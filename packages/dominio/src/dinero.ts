/**
 * Todo el dinero es un entero en pesos colombianos (COP). Nunca se usan decimales ni flotantes.
 */

/** Redondea al múltiplo más cercano. */
export function redondearA(valor: number, multiplo = 100): number {
  return Math.round(valor / multiplo) * multiplo;
}

/**
 * Aproxima por defecto, al múltiplo anterior (por defecto, la centena anterior). Es la regla del
 * parágrafo tercero del Decreto 0641 de 2025 de Manizales para el valor de la carrera.
 */
export function aproximarPorDefecto(valor: number, multiplo = 100): number {
  return Math.floor(valor / multiplo) * multiplo;
}

/** Aplica puntos básicos (1 % = 100 pb) a un monto y redondea al peso. */
export function aplicarPuntosBasicos(monto: number, puntosBasicos: number): number {
  return Math.round((monto * puntosBasicos) / 10_000);
}
