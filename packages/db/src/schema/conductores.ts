import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { catalogoVehiculo, ciudad } from './catalogos.js';
import {
  categoriaVehiculo,
  estadoDocumento,
  estadoHabilitacion,
  estadoOperativo,
  relacionVehiculo,
  tipoCuentaPago,
  tipoDocumento,
  titularDocumento,
} from './enums.js';
import { usuario } from './identidad.js';
import { actualizadoEn, creadoEn, id, marca, punto } from './tipos.js';

export const vehiculo = pgTable(
  'vehiculo',
  {
    id: id(),
    placa: text('placa').notNull(),
    /** Vacío si el vehículo no está en el catálogo: entra a revisión manual de cumplimiento. */
    catalogoVehiculoId: uuid('catalogo_vehiculo_id').references(() => catalogoVehiculo.id),
    marca: text('marca').notNull(),
    linea: text('linea').notNull(),
    modeloAnio: integer('modelo_anio').notNull(),
    color: text('color').notNull(),
    /** Asignada por el catálogo; cumplimiento puede corregirla con motivo y auditoría. */
    categoria: categoriaVehiculo('categoria').notNull(),
    fueraDeCatalogo: boolean('fuera_de_catalogo').notNull().default(false),
    activo: boolean('activo').notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('vehiculo_placa_uq').on(t.placa),
    check('vehiculo_placa_formato', sql`${t.placa} ~ '^[A-Z]{3}[0-9]{2}[0-9A-Z]$'`),
    check('vehiculo_modelo_anio', sql`${t.modeloAnio} between 1950 and 2100`),
  ],
);

export const conductor = pgTable(
  'conductor',
  {
    usuarioId: uuid('usuario_id')
      .primaryKey()
      .references(() => usuario.id, { onDelete: 'restrict' }),
    ciudadId: uuid('ciudad_id')
      .notNull()
      .references(() => ciudad.id),
    estadoHabilitacion: estadoHabilitacion('estado_habilitacion')
      .notNull()
      .default('registro_incompleto'),
    estadoOperativo: estadoOperativo('estado_operativo').notNull().default('desconectado'),
    vehiculoActivoId: uuid('vehiculo_activo_id').references(() => vehiculo.id),
    /** RN-003: atender categorías inferiores a la de su vehículo. */
    aceptaCategoriaInferior: boolean('acepta_categoria_inferior').notNull().default(false),
    /** RN-092: recibir viajes intermunicipales y nacionales. */
    aceptaIntermunicipal: boolean('acepta_intermunicipal').notNull().default(false),
    /** RN-063: deuda de comisión sin pagar tras el cierre diario. Lo fija el cierre y lo libera el pago. */
    bloqueadoPorDeuda: boolean('bloqueado_por_deuda').notNull().default(false),
    /** RUT configurable (D-06): se guarda si el conductor lo entrega. */
    rut: text('rut'),
    calificacionPromedio: numeric('calificacion_promedio', {
      precision: 3,
      scale: 2,
      mode: 'number',
    }),
    calificacionesTotal: integer('calificaciones_total').notNull().default(0),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    index('conductor_ciudad_estado_idx').on(t.ciudadId, t.estadoOperativo),
    check(
      'conductor_calificacion_rango',
      sql`${t.calificacionPromedio} is null or ${t.calificacionPromedio} between 1 and 5`,
    ),
  ],
);

export const conductorVehiculo = pgTable(
  'conductor_vehiculo',
  {
    conductorId: uuid('conductor_id')
      .notNull()
      .references(() => conductor.usuarioId, { onDelete: 'cascade' }),
    vehiculoId: uuid('vehiculo_id')
      .notNull()
      .references(() => vehiculo.id, { onDelete: 'cascade' }),
    relacion: relacionVehiculo('relacion').notNull(),
  },
  (t) => [primaryKey({ columns: [t.conductorId, t.vehiculoId] })],
);

/** Cuenta donde se le paga al conductor: llave Bre-B o cuenta bancaria (RN-070). */
export const cuentaPagoConductor = pgTable(
  'cuenta_pago_conductor',
  {
    id: id(),
    conductorId: uuid('conductor_id')
      .notNull()
      .references(() => conductor.usuarioId, { onDelete: 'cascade' }),
    tipo: tipoCuentaPago('tipo').notNull(),
    /** Llave o número de cuenta, cifrado a nivel de aplicación (RNF-46). */
    valorCifrado: text('valor_cifrado').notNull(),
    banco: text('banco'),
    verificada: boolean('verificada').notNull().default(false),
    activa: boolean('activa').notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('cuenta_pago_activa_uq')
      .on(t.conductorId)
      .where(sql`${t.activa}`),
  ],
);

/** Documentos de conductores y vehículos con su revisión (RN-110 a RN-116). */
export const documento = pgTable(
  'documento',
  {
    id: id(),
    titular: titularDocumento('titular').notNull(),
    conductorId: uuid('conductor_id').references(() => conductor.usuarioId, {
      onDelete: 'cascade',
    }),
    vehiculoId: uuid('vehiculo_id').references(() => vehiculo.id, { onDelete: 'cascade' }),
    tipo: tipoDocumento('tipo').notNull(),
    numero: text('numero'),
    venceEn: date('vence_en'),
    archivoClave: text('archivo_clave').notNull(),
    estado: estadoDocumento('estado').notNull().default('pendiente'),
    revisadoPor: uuid('revisado_por').references(() => usuario.id),
    revisadoEn: marca('revisado_en'),
    motivoRechazo: text('motivo_rechazo'),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    index('documento_conductor_tipo_idx').on(t.conductorId, t.tipo),
    index('documento_vehiculo_tipo_idx').on(t.vehiculoId, t.tipo),
    index('documento_vencimiento_idx')
      .on(t.venceEn)
      .where(sql`${t.estado} = 'aprobado'`),
    check(
      'documento_un_titular',
      sql`(${t.titular} = 'conductor' and ${t.conductorId} is not null and ${t.vehiculoId} is null)
        or (${t.titular} = 'vehiculo' and ${t.vehiculoId} is not null and ${t.conductorId} is null)`,
    ),
    check(
      'documento_rechazo_con_motivo',
      sql`${t.estado} <> 'rechazado' or ${t.motivoRechazo} is not null`,
    ),
    check(
      'documento_aprobado_revisado',
      sql`${t.estado} <> 'aprobado' or (${t.revisadoPor} is not null and ${t.revisadoEn} is not null)`,
    ),
  ],
);

/** Periodo en que el conductor está en línea. Base de las horas conectadas y la utilización. */
export const sesionConductor = pgTable(
  'sesion_conductor',
  {
    id: id(),
    conductorId: uuid('conductor_id')
      .notNull()
      .references(() => conductor.usuarioId),
    vehiculoId: uuid('vehiculo_id')
      .notNull()
      .references(() => vehiculo.id),
    inicio: marca('inicio').notNull().defaultNow(),
    fin: marca('fin'),
  },
  (t) => [
    index('sesion_conductor_idx').on(t.conductorId, t.inicio),
    uniqueIndex('sesion_conductor_abierta_uq')
      .on(t.conductorId)
      .where(sql`${t.fin} is null`),
    check('sesion_conductor_periodo', sql`${t.fin} is null or ${t.fin} >= ${t.inicio}`),
  ],
);

/**
 * Posiciones del conductor. En la base es una tabla **particionada por día**: la migración
 * de integridad la convierte (Drizzle no modela particiones). No lleva claves foráneas por el
 * volumen de escritura (RNF-10); los datos llegan de sesiones autenticadas.
 */
export const posicionConductor = pgTable(
  'posicion_conductor',
  {
    conductorId: uuid('conductor_id').notNull(),
    registradaEn: marca('registrada_en').notNull(),
    ubicacion: punto('ubicacion').notNull(),
    precisionM: integer('precision_m'),
    velocidadKmh: numeric('velocidad_kmh', { precision: 5, scale: 1, mode: 'number' }),
    rumbo: integer('rumbo'),
    estadoOperativo: estadoOperativo('estado_operativo').notNull(),
    viajeId: uuid('viaje_id'),
  },
  (t) => [
    primaryKey({ columns: [t.conductorId, t.registradaEn] }),
    index('posicion_viaje_idx')
      .on(t.viajeId, t.registradaEn)
      .where(sql`${t.viajeId} is not null`),
    check('posicion_rumbo', sql`${t.rumbo} is null or ${t.rumbo} between 0 and 359`),
  ],
);
