import { describe, expect, it } from 'vitest';
import { normalizarTelefono } from './telefono.js';

describe('normalizarTelefono', () => {
  it.each([
    ['300 123 4567', '+573001234567'],
    ['3001234567', '+573001234567'],
    ['573001234567', '+573001234567'],
    ['+57 300-123-4567', '+573001234567'],
    ['(300) 123.4567', '+573001234567'],
    ['+14155552671', '+14155552671'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarTelefono(entrada)).toBe(esperado);
  });
  it.each(['', '123', '2001234567', 'abcdefghij', '+0123456789', '30012345678'])(
    'rechaza "%s"',
    (entrada) => {
      expect(() => normalizarTelefono(entrada)).toThrow();
    },
  );
});
