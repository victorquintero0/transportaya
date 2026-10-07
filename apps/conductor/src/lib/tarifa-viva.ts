import {
  calcularCobroEspera,
  calcularTarifaUrbana,
  type DesgloseTarifa,
  type Recargo,
} from '@transportaya/dominio';
import type { ViajeActual } from './tipos.ts';

/**
 * El valor del taxímetro en pantalla. Usa la misma función del servidor, así lo que el conductor ve mientras
 * maneja coincide (salvo diferencias de GPS) con lo que se cobra al finalizar.
 */
export function tarifaEnVivo(
  viaje: Pick<ViajeActual, 'tarifa' | 'rutaFija' | 'tiempos'>,
  medicion: { distanciaM: number; tiempoDetenidoS: number },
): { total: number; desglose: DesgloseTarifa | null; fija: boolean } {
  if (viaje.rutaFija) return { total: viaje.rutaFija.tarifa, desglose: null, fija: true };
  const t = viaje.tarifa;
  if (!t) return { total: 0, desglose: null, fija: false };
  const desglose = calcularTarifaUrbana({
    parametros: { base: t.base, valorKm: t.valorKm, valorMinuto: t.valorMinuto, minima: t.minima },
    distanciaM: medicion.distanciaM,
    tiempoCobrableS: medicion.tiempoDetenidoS,
    multiplicadorDinamico: t.multiplicadorDinamico,
    recargos: t.recargos as Recargo[],
    cobroEspera: cobroDeEspera(viaje),
  });
  return { total: desglose.total, desglose, fija: false };
}

/** La espera se cobra desde que el conductor marcó "llegué" hasta que inicia el viaje (RN-041). */
export function cobroDeEspera(viaje: Pick<ViajeActual, 'tarifa' | 'tiempos'>): number {
  const t = viaje.tarifa;
  if (!t || !viaje.tiempos.enSitioEn || !viaje.tiempos.iniciadoEn) return 0;
  const segundos =
    (Date.parse(viaje.tiempos.iniciadoEn) - Date.parse(viaje.tiempos.enSitioEn)) / 1000;
  return calcularCobroEspera(segundos, {
    minutosGratis: t.esperaMinutosGratis,
    valorMinuto: t.esperaMinuto,
  });
}
