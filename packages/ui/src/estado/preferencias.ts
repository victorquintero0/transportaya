/**
 * Lo que las apps guardan en sus ajustes y que los sonidos y la vibración necesitan saber. Cada app lo registra al
 * arrancar, así los componentes compartidos no dependen del almacén de ajustes de ninguna app.
 */
export interface Preferencias {
  sonido: boolean;
  vibracion: boolean;
}

let leer: () => Preferencias = () => ({ sonido: true, vibracion: true });

export function registrarPreferencias(fn: () => Preferencias): void {
  leer = fn;
}

export const preferencias = (): Preferencias => leer();
