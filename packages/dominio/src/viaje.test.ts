import { describe, expect, it } from 'vitest';
import { puedeAtender } from './categorias.js';
import {
  ESTADOS_VIAJE,
  TransicionInvalidaError,
  esEstadoFinal,
  puedeCancelar,
  puedeTransitar,
  transitar,
} from './viaje.js';

describe('máquina de estados del viaje', () => {
  it('recorre el camino feliz', () => {
    let estado = transitar('buscando_conductor', 'asignado');
    estado = transitar(estado, 'en_sitio');
    estado = transitar(estado, 'en_curso');
    estado = transitar(estado, 'finalizado');
    expect(estado).toBe('finalizado');
  });
  it('si el conductor cancela, el viaje vuelve a búsqueda', () => {
    expect(puedeTransitar('asignado', 'buscando_conductor')).toBe(true);
  });
  it('no permite saltos ni salir de un estado final', () => {
    expect(puedeTransitar('buscando_conductor', 'en_curso')).toBe(false);
    expect(() => transitar('finalizado', 'cancelado')).toThrow(TransicionInvalidaError);
  });
  it('los estados finales son finalizado, cancelado y sin_conductor', () => {
    expect(ESTADOS_VIAJE.filter(esEstadoFinal).sort()).toEqual([
      'cancelado',
      'finalizado',
      'sin_conductor',
    ]);
  });
  it('un viaje en curso solo lo cancela la operación', () => {
    expect(puedeCancelar('en_curso', 'pasajero')).toBe(false);
    expect(puedeCancelar('en_curso', 'conductor')).toBe(false);
    expect(puedeCancelar('en_curso', 'operacion')).toBe(true);
    expect(puedeCancelar('en_sitio', 'conductor')).toBe(true);
    expect(puedeCancelar('finalizado', 'operacion')).toBe(false);
  });
});

describe('puedeAtender (RN-003)', () => {
  it('atiende su categoría', () => {
    expect(puedeAtender('media', 'media', false)).toBe(true);
  });
  it('una categoría superior atiende una inferior solo si el conductor lo activó', () => {
    expect(puedeAtender('alta', 'media', false)).toBe(false);
    expect(puedeAtender('alta', 'media', true)).toBe(true);
  });
  it('nunca atiende una categoría superior', () => {
    expect(puedeAtender('media', 'alta', true)).toBe(false);
  });
});
