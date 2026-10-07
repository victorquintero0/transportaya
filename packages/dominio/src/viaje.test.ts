import { describe, expect, it } from 'vitest';
import { puedeAtender, recargoDeCategoria } from './categorias.js';
import { calcularTarifaUrbana } from './tarifas.js';
import { TARIFA_TAXI_MANIZALES_2026 as TAXI } from './semilla-manizales-2026.js';
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

describe('recargo por categoría (D-22)', () => {
  it('Media no tiene recargo; Media Alta suma $1.000 y Alta $2.000', () => {
    expect(recargoDeCategoria('media', TAXI.recargoCategoria)).toBeNull();
    expect(recargoDeCategoria('media_alta', TAXI.recargoCategoria)).toEqual({
      nombre: 'categoria_media_alta',
      tipo: 'fijo',
      valor: 1000,
    });
    expect(recargoDeCategoria('alta', TAXI.recargoCategoria)?.valor).toBe(2000);
  });

  it('se refleja en el total de la carrera', () => {
    const entrada = { parametros: TAXI.parametros, distanciaM: 6000, tiempoCobrableS: 180 };
    const sin = calcularTarifaUrbana(entrada);
    const alta = recargoDeCategoria('alta', TAXI.recargoCategoria);
    const con = calcularTarifaUrbana({ ...entrada, recargos: alta ? [alta] : [] });
    expect(sin.totalRedondeado).toBe(15_000);
    expect(con.totalRedondeado).toBe(17_000);
  });
});
