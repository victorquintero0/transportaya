import { Inject, Injectable } from '@nestjs/common';
import { auditoria, pasajero, sesion, ticket, usuario, viaje } from '@transportaya/db';
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { type Operador, auditar } from './auditoria.js';
import { comodines } from './comun.js';

export interface FiltroPasajeros {
  q?: string | undefined;
  estado?: string | undefined;
  conDeuda?: boolean | undefined;
  limite: number;
  desplazar: number;
}

@Injectable()
export class PasajerosOperacionService {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  async listar(f: FiltroPasajeros) {
    const donde = and(
      f.q
        ? or(ilike(usuario.nombre, comodines(f.q)), ilike(usuario.telefono, comodines(f.q)))
        : undefined,
      f.estado ? sql`${usuario.estado}::text = ${f.estado}` : undefined,
      f.conDeuda ? sql`${pasajero.deudaPendiente} > 0` : undefined,
    );
    const filas = await this.bd.db
      .select({
        id: pasajero.usuarioId,
        nombre: usuario.nombre,
        telefono: usuario.telefono,
        estado: usuario.estado,
        calificacion: pasajero.calificacionPromedio,
        deuda: pasajero.deudaPendiente,
        creadoEn: pasajero.creadoEn,
        viajes: sql<number>`(select count(*)::int from viaje v where v.pasajero_id = ${pasajero.usuarioId} and v.estado = 'finalizado')`,
      })
      .from(pasajero)
      .innerJoin(usuario, eq(usuario.id, pasajero.usuarioId))
      .where(donde)
      .orderBy(desc(pasajero.creadoEn))
      .limit(f.limite)
      .offset(f.desplazar);
    const [t] = await this.bd.db
      .select({ total: sql<number>`count(*)::int` })
      .from(pasajero)
      .innerJoin(usuario, eq(usuario.id, pasajero.usuarioId))
      .where(donde);
    return {
      total: t?.total ?? 0,
      items: filas.map((r) => ({ ...r, creadoEn: r.creadoEn.toISOString() })),
    };
  }

  private async cargar(id: string) {
    const [p] = await this.bd.db
      .select({ p: pasajero, u: usuario })
      .from(pasajero)
      .innerJoin(usuario, eq(usuario.id, pasajero.usuarioId))
      .where(eq(pasajero.usuarioId, id));
    if (!p) throw noEncontrado('PASAJERO_NO_ENCONTRADO', 'No encontramos a ese pasajero');
    return p;
  }

  async ficha(id: string) {
    const { db } = this.bd;
    const { p, u } = await this.cargar(id);
    const viajes = await db
      .select({
        id: viaje.id,
        codigo: viaje.codigo,
        estado: viaje.estado,
        solicitadoEn: viaje.solicitadoEn,
        precioFinal: viaje.precioFinal,
        canceladoPor: viaje.canceladoPor,
      })
      .from(viaje)
      .where(eq(viaje.pasajeroId, id))
      .orderBy(desc(viaje.solicitadoEn))
      .limit(15);
    const [r] = (
      await db.execute<{ finalizados: number; cancelados: number; cancelados_30d: number }>(sql`
        select
          count(*) filter (where estado = 'finalizado')::int as finalizados,
          count(*) filter (where estado = 'cancelado' and cancelado_por = 'pasajero')::int as cancelados,
          count(*) filter (where estado = 'cancelado' and cancelado_por = 'pasajero' and solicitado_en > now() - interval '30 days')::int as cancelados_30d
        from viaje where pasajero_id = ${id}`)
    ).rows;
    const tickets = await db
      .select({
        id: ticket.id,
        tipo: ticket.tipo,
        estado: ticket.estado,
        asunto: ticket.asunto,
        creadoEn: ticket.creadoEn,
      })
      .from(ticket)
      .where(eq(ticket.usuarioId, id))
      .orderBy(desc(ticket.creadoEn))
      .limit(10);
    const historial = await db
      .select({
        accion: auditoria.accion,
        quien: usuario.nombre,
        motivo: auditoria.motivo,
        ocurridoEn: auditoria.ocurridoEn,
      })
      .from(auditoria)
      .leftJoin(usuario, eq(usuario.id, auditoria.usuarioId))
      .where(and(eq(auditoria.entidad, 'pasajero'), eq(auditoria.entidadId, id)))
      .orderBy(desc(auditoria.ocurridoEn))
      .limit(15);
    return {
      id,
      nombre: u.nombre,
      telefono: u.telefono,
      email: u.email,
      estado: u.estado,
      calificacion: p.calificacionPromedio,
      calificaciones: p.calificacionesTotal,
      deuda: p.deudaPendiente,
      aceptoTerminosEn: p.aceptoTerminosEn?.toISOString() ?? null,
      creadoEn: p.creadoEn.toISOString(),
      resumen: {
        viajesFinalizados: r?.finalizados ?? 0,
        cancelacionesPropias: r?.cancelados ?? 0,
        cancelacionesUlt30d: r?.cancelados_30d ?? 0,
      },
      viajes: viajes.map((v) => ({ ...v, solicitadoEn: v.solicitadoEn.toISOString() })),
      tickets: tickets.map((t) => ({ ...t, creadoEn: t.creadoEn.toISOString() })),
      historial: historial.map((h) => ({
        ...h,
        quien: h.quien ?? 'Sistema',
        ocurridoEn: h.ocurridoEn.toISOString(),
      })),
    };
  }

  async bloquear(id: string, motivo: string, operador: Operador) {
    const { u } = await this.cargar(id);
    if (u.estado === 'bloqueado') throw conflicto('YA_BLOQUEADO', 'Ya está bloqueado.');
    const [activo] = await this.bd.db
      .select({ id: viaje.id })
      .from(viaje)
      .where(
        and(
          eq(viaje.pasajeroId, id),
          inArray(viaje.estado, ['buscando_conductor', 'asignado', 'en_sitio', 'en_curso']),
        ),
      )
      .limit(1);
    if (activo)
      throw conflicto(
        'TIENE_VIAJE_ACTIVO',
        'Tiene un viaje en curso. Termínalo o cancélalo antes de bloquearlo.',
      );
    await this.bd.db.transaction(async (tx) => {
      await tx.update(usuario).set({ estado: 'bloqueado' }).where(eq(usuario.id, id));
      await tx
        .update(sesion)
        .set({ revocadaEn: new Date() })
        .where(and(eq(sesion.usuarioId, id), isNull(sesion.revocadaEn)));
      await auditar(tx, operador, {
        accion: 'pasajero.bloquear',
        entidad: 'pasajero',
        entidadId: id,
        antes: { estado: u.estado },
        despues: { estado: 'bloqueado' },
        motivo,
      });
    });
  }

  async desbloquear(id: string, motivo: string, operador: Operador) {
    const { u } = await this.cargar(id);
    if (u.estado !== 'bloqueado')
      throw conflicto('NO_ESTA_BLOQUEADO', 'Esta persona no está bloqueada.');
    await this.bd.db.transaction(async (tx) => {
      await tx.update(usuario).set({ estado: 'activo' }).where(eq(usuario.id, id));
      await auditar(tx, operador, {
        accion: 'pasajero.desbloquear',
        entidad: 'pasajero',
        entidadId: id,
        antes: { estado: u.estado },
        despues: { estado: 'activo' },
        motivo,
      });
    });
  }
}
