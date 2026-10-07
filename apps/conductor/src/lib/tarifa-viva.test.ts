import { describe, expect, it } from 'vitest';
import { cobroDeEspera, tarifaEnVivo } from './tarifa-viva.ts';
import type { ViajeActual } from './tipos.ts';

const tarifa: NonNullable<ViajeActual['tarifa']> = {
  base: 3700,
  valorKm: 1784,
  valorMinuto: 223,
  minima: 6300,
  esperaMinutosGratis: 3,
  esperaMinuto: 250,
  multiplicadorDinamico: 1,
  recargos: [],
};
const tiempos = {
  solicitadoEn: '2026-10-06T15:00:00Z',
  aceptadoEn: null,
  enSitioEn: null,
  iniciadoEn: null,
};

describe('taxímetro en vivo', () => {
  it('al empezar cobra la tarifa mínima', () => {
    const r = tarifaEnVivo(
      { tarifa, rutaFija: null, tiempos },
      { distanciaM: 0, tiempoDetenidoS: 0 },
    );
    expect(r.total).toBe(6300);
    expect(r.fija).toBe(false);
  });

  it('suma distancia y tiempo detenido con la misma fórmula del servidor, aproximada a la centena', () => {
    // 3.700 + 5 km × 1.784 + 4 min × 223 = 3.700 + 8.920 + 892 = 13.512 → 13.500
    const r = tarifaEnVivo(
      { tarifa, rutaFija: null, tiempos },
      { distanciaM: 5000, tiempoDetenidoS: 240 },
    );
    expect(r.total).toBe(13_500);
  });

  it('aplica recargos fijos y la dinámica congelada', () => {
    const conRecargo = {
      ...tarifa,
      recargos: [{ nombre: 'Categoría Media Alta', tipo: 'fijo' as const, valor: 1000 }],
    };
    const r = tarifaEnVivo(
      { tarifa: conRecargo, rutaFija: null, tiempos },
      { distanciaM: 5000, tiempoDetenidoS: 0 },
    );
    // subtotal 3.700 + 8.920 = 12.620; + 1.000 = 13.620 → 13.600
    expect(r.total).toBe(13_600);
  });

  it('una ruta fija no depende de la medición', () => {
    const r = tarifaEnVivo(
      {
        tarifa: null,
        rutaFija: { destino: 'Pereira', modalidad: 'directo', tarifa: 240_000 },
        tiempos,
      },
      { distanciaM: 99, tiempoDetenidoS: 99 },
    );
    expect(r).toMatchObject({ total: 240_000, fija: true });
  });

  it('sin tarifa no cobra nada', () => {
    expect(
      tarifaEnVivo(
        { tarifa: null, rutaFija: null, tiempos },
        { distanciaM: 1000, tiempoDetenidoS: 0 },
      ).total,
    ).toBe(0);
  });
});

describe('cobro de la espera', () => {
  it('no cobra dentro de los minutos gratis', () => {
    expect(
      cobroDeEspera({
        tarifa,
        tiempos: {
          ...tiempos,
          enSitioEn: '2026-10-06T15:10:00Z',
          iniciadoEn: '2026-10-06T15:12:30Z',
        },
      }),
    ).toBe(0);
  });
  it('cobra cada minuto o fracción después de los gratis', () => {
    // 5 min 10 s en sitio: 2 min 10 s sobre los 3 gratis → 3 minutos × 250
    expect(
      cobroDeEspera({
        tarifa,
        tiempos: {
          ...tiempos,
          enSitioEn: '2026-10-06T15:10:00Z',
          iniciadoEn: '2026-10-06T15:15:10Z',
        },
      }),
    ).toBe(750);
  });
  it('sin inicio todavía no hay cobro', () => {
    expect(
      cobroDeEspera({ tarifa, tiempos: { ...tiempos, enSitioEn: '2026-10-06T15:10:00Z' } }),
    ).toBe(0);
  });
});
