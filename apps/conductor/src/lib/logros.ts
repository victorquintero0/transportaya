import type { Ganancias } from './tipos.ts';

/** Días seguidos (terminando hoy o ayer) con al menos un viaje. */
export function racha(porDia: Ganancias['porDia']): number {
  const conViajes = new Set(porDia.filter((d) => d.viajes > 0).map((d) => d.dia));
  const dias = porDia.map((d) => d.dia).sort();
  let n = 0;
  for (let i = dias.length - 1; i >= 0; i--) {
    const dia = dias[i]!;
    if (conViajes.has(dia)) n += 1;
    else if (i === dias.length - 1)
      continue; // hoy todavía puede venir
    else break;
  }
  return n;
}
