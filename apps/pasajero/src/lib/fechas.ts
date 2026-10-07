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
