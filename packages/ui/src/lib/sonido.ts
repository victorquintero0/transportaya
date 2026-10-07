import { preferencias } from '../estado/preferencias.ts';

/**
 * Sonidos sintetizados con WebAudio: no hay archivos que descargar y funcionan sin conexión.
 * El navegador solo deja sonar tras un toque del usuario; `desbloquearAudio` se llama al conectarse.
 */
let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (!preferencias().sonido) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function desbloquearAudio(): void {
  contexto();
}

function nota(
  ac: AudioContext,
  frecuencia: number,
  inicio: number,
  duracion: number,
  volumen = 0.18,
  tipo: OscillatorType = 'sine',
) {
  const osc = ac.createOscillator();
  const ganancia = ac.createGain();
  osc.type = tipo;
  osc.frequency.value = frecuencia;
  const t0 = ac.currentTime + inicio;
  ganancia.gain.setValueAtTime(0.0001, t0);
  ganancia.gain.exponentialRampToValueAtTime(volumen, t0 + 0.015);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  osc.connect(ganancia).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.05);
}

/** Escala alegre ascendente cuando llega una oferta; se repite hasta que se detiene. */
export function iniciarTimbreOferta(): () => void {
  const ac = contexto();
  if (!ac) return () => undefined;
  const tocar = () => {
    [659.25, 783.99, 987.77, 1318.51].forEach((f, i) =>
      nota(ac, f, i * 0.12, 0.28, 0.2, 'triangle'),
    );
  };
  tocar();
  const id = window.setInterval(tocar, 1600);
  return () => window.clearInterval(id);
}

/** Aceptar una oferta, llegar, iniciar: confirmaciones cortas. */
export function ding(): void {
  const ac = contexto();
  if (!ac) return;
  nota(ac, 880, 0, 0.18, 0.16);
  nota(ac, 1318.51, 0.09, 0.25, 0.16);
}

export function toque(): void {
  const ac = contexto();
  if (!ac) return;
  nota(ac, 520, 0, 0.06, 0.07, 'triangle');
}

/** Fin del viaje: pequeño festejo. */
export function tada(): void {
  const ac = contexto();
  if (!ac) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nota(ac, f, i * 0.09, 0.4, 0.17, 'triangle'));
  nota(ac, 1568, 0.4, 0.7, 0.14, 'sine');
}

export function alerta(): void {
  const ac = contexto();
  if (!ac) return;
  nota(ac, 330, 0, 0.22, 0.2, 'square');
  nota(ac, 247, 0.25, 0.3, 0.2, 'square');
}
