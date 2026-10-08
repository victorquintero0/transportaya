import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { estadoEmpresa, estadoUsuario, rolInterno, tipoMetodoPago } from './enums.js';
import { actualizadoEn, cop, creadoEn, id, marca, punto } from './tipos.js';

/** Toda persona del sistema: pasajero, conductor o empleado. El teléfono es el identificador de ingreso. */
export const usuario = pgTable(
  'usuario',
  {
    id: id(),
    telefono: text('telefono').notNull(),
    email: text('email'),
    nombre: text('nombre').notNull(),
    estado: estadoUsuario('estado').notNull().default('activo'),
    fotoClave: text('foto_clave'),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('usuario_telefono_uq').on(t.telefono),
    check('usuario_telefono_e164', sql`${t.telefono} ~ '^[+][1-9][0-9]{7,14}$'`),
  ],
);

/**
 * Empresa cliente con contrato (RN-100). El descuento lo absorbe TransporteYa: el conductor cobra el viaje completo.
 * `cupo` es el crédito máximo en pesos (sin tope si es nulo) y el ciclo de facturación empieza el `dia_corte`.
 */
export const empresa = pgTable(
  'empresa',
  {
    id: id(),
    nombre: text('nombre').notNull(),
    nit: text('nit').notNull(),
    contactoNombre: text('contacto_nombre').notNull(),
    contactoTelefono: text('contacto_telefono'),
    contactoEmail: text('contacto_email'),
    estado: estadoEmpresa('estado').notNull().default('activa'),
    motivoSuspension: text('motivo_suspension'),
    /** Descuento pactado en puntos básicos (500 = 5 %). */
    descuentoPb: integer('descuento_pb').notNull().default(0),
    /** Si los viajes de la empresa pagan la tarifa dinámica (RN-100). */
    aplicaDinamica: boolean('aplica_dinamica').notNull().default(false),
    cupo: cop('cupo'),
    diaCorte: integer('dia_corte').notNull().default(1),
    diasPago: integer('dias_pago').notNull().default(15),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('empresa_nit_uq').on(t.nit),
    check('empresa_descuento', sql`${t.descuentoPb} between 0 and 5000`),
    check('empresa_dia_corte', sql`${t.diaCorte} between 1 and 28`),
    check('empresa_dias_pago', sql`${t.diasPago} between 0 and 90`),
    check('empresa_cupo', sql`${t.cupo} is null or ${t.cupo} > 0`),
  ],
);

/** Personal interno de TransporteYa que entra a la App Operación. */
export const empleado = pgTable(
  'empleado',
  {
    usuarioId: uuid('usuario_id')
      .primaryKey()
      .references(() => usuario.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    contrasenaHash: text('contrasena_hash').notNull(),
    /** Secreto TOTP cifrado a nivel de aplicación (RNF-43, RNF-46). */
    totpSecretoCifrado: text('totp_secreto_cifrado'),
    totpActivo: boolean('totp_activo').notNull().default(false),
    activo: boolean('activo').notNull().default(true),
    /** Solo para el administrador de una empresa cliente (rol `empresa`): la única empresa que puede ver. */
    empresaId: uuid('empresa_id').references(() => empresa.id),
    ultimoIngresoEn: marca('ultimo_ingreso_en'),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('empleado_email_uq').on(t.email),
    index('empleado_empresa_idx')
      .on(t.empresaId)
      .where(sql`${t.empresaId} is not null`),
  ],
);

export const usuarioRol = pgTable(
  'usuario_rol',
  {
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => empleado.usuarioId, { onDelete: 'cascade' }),
    rol: rolInterno('rol').notNull(),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.rol] })],
);

/** Códigos OTP enviados por WhatsApp o SMS (D-13). Solo se guarda el hash. */
export const otpCodigo = pgTable(
  'otp_codigo',
  {
    id: id(),
    telefono: text('telefono').notNull(),
    codigoHash: text('codigo_hash').notNull(),
    canal: text('canal').notNull().default('whatsapp'),
    intentos: integer('intentos').notNull().default(0),
    expiraEn: marca('expira_en').notNull(),
    consumidoEn: marca('consumido_en'),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('otp_codigo_telefono_idx').on(t.telefono, t.creadoEn),
    check('otp_codigo_canal', sql`${t.canal} in ('whatsapp', 'sms')`),
    check('otp_codigo_intentos', sql`${t.intentos} >= 0`),
  ],
);

/** Sesiones con refresh token rotativo y revocable (RNF-41). Solo se guarda el hash del token. */
export const sesion = pgTable(
  'sesion',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /** App con la que se inició sesión: el refresco debe conservar el rol. */
    rol: text('rol').notNull(),
    dispositivo: text('dispositivo'),
    ip: text('ip'),
    creadaEn: creadoEn(),
    expiraEn: marca('expira_en').notNull(),
    revocadaEn: marca('revocada_en'),
  },
  (t) => [
    uniqueIndex('sesion_token_hash_uq').on(t.tokenHash),
    index('sesion_usuario_idx').on(t.usuarioId),
    check('sesion_rol', sql`${t.rol} in ('conductor', 'pasajero', 'interno')`),
  ],
);

/** Suscripciones de Web Push de las PWA. */
export const suscripcionPush = pgTable(
  'suscripcion_push',
  {
    id: id(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    claveP256dh: text('clave_p256dh').notNull(),
    claveAuth: text('clave_auth').notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('suscripcion_push_endpoint_uq').on(t.endpoint)],
);

export const pasajero = pgTable(
  'pasajero',
  {
    usuarioId: uuid('usuario_id')
      .primaryKey()
      .references(() => usuario.id, { onDelete: 'restrict' }),
    calificacionPromedio: numeric('calificacion_promedio', {
      precision: 3,
      scale: 2,
      mode: 'number',
    }),
    calificacionesTotal: integer('calificaciones_total').notNull().default(0),
    /** Cobros fallidos y tarifas de cancelación por pagar (RN-053). */
    deudaPendiente: cop('deuda_pendiente').notNull().default(0),
    /** Autorización de tratamiento de datos y términos (Ley 1581 de 2012, PAS-02): cuándo y qué versión aceptó. */
    aceptoTerminosEn: marca('acepto_terminos_en'),
    versionTerminos: text('version_terminos'),
    creadoEn: creadoEn(),
  },
  (t) => [
    check('pasajero_deuda_no_negativa', sql`${t.deudaPendiente} >= 0`),
    check(
      'pasajero_calificacion_rango',
      sql`${t.calificacionPromedio} is null or ${t.calificacionPromedio} between 1 and 5`,
    ),
  ],
);

export const contactoConfianza = pgTable(
  'contacto_confianza',
  {
    id: id(),
    pasajeroId: uuid('pasajero_id')
      .notNull()
      .references(() => pasajero.usuarioId, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    telefono: text('telefono').notNull(),
  },
  (t) => [
    index('contacto_confianza_pasajero_idx').on(t.pasajeroId),
    check('contacto_confianza_telefono_e164', sql`${t.telefono} ~ '^[+][1-9][0-9]{7,14}$'`),
  ],
);

export const lugarGuardado = pgTable(
  'lugar_guardado',
  {
    id: id(),
    pasajeroId: uuid('pasajero_id')
      .notNull()
      .references(() => pasajero.usuarioId, { onDelete: 'cascade' }),
    etiqueta: text('etiqueta').notNull(),
    direccion: text('direccion').notNull(),
    ubicacion: punto('ubicacion').notNull(),
  },
  (t) => [index('lugar_guardado_pasajero_idx').on(t.pasajeroId)],
);

/** Métodos de pago del pasajero. Nunca se guarda el número de tarjeta: solo el token de Wompi (RN-051). */
export const metodoPago = pgTable(
  'metodo_pago',
  {
    id: id(),
    pasajeroId: uuid('pasajero_id')
      .notNull()
      .references(() => pasajero.usuarioId, { onDelete: 'cascade' }),
    tipo: tipoMetodoPago('tipo').notNull(),
    proveedor: text('proveedor').notNull().default('wompi'),
    tokenProveedor: text('token_proveedor').notNull(),
    marca: text('marca'),
    ultimos4: text('ultimos4'),
    predeterminado: boolean('predeterminado').notNull().default(false),
    activo: boolean('activo').notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex('metodo_pago_token_uq').on(t.proveedor, t.tokenProveedor),
    uniqueIndex('metodo_pago_predeterminado_uq')
      .on(t.pasajeroId)
      .where(sql`${t.predeterminado} and ${t.activo}`),
    check('metodo_pago_ultimos4', sql`${t.ultimos4} is null or ${t.ultimos4} ~ '^[0-9]{4}$'`),
  ],
);
