import { describe, expect, it } from 'vitest';
import { TARIFA_TAXI_MANIZALES_2026 as TAXI } from './semilla-manizales-2026.js';
import {
  calcularCobroEspera,
  calcularTarifaUrbana,
  costoCancelacionPasajero,
  estimarTiempoDetenido,
  puedeCancelarPorPasajeroAusente,
} from './tarifas.js';

// Valores ficticios del ejemplo de docs/03 (RN-010), no son tarifas reales.
const parametros = { base: 2500, valorKm: 1100, valorMinuto: 250, minima: 6000 };

describe('calcularTarifaUrbana (RN-010)', () => {
  it('reproduce el ejemplo de la documentación', () => {
    const r = calcularTarifaUrbana({
      parametros,
      distanciaM: 6000,
      tiempoCobrableS: 18 * 60,
      multiplicadorDinamico: 1.2,
      recargos: [{ nombre: 'nocturno', tipo: 'fijo', valor: 1000 }],
    });
    expect(r.distancia).toBe(6600);
    expect(r.tiempo).toBe(4500);
    expect(r.subtotal).toBe(13_600);
    expect(r.tarifaViaje).toBe(16_320);
    expect(r.totalRedondeado).toBe(17_300);
    expect(r.total).toBe(17_300);
  });

  it('aplica la tarifa mínima', () => {
    const r = calcularTarifaUrbana({ parametros, distanciaM: 500, tiempoCobrableS: 120 });
    expect(r.subtotal).toBe(3550);
    expect(r.tarifaViaje).toBe(6000);
  });

  it('no multiplica los recargos por la dinámica y calcula los porcentuales sobre el subtotal', () => {
    const r = calcularTarifaUrbana({
      parametros,
      distanciaM: 6000,
      tiempoCobrableS: 18 * 60,
      multiplicadorDinamico: 2,
      recargos: [{ nombre: 'festivo', tipo: 'porcentaje', puntosBasicos: 1000 }],
    });
    expect(r.tarifaViaje).toBe(27_200);
    expect(r.recargos).toBe(1360);
  });

  it('suma peajes, espera y propina sin redondearlos', () => {
    const r = calcularTarifaUrbana({
      parametros,
      distanciaM: 6000,
      tiempoCobrableS: 18 * 60,
      peajes: 9400,
      cobroEspera: 750,
      propina: 2000,
    });
    expect(r.totalRedondeado).toBe(13_600);
    expect(r.total).toBe(13_600 + 9400 + 750 + 2000);
  });

  it('recalcula con la distancia y el tiempo reales (D-10)', () => {
    const estimado = calcularTarifaUrbana({ parametros, distanciaM: 6000, tiempoCobrableS: 1080 });
    const real = calcularTarifaUrbana({ parametros, distanciaM: 8000, tiempoCobrableS: 1500 });
    expect(real.total).toBeGreaterThan(estimado.total);
  });

  it('rechaza multiplicadores menores a 1 y valores negativos', () => {
    expect(() =>
      calcularTarifaUrbana({
        parametros,
        distanciaM: 1,
        tiempoCobrableS: 1,
        multiplicadorDinamico: 0.5,
      }),
    ).toThrow(RangeError);
    expect(() => calcularTarifaUrbana({ parametros, distanciaM: -1, tiempoCobrableS: 1 })).toThrow(
      RangeError,
    );
  });
});

describe('calcularCobroEspera (RN-041)', () => {
  it('no cobra dentro de los minutos gratis', () => {
    expect(calcularCobroEspera(180)).toBe(0);
  });
  it('cobra cada minuto o fracción después de los minutos gratis', () => {
    expect(calcularCobroEspera(181)).toBe(250);
    expect(calcularCobroEspera(180 + 120)).toBe(500);
  });
});

describe('costoCancelacionPasajero (RN-042)', () => {
  it('es gratis antes de tener conductor', () => {
    expect(costoCancelacionPasajero({ tieneConductor: false })).toBe(0);
  });
  it('es gratis hasta 2 minutos después de la asignación', () => {
    expect(costoCancelacionPasajero({ tieneConductor: true, segundosDesdeAsignacion: 120 })).toBe(
      0,
    );
  });
  it('es gratis si el ETA empeoró más de 5 minutos', () => {
    expect(
      costoCancelacionPasajero({
        tieneConductor: true,
        segundosDesdeAsignacion: 600,
        empeoraEtaSegundos: 301,
      }),
    ).toBe(0);
  });
  it('cobra $4.000 en los demás casos', () => {
    expect(
      costoCancelacionPasajero({
        tieneConductor: true,
        segundosDesdeAsignacion: 600,
        empeoraEtaSegundos: 60,
      }),
    ).toBe(4000);
  });
});

describe('puedeCancelarPorPasajeroAusente (RN-043)', () => {
  it('se habilita a los 5 minutos', () => {
    expect(puedeCancelarPorPasajeroAusente(299)).toBe(false);
    expect(puedeCancelarPorPasajeroAusente(300)).toBe(true);
  });
});

describe('tarifa de taxi de Manizales 2026 (Decreto 0641, D-20)', () => {
  const { parametros, recargos } = TAXI;

  it('banderazo + km + tiempo detenido, con recargo nocturno y de aplicación', () => {
    // 3.700 + 6 km × 1.784 (10.704) + 3 min detenido × 223 (669) = 15.073
    const r = calcularTarifaUrbana({
      parametros,
      distanciaM: 6000,
      tiempoCobrableS: 3 * 60,
      recargos: [
        { nombre: 'nocturno', tipo: 'fijo', valor: recargos.horario },
        { nombre: 'puerta_a_puerta', tipo: 'fijo', valor: recargos.puertaAPuerta },
      ],
    });
    expect(r.subtotal).toBe(15_073);
    expect(r.recargos).toBe(1800);
    // 16.873 se aproxima por defecto a la centena anterior (parágrafo tercero)
    expect(r.totalRedondeado).toBe(16_800);
  });

  it('aproxima siempre por defecto, también cuando termina en más de $50', () => {
    const r = calcularTarifaUrbana({
      parametros: { ...parametros, minima: 0 },
      distanciaM: 5000,
      tiempoCobrableS: 0,
    });
    expect(r.subtotal).toBe(12_620);
    expect(r.totalRedondeado).toBe(12_600);
    expect(
      calcularTarifaUrbana({
        parametros: { ...parametros, minima: 0 },
        distanciaM: 5100,
        tiempoCobrableS: 0,
      }).totalRedondeado,
    ).toBe(12_700);
  });

  it('cobra la tarifa mínima de $6.300 en carreras cortas', () => {
    const r = calcularTarifaUrbana({ parametros, distanciaM: 1000, tiempoCobrableS: 0 });
    expect(r.subtotal).toBe(5484);
    expect(r.tarifaViaje).toBe(6300);
  });

  it('suma el recargo de aeropuerto', () => {
    const r = calcularTarifaUrbana({
      parametros,
      distanciaM: 10_000,
      tiempoCobrableS: 0,
      recargos: [{ nombre: 'aeropuerto', tipo: 'fijo', valor: recargos.aeropuerto }],
    });
    expect(r.totalRedondeado).toBe(3700 + 17_840 + 4700 - ((3700 + 17_840 + 4700) % 100));
  });
});

describe('estimarTiempoDetenido (D-23)', () => {
  it('estima una fracción de la duración del viaje', () => {
    expect(estimarTiempoDetenido(1200, 0.15)).toBe(180);
  });
  it('rechaza fracciones fuera de 0 a 1', () => {
    expect(() => estimarTiempoDetenido(1200, 1.5)).toThrow(RangeError);
  });
});
