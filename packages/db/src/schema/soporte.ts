import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { estadoTicket, prioridadTicket, tipoTicket } from './enums.js';
import { empleado, usuario } from './identidad.js';
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

/**
 * Solicitudes de las personas sobre sus datos personales (Ley 1581 de 2012, art. 14; RNF-62): consultar, rectificar,
 * suprimir o revocar la autorización. La ley da 10 días hábiles para las consultas y 15 para los reclamos, por eso cada
 * una guarda su fecha límite.
 */
export const solicitudDatos = pgTable(
  'solicitud_datos',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    rol: text('rol').notNull(),
    tipo: text('tipo').notNull(),
    detalle: text('detalle').notNull(),
    estado: text('estado').notNull().default('recibida'),
    venceEn: marca('vence_en').notNull(),
    respuesta: text('respuesta'),
    /** Quien resolvió. Vacío cuando la propia persona ejerció el derecho desde la app (por ejemplo, eliminar su cuenta). */
    resueltaPor: uuid('resuelta_por').references(() => empleado.usuarioId),
    resueltaEn: marca('resuelta_en'),
    creadaEn: creadoEn(),
  },
  (t) => [
    index('solicitud_datos_bandeja_idx')
      .on(t.estado, t.venceEn)
      .where(sql`${t.estado} in ('recibida', 'en_tramite')`),
    index('solicitud_datos_usuario_idx').on(t.usuarioId, t.creadaEn),
    check('solicitud_datos_rol', sql`${t.rol} in ('conductor', 'pasajero')`),
    check(
      'solicitud_datos_tipo',
      sql`${t.tipo} in ('consulta', 'rectificacion', 'supresion', 'revocatoria')`,
    ),
    check(
      'solicitud_datos_estado',
      sql`${t.estado} in ('recibida', 'en_tramite', 'aceptada', 'rechazada', 'ejecutada')`,
    ),
    check('solicitud_datos_detalle', sql`char_length(${t.detalle}) between 5 and 2000`),
    check(
      'solicitud_datos_resuelta',
      sql`(${t.estado} in ('recibida', 'en_tramite')) = (${t.resueltaEn} is null)`,
    ),
    check(
      'solicitud_datos_rechazo_con_respuesta',
      sql`${t.estado} <> 'rechazada' or ${t.respuesta} is not null`,
    ),
  ],
);
