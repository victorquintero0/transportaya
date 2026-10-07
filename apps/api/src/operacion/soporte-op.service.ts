import { Inject, Injectable } from '@nestjs/common';
import {
  conductor,
  empleado,
  pago,
  pasajero,
  reembolso,
  ticket,
  ticketMensaje,
  usuario,
  viaje,
} from '@transportaya/db';
import { tienePermiso, type RolInterno } from '@transportaya/dominio';
import { and, desc, eq, ilike, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado, prohibido, solicitudInvalida } from '../comun/errores.js';
import { type Operador, auditar } from './auditoria.js';
import { comodines } from './comun.js';
import { ParametrosService } from './parametros.service.js';

type Estado = 'abierto' | 'en_proceso' | 'esperando_usuario' | 'resuelto' | 'cerrado';
type Tipo = typeof ticket.$inferSelect.tipo;
type Prioridad = 'baja' | 'normal' | 'alta' | 'critica';

export interface FiltroTickets {
  q?: string | undefined;
  estado?: string | undefined;
  tipo?: string | undefined;
  prioridad?: string | undefined;
  /** `yo`, `sin` (sin asignar) o el id de un agente. */
  asignado?: string | undefined;
  vencidos?: boolean | undefined;
  limite: number;
  desplazar: number;
}

/** Estado del tiempo de respuesta: verde, ámbar si queda menos de la cuarta parte del plazo, rojo si ya venció. */
function semaforoSla(
  vence: Date | null,
  creado: Date,
  cerrado: boolean,
): 'verde' | 'ambar' | 'rojo' | null {
  if (!vence || cerrado) return null;
  const restante = vence.getTime() - Date.now();
  if (restante <= 0) return 'rojo';
  return restante < (vence.getTime() - creado.getTime()) / 4 ? 'ambar' : 'verde';
}

@Injectable()
export class SoporteOperacionService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
  ) {}

  async listar(f: FiltroTickets, operadorId: string) {
    const usu = alias(usuario, 'usu');
    const asig = alias(usuario, 'asig');
    const donde = and(
      f.q
        ? or(
            ilike(ticket.asunto, comodines(f.q)),
            ilike(usu.nombre, comodines(f.q)),
            ilike(viaje.codigo, comodines(f.q)),
          )
        : undefined,
      f.estado === 'abiertos'
        ? notInArray(ticket.estado, ['resuelto', 'cerrado'])
        : f.estado
          ? sql`${ticket.estado}::text = ${f.estado}`
          : undefined,
      f.tipo ? sql`${ticket.tipo}::text = ${f.tipo}` : undefined,
      f.prioridad ? sql`${ticket.prioridad}::text = ${f.prioridad}` : undefined,
      f.asignado === 'yo'
        ? eq(ticket.asignadoA, operadorId)
        : f.asignado === 'sin'
          ? isNull(ticket.asignadoA)
          : f.asignado
            ? eq(ticket.asignadoA, f.asignado)
            : undefined,
      f.vencidos
        ? and(lt(ticket.venceSlaEn, new Date()), notInArray(ticket.estado, ['resuelto', 'cerrado']))
        : undefined,
    );
    const filas = await this.bd.db
      .select({
        id: ticket.id,
        tipo: ticket.tipo,
        estado: ticket.estado,
        prioridad: ticket.prioridad,
        asunto: ticket.asunto,
        usuarioId: ticket.usuarioId,
        usuario: usu.nombre,
        viajeId: ticket.viajeId,
        codigoViaje: viaje.codigo,
        asignadoA: ticket.asignadoA,
        asignado: asig.nombre,
        venceSlaEn: ticket.venceSlaEn,
        creadoEn: ticket.creadoEn,
        actualizadoEn: ticket.actualizadoEn,
      })
      .from(ticket)
      .innerJoin(usu, eq(usu.id, ticket.usuarioId))
      .leftJoin(viaje, eq(viaje.id, ticket.viajeId))
      .leftJoin(asig, eq(asig.id, ticket.asignadoA))
      .where(donde)
      .orderBy(
        sql`case ${ticket.prioridad} when 'critica' then 0 when 'alta' then 1 when 'normal' then 2 else 3 end`,
        sql`${ticket.venceSlaEn} asc nulls last`,
        desc(ticket.creadoEn),
      )
      .limit(f.limite)
      .offset(f.desplazar);
    const [t] = await this.bd.db
      .select({ total: sql<number>`count(*)::int` })
      .from(ticket)
      .innerJoin(usu, eq(usu.id, ticket.usuarioId))
      .leftJoin(viaje, eq(viaje.id, ticket.viajeId))
      .where(donde);
    const [resumen] = (
      await this.bd.db.execute<{ abiertos: number; vencidos: number; sin_asignar: number }>(sql`
        select count(*) filter (where estado not in ('resuelto','cerrado'))::int as abiertos,
               count(*) filter (where estado not in ('resuelto','cerrado') and vence_sla_en < now())::int as vencidos,
               count(*) filter (where estado not in ('resuelto','cerrado') and asignado_a is null)::int as sin_asignar
        from ticket`)
    ).rows;
    return {
      total: t?.total ?? 0,
      resumen: {
        abiertos: resumen?.abiertos ?? 0,
        vencidos: resumen?.vencidos ?? 0,
        sinAsignar: resumen?.sin_asignar ?? 0,
      },
      items: filas.map((r) => ({
        ...r,
        sla: semaforoSla(
          r.venceSlaEn,
          r.creadoEn,
          r.estado === 'resuelto' || r.estado === 'cerrado',
        ),
        venceSlaEn: r.venceSlaEn?.toISOString() ?? null,
        creadoEn: r.creadoEn.toISOString(),
        actualizadoEn: r.actualizadoEn.toISOString(),
      })),
    };
  }

  async detalle(id: string) {
    const usu = alias(usuario, 'usu');
    const asig = alias(usuario, 'asig');
    const [t] = await this.bd.db
      .select({
        t: ticket,
        usuario: usu.nombre,
        telefono: usu.telefono,
        asignado: asig.nombre,
        codigoViaje: viaje.codigo,
        esConductor: sql<boolean>`exists (select 1 from conductor c where c.usuario_id = ${ticket.usuarioId})`,
        esPasajero: sql<boolean>`exists (select 1 from pasajero p where p.usuario_id = ${ticket.usuarioId})`,
      })
      .from(ticket)
      .innerJoin(usu, eq(usu.id, ticket.usuarioId))
      .leftJoin(asig, eq(asig.id, ticket.asignadoA))
      .leftJoin(viaje, eq(viaje.id, ticket.viajeId))
      .where(eq(ticket.id, id));
    if (!t) throw noEncontrado('TICKET_NO_ENCONTRADO', 'No encontramos ese ticket');
    const autor = alias(usuario, 'autor');
    const mensajes = await this.bd.db
      .select({
        id: ticketMensaje.id,
        autorId: ticketMensaje.autorId,
        autor: autor.nombre,
        esEmpleado: sql<boolean>`exists (select 1 from empleado e where e.usuario_id = ${ticketMensaje.autorId})`,
        cuerpo: ticketMensaje.cuerpo,
        interno: ticketMensaje.interno,
        creadoEn: ticketMensaje.creadoEn,
      })
      .from(ticketMensaje)
      .innerJoin(autor, eq(autor.id, ticketMensaje.autorId))
      .where(eq(ticketMensaje.ticketId, id))
      .orderBy(ticketMensaje.creadoEn);
    const cerrado = t.t.estado === 'resuelto' || t.t.estado === 'cerrado';

    let reembolsable: { pagoId: string; monto: number; reembolsado: number } | null = null;
    if (t.t.viajeId) {
      const [p] = await this.bd.db
        .select({ id: pago.id, monto: pago.monto, estado: pago.estado, tipo: pago.tipo })
        .from(pago)
        .where(eq(pago.viajeId, t.t.viajeId));
      if (p && p.tipo === 'electronico' && ['pagado', 'reembolsado_parcial'].includes(p.estado)) {
        const [r] = await this.bd.db
          .select({ s: sql<number>`coalesce(sum(${reembolso.monto}), 0)::int` })
          .from(reembolso)
          .where(eq(reembolso.pagoId, p.id));
        reembolsable = { pagoId: p.id, monto: p.monto, reembolsado: r?.s ?? 0 };
      }
    }
    return {
      id: t.t.id,
      tipo: t.t.tipo,
      estado: t.t.estado,
      prioridad: t.t.prioridad,
      asunto: t.t.asunto,
      usuario: {
        id: t.t.usuarioId,
        nombre: t.usuario,
        telefono: t.telefono,
        tipo: t.esConductor ? 'conductor' : t.esPasajero ? 'pasajero' : 'otro',
      },
      viaje: t.t.viajeId ? { id: t.t.viajeId, codigo: t.codigoViaje } : null,
      asignadoA: t.t.asignadoA,
      asignado: t.asignado,
      sla: semaforoSla(t.t.venceSlaEn, t.t.creadoEn, cerrado),
      venceSlaEn: t.t.venceSlaEn?.toISOString() ?? null,
      creadoEn: t.t.creadoEn.toISOString(),
      resueltoEn: t.t.resueltoEn?.toISOString() ?? null,
      mensajes: mensajes.map((m) => ({ ...m, creadoEn: m.creadoEn.toISOString() })),
      reembolsable,
    };
  }

  async crear(
    d: {
      usuarioId: string;
      tipo: Tipo;
      prioridad?: Prioridad | undefined;
      viajeId?: string | undefined;
      asunto: string;
      detalle?: string | undefined;
    },
    operador: Operador,
  ) {
    const [u] = await this.bd.db
      .select({ id: usuario.id })
      .from(usuario)
      .where(eq(usuario.id, d.usuarioId));
    if (!u) throw noEncontrado('USUARIO_NO_ENCONTRADO', 'No encontramos a esa persona');
    const prioridad = d.prioridad ?? (d.tipo === 'incidente_seguridad' ? 'alta' : 'normal');
    const horas = await this.parametros.numero(
      prioridad === 'alta' || prioridad === 'critica'
        ? 'soporte.sla_alta_h'
        : 'soporte.sla_normal_h',
    );
    return this.bd.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(ticket)
        .values({
          tipo: d.tipo,
          prioridad,
          usuarioId: d.usuarioId,
          viajeId: d.viajeId ?? null,
          asignadoA: operador.id,
          estado: 'en_proceso',
          asunto: d.asunto,
          venceSlaEn: new Date(Date.now() + horas * 3_600_000),
        })
        .returning({ id: ticket.id });
      if (d.detalle?.trim())
        await tx.insert(ticketMensaje).values({
          ticketId: t!.id,
          autorId: operador.id,
          cuerpo: d.detalle.trim(),
          interno: true,
        });
      await auditar(tx, operador, {
        accion: 'ticket.crear',
        entidad: 'ticket',
        entidadId: t!.id,
        despues: { tipo: d.tipo, usuarioId: d.usuarioId, viajeId: d.viajeId ?? null },
      });
      return { id: t!.id };
    });
  }

  private async cargar(id: string) {
    const [t] = await this.bd.db.select().from(ticket).where(eq(ticket.id, id));
    if (!t) throw noEncontrado('TICKET_NO_ENCONTRADO', 'No encontramos ese ticket');
    return t;
  }

  /** Responder al usuario deja el ticket esperándolo; una nota interna no cambia nada. */
  async responder(id: string, d: { cuerpo: string; interno: boolean }, operador: Operador) {
    const t = await this.cargar(id);
    if (t.estado === 'cerrado') throw conflicto('TICKET_CERRADO', 'Ese ticket está cerrado.');
    await this.bd.db.transaction(async (tx) => {
      await tx
        .insert(ticketMensaje)
        .values({ ticketId: id, autorId: operador.id, cuerpo: d.cuerpo, interno: d.interno });
      const cambios: Partial<typeof ticket.$inferInsert> = {};
      if (!t.asignadoA) cambios.asignadoA = operador.id;
      if (!d.interno && (t.estado === 'abierto' || t.estado === 'en_proceso'))
        cambios.estado = 'esperando_usuario';
      if (d.interno && t.estado === 'abierto') cambios.estado = 'en_proceso';
      if (Object.keys(cambios).length)
        await tx.update(ticket).set(cambios).where(eq(ticket.id, id));
      await auditar(tx, operador, {
        accion: d.interno ? 'ticket.nota_interna' : 'ticket.responder',
        entidad: 'ticket',
        entidadId: id,
      });
    });
  }

  async actualizar(
    id: string,
    d: {
      estado?: Estado | undefined;
      prioridad?: Prioridad | undefined;
      asignadoA?: string | null | undefined;
    },
    operador: Operador,
  ) {
    const t = await this.cargar(id);
    if (d.asignadoA) {
      const [e] = await this.bd.db
        .select({ activo: empleado.activo })
        .from(empleado)
        .where(eq(empleado.usuarioId, d.asignadoA));
      if (!e?.activo) throw solicitudInvalida('Esa persona no es un agente activo.');
    }
    await this.bd.db.transaction(async (tx) => {
      const cambios: Partial<typeof ticket.$inferInsert> = {};
      if (d.estado) {
        cambios.estado = d.estado;
        cambios.resueltoEn =
          d.estado === 'resuelto' || d.estado === 'cerrado' ? (t.resueltoEn ?? new Date()) : null;
      }
      if (d.prioridad) cambios.prioridad = d.prioridad;
      if (d.asignadoA !== undefined) cambios.asignadoA = d.asignadoA;
      if (Object.keys(cambios).length === 0) throw solicitudInvalida('No hay nada que cambiar.');
      await tx.update(ticket).set(cambios).where(eq(ticket.id, id));
      await auditar(tx, operador, {
        accion: 'ticket.actualizar',
        entidad: 'ticket',
        entidadId: id,
        antes: { estado: t.estado, prioridad: t.prioridad, asignadoA: t.asignadoA },
        despues: {
          estado: d.estado ?? t.estado,
          prioridad: d.prioridad ?? t.prioridad,
          asignadoA: d.asignadoA === undefined ? t.asignadoA : d.asignadoA,
        },
      });
    });
  }

  /** Soporte reembolsa hasta un límite; por encima de él, finanzas o supervisión (docs/02). */
  async reembolsar(
    id: string,
    d: { monto: number; motivo: string },
    operador: Operador,
    roles: RolInterno[],
  ) {
    const t = await this.cargar(id);
    if (!t.viajeId) throw conflicto('SIN_VIAJE', 'Este ticket no está ligado a un viaje cobrado.');
    const limite = await this.parametros.numero('soporte.reembolso_limite_cop');
    if (d.monto > limite && !tienePermiso(roles, 'finanzas.operar'))
      throw prohibido(
        'LIMITE_REEMBOLSO',
        `Tu límite de reembolso es $${limite.toLocaleString('es-CO')}. Pásalo a finanzas o a un supervisor.`,
      );
    return this.bd.db.transaction(async (tx) => {
      const [p] = await tx.select().from(pago).where(eq(pago.viajeId, t.viajeId!)).for('update');
      if (!p || p.tipo !== 'electronico' || !['pagado', 'reembolsado_parcial'].includes(p.estado))
        throw conflicto(
          'SIN_COBRO_ELECTRONICO',
          'Ese viaje no tiene un cobro electrónico que reembolsar.',
        );
      const [prev] = await tx
        .select({ s: sql<number>`coalesce(sum(${reembolso.monto}), 0)::int` })
        .from(reembolso)
        .where(eq(reembolso.pagoId, p.id));
      const restante = p.monto - (prev?.s ?? 0);
      if (d.monto > restante)
        throw conflicto(
          'MONTO_EXCEDE_COBRO',
          `Solo se pueden reembolsar $${restante.toLocaleString('es-CO')} más de ese cobro.`,
        );
      const [r] = await tx
        .insert(reembolso)
        .values({
          pagoId: p.id,
          ticketId: id,
          monto: d.monto,
          motivo: d.motivo,
          aprobadoPor: operador.id,
        })
        .returning({ id: reembolso.id });
      const total = d.monto === restante;
      await tx
        .update(pago)
        .set({ estado: total ? 'reembolsado' : 'reembolsado_parcial' })
        .where(eq(pago.id, p.id));
      await tx
        .update(viaje)
        .set({ estadoPago: total ? 'reembolsado' : 'reembolsado_parcial' })
        .where(eq(viaje.id, t.viajeId!));
      await tx.insert(ticketMensaje).values({
        ticketId: id,
        autorId: operador.id,
        cuerpo: `Reembolso de $${d.monto.toLocaleString('es-CO')}: ${d.motivo}`,
        interno: true,
      });
      await auditar(tx, operador, {
        accion: 'reembolso.crear',
        entidad: 'ticket',
        entidadId: id,
        despues: { monto: d.monto, pagoId: p.id, reembolsoId: r!.id },
        motivo: d.motivo,
      });
      return { id: r!.id, restante: restante - d.monto };
    });
  }

  /** Agentes a quienes se puede asignar un ticket. */
  async agentes() {
    return this.bd.db
      .select({ id: empleado.usuarioId, nombre: usuario.nombre })
      .from(empleado)
      .innerJoin(usuario, eq(usuario.id, empleado.usuarioId))
      .where(eq(empleado.activo, true))
      .orderBy(usuario.nombre);
  }

  /** Para crear un ticket desde la ficha: ¿es conductor o pasajero? */
  async tipoDeUsuario(id: string) {
    const [c] = await this.bd.db
      .select({ id: conductor.usuarioId })
      .from(conductor)
      .where(eq(conductor.usuarioId, id));
    if (c) return 'conductor';
    const [p] = await this.bd.db
      .select({ id: pasajero.usuarioId })
      .from(pasajero)
      .where(eq(pasajero.usuarioId, id));
    return p ? 'pasajero' : 'otro';
  }
}
