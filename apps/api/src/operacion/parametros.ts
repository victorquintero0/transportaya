/**
 * Parámetros operativos que la App Operación puede cambiar (OPE-12). Cada uno tiene un valor por defecto, un rango
 * válido y la unidad en que se muestra. Solo están los que el sistema realmente lee.
 */
export interface DefinicionParametro {
  grupo: string;
  descripcion: string;
  unidad: string;
  defecto: number;
  min: number;
  max: number;
}

export const CATALOGO_PARAMETROS = {
  'despacho.oferta_s': {
    grupo: 'Despacho',
    descripcion: 'Tiempo que tiene el conductor para aceptar una oferta',
    unidad: 's',
    defecto: 15,
    min: 5,
    max: 60,
  },
  'despacho.reintento_s': {
    grupo: 'Despacho',
    descripcion: 'Cada cuánto se reintenta cuando no hay conductores disponibles',
    unidad: 's',
    defecto: 5,
    min: 1,
    max: 60,
  },
  'despacho.presupuesto_s': {
    grupo: 'Despacho',
    descripcion: 'Tiempo total buscando conductor antes de dar el viaje por "sin conductor"',
    unidad: 's',
    defecto: 120,
    min: 30,
    max: 900,
  },
  'despacho.radio_m': {
    grupo: 'Despacho',
    descripcion: 'Radio máximo de búsqueda de conductores',
    unidad: 'm',
    defecto: 8000,
    min: 500,
    max: 50000,
  },
  'despacho.edad_posicion_s': {
    grupo: 'Despacho',
    descripcion: 'Antigüedad máxima de la posición de un conductor para ofrecerle un viaje',
    unidad: 's',
    defecto: 30,
    min: 5,
    max: 300,
  },
  'semaforo.asignacion_ambar_s': {
    grupo: 'Torre de control',
    descripcion: 'Buscando conductor: pasa a ámbar después de',
    unidad: 's',
    defecto: 45,
    min: 5,
    max: 900,
  },
  'semaforo.asignacion_rojo_s': {
    grupo: 'Torre de control',
    descripcion: 'Buscando conductor: pasa a rojo después de',
    unidad: 's',
    defecto: 90,
    min: 10,
    max: 1800,
  },
  'semaforo.llegada_ambar_s': {
    grupo: 'Torre de control',
    descripcion: 'Conductor en camino a la recogida: ámbar después de',
    unidad: 's',
    defecto: 600,
    min: 60,
    max: 3600,
  },
  'semaforo.llegada_rojo_s': {
    grupo: 'Torre de control',
    descripcion: 'Conductor en camino a la recogida: rojo después de',
    unidad: 's',
    defecto: 900,
    min: 60,
    max: 7200,
  },
  'semaforo.espera_ambar_s': {
    grupo: 'Torre de control',
    descripcion: 'Conductor esperando al pasajero: ámbar después de',
    unidad: 's',
    defecto: 180,
    min: 30,
    max: 1800,
  },
  'semaforo.espera_rojo_s': {
    grupo: 'Torre de control',
    descripcion: 'Conductor esperando al pasajero: rojo después de',
    unidad: 's',
    defecto: 300,
    min: 30,
    max: 3600,
  },
  'soporte.sla_normal_h': {
    grupo: 'Soporte',
    descripcion: 'Tiempo de primera respuesta de un ticket normal',
    unidad: 'h',
    defecto: 24,
    min: 1,
    max: 168,
  },
  'soporte.sla_alta_h': {
    grupo: 'Soporte',
    descripcion: 'Tiempo de primera respuesta de un ticket urgente (seguridad)',
    unidad: 'h',
    defecto: 2,
    min: 1,
    max: 48,
  },
  'soporte.reembolso_limite_cop': {
    grupo: 'Soporte',
    descripcion: 'Reembolso máximo que puede dar un agente de soporte sin pasar a finanzas',
    unidad: 'COP',
    defecto: 30000,
    min: 0,
    max: 1000000,
  },
  'documentos.aviso_dias': {
    grupo: 'Cumplimiento',
    descripcion: 'Días de anticipación para listar documentos por vencer',
    unidad: 'días',
    defecto: 30,
    min: 1,
    max: 120,
  },
  'retencion.posiciones_dias': {
    grupo: 'Privacidad y retención',
    descripcion: 'Días que se guardan las posiciones GPS detalladas de los conductores',
    unidad: 'días',
    defecto: 180,
    min: 30,
    max: 1095,
  },
  'retencion.chats_dias': {
    grupo: 'Privacidad y retención',
    descripcion: 'Días que se guardan los mensajes entre pasajero y conductor',
    unidad: 'días',
    defecto: 180,
    min: 30,
    max: 1095,
  },
  'retencion.trayectorias_dias': {
    grupo: 'Privacidad y retención',
    descripcion:
      'Días que se guarda el recorrido GPS de cada viaje (el viaje y su cobro se conservan)',
    unidad: 'días',
    defecto: 365,
    min: 90,
    max: 1825,
  },
} as const satisfies Record<string, DefinicionParametro>;

export type ClaveParametro = keyof typeof CATALOGO_PARAMETROS;
