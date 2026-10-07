/**
 * Prueba técnica de la PWA del conductor (ADR-0003).
 *
 * El periodo medido se divide en intervalos del tamaño del envío esperado (por ejemplo, 4 s en
 * viaje). Un intervalo está "cubierto" si llegó al menos una ubicación en él. La pérdida es el
 * porcentaje de intervalos sin ninguna ubicación.
 */

/** Si se pierde más de este porcentaje de ubicaciones en viaje, se activa el plan B con Capacitor. */
export const UMBRAL_PERDIDA_ADR_0003 = 0.05;

export interface ResumenCobertura {
  intervalos: number;
  cubiertos: number;
  /** Fracción entre 0 y 1 de intervalos sin ubicación. */
  perdida: number;
  /** Mayor tramo continuo sin ubicaciones, en milisegundos. */
  mayorHuecoMs: number;
  aceptable: boolean;
}

export function resumirCobertura(
  marcasDeTiempoMs: readonly number[],
  intervaloMs: number,
  desdeMs: number,
  hastaMs: number,
  umbralPerdida = UMBRAL_PERDIDA_ADR_0003,
): ResumenCobertura {
  if (intervaloMs <= 0) throw new RangeError('El intervalo debe ser positivo');
  const intervalos = Math.floor((hastaMs - desdeMs) / intervaloMs);
  if (intervalos <= 0) {
    return { intervalos: 0, cubiertos: 0, perdida: 0, mayorHuecoMs: 0, aceptable: true };
  }

  const cubierto = new Array<boolean>(intervalos).fill(false);
  for (const t of marcasDeTiempoMs) {
    if (t < desdeMs || t >= desdeMs + intervalos * intervaloMs) continue;
    cubierto[Math.floor((t - desdeMs) / intervaloMs)] = true;
  }

  let cubiertos = 0;
  let huecoActual = 0;
  let mayorHueco = 0;
  for (const c of cubierto) {
    if (c) {
      cubiertos += 1;
      huecoActual = 0;
    } else {
      huecoActual += 1;
      mayorHueco = Math.max(mayorHueco, huecoActual);
    }
  }

  const perdida = (intervalos - cubiertos) / intervalos;
  return {
    intervalos,
    cubiertos,
    perdida,
    mayorHuecoMs: mayorHueco * intervaloMs,
    aceptable: perdida <= umbralPerdida,
  };
}
