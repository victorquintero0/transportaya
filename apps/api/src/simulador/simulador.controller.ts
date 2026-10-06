import { Body, Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { conductor, documento, usuario } from '@transportaya/db';
import { and, eq, sql } from 'drizzle-orm';
import { RequiereRol, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { validar } from '../comun/zod.js';
import { z } from 'zod';
import { PasajerosSimuladosService } from './pasajeros.service.js';
import { CONFIG, type Configuracion } from '../config.js';
import { PerfilService } from '../conductor/perfil.service.js';
import { CierresService } from '../dinero/cierres.service.js';
import { PagosService } from '../dinero/pagos.service.js';
import { fechaBogota } from '@transportaya/dominio';

/** Teléfono reservado del revisor simulado. */
const REVISOR_SIMULADO = '+570000000001';

/**
 * Herramientas para probar sin los demás actores. Solo existen con `SIMULADOR=true` (nunca en producción):
 * cualquier otra configuración responde 404 como si la ruta no existiera.
 */
@Controller('v1/dev')
@RequiereRol('conductor')
export class SimuladorController {
  constructor(
    @Inject(CONFIG) private readonly config: Pick<Configuracion, 'SIMULADOR'>,
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(PerfilService) private readonly perfil: PerfilService,
    @Inject(PasajerosSimuladosService) private readonly pasajeros: PasajerosSimuladosService,
    @Inject(CierresService) private readonly cierres: CierresService,
    @Inject(PagosService) private readonly pagos: PagosService,
  ) {}

  private exigirSimulador(): void {
    if (!this.config.SIMULADOR) throw noEncontrado('NO_ENCONTRADO', 'Ruta no encontrada');
  }

  /** Hace de analista de cumplimiento: aprueba todos los documentos y habilita al conductor. */
  @Post('conductor/aprobar')
  @HttpCode(200)
  async aprobar(@UsuarioActual() u: UsuarioAutenticado) {
    this.exigirSimulador();
    const { db } = this.bd;
    const [yo] = await db
      .select({ estado: conductor.estadoHabilitacion })
      .from(conductor)
      .where(eq(conductor.usuarioId, u.id));
    if (yo?.estado !== 'en_revision') {
      throw conflicto('NO_ESTA_EN_REVISION', 'Primero envía tu registro a revisión.');
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(usuario)
        .values({ telefono: REVISOR_SIMULADO, nombre: 'Revisión simulada' })
        .onConflictDoNothing();
      const [revisor] = await tx
        .select({ id: usuario.id })
        .from(usuario)
        .where(eq(usuario.telefono, REVISOR_SIMULADO));
      await tx
        .update(documento)
        .set({ estado: 'aprobado', revisadoPor: revisor!.id, revisadoEn: new Date() })
        .where(and(eq(documento.estado, 'pendiente'), eq(documento.conductorId, u.id)));
      // y los de sus vehículos
      await tx.execute(
        sql`update documento set estado = 'aprobado', revisado_por = ${revisor!.id}, revisado_en = now()
          where estado = 'pendiente' and vehiculo_id in (select vehiculo_id from conductor_vehiculo where conductor_id = ${u.id})`,
      );
      await tx
        .update(conductor)
        .set({ estadoHabilitacion: 'habilitado' })
        .where(eq(conductor.usuarioId, u.id));
    });
    return this.perfil.obtener(u.id);
  }

  /** Crea un pasajero de mentira que pide un viaje cerca de ti, para probar las ofertas. */
  @Post('pasajeros/viaje')
  @HttpCode(201)
  crearViaje(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    this.exigirSimulador();
    const opciones = validar(
      z
        .object({
          distanciaKm: z.number().min(0.5).max(40).optional(),
          metodoPago: z.enum(['efectivo', 'tarjeta']).optional(),
          nacional: z.boolean().optional(),
          destinoNacional: z.string().max(40).optional(),
        })
        .default({}),
      cuerpo ?? {},
    );
    return this.pasajeros.crearViaje(u.id, opciones);
  }

  /** El pasajero de mentira cancela el viaje. */
  @Post('pasajeros/viaje/:id/cancelar')
  @HttpCode(200)
  cancelarViaje(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    this.exigirSimulador();
    return this.pasajeros.cancelar(u.id, id);
  }

  /**
   * Adelanta el cierre diario de hoy para verlo funcionar sin esperar a medianoche. Con `rehacer` descarta el de hoy
   * (si no tiene pagos asociados) y lo calcula de nuevo con lo que hay.
   */
  @Post('cierre')
  @HttpCode(200)
  async cerrarHoy(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    this.exigirSimulador();
    const { rehacer } = validar(z.object({ rehacer: z.boolean().default(false) }), cuerpo ?? {});
    const dia = fechaBogota(new Date());
    if (rehacer) {
      await this.bd.db.execute(
        sql`delete from pago_conductor where conductor_id = ${u.id} and cierre_id in (select id from cierre_diario where conductor_id = ${u.id} and dia = ${dia}::date) and estado = 'pendiente'`,
      );
      await this.bd.db.execute(
        sql`delete from cierre_diario where conductor_id = ${u.id} and dia = ${dia}::date and not exists (select 1 from pago_conductor p where p.cierre_id = cierre_diario.id)`,
      );
    }
    return { dia, cierre: await this.cierres.cerrarConductor(u.id, dia) };
  }

  /** Hace de banco: entrega al conductor el dinero de sus pagos pendientes. */
  @Post('pagos/entregar')
  @HttpCode(200)
  async entregarPagos(@UsuarioActual() u: UsuarioAutenticado) {
    this.exigirSimulador();
    const pendientes = await this.pagos.pendientesDeConductor(u.id);
    let total = 0;
    for (const p of pendientes) {
      const r = await this.pagos.confirmarPagoConductor(p.id);
      if (!r.yaConfirmado) total += r.monto ?? 0;
    }
    return { pagos: pendientes.length, total };
  }

  /** Hace de Bre-B y de finanzas: el conductor "paga" su comisión y el pago se concilia al instante. */
  @Post('pagos-comision/simular')
  @HttpCode(200)
  async pagarComision(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    this.exigirSimulador();
    const { monto } = validar(
      z.object({ monto: z.number().int().min(1000).max(5_000_000).optional() }),
      cuerpo ?? {},
    );
    const deuda = (await this.pagos.saldo(u.id)).deuda;
    const aPagar = monto ?? deuda;
    if (aPagar <= 0) throw conflicto('SIN_DEUDA', 'No tienes comisión pendiente.');
    const pago = await this.pagos.reportarPagoComision(u.id, {
      monto: aPagar,
      referencia: `SIM-${Date.now()}`,
    });
    await this.pagos.conciliarPagoComision(pago.id, null);
    return this.pagos.saldo(u.id);
  }
}
