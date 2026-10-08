import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { categoriaVehiculo, modalidadRuta, tipoRecargo, tipoServicio, tipoZona } from './enums.js';
import { usuario } from './identidad.js';
import { actualizadoEn, cop, creadoEn, id, marca, poligono, punto } from './tipos.js';

export const ciudad = pgTable(
  'ciudad',
  {
    id: id(),
    nombre: text('nombre').notNull(),
    departamento: text('departamento').notNull(),
    /** Área de servicio (RN-001). Solo se aceptan solicitudes con origen dentro. */
    areaServicio: poligono('area_servicio'),
    zonaHoraria: text('zona_horaria').notNull().default('America/Bogota'),
    activa: boolean('activa').notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('ciudad_nombre_uq').on(t.nombre, t.departamento)],
);

/** Catálogo de vehículos que circulan en Colombia; asigna la categoría al registrar (D-07). */
export const catalogoVehiculo = pgTable(
  'catalogo_vehiculo',
  {
    id: id(),
    marca: text('marca').notNull(),
    linea: text('linea').notNull(),
    anioDesde: integer('anio_desde').notNull().default(1990),
    anioHasta: integer('anio_hasta'),
    carroceria: text('carroceria'),
    pasajeros: integer('pasajeros'),
    puertas: integer('puertas'),
    categoria: categoriaVehiculo('categoria').notNull(),
    fotoClave: text('foto_clave'),
    activo: boolean('activo').notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('catalogo_vehiculo_uq').on(t.marca, t.linea, t.anioDesde),
    check(
      'catalogo_vehiculo_anios',
      sql`${t.anioHasta} is null or ${t.anioHasta} >= ${t.anioDesde}`,
    ),
  ],
);

/**
 * Versión de tarifa (RN-014). La exclusión por traslape de vigencia se declara en la migración de
 * integridad, porque Drizzle no modela restricciones de exclusión.
 */
export const tarifa = pgTable(
  'tarifa',
  {
    id: id(),
    ciudadId: uuid('ciudad_id')
      .notNull()
      .references(() => ciudad.id),
    tipoServicio: tipoServicio('tipo_servicio').notNull().default('inmediato'),
    version: integer('version').notNull(),
    base: cop('base').notNull(),
    valorKm: cop('valor_km').notNull(),
    /** Se aplica al tiempo detenido (D-23): $223 por minuto en Manizales 2026. */
    valorMinuto: cop('valor_minuto').notNull(),
    minima: cop('minima').notNull(),
    cancelacion: cop('cancelacion').notNull().default(4000),
    esperaMinuto: cop('espera_minuto').notNull().default(250),
    esperaMinutosGratis: integer('espera_minutos_gratis').notNull().default(3),
    /** Origen del valor, por ejemplo el decreto que lo fija. */
    fuente: text('fuente'),
    vigenteDesde: marca('vigente_desde').notNull(),
    vigenteHasta: marca('vigente_hasta'),
    creadoPor: uuid('creado_por').references(() => usuario.id),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('tarifa_version_uq').on(t.ciudadId, t.tipoServicio, t.version),
    check(
      'tarifa_valores_no_negativos',
      sql`${t.base} >= 0 and ${t.valorKm} >= 0 and ${t.valorMinuto} >= 0 and ${t.minima} >= 0
        and ${t.cancelacion} >= 0 and ${t.esperaMinuto} >= 0 and ${t.esperaMinutosGratis} >= 0`,
    ),
    check(
      'tarifa_vigencia',
      sql`${t.vigenteHasta} is null or ${t.vigenteHasta} > ${t.vigenteDesde}`,
    ),
  ],
);

/**
 * Recargos de una tarifa (RN-011): nocturno, dominical/festivo, aeropuerto, puerta a puerta,
 * moteles, termales, mascotas y el recargo por categoría (D-22, con `categoria`).
 */
export const tarifaRecargo = pgTable(
  'tarifa_recargo',
  {
    id: id(),
    tarifaId: uuid('tarifa_id')
      .notNull()
      .references(() => tarifa.id, { onDelete: 'cascade' }),
    codigo: text('codigo').notNull(),
    nombre: text('nombre').notNull(),
    tipo: tipoRecargo('tipo').notNull().default('fijo'),
    /** Pesos si es `fijo`; puntos básicos (100 = 1 %) si es `porcentaje`. */
    valor: cop('valor').notNull(),
    /** Si se indica, el recargo solo aplica a esa categoría (D-22). */
    categoria: categoriaVehiculo('categoria'),
    activo: boolean('activo').notNull().default(true),
  },
  (t) => [
    // Un recargo general por código, y un recargo por código y categoría (D-22).
    uniqueIndex('tarifa_recargo_general_uq')
      .on(t.tarifaId, t.codigo)
      .where(sql`${t.categoria} is null`),
    uniqueIndex('tarifa_recargo_categoria_uq')
      .on(t.tarifaId, t.codigo, t.categoria)
      .where(sql`${t.categoria} is not null`),
    check('tarifa_recargo_valor', sql`${t.valor} >= 0`),
  ],
);

/** Calendario oficial de festivos de Colombia, cargado por año. */
export const festivo = pgTable('festivo', {
  fecha: date('fecha').primaryKey(),
  nombre: text('nombre').notNull(),
});

export const zona = pgTable(
  'zona',
  {
    id: id(),
    ciudadId: uuid('ciudad_id')
      .notNull()
      .references(() => ciudad.id),
    tipo: tipoZona('tipo').notNull(),
    nombre: text('nombre').notNull(),
    poligono: poligono('poligono').notNull(),
    activa: boolean('activa').notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [index('zona_ciudad_tipo_idx').on(t.ciudadId, t.tipo)],
);

/** Rutas con tarifa fija (RN-090). La primera carga son las 193 tarifas desde Manizales. */
export const rutaFija = pgTable(
  'ruta_fija',
  {
    id: id(),
    ciudadOrigenId: uuid('ciudad_origen_id')
      .notNull()
      .references(() => ciudad.id),
    destino: text('destino').notNull(),
    modalidad: modalidadRuta('modalidad').notNull().default('solo_ida'),
    tarifa: cop('tarifa').notNull(),
    destinoUbicacion: punto('destino_ubicacion'),
    fuente: text('fuente'),
    vigenteDesde: date('vigente_desde').notNull(),
    vigenteHasta: date('vigente_hasta'),
    activa: boolean('activa').notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('ruta_fija_uq').on(t.ciudadOrigenId, t.destino, t.modalidad, t.vigenteDesde),
    check('ruta_fija_tarifa', sql`${t.tarifa} > 0`),
    check(
      'ruta_fija_vigencia',
      sql`${t.vigenteHasta} is null or ${t.vigenteHasta} > ${t.vigenteDesde}`,
    ),
  ],
);

/** Parámetros operativos editables desde la App Operación (tiempos, radios, umbrales, intervalos de GPS). */
export const parametro = pgTable('parametro', {
  clave: text('clave').primaryKey(),
  valor: jsonb('valor').notNull(),
  descripcion: text('descripcion'),
  actualizadoPor: uuid('actualizado_por').references(() => usuario.id),
  actualizadoEn: actualizadoEn(),
});

/** Dinámica manual por zona y horario (RN-024, RN-025). */
export const dinamicaZona = pgTable(
  'dinamica_zona',
  {
    id: id(),
    zonaId: uuid('zona_id')
      .notNull()
      .references(() => zona.id),
    multiplicador: numeric('multiplicador', { precision: 4, scale: 2, mode: 'number' }).notNull(),
    desde: marca('desde').notNull(),
    hasta: marca('hasta').notNull(),
    motivo: text('motivo').notNull(),
    creadoPor: uuid('creado_por')
      .notNull()
      .references(() => usuario.id),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('dinamica_zona_vigencia_idx').on(t.zonaId, t.desde, t.hasta),
    check('dinamica_zona_multiplicador', sql`${t.multiplicador} >= 1`),
    check('dinamica_zona_periodo', sql`${t.hasta} > ${t.desde}`),
  ],
);

/**
 * Peajes georreferenciados (RN-091). Si el recorrido que midió el servidor pasa por uno activo, su valor se suma al
 * precio del viaje (RN-041). No cuenta para la comisión.
 */
export const peaje = pgTable(
  'peaje',
  {
    id: id(),
    nombre: text('nombre').notNull(),
    ubicacion: punto('ubicacion').notNull(),
    /** Lo que paga un automóvil (categoría I), en pesos. */
    valor: cop('valor').notNull(),
    fuente: text('fuente'),
    activo: boolean('activo').notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [uniqueIndex('peaje_nombre_uq').on(t.nombre), check('peaje_valor', sql`${t.valor} > 0`)],
);
