import { BadRequestException } from '@nestjs/common';
import { TARIFA_TAXI_MANIZALES_2026 } from '@transportaya/dominio';
import { describe, expect, it } from 'vitest';
import { leerConfiguracion } from './config.js';
import { SaludController } from './salud.controller.js';
import { TarifasController } from './tarifas.controller.js';

describe('SaludController', () => {
  it('responde ok', () => {
    expect(new SaludController({ SIMULADOR: true }).estado()).toMatchObject({
      estado: 'ok',
      servicio: 'transportaya-api',
    });
  });
});

describe('TarifasController.simular', () => {
  const controlador = new TarifasController();
  const valido = {
    parametros: { base: 2500, valorKm: 1100, valorMinuto: 250, minima: 6000 },
    distanciaM: 6000,
    tiempoCobrableS: 1080,
    multiplicadorDinamico: 1.2,
    recargos: [{ nombre: 'nocturno', tipo: 'fijo', valor: 1000 }],
  };

  it('usa la lógica compartida del dominio', () => {
    expect(controlador.simular(valido).total).toBe(17_300);
  });
  it('calcula la tarifa de taxi de Manizales 2026 con sus recargos', () => {
    const { parametros, recargos } = TARIFA_TAXI_MANIZALES_2026;
    const r = controlador.simular({
      parametros,
      distanciaM: 6000,
      tiempoCobrableS: 180,
      recargos: [
        { nombre: 'nocturno', tipo: 'fijo', valor: recargos.horario },
        { nombre: 'puerta_a_puerta', tipo: 'fijo', valor: recargos.puertaAPuerta },
      ],
    });
    expect(r.total).toBe(16_800);
  });
  it('rechaza solicitudes inválidas con un código estable', () => {
    expect(() => controlador.simular({ ...valido, multiplicadorDinamico: 0.5 })).toThrow(
      BadRequestException,
    );
    expect(() => controlador.simular({})).toThrow(BadRequestException);
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
