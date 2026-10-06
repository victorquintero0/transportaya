import {
  cierreDiario,
  conductor,
  movimientoSaldo,
  pagoComision,
  pagoConductor,
} from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { CONFIG, type Configuracion } from '../config.js';
import { Eventos } from '../tiempo-real/eventos.service.js';

@Injectable()
export class PagosService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CONFIG) private readonly config: Pick<Configuracion, 'LLAVE_BRE_B_EMPRESA'>,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  async saldo(conductorId: string) {
    const { db } = this.bd;
    const r = await db.execute<{ saldo: string }>(
      sql`select saldo::text from saldo_conductor where conductor_id = ${conductorId}`,
    );
    const saldo = Number(r.rows[0]?.saldo ?? 0);
    const [yo] = await db
      .select({ bloqueado: conductor.bloqueadoPorDeuda })
      .from(conductor)
      .where(eq(conductor.usuarioId, conductorId));
    const [ultimo] = await db
      .select()
      .from(cierreDiario)
      .where(eq(cierreDiario.conductorId, conductorId))
      .orderBy(desc(cierreDiario.dia))
      .limit(1);
    const pendientes = await db
      .select()
      .from(pagoComision)
      .where(and(eq(pagoComision.conductorId, conductorId), eq(pagoComision.estado, 'pendiente')));
    const porRecibir = await db
      .select()
      .from(pagoConductor)
      .where(
        and(
          eq(pagoConductor.conductorId, conductorId),
          sql`${pagoConductor.estado} in ('pendiente', 'enviada')`,
        ),
      );
    return {
      /** Positivo: TransporteYa le debe. Negativo: debe su comisión. */
      saldo,
      deuda: Math.max(0, -saldo),
      aFavor: Math.max(0, saldo),
      bloqueadoPorDeuda: yo?.bloqueado ?? false,
      /** A dónde pagar la comisión (D-04). */
      datosPago: { llave: this.config.LLAVE_BRE_B_EMPRESA ?? null, titular: 'TransporteYa' },
      ultimoCierre: ultimo
        ? {
            dia: ultimo.dia,
            saldoFinal: ultimo.saldoFinal,
            resultado: ultimo.resultado,
            estado: ultimo.estado,
          }
        : null,
      pagosEnRevision: pendientes.map((p) => ({
        id: p.id,
        monto: p.monto,
        referencia: p.referencia,
        creadoEn: p.creadoEn.toISOString(),
      })),
      pagosPorRecibir: porRecibir.map((p) => ({ id: p.id, monto: p.monto, estado: p.estado })),
    };
  }

  /** El libro del conductor, de lo más reciente a lo más antiguo, con el saldo después de cada movimiento. */
  async movimientos(conductorId: string, limite = 30, antes?: Date) {
    const filas = await this.bd.db.execute<{
      id: string;
      tipo: string;
      monto: string;
      creado_en: Date;
      codigo: string | null;
      motivo: string | null;
      saldo_despues: string;
    }>(sql`
      select * from (
        select m.id, m.tipo::text, m.monto::text, m.creado_en, v.codigo, m.motivo,
               sum(m.monto) over (order by m.creado_en, m.id)::text as saldo_despues
        from movimiento_saldo m left join viaje v on v.id = m.viaje_id
        where m.conductor_id = ${conductorId}
      ) t
      ${antes ? sql`where creado_en < ${antes}` : sql``}
      order by creado_en desc, id desc limit ${limite}`);
    return filas.rows.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      monto: Number(f.monto),
      viaje: f.codigo,
      motivo: f.motivo,
      creadoEn: new Date(f.creado_en).toISOString(),
      saldoDespues: Number(f.saldo_despues),
    }));
  }

  async cierres(conductorId: string, limite = 14) {
    const filas = await this.bd.db
      .select()
      .from(cierreDiario)
      .where(eq(cierreDiario.conductorId, conductorId))
      .orderBy(desc(cierreDiario.dia))
      .limit(limite);
    return filas.map((c) => ({
      id: c.id,
      dia: c.dia,
      saldoInicial: c.saldoInicial,
      netoDia: c.netoDia,
      saldoFinal: c.saldoFinal,
      resultado: c.resultado,
      estado: c.estado,
    }));
  }

  /**
   * El conductor avisa que pagó su comisión por llave o Bre-B. Queda pendiente hasta que se concilie con el banco
   * (R-14): mientras tanto no se le habilita, pero finanzas puede hacerlo de inmediato al ver el pago.
   */
  async reportarPagoComision(conductorId: string, d: { monto: number; referencia: string }) {
    const { db } = this.bd;
    const [abiertos] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(pagoComision)
      .where(and(eq(pagoComision.conductorId, conductorId), eq(pagoComision.estado, 'pendiente')));
    if ((abiertos?.n ?? 0) >= 5)
      throw conflicto(
        'DEMASIADOS_PAGOS_PENDIENTES',
        'Ya tienes varios pagos en revisión. Espera a que se confirmen.',
      );
    try {
      const [fila] = await db
        .insert(pagoComision)
        .values({ conductorId, monto: d.monto, referencia: d.referencia })
        .returning({ id: pagoComision.id, estado: pagoComision.estado });
      return fila!;
    } catch (e) {
      if (
        /pago_comision_referencia_uq/.test(
          String((e as { cause?: { message?: string } }).cause?.message ?? e),
        )
      ) {
        throw conflicto('REFERENCIA_REPETIDA', 'Ese número de transferencia ya fue reportado.');
      }
      throw e;
    }
  }

  /**
   * Concilia un pago de comisión: acredita el valor en el libro y, si el conductor queda sin deuda, lo habilita (RN-063).
   * Es idempotente. Lo llama finanzas desde la App Operación, o el webhook del banco cuando exista.
   */
  async conciliarPagoComision(pagoId: string, porUsuarioId: string | null = null) {
    const { db } = this.bd;
    const resultado = await db.transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(pagoComision)
        .where(eq(pagoComision.id, pagoId))
        .for('update');
      if (!p) throw noEncontrado('PAGO_NO_ENCONTRADO', 'No encontramos ese pago');
      if (p.estado !== 'pendiente')
        return { yaConciliado: true as const, conductorId: p.conductorId };

      await tx
        .update(pagoComision)
        .set({ estado: 'conciliado', conciliadoEn: new Date(), conciliadoPor: porUsuarioId })
        .where(eq(pagoComision.id, p.id));
      await tx.insert(movimientoSaldo).values({
        conductorId: p.conductorId,
        tipo: 'pago_comision',
        monto: p.monto,
        pagoComisionId: p.id,
        motivo: `Pago por ${p.canal}`,
      });

      const r = await tx.execute<{ s: string }>(
        sql`select coalesce(sum(monto), 0)::text as s from movimiento_saldo where conductor_id = ${p.conductorId}`,
      );
      const saldo = Number(r.rows[0]?.s ?? 0);
      let habilitado = false;
      if (saldo >= 0) {
        await tx
          .update(conductor)
          .set({ bloqueadoPorDeuda: false })
          .where(eq(conductor.usuarioId, p.conductorId));
        await tx
          .update(cierreDiario)
          .set({ estado: 'cobrado' })
          .where(
            and(eq(cierreDiario.conductorId, p.conductorId), eq(cierreDiario.estado, 'por_cobrar')),
          );
        habilitado = true;
      }
      return { yaConciliado: false as const, conductorId: p.conductorId, saldo, habilitado };
    });
    if (!resultado.yaConciliado && resultado.habilitado) {
      this.eventos.aConductor(resultado.conductorId, 'conductor:estado', {
        estadoOperativo: 'desconectado',
        motivo: 'comision_pagada',
      });
    }
    return resultado;
  }

  /** Confirma que el banco entregó el pago al conductor: lo descuenta del libro (RN-073). */
  async confirmarPagoConductor(pagoId: string) {
    return this.bd.db.transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(pagoConductor)
        .where(eq(pagoConductor.id, pagoId))
        .for('update');
      if (!p) throw noEncontrado('PAGO_NO_ENCONTRADO', 'No encontramos ese pago');
      if (p.estado === 'confirmada') return { yaConfirmado: true };
      await tx
        .update(pagoConductor)
        .set({
          estado: 'confirmada',
          enviadoEn: p.enviadoEn ?? new Date(),
          confirmadoEn: new Date(),
        })
        .where(eq(pagoConductor.id, p.id));
      await tx.insert(movimientoSaldo).values({
        conductorId: p.conductorId,
        tipo: 'pago_liquidacion',
        monto: -p.monto,
        pagoConductorId: p.id,
        motivo: 'Pago por Bre-B',
      });
      await tx
        .update(cierreDiario)
        .set({ estado: 'pagado' })
        .where(eq(cierreDiario.id, p.cierreId));
      return { yaConfirmado: false, monto: p.monto };
    });
  }

  /** Pagos a conductores aún sin confirmar (para el simulador del banco y para finanzas). */
  pendientesDeConductor(conductorId: string) {
    return this.bd.db
      .select()
      .from(pagoConductor)
      .where(
        and(
          eq(pagoConductor.conductorId, conductorId),
          sql`${pagoConductor.estado} in ('pendiente', 'enviada')`,
        ),
      );
  }
}
