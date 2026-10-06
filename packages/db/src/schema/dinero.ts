import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cuentaPagoConductor, conductor } from './conductores.js';
import {
  estadoCierre,
  estadoConciliacion,
  estadoPago,
  estadoTransferencia,
  resultadoCierre,
  tipoMovimiento,
  tipoPago,
} from './enums.js';
import { metodoPago, usuario } from './identidad.js';
import { ticket } from './soporte.js';
import { actualizadoEn, cop, creadoEn, id, marca } from './tipos.js';
import { viaje } from './viajes.js';

/** Cobro de un viaje. La `clave_idempotencia` evita cobrar dos veces (docs/10). */
export const pago = pgTable(
  'pago',
  {
    id: id(),
    viajeId: uuid('viaje_id')
      .notNull()
      .references(() => viaje.id),
    metodoPagoId: uuid('metodo_pago_id').references(() => metodoPago.id),
    tipo: tipoPago('tipo').notNull(),
    monto: cop('monto').notNull(),
    estado: estadoPago('estado').notNull().default('pendiente'),
    referenciaProveedor: text('referencia_proveedor'),
    claveIdempotencia: text('clave_idempotencia').notNull(),
    intentos: integer('intentos').notNull().default(0),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('pago_idempotencia_uq').on(t.claveIdempotencia),
    index('pago_viaje_idx').on(t.viajeId),
    index('pago_pendientes_idx')
      .on(t.estado, t.actualizadoEn)
      .where(sql`${t.estado} in ('pendiente', 'fallido')`),
    check('pago_monto', sql`${t.monto} > 0`),
    check('pago_intentos', sql`${t.intentos} >= 0`),
  ],
);

export const reembolso = pgTable(
  'reembolso',
  {
    id: id(),
    pagoId: uuid('pago_id')
      .notNull()
      .references(() => pago.id),
    ticketId: uuid('ticket_id').references(() => ticket.id),
    monto: cop('monto').notNull(),
    motivo: text('motivo').notNull(),
    aprobadoPor: uuid('aprobado_por')
      .notNull()
      .references(() => usuario.id),
    referenciaProveedor: text('referencia_proveedor'),
    creadoEn: creadoEn(),
  },
  (t) => [index('reembolso_pago_idx').on(t.pagoId), check('reembolso_monto', sql`${t.monto} > 0`)],
);

/**
 * Cierre diario del conductor a las 00:00 (RN-063, RN-070). El saldo final es el cruce neto:
 * positivo, TransporteYa le paga; negativo, el conductor paga su comisión para habilitarse.
 */
export const cierreDiario = pgTable(
  'cierre_diario',
  {
    id: id(),
    conductorId: uuid('conductor_id')
      .notNull()
      .references(() => conductor.usuarioId),
    dia: date('dia').notNull(),
    saldoInicial: cop('saldo_inicial').notNull(),
    netoDia: cop('neto_dia').notNull(),
    saldoFinal: cop('saldo_final').notNull(),
    resultado: resultadoCierre('resultado').notNull(),
    estado: estadoCierre('estado').notNull().default('abierto'),
    generadoEn: marca('generado_en').notNull().defaultNow(),
    aprobadoPor: uuid('aprobado_por').references(() => usuario.id),
    aprobadoEn: marca('aprobado_en'),
  },
  (t) => [
    uniqueIndex('cierre_diario_conductor_dia_uq').on(t.conductorId, t.dia),
    index('cierre_diario_dia_idx').on(t.dia, t.estado),
    check('cierre_diario_cuadra', sql`${t.saldoFinal} = ${t.saldoInicial} + ${t.netoDia}`),
    check(
      'cierre_diario_resultado',
      sql`(${t.resultado} = 'a_favor' and ${t.saldoFinal} > 0)
        or (${t.resultado} = 'a_cargo' and ${t.saldoFinal} < 0)
        or (${t.resultado} = 'en_cero' and ${t.saldoFinal} = 0)`,
    ),
  ],
);

/** Pago de TransporteYa al conductor por llave o Bre-B (saldo a favor). */
export const pagoConductor = pgTable(
  'pago_conductor',
  {
    id: id(),
    conductorId: uuid('conductor_id')
      .notNull()
      .references(() => conductor.usuarioId),
    cierreId: uuid('cierre_id')
      .notNull()
      .references(() => cierreDiario.id),
    cuentaPagoId: uuid('cuenta_pago_id')
      .notNull()
      .references(() => cuentaPagoConductor.id),
    monto: cop('monto').notNull(),
    estado: estadoTransferencia('estado').notNull().default('pendiente'),
    referencia: text('referencia'),
    motivoRechazo: text('motivo_rechazo'),
    enviadoEn: marca('enviado_en'),
    confirmadoEn: marca('confirmado_en'),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('pago_conductor_cierre_uq').on(t.cierreId),
    index('pago_conductor_estado_idx').on(t.estado),
    check('pago_conductor_monto', sql`${t.monto} > 0`),
    check(
      'pago_conductor_confirmado',
      sql`${t.estado} <> 'confirmada' or ${t.confirmadoEn} is not null`,
    ),
  ],
);

/**
 * Pago de la comisión del conductor a TransporteYa por llave o Bre-B. Al conciliarse genera el
 * movimiento `pago_comision` y habilita al conductor (RN-063, R-14).
 */
export const pagoComision = pgTable(
  'pago_comision',
  {
    id: id(),
    conductorId: uuid('conductor_id')
      .notNull()
      .references(() => conductor.usuarioId),
    cierreId: uuid('cierre_id').references(() => cierreDiario.id),
    monto: cop('monto').notNull(),
    canal: text('canal').notNull().default('llave_bre_b'),
    /** Identificador de la transferencia: evita conciliar dos veces el mismo pago. */
    referencia: text('referencia'),
    estado: estadoConciliacion('estado').notNull().default('pendiente'),
    conciliadoPor: uuid('conciliado_por').references(() => usuario.id),
    conciliadoEn: marca('conciliado_en'),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('pago_comision_referencia_uq')
      .on(t.canal, t.referencia)
      .where(sql`${t.referencia} is not null`),
    index('pago_comision_pendientes_idx')
      .on(t.estado, t.creadoEn)
      .where(sql`${t.estado} = 'pendiente'`),
    check('pago_comision_monto', sql`${t.monto} > 0`),
    check(
      'pago_comision_conciliado',
      sql`${t.estado} <> 'conciliado' or ${t.conciliadoEn} is not null`,
    ),
  ],
);

/**
 * Libro de movimientos del conductor (RN-061). **Inmutable**: un disparador impide UPDATE y DELETE;
 * los errores se corrigen con un movimiento de ajuste con doble aprobación.
 */
export const movimientoSaldo = pgTable(
  'movimiento_saldo',
  {
    id: id(),
    conductorId: uuid('conductor_id')
      .notNull()
      .references(() => conductor.usuarioId),
    tipo: tipoMovimiento('tipo').notNull(),
    /** Con signo: positivo a favor del conductor, negativo a su cargo. */
    monto: cop('monto').notNull(),
    viajeId: uuid('viaje_id').references(() => viaje.id),
    cierreId: uuid('cierre_id').references(() => cierreDiario.id),
    pagoComisionId: uuid('pago_comision_id').references(() => pagoComision.id),
    pagoConductorId: uuid('pago_conductor_id').references(() => pagoConductor.id),
    motivo: text('motivo'),
    creadoPor: uuid('creado_por').references(() => usuario.id),
    aprobadoPor: uuid('aprobado_por').references(() => usuario.id),
    creadoEn: creadoEn(),
    /** Día calendario en Bogotá: es el que cierra el cierre diario. */
    dia: date('dia').generatedAlwaysAs(sql`((creado_en at time zone 'America/Bogota')::date)`),
  },
  (t) => [
    index('movimiento_conductor_dia_idx').on(t.conductorId, t.dia),
    index('movimiento_cierre_idx').on(t.cierreId),
    index('movimiento_viaje_idx').on(t.viajeId),
    /** Un viaje no puede contabilizarse dos veces. */
    uniqueIndex('movimiento_viaje_tipo_uq')
      .on(t.viajeId, t.tipo)
      .where(
        sql`${t.tipo} in ('ingreso_viaje_electronico', 'comision_viaje_efectivo', 'peaje', 'propina', 'cancelacion')`,
      ),
    uniqueIndex('movimiento_pago_comision_uq')
      .on(t.pagoComisionId)
      .where(sql`${t.pagoComisionId} is not null`),
    uniqueIndex('movimiento_pago_conductor_uq')
      .on(t.pagoConductorId)
      .where(sql`${t.pagoConductorId} is not null`),
    check('movimiento_monto_no_cero', sql`${t.monto} <> 0`),
    check(
      'movimiento_signo_y_origen',
      sql`case ${t.tipo}
        when 'ingreso_viaje_electronico' then ${t.monto} > 0 and ${t.viajeId} is not null
        when 'comision_viaje_efectivo' then ${t.monto} < 0 and ${t.viajeId} is not null
        when 'peaje' then ${t.monto} > 0 and ${t.viajeId} is not null
        when 'propina' then ${t.monto} > 0 and ${t.viajeId} is not null
        when 'cancelacion' then ${t.viajeId} is not null
        when 'pago_comision' then ${t.monto} > 0 and ${t.pagoComisionId} is not null
        when 'pago_liquidacion' then ${t.monto} < 0 and ${t.pagoConductorId} is not null
        when 'ajuste' then ${t.motivo} is not null and ${t.creadoPor} is not null
          and ${t.aprobadoPor} is not null and ${t.aprobadoPor} <> ${t.creadoPor}
        else false end`,
    ),
  ],
);
