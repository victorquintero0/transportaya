import { useAjustes } from '../estado/ajustes.ts';

type Patron = 'toque' | 'oferta' | 'exito' | 'alerta';

const PATRONES: Record<Patron, number[]> = {
  toque: [12],
  oferta: [200, 100, 200, 100, 400],
  exito: [60, 40, 120],
  alerta: [300, 120, 300],
};

export function vibrar(patron: Patron = 'toque'): void {
  if (!useAjustes.getState().vibracion) return;
  try {
    navigator.vibrate?.(PATRONES[patron]);
  } catch {
    // algunos navegadores no permiten vibrar: no pasa nada
  }
}
