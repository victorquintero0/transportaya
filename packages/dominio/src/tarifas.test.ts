import { describe, expect, it } from 'vitest';
import {
  calcularCobroEspera,
  calcularTarifaUrbana,
  costoCancelacionPasajero,
  puedeCancelarPorPasajeroAusente,
} from './tarifas.js';

// Valores ficticios del ejemplo de docs/03 (RN-010), no son tarifas reales.
const parametros = { base: 2500, valorKm: 1100, valorMinuto: 250, minima: 6000 };

describe('calcularTarifaUrbana (RN-010)', () => {
  it('reproduce el ejemplo de la documentación', () => {
    const r = calcularTarifaUrbana({
      parametros,
      distanciaM: 6000,
      duracionS: 18 * 60,
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
    const r = calcularTarifaUrbana({ parametros, distanciaM: 500, duracionS: 120 });
    expect(r.subtotal).toBe(3550);
    expect(r.tarifaViaje).toBe(6000);
  });

  it('no multiplica los recargos por la dinámica y calcula los porcentuales sobre el subtotal', () => {
    const r = calcularTarifaUrbana({
      parametros,
      distanciaM: 6000,
      duracionS: 18 * 60,
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
      duracionS: 18 * 60,
      peajes: 9400,
      cobroEspera: 750,
      propina: 2000,
    });
    expect(r.totalRedondeado).toBe(13_600);
    expect(r.total).toBe(13_600 + 9400 + 750 + 2000);
  });

  it('recalcula con la distancia y el tiempo reales (D-10)', () => {
    const estimado = calcularTarifaUrbana({ parametros, distanciaM: 6000, duracionS: 1080 });
    const real = calcularTarifaUrbana({ parametros, distanciaM: 8000, duracionS: 1500 });
    expect(real.total).toBeGreaterThan(estimado.total);
  });

  it('rechaza multiplicadores menores a 1 y valores negativos', () => {
    expect(() =>
      calcularTarifaUrbana({ parametros, distanciaM: 1, duracionS: 1, multiplicadorDinamico: 0.5 }),
    ).toThrow(RangeError);
    expect(() => calcularTarifaUrbana({ parametros, distanciaM: -1, duracionS: 1 })).toThrow(
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
