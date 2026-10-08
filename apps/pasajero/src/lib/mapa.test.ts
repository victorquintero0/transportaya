import { describe, expect, it } from 'vitest';
import { crearProyeccion, trazoCurvo } from './mapa.ts';

describe('proyección del mapa esquemático', () => {
  it('el norte queda arriba y el oriente a la derecha', () => {
    const p = crearProyeccion(
      [
        { lat: 5.0, lng: -75.5 },
        { lat: 5.01, lng: -75.49 },
      ],
      400,
      400,
    );
    const sur = { lat: 5.0, lng: -75.5 };
    const norte = { lat: 5.01, lng: -75.5 };
    const este = { lat: 5.0, lng: -75.49 };
    expect(p.y(norte)).toBeLessThan(p.y(sur));
    expect(p.x(este)).toBeGreaterThan(p.x(sur));
  });

  it('todos los puntos caben dentro del margen', () => {
    const puntos = [
      { lat: 5.05, lng: -75.52 },
      { lat: 5.08, lng: -75.49 },
      { lat: 5.06, lng: -75.5 },
    ];
    const p = crearProyeccion(puntos, 400, 300, 40);
    for (const pt of puntos) {
      expect(p.x(pt)).toBeGreaterThanOrEqual(39.9);
      expect(p.x(pt)).toBeLessThanOrEqual(360.1);
      expect(p.y(pt)).toBeGreaterThanOrEqual(39.9);
      expect(p.y(pt)).toBeLessThanOrEqual(260.1);
    }
  });

  it('un solo punto, o puntos casi iguales, no se acercan al infinito', () => {
    const p = crearProyeccion([{ lat: 5.0689, lng: -75.5174 }], 400, 400);
    expect(p.metrosPorPixel).toBeGreaterThan(0.5);
    expect(p.x({ lat: 5.0689, lng: -75.5174 })).toBeCloseTo(200, 5);
  });

  it('mantiene la proporción real: un grado de longitud mide menos que uno de latitud', () => {
    const p = crearProyeccion(
      [
        { lat: 5, lng: -75 },
        { lat: 5.02, lng: -74.98 },
      ],
      400,
      400,
    );
    const anchoLng = p.x({ lat: 5, lng: -74.98 }) - p.x({ lat: 5, lng: -75 });
    const altoLat = p.y({ lat: 5, lng: -75 }) - p.y({ lat: 5.02, lng: -75 });
    expect(anchoLng / altoLat).toBeCloseTo(Math.cos((5.01 * Math.PI) / 180), 2);
  });

  it('el trazo es una curva entre los dos extremos', () => {
    expect(trazoCurvo(0, 0, 100, 0)).toMatch(/^M 0\.0 0\.0 Q [\d.-]+ [\d.-]+ 100\.0 0\.0$/);
  });
});

describe('proyección inversa', () => {
  it('invertir devuelve la coordenada de la que se partió', () => {
    const puntos = [
      { lat: 5.0, lng: -75.5 },
      { lat: 5.01, lng: -75.49 },
    ];
    const p = crearProyeccion(puntos, 400, 300, 40, 200);
    for (const punto of puntos) {
      const q = p.invertir(p.x(punto), p.y(punto));
      expect(q.lat).toBeCloseTo(punto.lat, 6);
      expect(q.lng).toBeCloseTo(punto.lng, 6);
    }
  });
});
