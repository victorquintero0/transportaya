const ZONA = 'America/Bogota';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function partes(fecha: Date): Record<string, string> {
  const r: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(fecha))
    r[p.type] = p.value;
  return r;
}

/** "7 oct, 08:15" en hora de Bogotá, sin depender de los datos de idioma del navegador. */
export function fechaHora(iso: string | Date): string {
  const p = partes(typeof iso === 'string' ? new Date(iso) : iso);
  return `${p['day']} ${MESES[Number(p['month']) - 1]}, ${p['hour'] === '24' ? '00' : p['hour']}:${p['minute']}`;
}

export function soloHora(iso: string | Date): string {
  const p = partes(typeof iso === 'string' ? new Date(iso) : iso);
  return `${p['hour'] === '24' ? '00' : p['hour']}:${p['minute']}`;
}

/** "2026-10-07" → "7 oct 2026". */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return `${d} ${MESES[(m ?? 1) - 1]} ${a}`;
}

/** Hoy en Bogotá como AAAA-MM-DD. */
export function hoyBogota(): string {
  const p = partes(new Date());
  return `${p['year']}-${String(p['month']).padStart(2, '0')}-${String(p['day']).padStart(2, '0')}`;
}

/** "hace 3 min", "hace 2 h", "hace 4 d". */
export function hace(iso: string, ahora = Date.now()): string {
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86_400)} d`;
}

/** Lo que falta para un plazo: "2 h 10 min" o "vencido hace 1 h". */
export function plazo(iso: string, ahora = Date.now()): string {
  const s = Math.round((new Date(iso).getTime() - ahora) / 1000);
  const abs = Math.abs(s);
  const texto =
    abs < 3600
      ? `${Math.max(1, Math.round(abs / 60))} min`
      : `${Math.floor(abs / 3600)} h ${String(Math.round((abs % 3600) / 60)).padStart(2, '0')} min`;
  return s >= 0 ? texto : `vencido hace ${texto}`;
}
