import { describe, expect, it } from 'vitest';
import { resumirCobertura } from './cobertura.ts';

const SEG = 1000;

describe('resumirCobertura', () => {
  it('sin pérdidas cuando llega una ubicación por intervalo', () => {
    const marcas = Array.from({ length: 10 }, (_, i) => i * 4 * SEG + 500);
    expect(resumirCobertura(marcas, 4 * SEG, 0, 40 * SEG)).toEqual({
      intervalos: 10,
      cubiertos: 10,
      perdida: 0,
      mayorHuecoMs: 0,
      aceptable: true,
    });
  });

  it('varias ubicaciones en el mismo intervalo cuentan una sola vez', () => {
    const r = resumirCobertura([100, 200, 300, 4100], 4 * SEG, 0, 8 * SEG);
    expect(r.cubiertos).toBe(2);
    expect(r.perdida).toBe(0);
  });

  it('detecta el hueco más largo, como al apagar la pantalla', () => {
    const marcas = [500, 4500, 8500, /* hueco de 5 intervalos */ 32_500, 36_500];
    const r = resumirCobertura(marcas, 4 * SEG, 0, 40 * SEG);
    expect(r.intervalos).toBe(10);
    expect(r.cubiertos).toBe(5);
    expect(r.mayorHuecoMs).toBe(5 * 4 * SEG);
    expect(r.perdida).toBe(0.5);
    expect(r.aceptable).toBe(false);
  });

  it('acepta hasta el 5 % de pérdida', () => {
    const marcas = Array.from({ length: 20 }, (_, i) => i * 4 * SEG + 1).filter((_, i) => i !== 7);
    const r = resumirCobertura(marcas, 4 * SEG, 0, 80 * SEG);
    expect(r.perdida).toBe(0.05);
    expect(r.aceptable).toBe(true);
  });

  it('ignora marcas fuera del periodo y periodos más cortos que un intervalo', () => {
    expect(resumirCobertura([-5, 99_999], 4 * SEG, 0, 8 * SEG).cubiertos).toBe(0);
    expect(resumirCobertura([], 4 * SEG, 0, 1000).intervalos).toBe(0);
  });

  it('rechaza intervalos no positivos', () => {
    expect(() => resumirCobertura([], 0, 0, 10)).toThrow(RangeError);
  });
});
