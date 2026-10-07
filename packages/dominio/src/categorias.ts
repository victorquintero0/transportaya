import type { RecargoFijo } from './tarifas.js';

/** Categorías de vehículo (D-07). La categoría la asigna el catálogo de vehículos. */
export const CATEGORIAS_VEHICULO = ['media', 'media_alta', 'alta'] as const;
export type CategoriaVehiculo = (typeof CATEGORIAS_VEHICULO)[number];

const ORDEN: Record<CategoriaVehiculo, number> = { media: 0, media_alta: 1, alta: 2 };

/**
 * RN-003: un vehículo de categoría superior puede atender viajes de una categoría inferior
 * solo si el conductor lo activó.
 */
export function puedeAtender(
  vehiculo: CategoriaVehiculo,
  solicitada: CategoriaVehiculo,
  aceptaCategoriaInferior: boolean,
): boolean {
  if (vehiculo === solicitada) return true;
  return aceptaCategoriaInferior && ORDEN[vehiculo] > ORDEN[solicitada];
}

/**
 * D-22: las categorías Media Alta y Alta suman un valor fijo a la tarifa. Devuelve el recargo para
 * pasarlo a `calcularTarifaUrbana`, o `null` si la categoría no tiene recargo.
 */
export function recargoDeCategoria(
  categoria: CategoriaVehiculo,
  valores: Readonly<Record<CategoriaVehiculo, number>>,
): RecargoFijo | null {
  const valor = valores[categoria];
  return valor > 0 ? { nombre: `categoria_${categoria}`, tipo: 'fijo', valor } : null;
}
