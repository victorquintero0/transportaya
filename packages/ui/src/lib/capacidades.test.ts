import { describe, expect, it } from 'vitest';
import { detectarPlataforma } from './instalacion.ts';
import { evaluarCapacidades, informeTexto } from './capacidades.ts';

const base = {
  seguro: true,
  instalada: false,
  agente: 'Mozilla/5.0',
  pantalla: '412×915 px · 2.6x',
  enLinea: true,
  serviceWorker: 'controlando' as const,
  ubicacion: 'granted' as const,
  notificaciones: 'default' as const,
  wakeLock: true,
  vibracion: true,
  sonido: true,
};

describe('detectarPlataforma', () => {
  it('reconoce iPhone, iPad con Safari de escritorio, Android y la app ya instalada', () => {
    expect(detectarPlataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', false)).toBe('ios');
    expect(detectarPlataforma('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', false, 5)).toBe(
      'ios',
    );
    expect(detectarPlataforma('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', false, 0)).toBe(
      'otra',
    );
    expect(detectarPlataforma('Mozilla/5.0 (Linux; Android 14; Pixel 7)', false)).toBe('android');
    expect(detectarPlataforma('Mozilla/5.0 (iPhone)', true)).toBe('instalada');
  });
});

describe('evaluarCapacidades', () => {
  it('con todo disponible no marca nada como faltante', () => {
    const lista = evaluarCapacidades(base);
    expect(lista.filter((c) => c.ok === false)).toEqual([]);
  });

  it('sin HTTPS avisa que faltan la ubicación segura y el service worker', () => {
    const lista = evaluarCapacidades({
      ...base,
      seguro: false,
      serviceWorker: 'no_soportado',
      wakeLock: false,
    });
    const faltan = lista.filter((c) => c.ok === false).map((c) => c.clave);
    expect(faltan).toEqual(['seguro', 'sw', 'wake']);
  });

  it('un service worker registrado pero que aún no controla pide recargar', () => {
    const sw = evaluarCapacidades({ ...base, serviceWorker: 'registrado' }).find(
      (c) => c.clave === 'sw',
    );
    expect(sw?.ok).toBe(false);
    expect(sw?.detalle).toMatch(/recarga/);
  });
});

describe('informeTexto', () => {
  it('lista cada prueba con su marca', () => {
    const t = informeTexto('Pasajero', evaluarCapacidades({ ...base, seguro: false }), new Date(0));
    expect(t.split('\n')[0]).toBe('Diagnóstico del teléfono · Pasajero · 1970-01-01T00:00:00.000Z');
    expect(t).toContain('[FALTA] Conexión segura (HTTPS)');
    expect(t).toContain('[ i ] App instalada');
  });
});
