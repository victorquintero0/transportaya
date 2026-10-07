import { describe, expect, it } from 'vitest';
import { fechaCorta, fechaHora, hace, plazo, soloHora } from './fechas.ts';

describe('fechas de la App Operación', () => {
  it('muestra la hora de Bogotá (UTC-5) sin depender del idioma del navegador', () => {
    expect(fechaHora('2026-10-07T13:15:00Z')).toBe('7 oct, 08:15');
    expect(soloHora('2026-10-07T05:05:00Z')).toBe('00:05');
    // la medianoche de Bogotá son las 05:00 UTC
    expect(fechaHora('2026-10-08T05:00:00Z')).toBe('8 oct, 00:00');
  });

  it('formatea fechas sin hora', () => {
    expect(fechaCorta('2026-03-09')).toBe('9 mar 2026');
  });

  it('dice hace cuánto pasó algo', () => {
    const ahora = Date.parse('2026-10-07T12:00:00Z');
    expect(hace('2026-10-07T11:59:40Z', ahora)).toBe('hace un momento');
    expect(hace('2026-10-07T11:50:00Z', ahora)).toBe('hace 10 min');
    expect(hace('2026-10-07T09:00:00Z', ahora)).toBe('hace 3 h');
    expect(hace('2026-10-04T12:00:00Z', ahora)).toBe('hace 3 d');
  });

  it('dice cuánto falta para un plazo o hace cuánto se venció', () => {
    const ahora = Date.parse('2026-10-07T12:00:00Z');
    expect(plazo('2026-10-07T14:10:00Z', ahora)).toBe('2 h 10 min');
    expect(plazo('2026-10-07T12:20:00Z', ahora)).toBe('20 min');
    expect(plazo('2026-10-07T11:00:00Z', ahora)).toBe('vencido hace 1 h 00 min');
  });
});
