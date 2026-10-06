import {
  cierreDiario,
  conductor,
  cuentaPagoConductor,
  movimientoSaldo,
  pagoConductor,
} from '@transportaya/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  calcularCierreDiario,
  decidirPago,
  type Movimiento,
  type TipoMovimiento,
} from '@transportaya/dominio';
import { and, eq, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { ConexionService } from '../conductor/conexion.service.js';
import { Eventos } from '../tiempo-real/eventos.service.js';

export interface ResultadoCierre {
  conductorId: string;
  dia: string;
  saldoInicial: number;
  netoDia: number;
  saldoFinal: number;
  resultado: 'a_favor' | 'a_cargo' | 'en_cero';
  /** Qué se hizo con el resultado (RN-063, RN-070, RN-074). */
  decision: 'pagar' | 'acumular' | 'cobrar' | 'nada';
  bloqueado: boolean;
}

@Injectable()
export class CierresService {
  private readonly log = new Logger('Cierres');

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(ConexionService) private readonly conexion: ConexionService,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  /** Cierra el día de todos los conductores que tuvieron movimientos, arrastran saldo o están bloqueados. */
  async cerrarDia(dia: string): Promise<ResultadoCierre[]> {
    const { db } = this.bd;
    const ids = await db.execute<{ id: string }>(sql`
      select conductor_id as id from movimiento_saldo where dia = ${dia}::date
      union select conductor_id from saldo_conductor where saldo <> 0
      union select usuario_id from conductor where bloqueado_por_deuda`);
    const resultados: ResultadoCierre[] = [];
    for (const { id } of ids.rows) {
      try {
        const r = await this.cerrarConductor(id, dia);
        if (r) resultados.push(r);
      } catch (e) {
        this.log.error(`Cierre de ${id} del ${dia}: ${e instanceof Error ? e.message : e}`);
      }
    }
    this.log.log(`Cierre del ${dia}: ${resultados.length} conductores`);
    return resultados;
  }

  /**
   * Cruce neto de un conductor (RN-063): lo que se le debe por viajes electrónicos contra las comisiones que debe por los
   * viajes en efectivo, más el saldo que arrastraba. Si queda debiendo, se bloquea hasta que pague por llave o Bre-B.
   */
  async cerrarConductor(conductorId: string, dia: string): Promise<ResultadoCierre | null> {
    const { db } = this.bd;
    const resultado = await db.transaction(async (tx) => {
      const [existente] = await tx
        .select({ id: cierreDiario.id })
        .from(cierreDiario)
        .where(and(eq(cierreDiario.conductorId, conductorId), eq(cierreDiario.dia, dia)));
      if (existente) return null;

      const previo = await tx.execute<{ s: string }>(
        sql`select coalesce(sum(monto), 0)::text as s from movimiento_saldo where conductor_id = ${conductorId} and dia < ${dia}::date`,
      );
      const saldoInicial = Number(previo.rows[0]?.s ?? 0);
      const delDia = await tx
        .select({ tipo: movimientoSaldo.tipo, monto: movimientoSaldo.monto })
        .from(movimientoSaldo)
        .where(
          and(
            eq(movimientoSaldo.conductorId, conductorId),
            sql`${movimientoSaldo.dia} = ${dia}::date`,
          ),
        );
      if (delDia.length === 0 && saldoInicial === 0) return null;

      const movimientos: Movimiento[] = delDia.map((m) => ({
        tipo: m.tipo as TipoMovimiento,
        monto: m.monto,
      }));
      const cierre = calcularCierreDiario(movimientos, saldoInicial);
      const decision = decidirPago(cierre);
      const estado =
        decision === 'pagar'
          ? 'por_pagar'
          : decision === 'cobrar'
            ? 'por_cobrar'
            : decision === 'acumular'
              ? 'abierto'
              : 'sin_movimiento';

      const [fila] = await tx
        .insert(cierreDiario)
        .values({
          conductorId,
          dia,
          saldoInicial,
          netoDia: cierre.neto - saldoInicial,
          saldoFinal: cierre.neto,
          resultado: cierre.resultado,
          estado,
        })
        .returning({ id: cierreDiario.id });

      await tx
        .update(conductor)
        .set({ bloqueadoPorDeuda: cierre.bloqueado })
        .where(eq(conductor.usuarioId, conductorId));

      if (decision === 'pagar') {
        const [cuenta] = await tx
          .select({ id: cuentaPagoConductor.id })
          .from(cuentaPagoConductor)
          .where(
            and(
              eq(cuentaPagoConductor.conductorId, conductorId),
              eq(cuentaPagoConductor.activa, true),
            ),
          );
        if (cuenta) {
          await tx.insert(pagoConductor).values({
            conductorId,
            cierreId: fila!.id,
            cuentaPagoId: cuenta.id,
            monto: cierre.neto,
          });
        }
      }
      return {
        conductorId,
        dia,
        saldoInicial,
        netoDia: cierre.neto - saldoInicial,
        saldoFinal: cierre.neto,
        resultado: cierre.resultado,
        decision,
        bloqueado: cierre.bloqueado,
      } satisfies ResultadoCierre;
    });

    if (resultado?.bloqueado) {
      // Queda sin habilitar: si estaba en línea sin hacer nada, se le desconecta. Si va en un viaje, lo termina y no recibe más.
      try {
        await this.conexion.desconectar(conductorId);
      } catch {
        /* con un viaje en curso no se interrumpe */
      }
      this.eventos.aConductor(conductorId, 'conductor:estado', {
        estadoOperativo: 'desconectado',
        motivo: 'deuda_pendiente',
      });
    }
    return resultado;
  }
}
