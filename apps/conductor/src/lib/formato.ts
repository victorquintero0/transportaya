/** Formatos en español de Colombia: $ 12.500, 3,4 km, 12 min. */

const moneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const entero = new Intl.NumberFormat('es-CO');
const decimal = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

/** 12500 → "$ 12.500" (con espacio normal, para que el texto se pueda partir y copiar bien). */
export function pesos(valor: number): string {
  return moneda.format(Math.round(valor)).replace(/\u00a0/g, ' ');
}

/** 1.250.000 → "$ 1,3 M"; 85.000 → "$ 85 mil": para espacios reducidos. */
export function pesosCorto(valor: number): string {
  const v = Math.abs(valor);
  const signo = valor < 0 ? '-' : '';
  if (v >= 1_000_000) return `${signo}$ ${decimal.format(v / 1_000_000)} M`;
  if (v >= 10_000) return `${signo}$ ${entero.format(Math.round(v / 1000))} mil`;
  return pesos(valor);
}

export function numero(valor: number): string {
  return entero.format(valor);
}

/** 420 → "420 m"; 3400 → "3,4 km". */
export function distancia(metros: number): string {
  const redondeado = Math.round(metros);
  if (redondeado < 1000) return `${redondeado} m`;
  return `${decimal.format(metros / 1000)} km`;
}

/** 725 → "12 min"; 4000 → "1 h 07 min"; 40 → "40 s". */
export function duracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** 205 → "03:25" ; 3725 → "1:02:05": para cronómetros. */
export function reloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(seg)}` : `${dos(m)}:${dos(seg)}`;
}

export function porcentaje(fraccion: number): string {
  return `${Math.round(fraccion * 100)} %`;
}

/** "2026-10-06" → "mar 6" */
export function diaCorto(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00-05:00`);
  return d
    .toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'America/Bogota' })
    .replace('.', '');
}

/** "2026-10-06" → "6 de octubre" */
export function diaLargo(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00-05:00`);
  return d.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
  });
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  });
}

/** Primer nombre con mayúscula inicial. */
export function primerNombre(nombre: string): string {
  const n = nombre.trim().split(/\s+/)[0] ?? '';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

/** Saludo según la hora de Bogotá. */
export function saludo(ahora = new Date()): string {
  const h = Number(
    ahora.toLocaleString('es-CO', { hour: 'numeric', hour12: false, timeZone: 'America/Bogota' }),
  );
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** 3001234567 → "300 123 4567" */
export function telefonoLegible(e164: string): string {
  const d = e164.replace(/^\+57/, '').replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : e164;
}
