/**
 * Recargo por horario del Decreto 0641 de 2025 de Manizales: nocturno (7 p. m. a 6 a. m.) y
 * dominical o festivo. Son excluyentes: si el servicio es nocturno en domingo o festivo, solo se
 * cobra el recargo nocturno.
 */
export type RecargoHorario = 'nocturno' | 'dominical_festivo';

export interface HorarioNocturno {
  /** Hora local (0-23) desde la que rige el recargo nocturno. */
  desdeHora: number;
  /** Hora local (0-23) hasta la que rige, sin incluirla. */
  hastaHora: number;
}

export const HORARIO_NOCTURNO_POR_DEFECTO: HorarioNocturno = { desdeHora: 19, hastaHora: 6 };

/** Colombia no tiene horario de verano: America/Bogota es siempre UTC−5. */
const DESFASE_BOGOTA_MS = -5 * 60 * 60 * 1000;

/**
 * Recargo de horario que aplica a un servicio que empieza en `instante`.
 * `esFestivo` viene del calendario oficial de festivos del año (RN, convenciones generales).
 */
export function recargoHorario(
  instante: Date,
  esFestivo: boolean,
  horario: HorarioNocturno = HORARIO_NOCTURNO_POR_DEFECTO,
): RecargoHorario | null {
  const local = new Date(instante.getTime() + DESFASE_BOGOTA_MS);
  const hora = local.getUTCHours();
  const esNocturno = hora >= horario.desdeHora || hora < horario.hastaHora;
  if (esNocturno) return 'nocturno';
  if (esFestivo || local.getUTCDay() === 0) return 'dominical_festivo';
  return null;
}
