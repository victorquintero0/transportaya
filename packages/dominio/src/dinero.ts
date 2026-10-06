/**
 * Todo el dinero es un entero en pesos colombianos (COP). Nunca se usan decimales ni flotantes.
 */

/** Redondea al múltiplo más cercano (por defecto, la centena: RN, convenciones generales). */
export function redondearA(valor: number, multiplo = 100): number {
  return Math.round(valor / multiplo) * multiplo;
}

/** Aplica puntos básicos (1 % = 100 pb) a un monto y redondea al peso. */
export function aplicarPuntosBasicos(monto: number, puntosBasicos: number): number {
  return Math.round((monto * puntosBasicos) / 10_000);
}
