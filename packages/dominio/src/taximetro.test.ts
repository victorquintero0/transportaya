import { describe, expect, it } from 'vitest';
import { desplazar } from './geo.js';
import { Taximetro, compararMediciones, resumirTrayectoria, type PuntoGps } from './taximetro.js';

const origen = { lat: 5.0703, lng: -75.5138 };
const T0 = Date.UTC(2026, 9, 6, 15, 0, 0);

/** Recorrido recto hacia el norte a velocidad constante, con una lectura cada `cada` segundos. */
function recto(
  desdeS: number,
  hastaS: number,
  velocidadMs: number,
  cada = 4,
  extra: Partial<PuntoGps> = {},
): PuntoGps[] {
  const puntos: PuntoGps[] = [];
  for (let s = desdeS; s <= hastaS; s += cada) {
    puntos.push({ ...desplazar(origen, velocidadMs * s, 0), instanteMs: T0 + s * 1000, ...extra });
  }
  return puntos;
}

/** Vehículo quieto con el ruido normal de un GPS (unos pocos metros). */
function quieto(desdeS: number, hastaS: number, posicionM: number, cada = 2): PuntoGps[] {
  const base = desplazar(origen, posicionM, 0);
  const puntos: PuntoGps[] = [];
  let i = 0;
  for (let s = desdeS; s <= hastaS; s += cada) {
    const ruido = desplazar(base, i++ % 2 === 0 ? 1.2 : 0.4, (i * 97) % 360);
    puntos.push({ ...ruido, instanteMs: T0 + s * 1000, precisionM: 5 });
  }
  return puntos;
}

describe('Taximetro', () => {
  it('mide la distancia de un recorrido a velocidad constante (10 m/s durante 10 min)', () => {
    const r = resumirTrayectoria(recto(0, 600, 10));
    expect(r.distanciaM).toBeGreaterThan(5990);
    expect(r.distanciaM).toBeLessThan(6010);
    expect(r.duracionS).toBe(600);
    expect(r.tiempoDetenidoS).toBe(0);
    expect(r.segundosSinSenal).toBe(0);
  });

  it('cuenta el tiempo detenido en un semáforo y no suma distancia por el ruido del GPS', () => {
    const puntos = [
      ...recto(0, 200, 10),
      ...quieto(202, 262, 2000),
      ...recto(264, 400, 10).map((p, i) => ({
        ...p,
        ...desplazar(origen, 2000 + 10 * (i * 4 + 0), 0),
      })),
    ];
    const r = resumirTrayectoria(puntos);
    expect(r.tiempoDetenidoS).toBeGreaterThanOrEqual(55);
    expect(r.tiempoDetenidoS).toBeLessThanOrEqual(65);
    // 2.000 m antes del semáforo + 1.360 m después; el ruido mientras estuvo quieto no suma
    expect(r.distanciaM).toBeGreaterThan(3300);
    expect(r.distanciaM).toBeLessThan(3450);
  });

  it('una parada corta (menos de 10 s) no cuenta como tiempo detenido', () => {
    // Quieto de t=100 a t=106 (6 s) y luego arranca a 10 m/s.
    const arranque: PuntoGps[] = [108, 112, 116, 120].map((s) => ({
      ...desplazar(origen, 1000 + 10 * (s - 106), 0),
      instanteMs: T0 + s * 1000,
    }));
    const puntos = [...recto(0, 100, 10), ...quieto(102, 106, 1000), ...arranque];
    expect(resumirTrayectoria(puntos).tiempoDetenidoS).toBe(0);
  });

  it('usa la velocidad que reporta el dispositivo cuando existe', () => {
    // Posiciones que se mueven poco pero el dispositivo dice que va a 30 km/h: no está detenido.
    const puntos: PuntoGps[] = [0, 4, 8, 12, 16, 20].map((s) => ({
      ...desplazar(origen, 10 * s, 0),
      instanteMs: T0 + s * 1000,
      velocidadKmh: 36,
    }));
    expect(resumirTrayectoria(puntos).tiempoDetenidoS).toBe(0);
  });

  it('descarta lecturas imprecisas, repetidas y saltos imposibles del GPS', () => {
    const buenos = recto(0, 60, 10);
    const t = new Taximetro();
    buenos.slice(0, 5).forEach((p) => t.agregar(p));
    t.agregar({ ...desplazar(origen, 40, 90), instanteMs: T0 + 18_000, precisionM: 250 }); // imprecisa
    t.agregar(buenos[4]!); // repetida
    t.agregar({ ...desplazar(origen, 5000, 0), instanteMs: T0 + 19_000 }); // 5 km en 3 s
    buenos.slice(5).forEach((p) => t.agregar(p));
    const r = t.resumen();
    expect(r.puntosDescartados).toBe(3);
    expect(r.distanciaM).toBeGreaterThan(595);
    expect(r.distanciaM).toBeLessThan(605);
  });

  it('un tramo sin señal se estima en línea recta y se marca', () => {
    const puntos = [...recto(0, 100, 10), ...recto(220, 300, 10)]; // 120 s sin lecturas
    const r = resumirTrayectoria(puntos);
    expect(r.segundosSinSenal).toBe(120);
    expect(r.distanciaEnHuecosM).toBeGreaterThan(1150);
    expect(r.distanciaM).toBeGreaterThan(2990);
    expect(r.distanciaM).toBeLessThan(3010);
    expect(resumirTrayectoria(puntos, { factorHuecos: 1.3 }).distanciaEnHuecosM).toBeGreaterThan(
      1500,
    );
  });

  it('acepta lecturas desordenadas al resumir una trayectoria guardada', () => {
    const puntos = recto(0, 120, 10);
    expect(resumirTrayectoria([...puntos].reverse())).toEqual(resumirTrayectoria(puntos));
  });

  it('el resumen en vivo incluye la detención en curso', () => {
    const t = new Taximetro();
    [...recto(0, 100, 10), ...quieto(102, 140, 1000)].forEach((p) => t.agregar(p));
    expect(t.resumen().tiempoDetenidoS).toBeGreaterThanOrEqual(35);
  });

  it('sin lecturas todo es cero', () => {
    expect(new Taximetro().resumen()).toEqual({
      distanciaM: 0,
      duracionS: 0,
      tiempoDetenidoS: 0,
      distanciaEnHuecosM: 0,
      segundosSinSenal: 0,
      puntosUsados: 0,
      puntosDescartados: 0,
    });
  });
});

describe('compararMediciones (RN-015.3)', () => {
  it('acepta diferencias de hasta el 10 %', () => {
    expect(
      compararMediciones(
        { distanciaM: 10_000, tiempoDetenidoS: 600 },
        { distanciaM: 10_900, tiempoDetenidoS: 640 },
      ).excede,
    ).toBe(false);
  });
  it('marca diferencias de más del 10 % en distancia o en tiempo detenido', () => {
    expect(
      compararMediciones(
        { distanciaM: 10_000, tiempoDetenidoS: 600 },
        { distanciaM: 12_000, tiempoDetenidoS: 600 },
      ).excede,
    ).toBe(true);
    expect(
      compararMediciones(
        { distanciaM: 10_000, tiempoDetenidoS: 600 },
        { distanciaM: 10_000, tiempoDetenidoS: 800 },
      ).excede,
    ).toBe(true);
  });
  it('en viajes cortos una diferencia pequeña en términos absolutos no dispara alerta', () => {
    expect(
      compararMediciones(
        { distanciaM: 800, tiempoDetenidoS: 20 },
        { distanciaM: 1000, tiempoDetenidoS: 45 },
      ).excede,
    ).toBe(false);
  });
});
