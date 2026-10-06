/** Colombia no tiene horario de verano: America/Bogota es siempre UTC−5. */
const DESFASE_BOGOTA_MS = -5 * 60 * 60 * 1000;

/** Fecha calendario (AAAA-MM-DD) en Bogotá de un instante. Es la que usan los vencimientos y el cierre diario. */
export function fechaBogota(instante: Date | number): string {
  const ms = typeof instante === 'number' ? instante : instante.getTime();
  return new Date(ms + DESFASE_BOGOTA_MS).toISOString().slice(0, 10);
}

/** Días completos entre dos fechas AAAA-MM-DD (positivo si `hasta` es posterior a `desde`). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  );
}
