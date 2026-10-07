import { describe, expect, it } from 'vitest';
import { racha } from './logros.ts';

const dia = (dia: string, viajes: number) => ({ dia, viajes, bruto: 0, neto: 0 });

describe('racha de días con viajes', () => {
  it('cuenta los días seguidos hasta hoy', () => {
    expect(racha([dia('2026-10-04', 2), dia('2026-10-05', 1), dia('2026-10-06', 3)])).toBe(3);
  });
  it('hoy sin viajes todavía no rompe la racha', () => {
    expect(racha([dia('2026-10-04', 2), dia('2026-10-05', 1), dia('2026-10-06', 0)])).toBe(2);
  });
  it('un día sin viajes antes de hoy la rompe', () => {
    expect(
      racha([
        dia('2026-10-03', 4),
        dia('2026-10-04', 0),
        dia('2026-10-05', 1),
        dia('2026-10-06', 1),
      ]),
    ).toBe(2);
  });
  it('sin datos no hay racha', () => {
    expect(racha([])).toBe(0);
  });
});
