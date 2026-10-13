import { Inject, Injectable } from '@nestjs/common';
import { movimientoPuntos, referido, usuario, viaje } from '@transportaya/db';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { ParametrosService } from '../operacion/parametros.service.js';
import { auditar, type Operador } from '../operacion/auditoria.js';
import { comodines } from '../operacion/comun.js';
import { ReferidosService } from './referidos.service.js';

type EstadoReferidoFiltro = 'pendiente' | 'otorgado' | 'rechazado';

/** Lo que Operación ve y puede hacer con el programa de referidos (OPE-14). */
@Injectable()
export class ReferidosOpService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(ReferidosService) private readonly referidos: ReferidosService,
  ) {}

  /** Cifras del programa: cuántos referidos, cuántos puntos hay, cuánto cuesta y quién invita más (para vigilar abusos). */
  async resumen() {
    const { db } = this.bd;
    const reglas = await this.parametros.referidos();
    const porEstado = await db
      .select({ estado: referido.estado, n: sql<number>`count(*)::int` })
      .from(referido)
      .groupBy(referido.estado);
    const [puntos] = await db
      .select({
        emitidos: sql<number>`coalesce(sum(${movimientoPuntos.puntos}) filter (where ${movimientoPuntos.tipo} in ('referido_referidor', 'referido_invitado')), 0)::int`,
        canjeados: sql<number>`coalesce(-sum(${movimientoPuntos.puntos}) filter (where ${movimientoPuntos.tipo} in ('canje_descuento', 'canje_abono', 'reverso')), 0)::int`,
        enCirculacion: sql<number>`coalesce(sum(${movimientoPuntos.puntos}), 0)::int`,
      })
      .from(movimientoPuntos);
    const [descuentos] = await db
      .select({ s: sql<number>`coalesce(sum(${viaje.descuentoPuntos}), 0)::bigint` })
      .from(viaje);
    const [abonos] = await db
      .execute<{ s: string }>(
        sql`select coalesce(sum(monto), 0)::text as s from movimiento_saldo where tipo = 'abono_puntos'`,
      )
      .then((r) => r.rows);
    const top = await db.execute<{
      id: string;
      nombre: string;
      telefono: string;
      invitados: number;
      otorgados: number;
      puntos: number;
    }>(sql`
      select u.id, u.nombre, u.telefono, count(*)::int as invitados,
             count(*) filter (where r.estado = 'otorgado')::int as otorgados,
             coalesce(sum(r.puntos_referidor), 0)::int as puntos
      from referido r join usuario u on u.id = r.referidor_id
      group by u.id, u.nombre, u.telefono
      order by invitados desc, puntos desc limit 10`);
    const cuenta = (e: EstadoReferidoFiltro) => porEstado.find((f) => f.estado === e)?.n ?? 0;
    return {
      activo: reglas.activo,
      valorPunto: reglas.valorPunto,
      referidos: {
        pendientes: cuenta('pendiente'),
        otorgados: cuenta('otorgado'),
        rechazados: cuenta('rechazado'),
      },
      puntos: {
        emitidos: Number(puntos?.emitidos ?? 0),
        canjeados: Number(puntos?.canjeados ?? 0),
        enCirculacion: Number(puntos?.enCirculacion ?? 0),
      },
      costo: {
        /** Lo que TransporteYa ya pagó: descuentos en viajes y abonos a la comisión. */
        realizado: Number(descuentos?.s ?? 0) + Number(abonos?.s ?? 0),
        /** Lo que valdrían hoy todos los puntos que las personas aún tienen. */
        pendiente: Math.max(0, Number(puntos?.enCirculacion ?? 0)) * reglas.valorPunto,
      },
      masInvitan: top.rows,
    };
  }

  async listar(f: {
    estado?: EstadoReferidoFiltro | undefined;
    q?: string | undefined;
    limite: number;
    desplazar: number;
  }) {
    const referidor = alias(usuario, 'referidor');
    const invitado = alias(usuario, 'invitado');
    const q = f.q?.trim();
    const donde = and(
      f.estado ? eq(referido.estado, f.estado) : undefined,
      q
        ? or(
            ilike(referidor.nombre, comodines(q)),
            ilike(referidor.telefono, comodines(q)),
            ilike(invitado.nombre, comodines(q)),
            ilike(invitado.telefono, comodines(q)),
            ilike(referido.codigo, comodines(q)),
          )
        : undefined,
    );
    const filas = await this.bd.db
      .select({
        id: referido.id,
        codigo: referido.codigo,
        estado: referido.estado,
        rol: referido.rolInvitado,
        puntosReferidor: referido.puntosReferidor,
        puntosInvitado: referido.puntosInvitado,
        motivo: referido.motivo,
        creadoEn: referido.creadoEn,
        resueltoEn: referido.resueltoEn,
        referidorId: referidor.id,
        referidorNombre: referidor.nombre,
        referidorTelefono: referidor.telefono,
        invitadoId: invitado.id,
        invitadoNombre: invitado.nombre,
        invitadoTelefono: invitado.telefono,
      })
      .from(referido)
      .innerJoin(referidor, eq(referidor.id, referido.referidorId))
      .innerJoin(invitado, eq(invitado.id, referido.invitadoId))
      .where(donde)
      .orderBy(desc(referido.creadoEn))
      .limit(f.limite)
      .offset(f.desplazar);
    return filas.map((r) => ({
      ...r,
      creadoEn: r.creadoEn.toISOString(),
      resueltoEn: r.resueltoEn?.toISOString() ?? null,
    }));
  }

  /** La ficha de puntos de una persona: su código, saldo, movimientos e invitaciones. */
  async persona(usuarioId: string) {
    const [u] = await this.bd.db
      .select({ id: usuario.id, nombre: usuario.nombre, telefono: usuario.telefono })
      .from(usuario)
      .where(eq(usuario.id, usuarioId));
    if (!u) throw noEncontrado('USUARIO_NO_ENCONTRADO', 'No encontramos a esa persona.');
    const reglas = await this.parametros.referidos();
    const [codigo] = await this.bd.db
      .select({ c: usuario.codigoReferido })
      .from(usuario)
      .where(eq(usuario.id, usuarioId));
    const invitadoNombre = alias(usuario, 'invitado_nombre');
    const hechos = await this.bd.db
      .select({
        id: referido.id,
        invitado: invitadoNombre.nombre,
        estado: referido.estado,
        rol: referido.rolInvitado,
        puntos: referido.puntosReferidor,
        creadoEn: referido.creadoEn,
      })
      .from(referido)
      .innerJoin(invitadoNombre, eq(invitadoNombre.id, referido.invitadoId))
      .where(eq(referido.referidorId, usuarioId))
      .orderBy(desc(referido.creadoEn));
    const referidorNombre = alias(usuario, 'referidor_nombre');
    const [recibido] = await this.bd.db
      .select({
        id: referido.id,
        referidor: referidorNombre.nombre,
        codigo: referido.codigo,
        estado: referido.estado,
        puntos: referido.puntosInvitado,
      })
      .from(referido)
      .innerJoin(referidorNombre, eq(referidorNombre.id, referido.referidorId))
      .where(eq(referido.invitadoId, usuarioId));
    return {
      persona: u,
      codigo: codigo?.c ?? null,
      saldo: await this.referidos.saldo(usuarioId),
      valorPunto: reglas.valorPunto,
      movimientos: await this.referidos.movimientos(usuarioId, 50),
      invitados: hechos.map((h) => ({ ...h, creadoEn: h.creadoEn.toISOString() })),
      invitadoPor: recibido ?? null,
    };
  }

  /** Suma o resta puntos a mano (un error, una cortesía). Cuesta dinero a TransporteYa: pide permiso y motivo. */
  async ajustar(operador: Operador, usuarioId: string, puntos: number, motivo: string) {
    const reglas = await this.parametros.referidos();
    return this.bd.db.transaction(async (tx) => {
      const [u] = await tx
        .select({ id: usuario.id })
        .from(usuario)
        .where(eq(usuario.id, usuarioId))
        .for('update');
      if (!u) throw noEncontrado('USUARIO_NO_ENCONTRADO', 'No encontramos a esa persona.');
      const antes = await this.referidos.saldo(usuarioId, tx);
      await tx.insert(movimientoPuntos).values({
        usuarioId,
        tipo: 'ajuste',
        puntos,
        valorPunto: reglas.valorPunto,
        motivo,
        creadoPor: operador.id,
      });
      await auditar(tx, operador, {
        accion: 'referidos.ajustar',
        entidad: 'usuario',
        entidadId: usuarioId,
        antes: { saldo: antes },
        despues: { saldo: antes + puntos, ajuste: puntos },
        motivo,
      });
      return { saldo: antes + puntos };
    });
  }

  /** Un referido pendiente que no debe pagarse (cuenta falsa, abuso): queda rechazado y no entrega puntos. */
  async rechazar(operador: Operador, referidoId: string, motivo: string) {
    return this.bd.db.transaction(async (tx) => {
      const [r] = await tx.select().from(referido).where(eq(referido.id, referidoId)).for('update');
      if (!r) throw noEncontrado('REFERIDO_NO_ENCONTRADO', 'No encontramos ese referido.');
      if (r.estado !== 'pendiente')
        throw conflicto('REFERIDO_YA_RESUELTO', 'Ese referido ya no está pendiente.');
      await tx
        .update(referido)
        .set({ estado: 'rechazado', motivo, resueltoEn: new Date() })
        .where(eq(referido.id, referidoId));
      await auditar(tx, operador, {
        accion: 'referidos.rechazar',
        entidad: 'referido',
        entidadId: referidoId,
        antes: { estado: 'pendiente' },
        despues: { estado: 'rechazado' },
        motivo,
      });
      return { estado: 'rechazado' as const };
    });
  }

  /** Un referido que ya pagó pero era fraude: se marca rechazado y se restan los puntos que entregó. */
  async revertir(operador: Operador, referidoId: string, motivo: string) {
    const reglas = await this.parametros.referidos();
    return this.bd.db.transaction(async (tx) => {
      const [r] = await tx.select().from(referido).where(eq(referido.id, referidoId)).for('update');
      if (!r) throw noEncontrado('REFERIDO_NO_ENCONTRADO', 'No encontramos ese referido.');
      if (r.estado !== 'otorgado')
        throw conflicto(
          'REFERIDO_NO_OTORGADO',
          'Solo se puede revertir un referido que ya pagó puntos.',
        );
      await tx
        .update(referido)
        .set({ estado: 'rechazado', motivo, resueltoEn: new Date() })
        .where(eq(referido.id, referidoId));
      const restar = [
        { usuarioId: r.referidorId, puntos: r.puntosReferidor },
        { usuarioId: r.invitadoId, puntos: r.puntosInvitado },
      ].filter((f) => f.puntos > 0);
      for (const f of restar) {
        await tx
          .select({ id: usuario.id })
          .from(usuario)
          .where(eq(usuario.id, f.usuarioId))
          .for('update');
        await tx.insert(movimientoPuntos).values({
          usuarioId: f.usuarioId,
          tipo: 'ajuste',
          puntos: -f.puntos,
          valorPunto: reglas.valorPunto,
          referidoId,
          motivo: `Referido revertido: ${motivo}`,
          creadoPor: operador.id,
        });
      }
      await auditar(tx, operador, {
        accion: 'referidos.revertir',
        entidad: 'referido',
        entidadId: referidoId,
        antes: {
          estado: 'otorgado',
          puntosReferidor: r.puntosReferidor,
          puntosInvitado: r.puntosInvitado,
        },
        despues: { estado: 'rechazado' },
        motivo,
      });
      return {
        estado: 'rechazado' as const,
        puntosRestados: restar.reduce((s, f) => s + f.puntos, 0),
      };
    });
  }
}
