import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  conductor,
  movimientoPuntos,
  movimientoSaldo,
  referido,
  usuario,
  viaje,
} from '@transportaya/db';
import {
  abonoConPuntos,
  decidirOtorgamiento,
  descuentoConPuntos,
  esCodigoValido,
  generarCodigo,
  liquidarPuntosDeViaje,
  normalizarCodigo,
  puntosDeReferido,
  validarAplicarCodigo,
  type ReglasReferidos,
  type RolReferido,
} from '@transportaya/dominio';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';
import { ErrorNegocio, conflicto, noEncontrado } from '../comun/errores.js';
import { PagosService } from '../dinero/pagos.service.js';
import { ParametrosService } from '../operacion/parametros.service.js';
import { Eventos, type PuntosGanados } from '../tiempo-real/eventos.service.js';

const DIA_MS = 86_400_000;
const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

/** Un aviso de puntos ganados que se manda a la persona cuando la transacción ya terminó. */
export interface AvisoPuntos {
  usuarioId: string;
  aviso: PuntosGanados;
}

/**
 * Referidos y puntos (RN-150 a RN-159): códigos, invitaciones, entrega de puntos al primer viaje, canje por descuento
 * en un viaje y abono a la comisión del conductor. El saldo de puntos es siempre la suma del libro `movimiento_puntos`.
 */
@Injectable()
export class ReferidosService {
  private readonly log = new Logger(ReferidosService.name);

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(PagosService) private readonly pagos: PagosService,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  // ───────────────────────────────────────────────────────────── saldo

  /** Saldo de puntos: la suma del libro. */
  async saldo(usuarioId: string, db: DbOTx = this.bd.db): Promise<number> {
    const [f] = await db
      .select({ s: sql<number>`coalesce(sum(${movimientoPuntos.puntos}), 0)::int` })
      .from(movimientoPuntos)
      .where(eq(movimientoPuntos.usuarioId, usuarioId));
    return Number(f?.s ?? 0);
  }

  /** Bloquea a la persona mientras se mueven sus puntos, para que dos canjes a la vez no gasten el mismo saldo. */
  private async bloquear(tx: DbOTx, usuarioId: string): Promise<void> {
    await tx
      .select({ id: usuario.id })
      .from(usuario)
      .where(eq(usuario.id, usuarioId))
      .for('update');
  }

  // ───────────────────────────────────────────────────────────── código y resumen

  /** El código de la persona; se crea la primera vez que lo necesita. */
  async codigoDe(usuarioId: string): Promise<string> {
    const [u] = await this.bd.db
      .select({ codigo: usuario.codigoReferido, nombre: usuario.nombre })
      .from(usuario)
      .where(eq(usuario.id, usuarioId));
    if (!u) throw noEncontrado('USUARIO_NO_ENCONTRADO', 'No encontramos tu cuenta.');
    if (u.codigo) return u.codigo;
    for (let intento = 0; intento < 10; intento++) {
      const candidato = generarCodigo(u.nombre, () => randomInt(0, 1_000_000) / 1_000_000);
      try {
        const [hecho] = await this.bd.db
          .update(usuario)
          .set({ codigoReferido: candidato })
          .where(and(eq(usuario.id, usuarioId), sql`${usuario.codigoReferido} is null`))
          .returning({ codigo: usuario.codigoReferido });
        if (hecho?.codigo) return hecho.codigo;
        // Otra petición se le adelantó: se lee el que quedó
        const [ya] = await this.bd.db
          .select({ codigo: usuario.codigoReferido })
          .from(usuario)
          .where(eq(usuario.id, usuarioId));
        if (ya?.codigo) return ya.codigo;
      } catch (e) {
        if (
          !/usuario_codigo_referido_uq/.test(
            String((e as { cause?: { message?: string } }).cause?.message ?? e),
          )
        )
          throw e;
      }
    }
    throw conflicto('CODIGO_NO_DISPONIBLE', 'No pudimos crear tu código. Intenta de nuevo.');
  }

  /** Todo lo que la pantalla «Referidos» de las apps necesita en una llamada. */
  async resumen(usuarioId: string, rol: RolReferido) {
    const reglas = await this.parametros.referidos();
    const codigo = await this.codigoDe(usuarioId);
    const saldo = await this.saldo(usuarioId);

    const invitados = await this.bd.db
      .select({
        id: referido.id,
        nombre: usuario.nombre,
        rol: referido.rolInvitado,
        estado: referido.estado,
        puntos: referido.puntosReferidor,
        creadoEn: referido.creadoEn,
      })
      .from(referido)
      .innerJoin(usuario, eq(usuario.id, referido.invitadoId))
      .where(eq(referido.referidorId, usuarioId))
      .orderBy(desc(referido.creadoEn))
      .limit(50);

    const [mio] = await this.bd.db
      .select({
        codigo: referido.codigo,
        estado: referido.estado,
        rol: referido.rolInvitado,
        puntos: referido.puntosInvitado,
        referidor: usuario.nombre,
      })
      .from(referido)
      .innerJoin(usuario, eq(usuario.id, referido.referidorId))
      .where(eq(referido.invitadoId, usuarioId));

    const puede = mio ? false : await this.puedeUsarCodigo(usuarioId, rol, reglas);

    let abono: { puntos: number; monto: number } | null = null;
    let deuda = 0;
    if (rol === 'conductor') {
      deuda = await this.deudaDelConductor(usuarioId);
      const a = abonoConPuntos({ saldoPuntos: saldo, deuda, reglas });
      abono = a.ok ? { puntos: a.puntos, monto: a.monto } : null;
    }

    return {
      activo: reglas.activo,
      codigo,
      saldo,
      valorPunto: reglas.valorPunto,
      valorSaldo: saldo * reglas.valorPunto,
      topeDescuentoPct: reglas.topeDescuentoPct,
      minAbonoPuntos: reglas.minAbonoPuntos,
      recompensas: {
        invitarPasajero: reglas.puntosReferidorPasajero,
        invitarConductor: reglas.puntosReferidorConductor,
        bienvenidaPasajero: reglas.puntosInvitadoPasajero,
        bienvenidaConductor: reglas.puntosInvitadoConductor,
        viajeMinimo: reglas.minViaje,
      },
      usoCodigo: mio
        ? {
            codigo: mio.codigo,
            estado: mio.estado,
            referidor: primerNombre(mio.referidor),
            puntos: mio.puntos,
          }
        : null,
      puedeUsarCodigo: puede,
      ventanaDias: reglas.ventanaDias,
      invitados: invitados.map((i) => ({
        id: i.id,
        nombre: primerNombre(i.nombre),
        rol: i.rol,
        estado: i.estado,
        puntos: i.puntos,
        creadoEn: i.creadoEn.toISOString(),
      })),
      totales: {
        invitados: invitados.length,
        otorgados: invitados.filter((i) => i.estado === 'otorgado').length,
        pendientes: invitados.filter((i) => i.estado === 'pendiente').length,
        puntosGanados: invitados.reduce((s, i) => s + i.puntos, 0),
      },
      ...(rol === 'conductor' ? { deuda, abono } : {}),
    };
  }

  /** Los movimientos del libro de la persona, del más reciente al más antiguo. */
  async movimientos(usuarioId: string, limite = 30, antes?: Date) {
    const filas = await this.bd.db
      .select({
        id: movimientoPuntos.id,
        tipo: movimientoPuntos.tipo,
        puntos: movimientoPuntos.puntos,
        valorPunto: movimientoPuntos.valorPunto,
        motivo: movimientoPuntos.motivo,
        viaje: viaje.codigo,
        creadoEn: movimientoPuntos.creadoEn,
      })
      .from(movimientoPuntos)
      .leftJoin(viaje, eq(viaje.id, movimientoPuntos.viajeId))
      .where(
        and(
          eq(movimientoPuntos.usuarioId, usuarioId),
          antes ? lt(movimientoPuntos.creadoEn, antes) : undefined,
        ),
      )
      .orderBy(desc(movimientoPuntos.creadoEn), desc(movimientoPuntos.id))
      .limit(limite);
    return filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      puntos: f.puntos,
      valor: f.puntos * f.valorPunto,
      motivo: f.motivo,
      viaje: f.viaje,
      creadoEn: f.creadoEn.toISOString(),
    }));
  }

  // ───────────────────────────────────────────────────────────── usar un código

  private async viajesTerminados(db: DbOTx, usuarioId: string, rol: RolReferido): Promise<number> {
    const [f] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(viaje)
      .where(
        and(
          eq(rol === 'pasajero' ? viaje.pasajeroId : viaje.conductorId, usuarioId),
          eq(viaje.estado, 'finalizado'),
        ),
      );
    return Number(f?.n ?? 0);
  }

  private async puedeUsarCodigo(
    usuarioId: string,
    rol: RolReferido,
    reglas: ReglasReferidos,
  ): Promise<boolean> {
    if (!reglas.activo) return false;
    const [u] = await this.bd.db
      .select({ creadoEn: usuario.creadoEn })
      .from(usuario)
      .where(eq(usuario.id, usuarioId));
    if (!u) return false;
    const r = validarAplicarCodigo({
      reglas,
      codigoExiste: true,
      esPropio: false,
      yaInvitado: false,
      edadCuentaDias: Math.floor((Date.now() - u.creadoEn.getTime()) / DIA_MS),
      viajesTerminados: await this.viajesTerminados(this.bd.db, usuarioId, rol),
    });
    return r.ok;
  }

  /** RN-151: la persona escribe el código de quien la invitó. Los puntos llegan con su primer viaje terminado. */
  async aplicarCodigo(usuarioId: string, rol: RolReferido, texto: string) {
    const reglas = await this.parametros.referidos();
    const codigo = normalizarCodigo(texto);
    return this.bd.db.transaction(async (tx) => {
      await this.bloquear(tx, usuarioId);
      const [yo] = await tx
        .select({ creadoEn: usuario.creadoEn })
        .from(usuario)
        .where(eq(usuario.id, usuarioId));
      const [quien] = esCodigoValido(codigo)
        ? await tx
            .select({ id: usuario.id, nombre: usuario.nombre })
            .from(usuario)
            .where(and(eq(usuario.codigoReferido, codigo), eq(usuario.estado, 'activo')))
        : [];
      const [ya] = await tx
        .select({ id: referido.id })
        .from(referido)
        .where(eq(referido.invitadoId, usuarioId));
      if (rol === 'conductor') {
        const [c] = await tx
          .select({ id: conductor.usuarioId })
          .from(conductor)
          .where(eq(conductor.usuarioId, usuarioId));
        if (!c)
          throw conflicto(
            'NO_ES_CONDUCTOR',
            'Primero crea tu perfil de conductor para usar un código.',
          );
      }
      const v = validarAplicarCodigo({
        reglas,
        codigoExiste: !!quien,
        esPropio: quien?.id === usuarioId,
        yaInvitado: !!ya,
        edadCuentaDias: Math.floor((Date.now() - (yo?.creadoEn.getTime() ?? Date.now())) / DIA_MS),
        viajesTerminados: await this.viajesTerminados(tx, usuarioId, rol),
      });
      if (!v.ok)
        throw new ErrorNegocio(v.codigo === 'CODIGO_NO_EXISTE' ? 404 : 409, v.codigo, v.detalle);
      await tx.insert(referido).values({
        referidorId: quien!.id,
        invitadoId: usuarioId,
        rolInvitado: rol,
        codigo,
      });
      const premio = puntosDeReferido(reglas, rol);
      return {
        referidor: primerNombre(quien!.nombre),
        puntosAlPrimerViaje: premio.invitado,
        viajeMinimo: reglas.minViaje,
      };
    });
  }

  // ───────────────────────────────────────────────────────────── entregar los puntos

  /**
   * Al terminar un viaje: si el pasajero o el conductor tenían una invitación pendiente y este es su primer viaje que
   * cuenta, se entregan los puntos (RN-153). Corre dentro de la transacción del viaje; devuelve los avisos para
   * mandarlos cuando esta termine.
   */
  async alFinalizarViaje(
    tx: DbOTx,
    d: { viajeId: string; pasajeroId: string; conductorId: string; precioFinal: number },
  ): Promise<AvisoPuntos[]> {
    const reglas = await this.parametros.referidos();
    if (!reglas.activo) return [];
    const avisos: AvisoPuntos[] = [];
    const partes: { invitadoId: string; rol: RolReferido; otraParte: string }[] = [
      { invitadoId: d.pasajeroId, rol: 'pasajero', otraParte: d.conductorId },
      { invitadoId: d.conductorId, rol: 'conductor', otraParte: d.pasajeroId },
    ];
    for (const p of partes) {
      const [r] = await tx
        .select()
        .from(referido)
        .where(
          and(
            eq(referido.invitadoId, p.invitadoId),
            eq(referido.rolInvitado, p.rol),
            eq(referido.estado, 'pendiente'),
          ),
        )
        .for('update');
      if (!r) continue;
      const [mes] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(referido)
        .where(
          and(
            eq(referido.referidorId, r.referidorId),
            eq(referido.estado, 'otorgado'),
            sql`${referido.puntosReferidor} > 0`,
            sql`${referido.resueltoEn} >= (date_trunc('month', now() at time zone 'America/Bogota') at time zone 'America/Bogota')`,
          ),
        );
      const decision = decidirOtorgamiento({
        reglas,
        rolInvitado: p.rol,
        precioFinal: d.precioFinal,
        otorgadosEnElMes: Number(mes?.n ?? 0),
        viajeConElReferidor: r.referidorId === p.otraParte,
      });
      if (decision.accion === 'esperar') continue;
      if (decision.accion === 'rechazar') {
        await tx
          .update(referido)
          .set({
            estado: 'rechazado',
            resueltoEn: new Date(),
            viajeId: d.viajeId,
            motivo: 'El referidor fue la otra parte del primer viaje.',
          })
          .where(eq(referido.id, r.id));
        continue;
      }
      await tx
        .update(referido)
        .set({
          estado: 'otorgado',
          resueltoEn: new Date(),
          viajeId: d.viajeId,
          puntosReferidor: decision.referidor,
          puntosInvitado: decision.invitado,
          ...(decision.topeAlcanzado ? { motivo: 'El referidor llegó al tope del mes.' } : {}),
        })
        .where(eq(referido.id, r.id));
      const filas = [
        {
          usuarioId: r.referidorId,
          tipo: 'referido_referidor' as const,
          puntos: decision.referidor,
        },
        { usuarioId: r.invitadoId, tipo: 'referido_invitado' as const, puntos: decision.invitado },
      ].filter((f) => f.puntos > 0);
      if (filas.length)
        await tx.insert(movimientoPuntos).values(
          filas.map((f) => ({
            ...f,
            valorPunto: reglas.valorPunto,
            referidoId: r.id,
            viajeId: d.viajeId,
            motivo:
              f.tipo === 'referido_referidor'
                ? 'Tu invitado terminó su primer viaje'
                : 'Bienvenida: tu primer viaje',
          })),
        );
      for (const f of filas)
        avisos.push({
          usuarioId: f.usuarioId,
          aviso: {
            puntos: f.puntos,
            motivo: f.tipo === 'referido_referidor' ? 'invitado_viajo' : 'bienvenida',
            saldo: await this.saldo(f.usuarioId, tx),
          },
        });
    }
    return avisos;
  }

  /** Manda los avisos de puntos ganados (después de que la transacción terminó). */
  avisar(avisos: readonly AvisoPuntos[]): void {
    for (const a of avisos) {
      this.eventos.aPasajero(a.usuarioId, 'puntos:ganados', a.aviso);
      this.eventos.aConductor(a.usuarioId, 'puntos:ganados', a.aviso);
    }
  }

  // ───────────────────────────────────────────────────────────── canje en un viaje

  /** Cuánto se puede descontar en un cobro de `precio` pesos con los puntos que la persona tiene hoy. */
  async descuentoPara(usuarioId: string, precio: number) {
    const reglas = await this.parametros.referidos();
    const saldo = await this.saldo(usuarioId);
    const d = descuentoConPuntos({ saldo, precio, reglas });
    return {
      activo: reglas.activo,
      saldo,
      valorPunto: reglas.valorPunto,
      topeDescuentoPct: reglas.topeDescuentoPct,
      puntos: d.puntos,
      descuento: d.descuento,
    };
  }

  /** Lo mismo para varios precios a la vez (las opciones de una cotización), con una sola lectura del saldo. */
  async evaluarPrecios(usuarioId: string, precios: readonly number[]) {
    const reglas = await this.parametros.referidos();
    const saldo = await this.saldo(usuarioId);
    return {
      activo: reglas.activo,
      saldo,
      valorPunto: reglas.valorPunto,
      topeDescuentoPct: reglas.topeDescuentoPct,
      porPrecio: precios.map((precio) => descuentoConPuntos({ saldo, precio, reglas })),
    };
  }

  /** Aparta los puntos para pagar parte de un viaje recién pedido (RN-155). Dentro de la transacción del pedido. */
  async separar(tx: DbOTx, usuarioId: string, viajeId: string, precioMaximo: number) {
    const reglas = await this.parametros.referidos();
    await this.bloquear(tx, usuarioId);
    const saldo = await this.saldo(usuarioId, tx);
    const d = descuentoConPuntos({ saldo, precio: precioMaximo, reglas });
    if (d.puntos <= 0) throw conflicto('SIN_PUNTOS', 'No tienes puntos para usar en este viaje.');
    await tx.insert(movimientoPuntos).values({
      usuarioId,
      tipo: 'canje_descuento',
      puntos: -d.puntos,
      valorPunto: reglas.valorPunto,
      viajeId,
      motivo: 'Puntos apartados para pagar parte del viaje',
    });
    await tx.update(viaje).set({ puntosSeparados: d.puntos }).where(eq(viaje.id, viajeId));
    return d;
  }

  /**
   * Al terminar el viaje: con el precio real se usan los puntos que el tope permita y el resto se devuelve (RN-156).
   * Devuelve lo que hay que guardar en el viaje.
   */
  async liquidar(
    tx: DbOTx,
    v: { id: string; pasajeroId: string; puntosSeparados: number },
    precioFinal: number,
  ): Promise<{ usados: number; descuento: number }> {
    if (v.puntosSeparados <= 0) return { usados: 0, descuento: 0 };
    const reglas = await this.parametros.referidos();
    const l = liquidarPuntosDeViaje({ separados: v.puntosSeparados, precioFinal, reglas });
    if (l.devueltos > 0)
      await tx
        .insert(movimientoPuntos)
        .values({
          usuarioId: v.pasajeroId,
          tipo: 'reverso',
          puntos: l.devueltos,
          valorPunto: reglas.valorPunto,
          viajeId: v.id,
          motivo: 'Puntos que sobraron al terminar el viaje',
        })
        .onConflictDoNothing();
    return { usados: l.usados, descuento: l.descuento };
  }

  /** Devuelve los puntos de un viaje que se canceló o se quedó sin conductor. Es idempotente. */
  async liberar(tx: DbOTx, viajeId: string): Promise<boolean> {
    const [v] = await tx
      .select({
        estado: viaje.estado,
        pasajeroId: viaje.pasajeroId,
        separados: viaje.puntosSeparados,
      })
      .from(viaje)
      .where(eq(viaje.id, viajeId))
      .for('update');
    if (!v || v.separados <= 0 || !['cancelado', 'sin_conductor'].includes(v.estado)) return false;
    const reglas = await this.parametros.referidos();
    const hecho = await tx
      .insert(movimientoPuntos)
      .values({
        usuarioId: v.pasajeroId,
        tipo: 'reverso',
        puntos: v.separados,
        valorPunto: reglas.valorPunto,
        viajeId,
        motivo: v.estado === 'cancelado' ? 'Viaje cancelado' : 'No encontramos conductor',
      })
      .onConflictDoNothing()
      .returning({ id: movimientoPuntos.id });
    return hecho.length > 0;
  }

  /** Red de seguridad: devuelve los puntos de los viajes que terminaron sin cobrarse y no se liberaron en el momento. */
  async liberarPendientes(): Promise<number> {
    const filas = await this.bd.db
      .select({ id: viaje.id })
      .from(viaje)
      .where(
        and(
          inArray(viaje.estado, ['cancelado', 'sin_conductor']),
          sql`${viaje.puntosSeparados} > 0`,
          sql`not exists (select 1 from movimiento_puntos m where m.viaje_id = ${viaje.id} and m.tipo = 'reverso')`,
        ),
      )
      .limit(100);
    let n = 0;
    for (const f of filas) {
      try {
        if (await this.bd.db.transaction((tx) => this.liberar(tx, f.id))) n += 1;
      } catch (e) {
        this.log.warn(
          `No se pudieron devolver los puntos del viaje ${f.id}: ${(e as Error).message}`,
        );
      }
    }
    return n;
  }

  // ───────────────────────────────────────────────────────────── abono a la comisión

  private async deudaDelConductor(conductorId: string, db: DbOTx = this.bd.db): Promise<number> {
    const [f] = await db
      .select({ s: sql<number>`coalesce(sum(${movimientoSaldo.monto}), 0)::bigint` })
      .from(movimientoSaldo)
      .where(eq(movimientoSaldo.conductorId, conductorId));
    return Math.max(0, -Number(f?.s ?? 0));
  }

  /** RN-158: el conductor paga con puntos parte o toda su comisión pendiente. */
  async abonarComision(conductorId: string, puntosPedidos?: number) {
    const reglas = await this.parametros.referidos();
    if (!reglas.activo)
      throw conflicto('REFERIDOS_INACTIVOS', 'Por ahora no se pueden canjear puntos.');
    const resultado = await this.bd.db.transaction(async (tx) => {
      await this.bloquear(tx, conductorId);
      const saldoPuntos = await this.saldo(conductorId, tx);
      const deuda = await this.deudaDelConductor(conductorId, tx);
      const a = abonoConPuntos({
        saldoPuntos,
        deuda,
        reglas,
        ...(puntosPedidos === undefined ? {} : { puntosPedidos }),
      });
      if (!a.ok) throw conflicto(a.codigo, a.detalle);
      const [mov] = await tx
        .insert(movimientoSaldo)
        .values({
          conductorId,
          tipo: 'abono_puntos',
          monto: a.monto,
          motivo: `Abono con ${a.puntos} puntos`,
        })
        .returning({ id: movimientoSaldo.id });
      await tx.insert(movimientoPuntos).values({
        usuarioId: conductorId,
        tipo: 'canje_abono',
        puntos: -a.puntos,
        valorPunto: reglas.valorPunto,
        movimientoSaldoId: mov!.id,
        motivo: 'Abono a la comisión',
      });
      const { saldo, habilitado } = await this.pagos.habilitarSiSinDeuda(tx, conductorId);
      return {
        puntos: a.puntos,
        monto: a.monto,
        saldoPuntos: saldoPuntos - a.puntos,
        deuda: Math.max(0, -saldo),
        habilitado,
      };
    });
    if (resultado.habilitado)
      this.eventos.aConductor(conductorId, 'conductor:estado', {
        estadoOperativo: 'desconectado',
        motivo: 'comision_pagada',
      });
    return resultado;
  }
}
