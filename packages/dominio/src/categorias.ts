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
