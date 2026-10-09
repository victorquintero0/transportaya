import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { categoriaVehiculo, estadoCuentaEmpresa, estadoVinculo, tipoServicio } from './enums.js';
import { empleado, empresa, usuario } from './identidad.js';
import { actualizadoEn, cop, creadoEn, id, marca } from './tipos.js';

/** A qué área de la empresa se carga cada viaje (RN-101). */
export const centroCosto = pgTable(
  'centro_costo',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    activo: boolean('activo').notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('centro_costo_codigo_uq').on(t.empresaId, t.codigo)],
);

/** Reglas de uso del perfil corporativo (RN-102). Listas vacías significan «sin restricción». */
export const politicaUso = pgTable(
  'politica_uso',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    nombre: text('nombre').notNull(),
    /** 1 = lunes … 7 = domingo. */
    dias: integer('dias')
      .array()
      .notNull()
      .default(sql`'{}'`),
    desdeMin: integer('desde_min').notNull().default(0),
    hastaMin: integer('hasta_min').notNull().default(1440),
    montoMaximo: cop('monto_maximo'),
    categorias: categoriaVehiculo('categorias')
      .array()
      .notNull()
      .default(sql`'{}'`),
    tiposServicio: tipoServicio('tipos_servicio')
      .array()
      .notNull()
      .default(sql`'{}'`),
    motivoObligatorio: boolean('motivo_obligatorio').notNull().default(false),
    activa: boolean('activa').notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('politica_uso_nombre_uq').on(t.empresaId, t.nombre),
    check(
      'politica_uso_ventana',
      sql`${t.desdeMin} between 0 and 1439 and ${t.hastaMin} between 1 and 1440`,
    ),
    check('politica_uso_monto', sql`${t.montoMaximo} is null or ${t.montoMaximo} > 0`),
  ],
);

/**
 * Un empleado de una empresa cliente. Nace como invitación por celular; cuando la persona la acepta en su app queda
 * ligada a su cuenta (`usuario_id`). Una persona está activa en una sola empresa a la vez.
 */
export const vinculoEmpresa = pgTable(
  'vinculo_empresa',
  {
    id: id(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    telefono: text('telefono').notNull(),
    nombre: text('nombre').notNull(),
    usuarioId: uuid('usuario_id').references(() => usuario.id),
    centroCostoId: uuid('centro_costo_id').references(() => centroCosto.id),
    politicaId: uuid('politica_id').references(() => politicaUso.id),
    estado: estadoVinculo('estado').notNull().default('invitado'),
    invitadoPor: uuid('invitado_por').references(() => empleado.usuarioId),
    invitadoEn: marca('invitado_en').notNull().defaultNow(),
    aceptadoEn: marca('aceptado_en'),
    retiradoEn: marca('retirado_en'),
  },
  (t) => [
    uniqueIndex('vinculo_empresa_telefono_uq')
      .on(t.empresaId, t.telefono)
      .where(sql`${t.estado} <> 'retirado'`),
    uniqueIndex('vinculo_empresa_activo_uq')
      .on(t.usuarioId)
      .where(sql`${t.estado} = 'activo'`),
    index('vinculo_empresa_telefono_idx').on(t.telefono),
    check(
      'vinculo_empresa_activo_con_usuario',
      sql`${t.estado} <> 'activo' or ${t.usuarioId} is not null`,
    ),
  ],
);

/** Cobro de un ciclo a una empresa (RN-105). Los viajes que incluye apuntan a él desde `viaje.estado_cuenta_id`. */
export const estadoCuenta = pgTable(
  'estado_cuenta',
  {
    id: id(),
    codigo: text('codigo').notNull(),
    empresaId: uuid('empresa_id')
      .notNull()
      .references(() => empresa.id),
    periodoDesde: date('periodo_desde').notNull(),
    periodoHasta: date('periodo_hasta').notNull(),
    viajes: integer('viajes').notNull(),
    subtotal: cop('subtotal').notNull(),
    descuento: cop('descuento').notNull(),
    total: cop('total').notNull(),
    estado: estadoCuentaEmpresa('estado').notNull().default('emitido'),
    emitidoEn: marca('emitido_en').notNull().defaultNow(),
    venceEn: date('vence_en').notNull(),
    pagadoEn: marca('pagado_en'),
    referenciaPago: text('referencia_pago'),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('estado_cuenta_codigo_uq').on(t.codigo),
    uniqueIndex('estado_cuenta_ciclo_uq').on(t.empresaId, t.periodoHasta),
    index('estado_cuenta_empresa_idx').on(t.empresaId, t.periodoHasta),
    check('estado_cuenta_total', sql`${t.total} = ${t.subtotal} - ${t.descuento}`),
    check('estado_cuenta_pagado', sql`(${t.estado} = 'pagado') = (${t.pagadoEn} is not null)`),
  ],
);
