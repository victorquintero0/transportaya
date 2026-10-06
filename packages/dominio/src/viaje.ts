/** Estados del viaje (docs/07, sección 1). */
export const ESTADOS_VIAJE = [
  'programado',
  'buscando_conductor',
  'asignado',
  'en_sitio',
  'en_curso',
  'finalizado',
  'cancelado',
  'sin_conductor',
] as const;
export type EstadoViaje = (typeof ESTADOS_VIAJE)[number];

export const ESTADOS_PAGO = [
  'no_aplica',
  'pendiente',
  'preautorizado',
  'pagado',
  'fallido',
  'reembolsado_parcial',
  'reembolsado',
] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

export const TIPOS_SERVICIO = ['inmediato', 'programado', 'aeropuerto', 'intermunicipal'] as const;
export type TipoServicio = (typeof TIPOS_SERVICIO)[number];

/** Quién cancela un viaje (RN-046). */
export type ActorCancelacion = 'pasajero' | 'conductor' | 'operacion' | 'sistema';

const TRANSICIONES: Record<EstadoViaje, readonly EstadoViaje[]> = {
  programado: ['buscando_conductor', 'cancelado'],
  buscando_conductor: ['asignado', 'sin_conductor', 'cancelado'],
  asignado: ['en_sitio', 'buscando_conductor', 'cancelado'],
  en_sitio: ['en_curso', 'cancelado'],
  en_curso: ['finalizado', 'cancelado'],
  finalizado: [],
  cancelado: [],
  sin_conductor: [],
};

/** Estados desde los que el viaje ya no cambia. */
export function esEstadoFinal(estado: EstadoViaje): boolean {
  return TRANSICIONES[estado].length === 0;
}

export function puedeTransitar(desde: EstadoViaje, hacia: EstadoViaje): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export class TransicionInvalidaError extends Error {
  constructor(
    readonly desde: EstadoViaje,
    readonly hacia: EstadoViaje,
  ) {
    super(`Transición de viaje no permitida: ${desde} → ${hacia}`);
    this.name = 'TransicionInvalidaError';
  }
}

/** Devuelve el nuevo estado o lanza si la transición no está permitida. */
export function transitar(desde: EstadoViaje, hacia: EstadoViaje): EstadoViaje {
  if (!puedeTransitar(desde, hacia)) throw new TransicionInvalidaError(desde, hacia);
  return hacia;
}

/**
 * Solo la operación puede cancelar un viaje que ya está en curso (docs/07).
 */
export function puedeCancelar(estado: EstadoViaje, actor: ActorCancelacion): boolean {
  if (!puedeTransitar(estado, 'cancelado')) return false;
  if (estado === 'en_curso') return actor === 'operacion';
  return true;
}
