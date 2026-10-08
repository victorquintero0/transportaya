const zona = 'America/Bogota';

function dia(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: zona });
}

/** "Hoy, 3:45 p. m." · "Ayer, 8:10 a. m." · "6 oct, 3:45 p. m." */
export function fechaCorta(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: zona,
  });
  const ayer = new Date(ahora.getTime() - 24 * 3_600_000);
  if (dia(d) === dia(ahora)) return `Hoy, ${hora}`;
  if (dia(d) === dia(ayer)) return `Ayer, ${hora}`;
  // Se arma a mano para que salga igual en todos los navegadores: "3 oct" y no "3 de oct.".
  const partes = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: zona,
  }).formatToParts(d);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  const fecha = `${valor('day')} ${valor('month').replace('.', '')}`;
  return `${fecha}, ${hora}`;
}

/** "Hoy, 3:45 p. m." · "Mañana, 8:10 a. m." · "vie 9 oct, 3:45 p. m." — para lo que todavía no ha pasado. */
export function fechaReserva(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: zona,
  });
  const manana = new Date(ahora.getTime() + 24 * 3_600_000);
  if (dia(d) === dia(ahora)) return `Hoy, ${hora}`;
  if (dia(d) === dia(manana)) return `Mañana, ${hora}`;
  const partes = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: zona,
  }).formatToParts(d);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return `${v('weekday').replace('.', '')} ${v('day')} ${v('month').replace('.', '')}, ${hora}`;
}

/** Para el campo de fecha y hora: el instante, como "AAAA-MM-DDTHH:MM" en hora de Bogotá. */
export function aCampoFechaHora(d: Date): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
}

/** Lo que escribió la persona en el campo (hora de Bogotá) como instante con zona horaria. */
export function deCampoFechaHora(valor: string): string {
  return new Date(`${valor}:00-05:00`).toISOString();
}
