import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { movimientoSaldo } from './dinero.js';
import { estadoReferido, rolReferido, tipoPuntos } from './enums.js';
import { usuario } from './identidad.js';
import { viaje } from './viajes.js';
import { creadoEn, id, marca } from './tipos.js';

/**
 * Una invitación: `referidor` invitó a `invitado` con su código (RN-150). Queda pendiente hasta que el invitado termina
 * su primer viaje en el rol por el que lo invitaron; ahí se entregan los puntos (RN-153). Una persona solo puede ser
 * invitada una vez.
 */
export const referido = pgTable(
  'referido',
  {
    id: id(),
    referidorId: uuid('referidor_id')
      .notNull()
      .references(() => usuario.id),
    invitadoId: uuid('invitado_id')
      .notNull()
      .references(() => usuario.id),
    rolInvitado: rolReferido('rol_invitado').notNull(),
    estado: estadoReferido('estado').notNull().default('pendiente'),
    /** El código tal como se usó, para poder auditarlo aunque el referidor lo cambie. */
    codigo: text('codigo').notNull(),
    puntosReferidor: integer('puntos_referidor').notNull().default(0),
    puntosInvitado: integer('puntos_invitado').notNull().default(0),
    /** El primer viaje terminado que hizo que se entregaran los puntos. */
    viajeId: uuid('viaje_id').references(() => viaje.id),
    /** Por qué se rechazó, o la nota de quien lo resolvió a mano. */
    motivo: text('motivo'),
    creadoEn: creadoEn(),
    resueltoEn: marca('resuelto_en'),
  },
  (t) => [
    uniqueIndex('referido_invitado_uq').on(t.invitadoId),
    index('referido_referidor_idx').on(t.referidorId, t.estado),
    check('referido_distintos', sql`${t.referidorId} <> ${t.invitadoId}`),
    check('referido_resuelto', sql`(${t.estado} = 'pendiente') = (${t.resueltoEn} is null)`),
    check('referido_puntos', sql`${t.puntosReferidor} >= 0 and ${t.puntosInvitado} >= 0`),
  ],
);

/**
 * El libro de puntos de cada persona. El saldo es la suma de `puntos` (positivo suma, negativo resta); no se guarda
 * aparte para que nunca se desfase (RN-159).
 */
export const movimientoPuntos = pgTable(
  'movimiento_puntos',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id),
    tipo: tipoPuntos('tipo').notNull(),
    puntos: integer('puntos').notNull(),
    /** Cuántos pesos valía un punto cuando se hizo el movimiento. */
    valorPunto: integer('valor_punto').notNull(),
    referidoId: uuid('referido_id').references(() => referido.id),
    viajeId: uuid('viaje_id').references(() => viaje.id),
    /** El abono que dejó en el libro del conductor (canje_abono). */
    movimientoSaldoId: uuid('movimiento_saldo_id').references(() => movimientoSaldo.id),
    motivo: text('motivo'),
    /** Quien lo hizo a mano desde Operación (ajustes y reversos). */
    creadoPor: uuid('creado_por').references(() => usuario.id),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('movimiento_puntos_usuario_idx').on(t.usuarioId, t.creadoEn),
    index('movimiento_puntos_viaje_idx')
      .on(t.viajeId)
      .where(sql`${t.viajeId} is not null`),
    /** Cada referido paga una sola vez a cada parte. */
    uniqueIndex('movimiento_puntos_referido_uq')
      .on(t.referidoId, t.tipo, t.usuarioId)
      .where(sql`${t.tipo} in ('referido_referidor', 'referido_invitado')`),
    /** Un viaje separa puntos una vez y los devuelve una vez. */
    uniqueIndex('movimiento_puntos_viaje_tipo_uq')
      .on(t.viajeId, t.tipo)
      .where(sql`${t.tipo} in ('canje_descuento', 'reverso') and ${t.viajeId} is not null`),
    check('movimiento_puntos_valor', sql`${t.valorPunto} > 0 and ${t.puntos} <> 0`),
    check(
      'movimiento_puntos_signo',
      sql`(${t.tipo} in ('referido_referidor', 'referido_invitado', 'reverso') and ${t.puntos} > 0)
        or (${t.tipo} in ('canje_descuento', 'canje_abono') and ${t.puntos} < 0)
        or ${t.tipo} = 'ajuste'`,
    ),
  ],
);
