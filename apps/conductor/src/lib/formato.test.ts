import { describe, expect, it } from 'vitest';
import {
  diaCorto,
  distancia,
  duracion,
  pesos,
  pesosCorto,
  porcentaje,
  primerNombre,
  reloj,
  saludo,
  telefonoLegible,
} from './formato.ts';

describe('formato', () => {
  it('pesos colombianos con punto de miles y sin decimales', () => {
    expect(pesos(12500)).toBe('$ 12.500');
    expect(pesos(1234567)).toBe('$ 1.234.567');
    expect(pesos(0)).toBe('$ 0');
    expect(pesos(16800.4)).toBe('$ 16.800');
  });
  it('pesos abreviados', () => {
    expect(pesosCorto(850)).toBe('$ 850');
    expect(pesosCorto(85_000)).toBe('$ 85 mil');
    expect(pesosCorto(1_250_000)).toBe('$ 1,3 M');
    expect(pesosCorto(-85_000)).toBe('-$ 85 mil');
  });
  it('distancias', () => {
    expect(distancia(420)).toBe('420 m');
    expect(distancia(999.6)).toBe('1,0 km');
    expect(distancia(3400)).toBe('3,4 km');
  });
  it('duraciones', () => {
    expect(duracion(40)).toBe('40 s');
    expect(duracion(725)).toBe('12 min');
    expect(duracion(4000)).toBe('1 h 07 min');
  });
  it('cronómetro', () => {
    expect(reloj(205)).toBe('03:25');
    expect(reloj(3725)).toBe('1:02:05');
    expect(reloj(-4)).toBe('00:00');
  });
  it('porcentaje, nombres y teléfono', () => {
    expect(porcentaje(0.456)).toBe('46 %');
    expect(primerNombre('  carlos andrés pérez ')).toBe('Carlos');
    expect(telefonoLegible('+573001234567')).toBe('300 123 4567');
  });
  it('días en español', () => {
    expect(diaCorto('2026-10-06')).toMatch(/mar/);
  });
  it('saludo según la hora de Bogotá', () => {
    expect(saludo(new Date('2026-10-06T14:00:00Z'))).toBe('Buenos días'); // 9 a. m.
    expect(saludo(new Date('2026-10-06T20:00:00Z'))).toBe('Buenas tardes'); // 3 p. m.
    expect(saludo(new Date('2026-10-07T02:00:00Z'))).toBe('Buenas noches'); // 9 p. m.
  });
});
