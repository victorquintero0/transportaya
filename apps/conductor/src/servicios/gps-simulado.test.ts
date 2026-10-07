import { distanciaMetros, Taximetro } from '@transportaya/dominio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CENTRO_MANIZALES, GpsSimulado } from './gps-simulado.ts';
import type { Posicion } from './gps.ts';

describe('GPS simulado', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T20:00:00Z'));
    vi.stubGlobal('window', { setInterval, clearInterval });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function correr(gps: GpsSimulado, segundos: number) {
    vi.advanceTimersByTime(segundos * 1000);
    gps.detener();
  }

  it('sin objetivo se queda quieto', () => {
    const puntos: Posicion[] = [];
    const gps = new GpsSimulado(CENTRO_MANIZALES, (p) => puntos.push(p));
    gps.arrancar();
    correr(gps, 10);
    expect(puntos.length).toBeGreaterThanOrEqual(10);
    expect(puntos.every((p) => p.velocidadKmh === 0)).toBe(true);
    expect(distanciaMetros(CENTRO_MANIZALES, gps.actual())).toBeLessThan(1);
  });

  it('avanza hacia el objetivo y se detiene al llegar', () => {
    const destino = { lat: CENTRO_MANIZALES.lat + 0.009, lng: CENTRO_MANIZALES.lng }; // ≈ 1 km al norte
    const gps = new GpsSimulado(CENTRO_MANIZALES, () => undefined, 1);
    gps.irA(destino);
    gps.arrancar();
    correr(gps, 200);
    expect(distanciaMetros(gps.actual(), destino)).toBeLessThan(10);
  });

  it('con paradas, el taxímetro mide distancia y tiempo detenido como en un viaje real', () => {
    const destino = { lat: CENTRO_MANIZALES.lat + 0.018, lng: CENTRO_MANIZALES.lng }; // ≈ 2 km
    const taximetro = new Taximetro();
    const gps = new GpsSimulado(
      CENTRO_MANIZALES,
      (p) =>
        taximetro.agregar({
          instanteMs: p.t,
          lat: p.lat,
          lng: p.lng,
          precisionM: p.precisionM,
          velocidadKmh: p.velocidadKmh,
        }),
      1,
    );
    gps.irA(destino, true);
    gps.arrancar();
    correr(gps, 400);
    const r = taximetro.resumen();
    expect(r.distanciaM).toBeGreaterThan(1800);
    expect(r.distanciaM).toBeLessThan(2400);
    expect(r.tiempoDetenidoS).toBeGreaterThanOrEqual(14); // al menos una parada de semáforo
  });
});
