import { aproximarPorDefecto } from './dinero.js';

/**
 * Parámetros de una versión de tarifa (RN-010, RN-014). Todos los valores son enteros en COP.
 * `valorMinuto` se aplica al **tiempo cobrable**: en la tarifa de taxi de Manizales es el tiempo detenido.
 */
export interface ParametrosTarifa {
  base: number;
  valorKm: number;
  valorMinuto: number;
  minima: number;
}

/**
 * Recargo (RN-011). No se multiplica por la dinámica. Un recargo porcentual se aplica sobre el
 * subtotal sin dinámica, expresado en puntos básicos (100 pb = 1 %).
 */
export type RecargoFijo = { nombre: string; tipo: 'fijo'; valor: number };
export type RecargoPorcentual = { nombre: string; tipo: 'porcentaje'; puntosBasicos: number };
export type Recargo = RecargoFijo | RecargoPorcentual;

export interface EntradaTarifa {
  parametros: ParametrosTarifa;
  /** Distancia en metros: estimada al cotizar, real al finalizar (RN-012). */
  distanciaM: number;
  /**
   * Segundos de tiempo cobrable: en la tarifa de taxi de Manizales, el tiempo detenido. Se estima al
   * cotizar (ver `estimarTiempoDetenido`) y se mide con el GPS al finalizar (RN-012).
   */
  tiempoCobrableS: number;
  /** Se congela al confirmar el viaje (RN-022). 1 = sin dinámica. */
  multiplicadorDinamico?: number;
  recargos?: readonly Recargo[];
  peajes?: number;
  cobroEspera?: number;
  propina?: number;
}

export interface DesgloseTarifa {
  base: number;
  distancia: number;
  tiempo: number;
  subtotal: number;
  multiplicadorDinamico: number;
  /** max(mínima, subtotal × dinámica) */
  tarifaViaje: number;
  recargos: number;
  /** Tarifa del viaje + recargos, aproximada por defecto a la centena. Es la base de la comisión junto con la espera. */
  totalRedondeado: number;
  peajes: number;
  cobroEspera: number;
  propina: number;
  /** Lo que paga el pasajero. */
  total: number;
}

/**
 * RN-010:
 *   subtotal     = base + km × valor_km + minutos_cobrables × valor_minuto
 *   tarifa_viaje = max(mínima, subtotal × dinámica)
 *   total        = aproximar_por_defecto(tarifa_viaje + recargos) + peajes + espera + propina
 */
export function calcularTarifaUrbana(entrada: EntradaTarifa): DesgloseTarifa {
  const { parametros, distanciaM, tiempoCobrableS } = entrada;
  const multiplicador = entrada.multiplicadorDinamico ?? 1;
  if (multiplicador < 1)
    throw new RangeError('El multiplicador de dinámica no puede ser menor a 1');
  if (distanciaM < 0 || tiempoCobrableS < 0) {
    throw new RangeError('Distancia y tiempo no pueden ser negativos');
  }

  const distancia = Math.round((distanciaM / 1000) * parametros.valorKm);
  const tiempo = Math.round((tiempoCobrableS / 60) * parametros.valorMinuto);
  const subtotal = parametros.base + distancia + tiempo;
  const tarifaViaje = Math.max(parametros.minima, Math.round(subtotal * multiplicador));

  const recargos = (entrada.recargos ?? []).reduce(
    (suma, r) =>
      suma + (r.tipo === 'fijo' ? r.valor : Math.round((subtotal * r.puntosBasicos) / 10_000)),
    0,
  );

  const totalRedondeado = aproximarPorDefecto(tarifaViaje + recargos);
  const peajes = entrada.peajes ?? 0;
  const cobroEspera = entrada.cobroEspera ?? 0;
  const propina = entrada.propina ?? 0;

  return {
    base: parametros.base,
    distancia,
    tiempo,
    subtotal,
    multiplicadorDinamico: multiplicador,
    tarifaViaje,
    recargos,
    totalRedondeado,
    peajes,
    cobroEspera,
    propina,
    total: totalRedondeado + peajes + cobroEspera + propina,
  };
}

/** Parámetros de espera (D-12 / RN-041). */
export interface ParametrosEspera {
  minutosGratis: number;
  valorMinuto: number;
}

export const ESPERA_POR_DEFECTO: ParametrosEspera = { minutosGratis: 3, valorMinuto: 250 };

/** RN-041: desde "llegué" hay minutos gratis; después se cobra cada minuto (o fracción). */
export function calcularCobroEspera(
  segundosDeEspera: number,
  parametros: ParametrosEspera = ESPERA_POR_DEFECTO,
): number {
  const excedente = segundosDeEspera - parametros.minutosGratis * 60;
  if (excedente <= 0) return 0;
  return Math.ceil(excedente / 60) * parametros.valorMinuto;
}

/** Parámetros de cancelación (D-12 / RN-042). */
export interface ParametrosCancelacion {
  tarifaCancelacion: number;
  /** Cancelación gratis hasta estos segundos después de la asignación. */
  segundosGratisTrasAsignacion: number;
  /** Gratis si el ETA del conductor empeoró más de estos segundos frente al prometido. */
  segundosEmpeoraEtaGratis: number;
  /** Segundos de espera en sitio antes de poder cancelar por pasajero ausente (RN-043). */
  segundosPasajeroAusente: number;
}

export const CANCELACION_POR_DEFECTO: ParametrosCancelacion = {
  tarifaCancelacion: 4000,
  segundosGratisTrasAsignacion: 120,
  segundosEmpeoraEtaGratis: 300,
  segundosPasajeroAusente: 300,
};

export interface ContextoCancelacionPasajero {
  tieneConductor: boolean;
  segundosDesdeAsignacion?: number;
  /** ETA actual menos el ETA prometido al asignar. */
  empeoraEtaSegundos?: number;
}

/** RN-042: costo de que el pasajero cancele. */
export function costoCancelacionPasajero(
  contexto: ContextoCancelacionPasajero,
  parametros: ParametrosCancelacion = CANCELACION_POR_DEFECTO,
): number {
  if (!contexto.tieneConductor) return 0;
  if ((contexto.segundosDesdeAsignacion ?? Infinity) <= parametros.segundosGratisTrasAsignacion)
    return 0;
  if ((contexto.empeoraEtaSegundos ?? 0) > parametros.segundosEmpeoraEtaGratis) return 0;
  return parametros.tarifaCancelacion;
}

/** RN-043: el conductor puede cancelar por pasajero ausente tras el tiempo de espera en sitio. */
export function puedeCancelarPorPasajeroAusente(
  segundosEnSitio: number,
  parametros: ParametrosCancelacion = CANCELACION_POR_DEFECTO,
): boolean {
  return segundosEnSitio >= parametros.segundosPasajeroAusente;
}

/**
 * La cotización no conoce el tiempo detenido real: se estima como una fracción de la duración del
 * viaje. La fracción debe calibrarse con los datos del piloto (D-23).
 */
export function estimarTiempoDetenido(duracionEstimadaS: number, fraccionDetenido: number): number {
  if (fraccionDetenido < 0 || fraccionDetenido > 1) {
    throw new RangeError('La fracción de tiempo detenido debe estar entre 0 y 1');
  }
  return Math.round(duracionEstimadaS * fraccionDetenido);
}
