import { describe, expect, it } from 'vitest';
import { leerConfiguracion } from './config.js';
import { SaludController } from './salud.controller.js';

describe('SaludController', () => {
  it('responde ok', () => {
    expect(new SaludController({ SIMULADOR: true }).estado()).toMatchObject({
      estado: 'ok',
      servicio: 'transportaya-api',
    });
  });
});

describe('leerConfiguracion', () => {
  it('aplica valores por defecto de desarrollo, con el simulador activo', () => {
    const c = leerConfiguracion({});
    expect(c).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      SIMULADOR: true,
      OTP_PROVEEDOR: 'simulador',
    });
    expect(c.CORS_ORIGENES).toHaveLength(3);
  });
  it('falla con valores inválidos', () => {
    expect(() => leerConfiguracion({ PORT: 'abc' })).toThrow();
  });
  it('en producción exige base y secreto, y prohíbe el simulador', () => {
    expect(() => leerConfiguracion({ NODE_ENV: 'production' })).toThrow(
      /DATABASE_URL|JWT_SECRET|OTP_PROVEEDOR/,
    );
    const bien = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@h/db',
      JWT_SECRET: 'x'.repeat(32),
    };
    // El proveedor simulado no puede usarse en producción: debe fallar hasta que exista el real.
    expect(() => leerConfiguracion(bien)).toThrow(/simulador/);
    expect(() => leerConfiguracion({ ...bien, SIMULADOR: 'true' })).toThrow(/SIMULADOR/);
  });
});
