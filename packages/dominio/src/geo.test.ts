import { describe, expect, it } from 'vitest';
import { desplazar, distanciaMetros, estaEnRadio, rumboGrados } from './geo.js';

const manizales = { lat: 5.0703, lng: -75.5138 };
const pereira = { lat: 4.8133, lng: -75.6961 };

describe('distanciaMetros', () => {
  it('es cero entre el mismo punto y simétrica', () => {
    expect(distanciaMetros(manizales, manizales)).toBe(0);
    expect(distanciaMetros(manizales, pereira)).toBeCloseTo(distanciaMetros(pereira, manizales), 6);
  });
  it('Manizales–Pereira en línea recta son unos 35 km', () => {
    const km = distanciaMetros(manizales, pereira) / 1000;
    expect(km).toBeGreaterThan(33);
    expect(km).toBeLessThan(37);
  });
  it('un grado de latitud son unos 111,2 km', () => {
    expect(distanciaMetros({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) / 1000).toBeCloseTo(111.19, 1);
  });
});

describe('rumboGrados', () => {
  it('norte, este, sur y oeste', () => {
    const o = { lat: 5, lng: -75 };
    expect(rumboGrados(o, { lat: 6, lng: -75 })).toBeCloseTo(0, 3);
    expect(rumboGrados(o, { lat: 5, lng: -74 })).toBeCloseTo(90, 0);
    expect(rumboGrados(o, { lat: 4, lng: -75 })).toBeCloseTo(180, 3);
    expect(rumboGrados(o, { lat: 5, lng: -76 })).toBeCloseTo(270, 0);
  });
});

describe('desplazar', () => {
  it('es la inversa de distancia y rumbo', () => {
    const destino = desplazar(manizales, 1500, 45);
    expect(distanciaMetros(manizales, destino)).toBeCloseTo(1500, 1);
    expect(rumboGrados(manizales, destino)).toBeCloseTo(45, 1);
  });
});

describe('estaEnRadio', () => {
  it('RN-040: "llegué" solo a menos de 150 m', () => {
    expect(estaEnRadio(manizales, desplazar(manizales, 149, 10), 150)).toBe(true);
    expect(estaEnRadio(manizales, desplazar(manizales, 151, 10), 150)).toBe(false);
  });
});
