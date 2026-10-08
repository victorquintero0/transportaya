import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ciudad, rutaFija, tarifa } from './catalogos.js';
import { conductor, vehiculo } from './conductores.js';
import {
  actorTipo,
  categoriaVehiculo,
  estadoAlerta,
  estadoPago,
  estadoViaje,
  metodoPagoViaje,
  resultadoOferta,
  severidadAlerta,
  tipoAlerta,
  tipoServicio,
} from './enums.js';
import { centroCosto, estadoCuenta, vinculoEmpresa } from './corporativo.js';
import { empresa, metodoPago, pasajero, usuario } from './identidad.js';
import { actualizadoEn, cop, creadoEn, id, lineaGeografica, marca, punto } from './tipos.js';

/** Precio estimado que ve el pasajero antes de confirmar (D-10): un rango, no un valor cerrado. */
export const cotizacion = pgTable(
  'cotizacion',
  {
    id: id(),
    pasajeroId: uuid('pasajero_id')
      .notNull()
      .references(() => pasajero.usuarioId),
    ciudadId: uuid('ciudad_id')
      .notNull()
      .references(() => ciudad.id),
    categoria: categoriaVehiculo('categoria').notNull(),
    tipoServicio: tipoServicio('tipo_servicio').notNull(),
    origen: punto('origen').notNull(),
    origenDireccion: text('origen_direccion'),
    destino: punto('destino').notNull(),
    destinoDireccion: text('destino_direccion'),
    /** Versión de tarifa usada (viajes urbanos). */
    tarifaId: uuid('tarifa_id').references(() => tarifa.id),
    /** Ruta con tarifa fija usada (viajes intermunicipales y nacionales). */
    rutaFijaId: uuid('ruta_fija_id').references(() => rutaFija.id),
    multiplicadorDinamico: numeric('multiplicador_dinamico', {
      precision: 4,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(1),
    distanciaEstimadaM: integer('distancia_estimada_m'),
    duracionEstimadaS: integer('duracion_estimada_s'),
    tiempoDetenidoEstimadoS: integer('tiempo_detenido_estimado_s'),
    precioMin: cop('precio_min').notNull(),
    precioMax: cop('precio_max').notNull(),
    /** Recargos aplicados en el momento de cotizar, para poder auditarla. */
    desglose: jsonb('desglose').notNull().default({}),
    /** Si es para una reserva (RN-080): la hora del servicio. El precio se calcula con los recargos de esa hora. */
    programadoPara: marca('programado_para'),
    expiraEn: marca('expira_en').notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('cotizacion_pasajero_idx').on(t.pasajeroId, t.creadoEn),
    check(
      'cotizacion_una_tarifa',
      sql`(${t.tarifaId} is not null and ${t.rutaFijaId} is null)
        or (${t.tarifaId} is null and ${t.rutaFijaId} is not null)`,
    ),
    check('cotizacion_rango', sql`${t.precioMin} >= 0 and ${t.precioMax} >= ${t.precioMin}`),
    check('cotizacion_dinamica', sql`${t.multiplicadorDinamico} >= 1`),
  ],
);

export const viaje = pgTable(
  'viaje',
  {
    id: id(),
    /** Código corto legible para soporte, por ejemplo TY-7K3M9Q. */
    codigo: text('codigo')
      .notNull()
      .default(sql`generar_codigo_viaje()`),
    pasajeroId: uuid('pasajero_id')
      .notNull()
      .references(() => pasajero.usuarioId),
    conductorId: uuid('conductor_id').references(() => conductor.usuarioId),
    vehiculoId: uuid('vehiculo_id').references(() => vehiculo.id),
    tipoServicio: tipoServicio('tipo_servicio').notNull(),
    categoria: categoriaVehiculo('categoria').notNull(),
    estado: estadoViaje('estado').notNull().default('buscando_conductor'),
    estadoPago: estadoPago('estado_pago').notNull().default('pendiente'),
    origen: punto('origen').notNull(),
    origenDireccion: text('origen_direccion'),
    destino: punto('destino').notNull(),
    destinoDireccion: text('destino_direccion'),
    notaConductor: text('nota_conductor'),
    programadoPara: marca('programado_para'),
    /** Reserva (RN-082): el conductor que la tomó, cuándo, y cuándo la confirmó. Mientras tanto el viaje sigue «programado». */
    reservaConductorId: uuid('reserva_conductor_id').references(() => conductor.usuarioId),
    reservaTomadaEn: marca('reserva_tomada_en'),
    reservaConfirmadaEn: marca('reserva_confirmada_en'),
    /** Desde cuándo se busca conductor. En una reserva es la hora en que se activó, no la de la solicitud. */
    busquedaDesde: marca('busqueda_desde'),
    cotizacionId: uuid('cotizacion_id')
      .notNull()
      .references(() => cotizacion.id),
    tarifaId: uuid('tarifa_id').references(() => tarifa.id),
    rutaFijaId: uuid('ruta_fija_id').references(() => rutaFija.id),
    /** Se congela al confirmar el viaje (RN-022). */
    multiplicadorDinamico: numeric('multiplicador_dinamico', {
      precision: 4,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(1),
    metodoPago: metodoPagoViaje('metodo_pago').notNull(),
    metodoPagoId: uuid('metodo_pago_id').references(() => metodoPago.id),
    /** Viaje corporativo (RN-103): a qué empresa se carga, quién lo pidió, a qué centro de costo y para qué. */
    empresaId: uuid('empresa_id').references(() => empresa.id),
    vinculoEmpresaId: uuid('vinculo_empresa_id').references(() => vinculoEmpresa.id),
    centroCostoId: uuid('centro_costo_id').references(() => centroCosto.id),
    motivoCorporativo: text('motivo_corporativo'),
    /** Lo que se le descuenta a la empresa por su contrato; lo absorbe TransporteYa, el conductor cobra completo. */
    descuentoCorporativo: cop('descuento_corporativo').notNull().default(0),
    /** El estado de cuenta en el que se cobró este viaje. */
    estadoCuentaId: uuid('estado_cuenta_id').references(() => estadoCuenta.id),
    pinInicio: text('pin_inicio'),
    precioEstimadoMin: cop('precio_estimado_min').notNull(),
    precioEstimadoMax: cop('precio_estimado_max').notNull(),

    // Taxímetro de la app del conductor: mide con GPS la distancia y los tiempos.
    distanciaTaximetroM: integer('distancia_taximetro_m'),
    tiempoDetenidoTaximetroS: integer('tiempo_detenido_taximetro_s'),
    duracionTaximetroS: integer('duracion_taximetro_s'),
    // Valores con los que se cobra (verificados con la trayectoria del servidor).
    distanciaRealM: integer('distancia_real_m'),
    tiempoDetenidoS: integer('tiempo_detenido_s'),
    duracionS: integer('duracion_s'),

    /** Desglose final: banderazo, km, tiempo, recargos, aproximación. */
    desglose: jsonb('desglose'),
    /** Tarifa del viaje con recargos, ya aproximada: base de la comisión (RN-060). */
    totalCarrera: cop('total_carrera'),
    cobroEspera: cop('cobro_espera').notNull().default(0),
    peajes: cop('peajes').notNull().default(0),
    propina: cop('propina').notNull().default(0),
    /** Lo que paga el pasajero. */
    precioFinal: cop('precio_final'),
    comision: cop('comision'),
    /** Puntos básicos aplicados (300 = 3 %), guardados para poder auditar el cobro. */
    comisionPb: integer('comision_pb'),
    trayectoria: lineaGeografica('trayectoria'),

    solicitadoEn: marca('solicitado_en').notNull().defaultNow(),
    aceptadoEn: marca('aceptado_en'),
    enSitioEn: marca('en_sitio_en'),
    iniciadoEn: marca('iniciado_en'),
    finalizadoEn: marca('finalizado_en'),
    canceladoEn: marca('cancelado_en'),
    canceladoPor: actorTipo('cancelado_por'),
    motivoCancelacion: text('motivo_cancelacion'),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('viaje_codigo_uq').on(t.codigo),
    index('viaje_activo_idx')
      .on(t.estado, t.solicitadoEn)
      .where(
        sql`${t.estado} in ('programado', 'buscando_conductor', 'asignado', 'en_sitio', 'en_curso')`,
      ),
    index('viaje_conductor_idx').on(t.conductorId, t.solicitadoEn),
    index('viaje_pasajero_idx').on(t.pasajeroId, t.solicitadoEn),
    index('viaje_origen_gix').using('gist', t.origen),
    /** Un conductor no puede tener dos viajes activos a la vez. */
    uniqueIndex('viaje_un_activo_por_conductor_uq')
      .on(t.conductorId)
      .where(sql`${t.estado} in ('asignado', 'en_sitio', 'en_curso')`),
    index('viaje_reservas_idx')
      .on(t.programadoPara)
      .where(sql`${t.estado} = 'programado'`),
    index('viaje_reserva_conductor_idx')
      .on(t.reservaConductorId, t.programadoPara)
      .where(sql`${t.reservaConductorId} is not null`),
    check(
      'viaje_programado_con_hora',
      sql`${t.estado} <> 'programado' or ${t.programadoPara} is not null`,
    ),
    check(
      'viaje_reserva_coherente',
      sql`(${t.reservaTomadaEn} is null) = (${t.reservaConductorId} is null)
        and (${t.reservaConfirmadaEn} is null or ${t.reservaConductorId} is not null)`,
    ),
    index('viaje_empresa_idx')
      .on(t.empresaId, t.solicitadoEn)
      .where(sql`${t.empresaId} is not null`),
    index('viaje_estado_cuenta_idx')
      .on(t.estadoCuentaId)
      .where(sql`${t.estadoCuentaId} is not null`),
    check(
      'viaje_corporativo_coherente',
      sql`(${t.empresaId} is null) = (${t.vinculoEmpresaId} is null)
        and (${t.empresaId} is not null or (${t.centroCostoId} is null and ${t.descuentoCorporativo} = 0
          and ${t.estadoCuentaId} is null))`,
    ),
    check('viaje_codigo_formato', sql`${t.codigo} ~ '^TY-[0-9A-Z]{6}$'`),
    check('viaje_pin_formato', sql`${t.pinInicio} is null or ${t.pinInicio} ~ '^[0-9]{4}$'`),
    check(
      'viaje_conductor_asignado',
      sql`${t.estado} not in ('asignado', 'en_sitio', 'en_curso', 'finalizado')
        or (${t.conductorId} is not null and ${t.vehiculoId} is not null)`,
    ),
    check(
      'viaje_finalizado_completo',
      sql`${t.estado} <> 'finalizado'
        or (${t.finalizadoEn} is not null and ${t.iniciadoEn} is not null and ${t.precioFinal} is not null
          and ${t.totalCarrera} is not null and ${t.comision} is not null and ${t.comisionPb} is not null)`,
    ),
    check(
      'viaje_cancelado_completo',
      sql`${t.estado} <> 'cancelado' or (${t.canceladoEn} is not null and ${t.canceladoPor} is not null)`,
    ),
    check(
      'viaje_montos',
      sql`${t.precioEstimadoMin} >= 0 and ${t.precioEstimadoMax} >= ${t.precioEstimadoMin}
        and ${t.cobroEspera} >= 0 and ${t.peajes} >= 0 and ${t.propina} >= 0
        and (${t.totalCarrera} is null or ${t.totalCarrera} >= 0)
        and (${t.precioFinal} is null or ${t.precioFinal} >= 0)
        and (${t.comision} is null or (${t.comision} >= 0 and ${t.comision} <= ${t.precioFinal}))
        and (${t.comisionPb} is null or ${t.comisionPb} between 0 and 10000)`,
    ),
    check(
      'viaje_mediciones',
      sql`coalesce(${t.distanciaTaximetroM}, 0) >= 0 and coalesce(${t.tiempoDetenidoTaximetroS}, 0) >= 0
        and coalesce(${t.duracionTaximetroS}, 0) >= 0 and coalesce(${t.distanciaRealM}, 0) >= 0
        and coalesce(${t.tiempoDetenidoS}, 0) >= 0 and coalesce(${t.duracionS}, 0) >= 0
        and coalesce(${t.tiempoDetenidoS}, 0) <= coalesce(${t.duracionS}, ${t.tiempoDetenidoS}, 0)`,
    ),
    check(
      'viaje_orden_tiempos',
      sql`(${t.aceptadoEn} is null or ${t.aceptadoEn} >= ${t.solicitadoEn})
        and (${t.enSitioEn} is null or ${t.aceptadoEn} is null or ${t.enSitioEn} >= ${t.aceptadoEn})
        and (${t.iniciadoEn} is null or ${t.enSitioEn} is null or ${t.iniciadoEn} >= ${t.enSitioEn})
        and (${t.finalizadoEn} is null or ${t.iniciadoEn} is null or ${t.finalizadoEn} >= ${t.iniciadoEn})`,
    ),
  ],
);

/** Registro inmutable de cada cambio de estado: fuente de la línea de tiempo y de los indicadores. */
export const viajeEvento = pgTable(
  'viaje_evento',
  {
    id: id(),
    viajeId: uuid('viaje_id')
      .notNull()
      .references(() => viaje.id),
    tipo: text('tipo').notNull(),
    actorTipo: actorTipo('actor_tipo').notNull(),
    actorId: uuid('actor_id'),
    ubicacion: punto('ubicacion'),
    datos: jsonb('datos').notNull().default({}),
    ocurridoEn: marca('ocurrido_en').notNull().defaultNow(),
  },
  (t) => [
    index('viaje_evento_idx').on(t.viajeId, t.ocurridoEn),
    check('viaje_evento_tipo', sql`${t.tipo} ~ '^[a-z][a-z0-9_]*$'`),
  ],
);

/** Oferta de un viaje a un conductor (RN-032): uno a la vez, con tiempo límite. */
export const oferta = pgTable(
  'oferta',
  {
    id: id(),
    viajeId: uuid('viaje_id')
      .notNull()
      .references(() => viaje.id),
    conductorId: uuid('conductor_id')
      .notNull()
      .references(() => conductor.usuarioId),
    ronda: integer('ronda').notNull().default(1),
    etaRecogidaS: integer('eta_recogida_s'),
    distanciaRecogidaM: integer('distancia_recogida_m'),
    ofrecidaEn: marca('ofrecida_en').notNull().defaultNow(),
    expiraEn: marca('expira_en').notNull(),
    respondidaEn: marca('respondida_en'),
    resultado: resultadoOferta('resultado').notNull().default('pendiente'),
  },
  (t) => [
    index('oferta_viaje_idx').on(t.viajeId, t.ofrecidaEn),
    uniqueIndex('oferta_viaje_conductor_ronda_uq').on(t.viajeId, t.conductorId, t.ronda),
    /** Un conductor solo puede tener una oferta pendiente. */
    uniqueIndex('oferta_una_pendiente_por_conductor_uq')
      .on(t.conductorId)
      .where(sql`${t.resultado} = 'pendiente'`),
    /** Un viaje solo puede tener una oferta aceptada: la asignación es atómica. */
    uniqueIndex('oferta_una_aceptada_por_viaje_uq')
      .on(t.viajeId)
      .where(sql`${t.resultado} = 'aceptada'`),
    check('oferta_expiracion', sql`${t.expiraEn} > ${t.ofrecidaEn}`),
    check(
      'oferta_respuesta',
      sql`(${t.resultado} = 'pendiente' and ${t.respondidaEn} is null)
        or (${t.resultado} <> 'pendiente' and ${t.respondidaEn} is not null)`,
    ),
  ],
);

export const viajeMensaje = pgTable(
  'viaje_mensaje',
  {
    id: id(),
    viajeId: uuid('viaje_id')
      .notNull()
      .references(() => viaje.id),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuario.id),
    cuerpo: text('cuerpo').notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('viaje_mensaje_idx').on(t.viajeId, t.creadoEn),
    check('viaje_mensaje_largo', sql`char_length(${t.cuerpo}) between 1 and 1000`),
  ],
);

export const calificacion = pgTable(
  'calificacion',
  {
    id: id(),
    viajeId: uuid('viaje_id')
      .notNull()
      .references(() => viaje.id),
    deUsuarioId: uuid('de_usuario_id')
      .notNull()
      .references(() => usuario.id),
    aUsuarioId: uuid('a_usuario_id')
      .notNull()
      .references(() => usuario.id),
    estrellas: integer('estrellas').notNull(),
    etiquetas: text('etiquetas')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    comentario: text('comentario'),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('calificacion_una_por_autor_uq').on(t.viajeId, t.deUsuarioId),
    index('calificacion_destinatario_idx').on(t.aUsuarioId, t.creadoEn),
    check('calificacion_estrellas', sql`${t.estrellas} between 1 and 5`),
    check('calificacion_distintos', sql`${t.deUsuarioId} <> ${t.aUsuarioId}`),
  ],
);

export const alerta = pgTable(
  'alerta',
  {
    id: id(),
    tipo: tipoAlerta('tipo').notNull(),
    severidad: severidadAlerta('severidad').notNull(),
    estado: estadoAlerta('estado').notNull().default('abierta'),
    viajeId: uuid('viaje_id').references(() => viaje.id),
    conductorId: uuid('conductor_id').references(() => conductor.usuarioId),
    datos: jsonb('datos').notNull().default({}),
    tomadaPor: uuid('tomada_por').references(() => usuario.id),
    tomadaEn: marca('tomada_en'),
    notaCierre: text('nota_cierre'),
    creadaEn: creadoEn(),
    cerradaEn: marca('cerrada_en'),
  },
  (t) => [
    index('alerta_abiertas_idx')
      .on(t.severidad, t.creadaEn)
      .where(sql`${t.estado} <> 'cerrada'`),
    index('alerta_viaje_idx').on(t.viajeId),
    check(
      'alerta_tomada',
      sql`${t.estado} = 'abierta' or (${t.tomadaPor} is not null and ${t.tomadaEn} is not null)`,
    ),
    check(
      'alerta_cerrada',
      sql`${t.estado} <> 'cerrada' or (${t.notaCierre} is not null and ${t.cerradaEn} is not null)`,
    ),
  ],
);

/** Enlace público del viaje en vivo (RN-132). Solo se guarda el hash del token. */
export const viajeCompartido = pgTable(
  'viaje_compartido',
  {
    id: id(),
    viajeId: uuid('viaje_id')
      .notNull()
      .references(() => viaje.id),
    tokenHash: text('token_hash').notNull(),
    expiraEn: marca('expira_en'),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('viaje_compartido_token_uq').on(t.tokenHash)],
);
