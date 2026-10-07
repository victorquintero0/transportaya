import { describe, expect, it } from 'vitest';
import { recargoHorario } from './recargos.js';

// Fechas en hora de Bogotá (UTC−5). 2026-10-05 es lunes; 2026-10-04, domingo.
const bogota = (iso: string) => new Date(`${iso}-05:00`);

describe('recargoHorario (Decreto 0641)', () => {
  it('no hay recargo de día entre semana', () => {
    expect(recargoHorario(bogota('2026-10-05T10:00:00'), false)).toBeNull();
  });
  it('es nocturno desde las 7 p. m. hasta antes de las 6 a. m.', () => {
    expect(recargoHorario(bogota('2026-10-05T18:59:00'), false)).toBeNull();
    expect(recargoHorario(bogota('2026-10-05T19:00:00'), false)).toBe('nocturno');
    expect(recargoHorario(bogota('2026-10-06T05:59:00'), false)).toBe('nocturno');
    expect(recargoHorario(bogota('2026-10-06T06:00:00'), false)).toBeNull();
  });
  it('domingos y festivos de día pagan el recargo dominical o festivo', () => {
    expect(recargoHorario(bogota('2026-10-04T10:00:00'), false)).toBe('dominical_festivo');
    expect(recargoHorario(bogota('2026-10-05T10:00:00'), true)).toBe('dominical_festivo');
  });
  it('son excluyentes: de noche en domingo o festivo solo se cobra el nocturno', () => {
    expect(recargoHorario(bogota('2026-10-04T21:00:00'), false)).toBe('nocturno');
    expect(recargoHorario(bogota('2026-10-05T21:00:00'), true)).toBe('nocturno');
  });
  it('interpreta la hora en America/Bogota y no en UTC', () => {
    // 2026-10-05T23:30 UTC = 18:30 en Bogotá: todavía no es nocturno
    expect(recargoHorario(new Date('2026-10-05T23:30:00Z'), false)).toBeNull();
    expect(recargoHorario(new Date('2026-10-06T00:00:00Z'), false)).toBe('nocturno');
  });
});
