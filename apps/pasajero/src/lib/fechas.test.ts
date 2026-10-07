import { describe, expect, it } from 'vitest';
import { fechaCorta } from './fechas.ts';

describe('fechas de los viajes', () => {
  const ahora = new Date('2026-10-07T20:00:00Z'); // 3:00 p. m. en Bogotá

  it('hoy y ayer se dicen con palabras', () => {
    expect(fechaCorta('2026-10-07T15:45:00Z', ahora)).toMatch(/^Hoy, 10:45/);
    expect(fechaCorta('2026-10-06T14:10:00Z', ahora)).toMatch(/^Ayer, 9:10/);
  });
  it('antes de ayer lleva la fecha', () => {
    expect(fechaCorta('2026-10-03T20:00:00Z', ahora)).toMatch(/^3 oct/);
  });
  it('usa la hora de Bogotá, no la del servidor: 01:00 UTC todavía es el día anterior', () => {
    expect(fechaCorta('2026-10-07T01:00:00Z', ahora)).toMatch(/^Ayer, 8:00/);
  });
});
