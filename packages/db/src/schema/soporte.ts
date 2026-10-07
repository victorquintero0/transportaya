import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { estadoTicket, prioridadTicket, tipoTicket } from './enums.js';
import { usuario } from './identidad.js';
import { actualizadoEn, creadoEn, id, marca } from './tipos.js';
import { viaje } from './viajes.js';

export const ticket = pgTable(
  'ticket',
  {
    id: id(),
    tipo: tipoTicket('tipo').notNull(),
    estado: estadoTicket('estado').notNull().default('abierto'),
    prioridad: prioridadTicket('prioridad').notNull().default('normal'),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    /** Los tickets sobre un viaje quedan vinculados a él (RN-142). */
    viajeId: uuid('viaje_id').references(() => viaje.id),
    asignadoA: uuid('asignado_a').references(() => usuario.id),
    asunto: text('asunto').notNull(),
    venceSlaEn: marca('vence_sla_en'),
    resueltoEn: marca('resuelto_en'),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    index('ticket_bandeja_idx')
      .on(t.estado, t.prioridad, t.venceSlaEn)
      .where(sql`${t.estado} not in ('resuelto', 'cerrado')`),
    index('ticket_usuario_idx').on(t.usuarioId, t.creadoEn),
    index('ticket_viaje_idx').on(t.viajeId),
    check(
      'ticket_resuelto',
      sql`${t.estado} not in ('resuelto', 'cerrado') or ${t.resueltoEn} is not null`,
    ),
  ],
);

export const ticketMensaje = pgTable(
  'ticket_mensaje',
  {
    id: id(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => ticket.id, { onDelete: 'cascade' }),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuario.id),
    cuerpo: text('cuerpo').notNull(),
    /** Nota interna: no la ve el usuario. */
    interno: boolean('interno').notNull().default(false),
    creadoEn: creadoEn(),
  },
  (t) => [index('ticket_mensaje_idx').on(t.ticketId, t.creadoEn)],
);

/** Registro inmutable de las acciones sensibles (RNF-48): quién, qué, antes, después y por qué. */
export const auditoria = pgTable(
  'auditoria',
  {
    id: id(),
    /** Vacío cuando la acción la hace el sistema. */
    usuarioId: uuid('usuario_id').references(() => usuario.id),
    accion: text('accion').notNull(),
    entidad: text('entidad').notNull(),
    entidadId: uuid('entidad_id'),
    antes: jsonb('antes'),
    despues: jsonb('despues'),
    motivo: text('motivo'),
    ip: text('ip'),
    ocurridoEn: marca('ocurrido_en').notNull().defaultNow(),
  },
  (t) => [
    index('auditoria_entidad_idx').on(t.entidad, t.entidadId, t.ocurridoEn),
    index('auditoria_usuario_idx').on(t.usuarioId, t.ocurridoEn),
    check('auditoria_accion', sql`${t.accion} ~ '^[a-z_]+([.][a-z_]+)+$'`),
  ],
);
