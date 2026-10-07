import { aplicarPuntosBasicos } from './dinero.js';
import type { TipoServicio } from './viaje.js';

/** Comisión de TransporteYa (D-03): 3 % dentro de la ciudad y 5 % en viajes nacionales. */
export type AmbitoComision = 'urbano' | 'nacional';

export const COMISION_PUNTOS_BASICOS: Readonly<Record<AmbitoComision, number>> = {
  urbano: 300,
  nacional: 500,
};

/** Los viajes intermunicipales (nacionales) pagan 5 %; el resto, incluido el aeropuerto urbano, 3 %. */
export function ambitoComision(tipo: TipoServicio): AmbitoComision {
  return tipo === 'intermunicipal' ? 'nacional' : 'urbano';
}

export interface BaseComision {
  /** Tarifa del viaje con recargos, ya redondeada. */
  totalRedondeado: number;
  cobroEspera?: number;
  tarifaCancelacion?: number;
}

/** RN-060: la comisión se calcula sobre tarifa, recargos, espera y cancelación; no sobre peajes ni propinas. */
export function calcularComision(
  base: BaseComision,
  ambito: AmbitoComision,
  puntosBasicos: Readonly<Record<AmbitoComision, number>> = COMISION_PUNTOS_BASICOS,
): number {
  const comisionable =
    base.totalRedondeado + (base.cobroEspera ?? 0) + (base.tarifaCancelacion ?? 0);
  return aplicarPuntosBasicos(comisionable, puntosBasicos[ambito]);
}

/** Tipos de movimiento del libro del conductor (RN-061). */
export const TIPOS_MOVIMIENTO = [
  'ingreso_viaje_electronico',
  'comision_viaje_efectivo',
  'peaje',
  'propina',
  'cancelacion',
  'pago_comision',
  'pago_liquidacion',
  'ajuste',
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/** Un movimiento del libro. `monto` lleva signo: positivo a favor del conductor, negativo a su cargo. */
export interface Movimiento {
  tipo: TipoMovimiento;
  monto: number;
  viajeId?: string;
}

export interface LiquidacionViaje {
  metodo: 'efectivo' | 'electronico';
  base: BaseComision;
  ambito: AmbitoComision;
  peajes?: number;
  propina?: number;
  viajeId?: string;
}

/**
 * Movimientos que genera un viaje finalizado (RN-061, RN-062):
 * - Electrónico: ingreso = tarifa − comisión; los peajes y la propina se acreditan completos.
 * - Efectivo: el conductor ya tiene el dinero; solo se debita la comisión.
 */
export function movimientosDeViaje(viaje: LiquidacionViaje): Movimiento[] {
  const comision = calcularComision(viaje.base, viaje.ambito);
  const cobrado =
    viaje.base.totalRedondeado +
    (viaje.base.cobroEspera ?? 0) +
    (viaje.base.tarifaCancelacion ?? 0);
  const ref = viaje.viajeId === undefined ? {} : { viajeId: viaje.viajeId };

  if (viaje.metodo === 'efectivo') {
    return [{ tipo: 'comision_viaje_efectivo', monto: -comision, ...ref }];
  }
  const movimientos: Movimiento[] = [
    { tipo: 'ingreso_viaje_electronico', monto: cobrado - comision, ...ref },
  ];
  if (viaje.peajes) movimientos.push({ tipo: 'peaje', monto: viaje.peajes, ...ref });
  if (viaje.propina) movimientos.push({ tipo: 'propina', monto: viaje.propina, ...ref });
  return movimientos;
}

export function sumarMovimientos(movimientos: readonly Movimiento[]): number {
  return movimientos.reduce((suma, m) => suma + m.monto, 0);
}

export type ResultadoCierre = 'a_favor' | 'a_cargo' | 'en_cero';

export interface CierreDiario {
  /** Suma de los movimientos del día más el saldo arrastrado. Positivo: TransporteYa debe al conductor. */
  neto: number;
  resultado: ResultadoCierre;
  /** Valor que el conductor debe pagar por llave / Bre-B para habilitarse (RN-063). */
  deuda: number;
  /** El conductor queda sin habilitar mientras tenga deuda (RN-063). */
  bloqueado: boolean;
}

/** RN-063: cruce neto a las 00:00. */
export function calcularCierreDiario(
  movimientosDelDia: readonly Movimiento[],
  saldoArrastrado = 0,
): CierreDiario {
  const neto = sumarMovimientos(movimientosDelDia) + saldoArrastrado;
  const resultado: ResultadoCierre = neto > 0 ? 'a_favor' : neto < 0 ? 'a_cargo' : 'en_cero';
  return { neto, resultado, deuda: neto < 0 ? -neto : 0, bloqueado: neto < 0 };
}

export const PAGO_MINIMO_POR_DEFECTO = 20_000;

export type DecisionPago = 'pagar' | 'acumular' | 'cobrar' | 'nada';

/** RN-070 y RN-074: qué hacer con el resultado del cierre. */
export function decidirPago(
  cierre: CierreDiario,
  pagoMinimo = PAGO_MINIMO_POR_DEFECTO,
): DecisionPago {
  if (cierre.resultado === 'a_cargo') return 'cobrar';
  if (cierre.resultado === 'a_favor') return cierre.neto >= pagoMinimo ? 'pagar' : 'acumular';
  return 'nada';
}
