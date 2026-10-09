import type { CategoriaVehiculo } from './categorias.js';
import { diasEntre } from './tiempo.js';
import type { TipoServicio } from './viaje.js';

/**
 * Clientes corporativos (RN-100 a RN-105): las reglas puras. La API las aplica al pedir un viaje y al cerrar el ciclo;
 * la app las usa para avisar antes de confirmar.
 */

export const ESTADOS_EMPRESA = ['activa', 'suspendida'] as const;
export type EstadoEmpresa = (typeof ESTADOS_EMPRESA)[number];

export const ESTADOS_VINCULO = ['invitado', 'activo', 'retirado'] as const;
export type EstadoVinculo = (typeof ESTADOS_VINCULO)[number];

export const ROLES_VINCULO = ['empleado', 'administrador'] as const;

/** Días de pago por defecto después de emitido el estado de cuenta (RN-104). */
export const DIAS_PAGO_POR_DEFECTO = 15;
/** Descuento máximo que se puede pactar: 50 %. */
export const DESCUENTO_MAXIMO_PB = 5000;

// ───────────────────────────────────────────────────────────── políticas de uso (RN-102, RN-103)

export interface PoliticaUso {
  /** Días permitidos: 1 = lunes … 7 = domingo. Vacío = todos. */
  dias: readonly number[];
  /** Ventana horaria en minutos desde medianoche (hora de Bogotá). Si `desdeMin` > `hastaMin` cruza la medianoche. */
  desdeMin: number;
  hastaMin: number;
  /** Tope por viaje, en pesos, comparado con el precio máximo estimado. `null` = sin tope. */
  montoMaximo: number | null;
  /** Vacío = todas. */
  categorias: readonly CategoriaVehiculo[];
  /** Vacío = todos. */
  tiposServicio: readonly TipoServicio[];
  motivoObligatorio: boolean;
}

export const POLITICA_SIN_RESTRICCIONES: PoliticaUso = {
  dias: [],
  desdeMin: 0,
  hastaMin: 1440,
  montoMaximo: null,
  categorias: [],
  tiposServicio: [],
  motivoObligatorio: false,
};

export type CodigoPolitica =
  | 'POLITICA_DIA'
  | 'POLITICA_HORARIO'
  | 'POLITICA_MONTO'
  | 'POLITICA_CATEGORIA'
  | 'POLITICA_SERVICIO'
  | 'POLITICA_MOTIVO';

export type ResultadoPolitica =
  { permitido: true } | { permitido: false; codigo: CodigoPolitica; detalle: string };

export interface ViajeParaPolitica {
  /** Hora del servicio: ahora para un viaje inmediato, la hora reservada para una reserva. */
  instante: Date;
  categoria: CategoriaVehiculo;
  tipoServicio: TipoServicio;
  /** Precio máximo estimado. */
  precioMaximo: number;
  motivo?: string | null | undefined;
}

const NOMBRE_DIA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const NOMBRE_CATEGORIA: Record<CategoriaVehiculo, string> = {
  media: 'Media',
  media_alta: 'Media Alta',
  alta: 'Alta',
};

/** Día ISO (1 = lunes … 7 = domingo) y minutos desde medianoche, en Bogotá. */
export function diaYMinutoBogota(instante: Date): { dia: number; minuto: number } {
  const local = new Date(instante.getTime() - 5 * 3_600_000);
  const dia = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
  return { dia, minuto: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export function horaTexto(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24;
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function dentroDeLaVentana(minuto: number, desde: number, hasta: number): boolean {
  if (desde === hasta) return true;
  return desde < hasta ? minuto >= desde && minuto < hasta : minuto >= desde || minuto < hasta;
}

/** RN-103: ¿este viaje cumple la política? Si no, dice por qué, para mostrarlo antes de confirmar. */
export function evaluarPolitica(p: PoliticaUso, v: ViajeParaPolitica): ResultadoPolitica {
  const { dia, minuto } = diaYMinutoBogota(v.instante);
  if (p.dias.length > 0 && !p.dias.includes(dia)) {
    const permitidos = [...p.dias].sort().map((d) => NOMBRE_DIA[d] ?? '');
    return {
      permitido: false,
      codigo: 'POLITICA_DIA',
      detalle: `La política de tu empresa solo permite viajes corporativos: ${permitidos.join(', ')}.`,
    };
  }
  if (!dentroDeLaVentana(minuto, p.desdeMin, p.hastaMin)) {
    return {
      permitido: false,
      codigo: 'POLITICA_HORARIO',
      detalle: `La política de tu empresa solo permite viajes corporativos entre ${horaTexto(p.desdeMin)} y ${horaTexto(p.hastaMin)}.`,
    };
  }
  if (p.tiposServicio.length > 0 && !p.tiposServicio.includes(v.tipoServicio)) {
    return {
      permitido: false,
      codigo: 'POLITICA_SERVICIO',
      detalle:
        v.tipoServicio === 'intermunicipal'
          ? 'La política de tu empresa no permite viajes a otras ciudades con cargo a la empresa.'
          : 'La política de tu empresa no permite este tipo de servicio con cargo a la empresa.',
    };
  }
  if (p.categorias.length > 0 && !p.categorias.includes(v.categoria)) {
    return {
      permitido: false,
      codigo: 'POLITICA_CATEGORIA',
      detalle: `La política de tu empresa no permite la categoría ${NOMBRE_CATEGORIA[v.categoria]}.`,
    };
  }
  if (p.montoMaximo !== null && v.precioMaximo > p.montoMaximo) {
    return {
      permitido: false,
      codigo: 'POLITICA_MONTO',
      detalle: `Este viaje puede costar hasta $ ${v.precioMaximo.toLocaleString('es-CO')} y la política de tu empresa permite hasta $ ${p.montoMaximo.toLocaleString('es-CO')} por viaje.`,
    };
  }
  if (p.motivoObligatorio && !(v.motivo ?? '').trim()) {
    return {
      permitido: false,
      codigo: 'POLITICA_MOTIVO',
      detalle: 'Tu empresa exige indicar el motivo del viaje.',
    };
  }
  return { permitido: true };
}

// ───────────────────────────────────────────────────────────── contrato: cupo y mora (RN-100, RN-104)

export interface ContratoEmpresa {
  estado: EstadoEmpresa;
  /** Cupo de crédito en pesos, `null` = sin tope. */
  cupo: number | null;
  /** Días que tiene para pagar cada estado de cuenta. */
  diasPago: number;
}

export type CodigoEmpresa = 'EMPRESA_SUSPENDIDA' | 'CUPO_AGOTADO' | 'CUENTA_VENCIDA';

export type ResultadoEmpresa =
  { disponible: true } | { disponible: false; codigo: CodigoEmpresa; detalle: string };

/**
 * RN-104: el perfil corporativo se suspende si la empresa lo está, si superaría el cupo o si tiene un estado de cuenta
 * sin pagar pasado su vencimiento. Los empleados siguen pudiendo pedir viajes personales.
 */
export function evaluarEmpresa(
  c: ContratoEmpresa,
  e: {
    /** Lo que la empresa ya debe: estados de cuenta sin pagar + lo consumido en el ciclo + lo reservado. */
    exposicion: number;
    /** Precio máximo del viaje que quiere pedir. */
    nuevo: number;
    /** El vencimiento más antiguo de un estado de cuenta sin pagar (AAAA-MM-DD), si hay. */
    vencimientoMasAntiguo: string | null;
    hoy: string;
  },
): ResultadoEmpresa {
  if (c.estado === 'suspendida')
    return {
      disponible: false,
      codigo: 'EMPRESA_SUSPENDIDA',
      detalle: 'El perfil corporativo de tu empresa está suspendido. Puedes viajar como persona.',
    };
  if (e.vencimientoMasAntiguo && e.vencimientoMasAntiguo < e.hoy)
    return {
      disponible: false,
      codigo: 'CUENTA_VENCIDA',
      detalle:
        'Tu empresa tiene un estado de cuenta vencido, así que el perfil corporativo está suspendido. Puedes viajar como persona.',
    };
  if (c.cupo !== null && e.exposicion + e.nuevo > c.cupo)
    return {
      disponible: false,
      codigo: 'CUPO_AGOTADO',
      detalle:
        'Tu empresa alcanzó su cupo de crédito, así que no puedes cargar este viaje a la empresa. Puedes viajar como persona.',
    };
  return { disponible: true };
}

/** Descuento pactado, en pesos, sobre un valor. Siempre hacia abajo para no cobrar de menos a nadie. */
export function descuentoCorporativo(valor: number, descuentoPb: number): number {
  if (valor <= 0 || descuentoPb <= 0) return 0;
  return Math.floor((valor * Math.min(descuentoPb, DESCUENTO_MAXIMO_PB)) / 10_000);
}

// ───────────────────────────────────────────────────────────── ciclos y estados de cuenta (RN-105)

export interface Ciclo {
  /** Primer día del ciclo (AAAA-MM-DD, incluido). */
  desde: string;
  /** Último día del ciclo (incluido). */
  hasta: string;
}

function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

function conDia(anio: number, mes: number, dia: number): string {
  return new Date(Date.UTC(anio, mes, dia)).toISOString().slice(0, 10);
}

/**
 * El ciclo de facturación que contiene una fecha. Empieza el `diaCorte` de cada mes (1 a 28) y termina el día
 * anterior al siguiente corte. Con corte el día 1 son los meses calendario.
 */
export function cicloDe(diaCorte: number, fecha: string): Ciclo {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const desde = d >= diaCorte ? conDia(a, m - 1, diaCorte) : conDia(a, m - 2, diaCorte);
  const siguiente = new Date(Date.parse(`${desde}T00:00:00Z`));
  const hasta = sumarDias(
    conDia(siguiente.getUTCFullYear(), siguiente.getUTCMonth() + 1, diaCorte),
    -1,
  );
  return { desde, hasta };
}

/** El ciclo que acaba de cerrar si hoy es día de corte; `null` si hoy no lo es. */
export function cicloParaFacturar(diaCorte: number, hoy: string): Ciclo | null {
  const dia = Number(hoy.slice(8, 10));
  if (dia !== diaCorte) return null;
  return cicloDe(diaCorte, sumarDias(hoy, -1));
}

/** El último ciclo ya cerrado a `hoy`: el que se factura aunque se haya pasado el día de corte. */
export function cicloCerrado(diaCorte: number, hoy: string): Ciclo {
  return cicloDe(diaCorte, sumarDias(cicloDe(diaCorte, hoy).desde, -1));
}

/** Fecha de vencimiento de un estado de cuenta emitido en `emision`. */
export function vencimientoDe(emision: string, diasPago: number): string {
  return sumarDias(emision, diasPago);
}

export type EstadoCuentaMostrado = 'emitido' | 'vencido' | 'pagado' | 'anulado';

export function estadoDeCuenta(
  e: { estado: 'emitido' | 'pagado' | 'anulado'; venceEn: string },
  hoy: string,
): EstadoCuentaMostrado {
  if (e.estado === 'emitido' && e.venceEn < hoy) return 'vencido';
  return e.estado;
}

export const ETIQUETA_ESTADO_CUENTA: Record<EstadoCuentaMostrado, string> = {
  emitido: 'Por pagar',
  vencido: 'Vencido',
  pagado: 'Pagado',
  anulado: 'Anulado',
};

/** Días de atraso de un estado de cuenta (0 si no está vencido). */
export function diasDeMora(venceEn: string, hoy: string): number {
  return Math.max(0, diasEntre(venceEn, hoy));
}
