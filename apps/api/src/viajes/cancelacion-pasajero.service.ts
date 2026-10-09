import { conductor, movimientoSaldo, oferta, pasajero, tarifa, viaje } from '@transportaya/db';
import {
  ambitoComision,
  CANCELACION_POR_DEFECTO,
  cancelacionGratis,
  calcularComision,
  COMISION_PUNTOS_BASICOS,
  costoCancelacionPasajero,
} from '@transportaya/dominio';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { ParametrosService } from '../operacion/parametros.service.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { DespachoService } from './despacho.service.js';
import { descuentoDeEmpresa } from './descuento-corporativo.js';
import { registrarEvento } from './eventos-viaje.js';

export interface CostoDeCancelar {
  /** Lo que le costaría al pasajero cancelar ahora mismo (RN-042). */
  costo: number;
  gratis: boolean;
  /** Segundos que le quedan para cancelar sin costo, si todavía está a tiempo. */
  segundosGratisRestantes: number | null;
}

/**
 * Cancelación por parte del pasajero (RN-042 a RN-044): gratis mientras se busca conductor o durante los primeros 2 minutos
 * tras la asignación; después cuesta la tarifa de cancelación, que va al conductor menos la comisión.
 */
@Injectable()
export class CancelacionPasajeroService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(DespachoService) private readonly despacho: DespachoService,
    @Inject(Eventos) private readonly eventos: Eventos,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
  ) {}

  /** Cuánto cuesta cancelar este viaje en este momento, para avisárselo al pasajero antes de confirmar (HU-PAS-02). */
  async costoDeCancelar(
    v: Pick<typeof viaje.$inferSelect, 'estado' | 'aceptadoEn' | 'tarifaId' | 'programadoPara'>,
    ahoraMs = Date.now(),
  ): Promise<CostoDeCancelar> {
    // Una reserva se cancela gratis hasta una hora antes del servicio (RN-084); después cuesta la tarifa de cancelación.
    if (v.programadoPara) {
      const rp = await this.parametros.reservas();
      if (cancelacionGratis(v.programadoPara, new Date(ahoraMs), rp))
        return { costo: 0, gratis: true, segundosGratisRestantes: null };
      const costo = await this.tarifaCancelacion(v.tarifaId);
      return { costo, gratis: false, segundosGratisRestantes: null };
    }
    if (v.estado === 'buscando_conductor' || v.estado === 'programado')
      return { costo: 0, gratis: true, segundosGratisRestantes: null };
    const tarifaCancelacion = await this.tarifaCancelacion(v.tarifaId);
    const parametros = { ...CANCELACION_POR_DEFECTO, tarifaCancelacion };
    const desdeAsignacion = (ahoraMs - (v.aceptadoEn?.getTime() ?? ahoraMs)) / 1000;
    // Si el conductor ya llegó, el tiempo gratis terminó para efectos prácticos; costoCancelacionPasajero lo resuelve por tiempo.
    const costo = costoCancelacionPasajero(
      {
        tieneConductor: true,
        segundosDesdeAsignacion: v.estado === 'asignado' ? desdeAsignacion : Infinity,
      },
      parametros,
    );
    const restante = Math.ceil(parametros.segundosGratisTrasAsignacion - desdeAsignacion);
    return {
      costo,
      gratis: costo === 0,
      segundosGratisRestantes: v.estado === 'asignado' && restante > 0 ? restante : null,
    };
  }

  private async tarifaCancelacion(tarifaId: string | null): Promise<number> {
    if (!tarifaId) return CANCELACION_POR_DEFECTO.tarifaCancelacion;
    const [t] = await this.bd.db.select().from(tarifa).where(eq(tarifa.id, tarifaId));
    return t?.cancelacion ?? CANCELACION_POR_DEFECTO.tarifaCancelacion;
  }

  /**
   * Cancelar una reserva que todavía no tiene conductor en camino. Gratis hasta una hora antes; después cuesta la
   * tarifa de cancelación, que va al conductor (menos la comisión) si ya la había confirmado, y si no se la queda
   * TransporteYa. En efectivo queda como deuda del pasajero (RN-053).
   */
  private async cancelarReserva(v: typeof viaje.$inferSelect, motivo: string) {
    const { db } = this.bd;
    const { costo } = await this.costoDeCancelar(v);
    const conductorId = v.reservaConfirmadaEn ? v.reservaConductorId : null;
    const ambito = ambitoComision(v.tipoServicio);
    const comision =
      costo > 0 && conductorId
        ? calcularComision({ totalRedondeado: 0, tarifaCancelacion: costo }, ambito)
        : costo;
    const r = await db.transaction(async (tx) => {
      const actualizada = await tx
        .update(viaje)
        .set({
          estado: 'cancelado',
          canceladoEn: new Date(),
          canceladoPor: 'pasajero',
          motivoCancelacion: motivo,
          ...(costo > 0
            ? {
                precioFinal: costo,
                totalCarrera: costo,
                comision,
                comisionPb: conductorId ? COMISION_PUNTOS_BASICOS[ambito] : 10_000,
                estadoPago:
                  v.metodoPago === 'efectivo' ? ('pendiente' as const) : ('pagado' as const),
                descuentoCorporativo: await descuentoDeEmpresa(tx, v.empresaId, costo),
              }
            : { estadoPago: 'no_aplica' as const }),
        })
        .where(and(eq(viaje.id, v.id), inArray(viaje.estado, ['programado', 'buscando_conductor'])))
        .returning({ id: viaje.id });
      if (actualizada.length === 0)
        throw conflicto('ESTADO_INVALIDO', 'Esta reserva ya no se puede cancelar.');
      if (costo > 0) {
        if (conductorId)
          await tx
            .insert(movimientoSaldo)
            .values({ conductorId, tipo: 'cancelacion', monto: costo - comision, viajeId: v.id });
        if (v.metodoPago === 'efectivo')
          await tx
            .update(pasajero)
            .set({ deudaPendiente: sql`${pasajero.deudaPendiente} + ${costo}` })
            .where(eq(pasajero.usuarioId, v.pasajeroId));
      }
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'cancelado',
        actorTipo: 'pasajero',
        actorId: v.pasajeroId,
        datos: { costo, reserva: true },
      });
      return actualizada;
    });
    void r;
    if (v.estado === 'buscando_conductor') await this.despacho.retirarOfertas(v.id);
    if (v.reservaConductorId)
      this.eventos.aConductor(v.reservaConductorId, 'reserva:cambio', {
        viajeId: v.id,
        motivo: 'cancelada',
      });
    return {
      costo,
      gananciaNeta: conductorId ? costo - comision : 0,
      conductorId: null as string | null,
    };
  }

  /** Cancela el viaje en nombre del pasajero. Quien llama ya comprobó que el viaje es suyo. */
  async cancelar(viajeId: string, motivo = 'cancelado_por_pasajero') {
    const { db } = this.bd;
    const [v] = await db.select().from(viaje).where(eq(viaje.id, viajeId));
    if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');

    if (v.programadoPara && (v.estado === 'programado' || v.estado === 'buscando_conductor'))
      return this.cancelarReserva(v, motivo);

    if (v.estado === 'buscando_conductor') {
      const r = await db
        .update(viaje)
        .set({
          estado: 'cancelado',
          canceladoEn: new Date(),
          canceladoPor: 'pasajero',
          motivoCancelacion: motivo,
          estadoPago: 'no_aplica',
        })
        .where(eq(viaje.id, v.id))
        .returning({ id: viaje.id });
      if (r.length === 0) throw conflicto('ESTADO_INVALIDO', 'Este viaje ya no se puede cancelar.');
      await registrarEvento(db, {
        viajeId: v.id,
        tipo: 'cancelado',
        actorTipo: 'pasajero',
        actorId: v.pasajeroId,
      });
      await this.despacho.retirarOfertas(v.id);
      return { costo: 0, gananciaNeta: 0, conductorId: null as string | null };
    }

    if (!v.conductorId || !['asignado', 'en_sitio'].includes(v.estado))
      throw conflicto('ESTADO_INVALIDO', 'Este viaje ya no se puede cancelar.');

    const conductorId = v.conductorId;
    const { costo } = await this.costoDeCancelar(v);
    const ambito = ambitoComision(v.tipoServicio);
    const comision = calcularComision({ totalRedondeado: 0, tarifaCancelacion: costo }, ambito);
    const cobraAlPasajero = costo > 0;

    await db.transaction(async (tx) => {
      await tx
        .update(viaje)
        .set({
          estado: 'cancelado',
          canceladoEn: new Date(),
          canceladoPor: 'pasajero',
          motivoCancelacion: motivo,
          ...(cobraAlPasajero
            ? {
                precioFinal: costo,
                totalCarrera: costo,
                comision,
                comisionPb: COMISION_PUNTOS_BASICOS[ambito],
                estadoPago: v.metodoPago === 'efectivo' ? 'pendiente' : 'pagado',
                descuentoCorporativo: await descuentoDeEmpresa(tx, v.empresaId, costo),
              }
            : { estadoPago: 'no_aplica' as const }),
        })
        .where(eq(viaje.id, v.id));
      if (cobraAlPasajero) {
        await tx
          .insert(movimientoSaldo)
          .values({ conductorId, tipo: 'cancelacion', monto: costo - comision, viajeId: v.id });
        if (v.metodoPago === 'efectivo') {
          // No hay a quién cobrarle en el momento: queda como deuda hasta que la pague (RN-053).
          await tx
            .update(pasajero)
            .set({ deudaPendiente: sql`${pasajero.deudaPendiente} + ${costo}` })
            .where(eq(pasajero.usuarioId, v.pasajeroId));
        }
      }
      await tx
        .update(oferta)
        .set({ resultado: 'retirada', respondidaEn: new Date() })
        .where(sql`${oferta.viajeId} = ${v.id} and ${oferta.resultado} = 'aceptada'`);
      await tx
        .update(conductor)
        .set({ estadoOperativo: 'disponible' })
        .where(eq(conductor.usuarioId, conductorId));
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'cancelado',
        actorTipo: 'pasajero',
        actorId: v.pasajeroId,
        datos: { costo },
      });
    });

    this.eventos.aConductor(conductorId, 'viaje:estado', {
      viajeId: v.id,
      estado: 'cancelado',
      canceladoPor: 'pasajero',
      costo,
    });
    this.eventos.aConductor(conductorId, 'conductor:estado', { estadoOperativo: 'disponible' });
    return { costo, gananciaNeta: costo - comision, conductorId };
  }
}
