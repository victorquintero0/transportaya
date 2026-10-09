/**
 * Reservas: viajes programados (RN-080 a RN-085). Estas funciones solo calculan fechas y reglas; los plazos son parámetros
 * que Operación puede cambiar (grupo «Reservas» de la configuración).
 */
export interface ParametrosReserva {
  /** Mínimo de anticipación para reservar, en minutos (RN-080). */
  anticipacionMinMin: number;
  /** Máximo de anticipación, en días (RN-080). */
  anticipacionMaxDias: number;
  /** Desde cuántas horas antes los conductores ven la reserva en el tablero (RN-082). */
  tableroH: number;
  /** Quien toma una reserva debe confirmarla al menos tantos minutos antes; si no, vuelve al tablero (RN-082). */
  confirmarMin: number;
  /** A cuántos minutos del servicio empieza el despacho automático (RN-083). */
  despachoMin: number;
  /** A cuántos minutos del servicio, si sigue sin conductor, se avisa a la operación (RN-083). */
  alertaMin: number;
  /** Cancelación gratis hasta tantos minutos antes (RN-084). */
  cancelacionGratisMin: number;
  /** El conductor puede soltar una reserva hasta tantos minutos antes; después, solo con soporte. */
  soltarMin: number;
  /** Cuánto se sigue buscando conductor después de la hora del servicio, en minutos. */
  esperaExtraMin: number;
}

export const RESERVA_POR_DEFECTO: ParametrosReserva = {
  anticipacionMinMin: 45,
  anticipacionMaxDias: 7,
  tableroH: 24,
  confirmarMin: 60,
  despachoMin: 30,
  alertaMin: 15,
  cancelacionGratisMin: 60,
  soltarMin: 120,
  esperaExtraMin: 10,
};

const MIN = 60_000;
const restaMin = (hora: Date, min: number) => new Date(hora.getTime() - min * MIN);

export type ErrorReserva = {
  codigo: 'RESERVA_MUY_PRONTO' | 'RESERVA_MUY_LEJOS';
  detalle: string;
};

/** ¿La hora pedida cumple la anticipación mínima y máxima? `null` si está bien. */
export function validarAnticipacion(
  programadoPara: Date,
  ahora: Date,
  p: ParametrosReserva = RESERVA_POR_DEFECTO,
): ErrorReserva | null {
  const faltanMin = (programadoPara.getTime() - ahora.getTime()) / MIN;
  if (faltanMin < p.anticipacionMinMin)
    return {
      codigo: 'RESERVA_MUY_PRONTO',
      detalle: `Una reserva se hace con al menos ${p.anticipacionMinMin} minutos de anticipación. Si lo necesitas ya, pide el viaje ahora.`,
    };
  if (faltanMin > p.anticipacionMaxDias * 24 * 60)
    return {
      codigo: 'RESERVA_MUY_LEJOS',
      detalle: `Solo se puede reservar con hasta ${p.anticipacionMaxDias} días de anticipación.`,
    };
  return null;
}

/** Desde cuándo los conductores ven la reserva en el tablero. */
export const apareceEnTablero = (
  programadoPara: Date,
  p: ParametrosReserva = RESERVA_POR_DEFECTO,
) => restaMin(programadoPara, p.tableroH * 60);

/** Última hora para que quien tomó la reserva la confirme. */
export const limiteConfirmacion = (
  programadoPara: Date,
  p: ParametrosReserva = RESERVA_POR_DEFECTO,
) => restaMin(programadoPara, p.confirmarMin);

/** Cuándo empieza el despacho automático. */
export const momentoDespacho = (programadoPara: Date, p: ParametrosReserva = RESERVA_POR_DEFECTO) =>
  restaMin(programadoPara, p.despachoMin);

/** Cuándo, si sigue sin conductor, se avisa a la operación. */
export const momentoAlerta = (programadoPara: Date, p: ParametrosReserva = RESERVA_POR_DEFECTO) =>
  restaMin(programadoPara, p.alertaMin);

/** Hasta cuándo se sigue buscando conductor para una reserva ya activada. */
export const finDeLaBusqueda = (programadoPara: Date, p: ParametrosReserva = RESERVA_POR_DEFECTO) =>
  new Date(programadoPara.getTime() + p.esperaExtraMin * MIN);

/**
 * ¿La reserva se confirma sola al tomarla? Si ya pasó la hora límite de confirmación no hay a quién pedirle que
 * confirme después: quien la toma tan tarde se compromete en ese momento.
 */
export const seConfirmaAlTomar = (
  programadoPara: Date,
  ahora: Date,
  p: ParametrosReserva = RESERVA_POR_DEFECTO,
): boolean => ahora.getTime() >= limiteConfirmacion(programadoPara, p).getTime();

/** RN-084: ¿se puede cancelar sin costo a esta hora? */
export const cancelacionGratis = (
  programadoPara: Date,
  ahora: Date,
  p: ParametrosReserva = RESERVA_POR_DEFECTO,
): boolean => programadoPara.getTime() - ahora.getTime() >= p.cancelacionGratisMin * MIN;

/** ¿El conductor todavía puede soltar la reserva él mismo? */
export const puedeSoltar = (
  programadoPara: Date,
  ahora: Date,
  p: ParametrosReserva = RESERVA_POR_DEFECTO,
): boolean => programadoPara.getTime() - ahora.getTime() >= p.soltarMin * MIN;

/** Dos reservas se pisan si quedan a menos de este tiempo una de la otra (servicio típico más un margen). */
export const MARGEN_ENTRE_RESERVAS_MIN = 90;
export const sePisan = (a: Date, b: Date, margenMin = MARGEN_ENTRE_RESERVAS_MIN): boolean =>
  Math.abs(a.getTime() - b.getTime()) < margenMin * MIN;

/** Quien tiene una reserva confirmada que empieza en menos de esto no recibe otros viajes. */
export const BLOQUEO_POR_RESERVA_MIN = 45;

export type EstadoReserva =
  'sin_conductor' | 'tomada' | 'confirmada' | 'buscando' | 'asignada' | 'en_curso' | 'cerrada';

export const ETIQUETA_ESTADO_RESERVA: Record<EstadoReserva, string> = {
  sin_conductor: 'Sin conductor',
  tomada: 'Tomada, falta confirmar',
  confirmada: 'Confirmada',
  buscando: 'Buscando conductor',
  asignada: 'Conductor en camino',
  en_curso: 'En curso',
  cerrada: 'Cerrada',
};

/** El estado de una reserva tal como lo ve la operación, a partir del viaje. */
export function estadoDeReserva(v: {
  estado: string;
  reservaConductorId: string | null;
  reservaConfirmadaEn: Date | null;
}): EstadoReserva {
  if (v.estado === 'programado')
    return v.reservaConductorId
      ? v.reservaConfirmadaEn
        ? 'confirmada'
        : 'tomada'
      : 'sin_conductor';
  if (v.estado === 'buscando_conductor') return 'buscando';
  if (v.estado === 'asignado' || v.estado === 'en_sitio') return 'asignada';
  if (v.estado === 'en_curso') return 'en_curso';
  return 'cerrada';
}
