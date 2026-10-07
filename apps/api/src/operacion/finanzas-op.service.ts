import { Inject, Injectable } from '@nestjs/common';
import {
  ajusteSaldo,
  cierreDiario,
  conductor,
  cuentaPagoConductor,
  movimientoSaldo,
  pagoComision,
  pagoConductor,
  usuario,
} from '@transportaya/db';
import { fechaBogota } from '@transportaya/dominio';
import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado, prohibido, solicitudInvalida } from '../comun/errores.js';
import { CifradoService, enmascarar } from '../conductor/cifrado.service.js';
import { CierresService } from '../dinero/cierres.service.js';
import { PagosService } from '../dinero/pagos.service.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { type Operador, auditar } from './auditoria.js';

@Injectable()
export class FinanzasOperacionService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CierresService) private readonly cierres: CierresService,
    @Inject(PagosService) private readonly pagos: PagosService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  async resumen() {
    const [r] = (
      await this.bd.db.execute<{
        a_favor: string;
        a_cargo: string;
        bloqueados: number;
        comisiones_pendientes: number;
        pagos_pendientes: number;
        ajustes_pendientes: number;
        ultimo_dia: string | null;
      }>(sql`
        select
          (select coalesce(sum(saldo), 0)::text from saldo_conductor where saldo > 0) as a_favor,
          (select coalesce(-sum(saldo), 0)::text from saldo_conductor where saldo < 0) as a_cargo,
          (select count(*)::int from conductor where bloqueado_por_deuda) as bloqueados,
          (select count(*)::int from pago_comision where estado = 'pendiente') as comisiones_pendientes,
          (select count(*)::int from pago_conductor where estado in ('pendiente', 'enviada')) as pagos_pendientes,
          (select count(*)::int from ajuste_saldo where estado = 'pendiente') as ajustes_pendientes,
          (select max(dia)::text from cierre_diario) as ultimo_dia`)
    ).rows;
    return {
      saldoAFavorConductores: Number(r?.a_favor ?? 0),
      deudaDeConductores: Number(r?.a_cargo ?? 0),
      conductoresBloqueadosPorDeuda: r?.bloqueados ?? 0,
      comisionesPorConciliar: r?.comisiones_pendientes ?? 0,
      pagosAConductoresPendientes: r?.pagos_pendientes ?? 0,
      ajustesPendientes: r?.ajustes_pendientes ?? 0,
      ultimoCierre: r?.ultimo_dia ?? null,
    };
  }

  async listarCierres(f: {
    dia?: string | undefined;
    estado?: string | undefined;
    limite: number;
    desplazar: number;
  }) {
    let dia = f.dia;
    if (!dia) {
      const [u] = await this.bd.db
        .select({ d: sql<string | null>`max(${cierreDiario.dia})::text` })
        .from(cierreDiario);
      dia = u?.d ?? undefined;
    }
    if (!dia) return { dia: null, total: 0, items: [], totales: { aFavor: 0, aCargo: 0 } };
    const donde = and(
      eq(cierreDiario.dia, dia),
      f.estado ? sql`${cierreDiario.estado}::text = ${f.estado}` : undefined,
    );
    const filas = await this.bd.db
      .select({
        id: cierreDiario.id,
        conductorId: cierreDiario.conductorId,
        conductor: usuario.nombre,
        telefono: usuario.telefono,
        saldoInicial: cierreDiario.saldoInicial,
        netoDia: cierreDiario.netoDia,
        saldoFinal: cierreDiario.saldoFinal,
        resultado: cierreDiario.resultado,
        estado: cierreDiario.estado,
        bloqueado: conductor.bloqueadoPorDeuda,
      })
      .from(cierreDiario)
      .innerJoin(usuario, eq(usuario.id, cierreDiario.conductorId))
      .innerJoin(conductor, eq(conductor.usuarioId, cierreDiario.conductorId))
      .where(donde)
      .orderBy(cierreDiario.saldoFinal)
      .limit(f.limite)
      .offset(f.desplazar);
    const [t] = (
      await this.bd.db.execute<{ total: number; a_favor: string; a_cargo: string }>(sql`
        select count(*)::int as total,
               coalesce(sum(saldo_final) filter (where saldo_final > 0), 0)::text as a_favor,
               coalesce(-sum(saldo_final) filter (where saldo_final < 0), 0)::text as a_cargo
        from cierre_diario where dia = ${dia}::date ${f.estado ? sql`and estado::text = ${f.estado}` : sql``}`)
    ).rows;
    return {
      dia,
      total: t?.total ?? 0,
      totales: { aFavor: Number(t?.a_favor ?? 0), aCargo: Number(t?.a_cargo ?? 0) },
      items: filas,
    };
  }

  /** Corre el cierre a mano (por ejemplo, si el de medianoche falló). Es idempotente por conductor y día. */
  async ejecutarCierre(dia: string, operador: Operador) {
    if (dia > fechaBogota(new Date())) throw solicitudInvalida('No se puede cerrar un día futuro.');
    const resultados = await this.cierres.cerrarDia(dia);
    await auditar(this.bd.db, operador, {
      accion: 'cierre.ejecutar',
      entidad: 'cierre_diario',
      despues: { dia, conductores: resultados.length },
    });
    return {
      dia,
      conductores: resultados.length,
      aPagar: resultados.filter((r) => r.decision === 'pagar').length,
      aCobrar: resultados.filter((r) => r.decision === 'cobrar').length,
      bloqueados: resultados.filter((r) => r.bloqueado).length,
    };
  }

  async cobranza() {
    const bloqueados = await this.bd.db.execute<{
      id: string;
      nombre: string;
      telefono: string;
      saldo: string;
      desde: string | null;
    }>(sql`
      select c.usuario_id as id, u.nombre, u.telefono, coalesce(s.saldo, 0)::text as saldo,
             (select max(dia)::text from cierre_diario d where d.conductor_id = c.usuario_id and d.estado = 'por_cobrar') as desde
      from conductor c join usuario u on u.id = c.usuario_id left join saldo_conductor s on s.conductor_id = c.usuario_id
      where c.bloqueado_por_deuda order by s.saldo`);
    const cond = alias(usuario, 'cond');
    const pendientes = await this.bd.db
      .select({
        id: pagoComision.id,
        conductorId: pagoComision.conductorId,
        conductor: cond.nombre,
        monto: pagoComision.monto,
        canal: pagoComision.canal,
        referencia: pagoComision.referencia,
        creadoEn: pagoComision.creadoEn,
        saldo: sql<string>`coalesce((select saldo::text from saldo_conductor sc where sc.conductor_id = ${pagoComision.conductorId}), '0')`,
      })
      .from(pagoComision)
      .innerJoin(cond, eq(cond.id, pagoComision.conductorId))
      .where(eq(pagoComision.estado, 'pendiente'))
      .orderBy(pagoComision.creadoEn);
    return {
      bloqueados: bloqueados.rows.map((b) => ({
        id: b.id,
        nombre: b.nombre,
        telefono: b.telefono,
        deuda: Math.max(0, -Number(b.saldo)),
        desde: b.desde,
      })),
      pagosPorConciliar: pendientes.map((p) => ({
        ...p,
        saldo: Number(p.saldo),
        creadoEn: p.creadoEn.toISOString(),
      })),
    };
  }

  async conciliar(pagoId: string, operador: Operador) {
    const r = await this.pagos.conciliarPagoComision(pagoId, operador.id);
    if (!r.yaConciliado)
      await auditar(this.bd.db, operador, {
        accion: 'pago_comision.conciliar',
        entidad: 'pago_comision',
        entidadId: pagoId,
        despues: { habilitado: r.habilitado, saldo: r.saldo },
      });
    return r.yaConciliado
      ? { yaConciliado: true }
      : { yaConciliado: false, habilitado: r.habilitado, saldo: r.saldo };
  }

  async rechazarPagoComision(pagoId: string, motivo: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(pagoComision)
        .where(eq(pagoComision.id, pagoId))
        .for('update');
      if (!p) throw noEncontrado('PAGO_NO_ENCONTRADO', 'No encontramos ese pago');
      if (p.estado !== 'pendiente')
        throw conflicto('PAGO_YA_RESUELTO', 'Ese pago ya fue revisado.');
      await tx
        .update(pagoComision)
        .set({ estado: 'rechazado', conciliadoPor: operador.id, conciliadoEn: new Date() })
        .where(eq(pagoComision.id, pagoId));
      await auditar(tx, operador, {
        accion: 'pago_comision.rechazar',
        entidad: 'pago_comision',
        entidadId: pagoId,
        antes: { estado: p.estado, monto: p.monto, referencia: p.referencia },
        motivo,
      });
    });
  }

  /** Habilita a un conductor bloqueado por deuda sin esperar el pago (queda registrado con su motivo). */
  async habilitarPorDeuda(conductorId: string, motivo: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [c] = await tx
        .select({ bloqueado: conductor.bloqueadoPorDeuda })
        .from(conductor)
        .where(eq(conductor.usuarioId, conductorId))
        .for('update');
      if (!c) throw noEncontrado('CONDUCTOR_NO_ENCONTRADO', 'No encontramos a ese conductor');
      if (!c.bloqueado)
        throw conflicto('NO_ESTA_BLOQUEADO', 'Ese conductor no está bloqueado por deuda.');
      await tx
        .update(conductor)
        .set({ bloqueadoPorDeuda: false })
        .where(eq(conductor.usuarioId, conductorId));
      await auditar(tx, operador, {
        accion: 'conductor.habilitar_por_deuda',
        entidad: 'conductor',
        entidadId: conductorId,
        antes: { bloqueadoPorDeuda: true },
        despues: { bloqueadoPorDeuda: false },
        motivo,
      });
    });
    this.eventos.aConductor(conductorId, 'conductor:estado', {
      estadoOperativo: 'desconectado',
      motivo: 'Tu cuenta fue habilitada. ¡Ya puedes conectarte!',
    });
  }

  async libro(conductorId: string, limite: number) {
    const [c] = await this.bd.db
      .select({ nombre: usuario.nombre })
      .from(conductor)
      .innerJoin(usuario, eq(usuario.id, conductor.usuarioId))
      .where(eq(conductor.usuarioId, conductorId));
    if (!c) throw noEncontrado('CONDUCTOR_NO_ENCONTRADO', 'No encontramos a ese conductor');
    const saldo = await this.pagos.saldo(conductorId);
    return {
      conductor: c.nombre,
      saldo: saldo.saldo,
      bloqueadoPorDeuda: saldo.bloqueadoPorDeuda,
      movimientos: await this.pagos.movimientos(conductorId, limite),
    };
  }

  // ── Pagos a conductores (liquidaciones) ────────────────────────────────────
  async pagosAConductores(estado?: string) {
    const cond = alias(usuario, 'cond');
    const filas = await this.bd.db
      .select({
        id: pagoConductor.id,
        conductorId: pagoConductor.conductorId,
        conductor: cond.nombre,
        monto: pagoConductor.monto,
        estado: pagoConductor.estado,
        motivoRechazo: pagoConductor.motivoRechazo,
        dia: cierreDiario.dia,
        tipoCuenta: cuentaPagoConductor.tipo,
        banco: cuentaPagoConductor.banco,
        valorCifrado: cuentaPagoConductor.valorCifrado,
        creadoEn: pagoConductor.creadoEn,
      })
      .from(pagoConductor)
      .innerJoin(cond, eq(cond.id, pagoConductor.conductorId))
      .innerJoin(cierreDiario, eq(cierreDiario.id, pagoConductor.cierreId))
      .innerJoin(cuentaPagoConductor, eq(cuentaPagoConductor.id, pagoConductor.cuentaPagoId))
      .where(
        estado
          ? sql`${pagoConductor.estado}::text = ${estado}`
          : sql`${pagoConductor.estado} in ('pendiente', 'enviada')`,
      )
      .orderBy(desc(pagoConductor.creadoEn))
      .limit(200);
    return filas.map(({ valorCifrado, ...f }) => ({
      ...f,
      cuenta: enmascarar(this.cifrado.descifrar(valorCifrado)),
      creadoEn: f.creadoEn.toISOString(),
    }));
  }

  async enviarPagoAConductor(id: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const r = await tx
        .update(pagoConductor)
        .set({ estado: 'enviada', enviadoEn: new Date() })
        .where(and(eq(pagoConductor.id, id), eq(pagoConductor.estado, 'pendiente')))
        .returning({ monto: pagoConductor.monto, conductorId: pagoConductor.conductorId });
      if (r.length === 0) throw conflicto('PAGO_NO_PENDIENTE', 'Ese pago ya no está pendiente.');
      await auditar(tx, operador, {
        accion: 'pago_conductor.enviar',
        entidad: 'pago_conductor',
        entidadId: id,
        despues: { monto: r[0]!.monto, conductorId: r[0]!.conductorId },
      });
    });
  }

  async confirmarPagoAConductor(id: string, operador: Operador) {
    const r = await this.pagos.confirmarPagoConductor(id);
    if (!r.yaConfirmado)
      await auditar(this.bd.db, operador, {
        accion: 'pago_conductor.confirmar',
        entidad: 'pago_conductor',
        entidadId: id,
        despues: { monto: r.monto },
      });
    return r;
  }

  async rechazarPagoAConductor(id: string, motivo: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const r = await tx
        .update(pagoConductor)
        .set({ estado: 'rechazada', motivoRechazo: motivo })
        .where(
          and(eq(pagoConductor.id, id), sql`${pagoConductor.estado} in ('pendiente', 'enviada')`),
        )
        .returning({ monto: pagoConductor.monto });
      if (r.length === 0) throw conflicto('PAGO_NO_PENDIENTE', 'Ese pago ya no está pendiente.');
      await auditar(tx, operador, {
        accion: 'pago_conductor.rechazar',
        entidad: 'pago_conductor',
        entidadId: id,
        antes: { monto: r[0]!.monto },
        motivo,
      });
    });
  }

  // ── Ajustes manuales con doble aprobación ─────────────────────────────────
  async ajustes(estado?: string) {
    const cond = alias(usuario, 'cond');
    const prop = alias(usuario, 'prop');
    const res = alias(usuario, 'res');
    const filas = await this.bd.db
      .select({
        id: ajusteSaldo.id,
        conductorId: ajusteSaldo.conductorId,
        conductor: cond.nombre,
        monto: ajusteSaldo.monto,
        motivo: ajusteSaldo.motivo,
        estado: ajusteSaldo.estado,
        propuestoPor: prop.nombre,
        propuestoPorId: ajusteSaldo.propuestoPor,
        resueltoPor: res.nombre,
        motivoResolucion: ajusteSaldo.motivoResolucion,
        creadoEn: ajusteSaldo.creadoEn,
        resueltoEn: ajusteSaldo.resueltoEn,
      })
      .from(ajusteSaldo)
      .innerJoin(cond, eq(cond.id, ajusteSaldo.conductorId))
      .innerJoin(prop, eq(prop.id, ajusteSaldo.propuestoPor))
      .leftJoin(res, eq(res.id, ajusteSaldo.resueltoPor))
      .where(estado ? eq(ajusteSaldo.estado, estado) : undefined)
      .orderBy(desc(ajusteSaldo.creadoEn))
      .limit(200);
    return filas.map((f) => ({
      ...f,
      creadoEn: f.creadoEn.toISOString(),
      resueltoEn: f.resueltoEn?.toISOString() ?? null,
    }));
  }

  async proponerAjuste(
    d: { conductorId: string; monto: number; motivo: string; viajeId?: string | undefined },
    operador: Operador,
  ) {
    return this.bd.db.transaction(async (tx) => {
      const [c] = await tx
        .select({ id: conductor.usuarioId })
        .from(conductor)
        .where(eq(conductor.usuarioId, d.conductorId));
      if (!c) throw noEncontrado('CONDUCTOR_NO_ENCONTRADO', 'No encontramos a ese conductor');
      const [a] = await tx
        .insert(ajusteSaldo)
        .values({
          conductorId: d.conductorId,
          monto: d.monto,
          motivo: d.motivo,
          viajeId: d.viajeId ?? null,
          propuestoPor: operador.id,
        })
        .returning({ id: ajusteSaldo.id });
      await auditar(tx, operador, {
        accion: 'ajuste_saldo.proponer',
        entidad: 'ajuste_saldo',
        entidadId: a!.id,
        despues: { conductorId: d.conductorId, monto: d.monto },
        motivo: d.motivo,
      });
      return { id: a!.id };
    });
  }

  async aprobarAjuste(id: string, operador: Operador) {
    const r = await this.bd.db.transaction(async (tx) => {
      const [a] = await tx.select().from(ajusteSaldo).where(eq(ajusteSaldo.id, id)).for('update');
      if (!a) throw noEncontrado('AJUSTE_NO_ENCONTRADO', 'No encontramos ese ajuste');
      if (a.estado !== 'pendiente')
        throw conflicto('AJUSTE_YA_RESUELTO', 'Ese ajuste ya fue resuelto.');
      if (a.propuestoPor === operador.id)
        throw prohibido(
          'DOBLE_APROBACION',
          'Quien propone un ajuste no puede aprobarlo: debe hacerlo otra persona.',
        );
      const [m] = await tx
        .insert(movimientoSaldo)
        .values({
          conductorId: a.conductorId,
          tipo: 'ajuste',
          monto: a.monto,
          viajeId: a.viajeId,
          motivo: a.motivo,
          creadoPor: a.propuestoPor,
          aprobadoPor: operador.id,
        })
        .returning({ id: movimientoSaldo.id });
      await tx
        .update(ajusteSaldo)
        .set({
          estado: 'aprobado',
          resueltoPor: operador.id,
          resueltoEn: new Date(),
          movimientoId: m!.id,
        })
        .where(eq(ajusteSaldo.id, id));
      const s = await tx.execute<{ s: string }>(
        sql`select coalesce(sum(monto), 0)::text as s from movimiento_saldo where conductor_id = ${a.conductorId}`,
      );
      const saldo = Number(s.rows[0]?.s ?? 0);
      // Si el ajuste deja al conductor sin deuda, queda habilitado como cuando paga su comisión (RN-063).
      let habilitado = false;
      if (saldo >= 0) {
        const h = await tx
          .update(conductor)
          .set({ bloqueadoPorDeuda: false })
          .where(and(eq(conductor.usuarioId, a.conductorId), eq(conductor.bloqueadoPorDeuda, true)))
          .returning({ id: conductor.usuarioId });
        habilitado = h.length > 0;
      }
      await auditar(tx, operador, {
        accion: 'ajuste_saldo.aprobar',
        entidad: 'ajuste_saldo',
        entidadId: id,
        despues: {
          monto: a.monto,
          conductorId: a.conductorId,
          propuestoPor: a.propuestoPor,
          saldo,
        },
        motivo: a.motivo,
      });
      return { conductorId: a.conductorId, saldo, habilitado };
    });
    if (r.habilitado)
      this.eventos.aConductor(r.conductorId, 'conductor:estado', {
        estadoOperativo: 'desconectado',
        motivo: 'Tu saldo quedó al día. ¡Ya puedes conectarte!',
      });
    return { saldo: r.saldo, habilitado: r.habilitado };
  }

  async rechazarAjuste(id: string, motivo: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [a] = await tx.select().from(ajusteSaldo).where(eq(ajusteSaldo.id, id)).for('update');
      if (!a) throw noEncontrado('AJUSTE_NO_ENCONTRADO', 'No encontramos ese ajuste');
      if (a.estado !== 'pendiente')
        throw conflicto('AJUSTE_YA_RESUELTO', 'Ese ajuste ya fue resuelto.');
      if (a.propuestoPor === operador.id)
        throw prohibido(
          'DOBLE_APROBACION',
          'Para retirar tu propuesta pide a otra persona que la rechace.',
        );
      await tx
        .update(ajusteSaldo)
        .set({
          estado: 'rechazado',
          resueltoPor: operador.id,
          resueltoEn: new Date(),
          motivoResolucion: motivo,
        })
        .where(eq(ajusteSaldo.id, id));
      await auditar(tx, operador, {
        accion: 'ajuste_saldo.rechazar',
        entidad: 'ajuste_saldo',
        entidadId: id,
        antes: { monto: a.monto },
        motivo,
      });
    });
  }
}
