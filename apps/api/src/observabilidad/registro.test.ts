import { describe, expect, it } from 'vitest';
import { contexto, idValido } from './contexto.js';
import { RegistroApp } from './registro.js';

function capturar(formato: 'json' | 'texto', nivel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
  const lineas: string[] = [];
  return { lineas, registro: new RegistroApp(formato, nivel, (l) => lineas.push(l)) };
}

describe('Registro de la API (RNF-80)', () => {
  it('escribe una línea JSON por evento, con el contexto de Nest y el identificador de la solicitud', () => {
    const { lineas, registro } = capturar('json');
    contexto.run({ id: 'abc12345-solicitud' }, () => registro.log('Hola', 'Prueba'));
    const l = JSON.parse(lineas[0]!);
    expect(l).toMatchObject({
      nivel: 'info',
      contexto: 'Prueba',
      req: 'abc12345-solicitud',
      msg: 'Hola',
    });
    expect(Date.parse(l.t)).not.toBeNaN();
  });

  it('un objeto se vuelve campos de la línea, sin perder el mensaje', () => {
    const { lineas, registro } = capturar('json');
    registro.warn({ evento: 'solicitud', msg: 'GET /v1/x 404', estado: 404, ms: 3 }, 'Http');
    expect(JSON.parse(lineas[0]!)).toMatchObject({
      nivel: 'warn',
      evento: 'solicitud',
      estado: 404,
      msg: 'GET /v1/x 404',
    });
  });

  it('los errores llevan la pila, y fuera de una solicitud no hay identificador', () => {
    const { lineas, registro } = capturar('json');
    registro.error('Falló algo', 'Línea 1\n  en f()', 'Errores');
    const l = JSON.parse(lineas[0]!);
    expect(l).toMatchObject({ nivel: 'error', contexto: 'Errores', pila: 'Línea 1\n  en f()' });
    expect(l.req).toBeUndefined();
  });

  it('respeta el nivel configurado', () => {
    const { lineas, registro } = capturar('json', 'warn');
    registro.log('no sale');
    registro.debug('tampoco');
    registro.warn('sí sale');
    expect(lineas).toHaveLength(1);
  });

  it('en desarrollo imprime texto legible', () => {
    const { lineas, registro } = capturar('texto');
    contexto.run({ id: '12345678-aaaa' }, () => registro.log('Listo', 'Api'));
    expect(lineas[0]).toMatch(/INFO {2}\[Api\] \(12345678\) Listo/);
  });

  it('solo acepta identificadores de solicitud cortos y sin caracteres raros', () => {
    expect(idValido('2f1c9a0e-6b1d-4f5e-9c7a-0a1b2c3d4e5f')).toBe(true);
    expect(idValido('corto')).toBe(false);
    expect(idValido('con espacios y \n saltos')).toBe(false);
    expect(idValido('x'.repeat(100))).toBe(false);
    expect(idValido(undefined)).toBe(false);
  });
});
