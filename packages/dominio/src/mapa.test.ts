import { describe, expect, it } from 'vitest';
import { PRESETS_MAPA, ponerClave, urlEstiloValida } from './mapa.js';

describe('configuración del mapa', () => {
  it('acepta HTTPS y HTTP solo en la propia máquina', () => {
    expect(urlEstiloValida('https://tiles.openfreemap.org/styles/positron')).toBe(true);
    expect(urlEstiloValida('https://api.maptiler.com/maps/streets-v2/style.json?key={clave}')).toBe(
      true,
    );
    expect(urlEstiloValida('http://localhost:8080/style.json')).toBe(true);
    expect(urlEstiloValida('http://ejemplo.com/style.json')).toBe(false);
    expect(urlEstiloValida('javascript:alert(1)')).toBe(false);
    expect(urlEstiloValida('no es una dirección')).toBe(false);
  });

  it('pone la clave codificada donde va {clave}', () => {
    expect(ponerClave('https://x.co/s.json?key={clave}', 'a b&c')).toBe(
      'https://x.co/s.json?key=a%20b%26c',
    );
    expect(ponerClave(null, 'k')).toBeNull();
    expect(ponerClave('https://x.co/s.json', null)).toBe('https://x.co/s.json');
  });

  it('todos los presets con dirección son válidos', () => {
    for (const p of Object.values(PRESETS_MAPA)) {
      if (p.estilo) expect(urlEstiloValida(p.estilo)).toBe(true);
      if (p.estiloOscuro) expect(urlEstiloValida(p.estiloOscuro)).toBe(true);
    }
  });
});
