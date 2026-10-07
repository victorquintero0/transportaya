import { describe, expect, it } from 'vitest';
import {
  ambitoComision,
  calcularCierreDiario,
  calcularComision,
  decidirPago,
  movimientosDeViaje,
  sumarMovimientos,
} from './saldos.js';

describe('comisión (D-03, RN-060)', () => {
  it('urbano 3 % y nacional 5 %', () => {
    expect(calcularComision({ totalRedondeado: 20_000 }, 'urbano')).toBe(600);
    expect(calcularComision({ totalRedondeado: 240_000 }, 'nacional')).toBe(12_000);
  });
  it('incluye espera y cancelación', () => {
    expect(
      calcularComision(
        { totalRedondeado: 20_000, cobroEspera: 1000, tarifaCancelacion: 4000 },
        'urbano',
      ),
    ).toBe(750);
  });
  it('solo los viajes intermunicipales son nacionales', () => {
    expect(ambitoComision('intermunicipal')).toBe('nacional');
    expect(ambitoComision('inmediato')).toBe('urbano');
    expect(ambitoComision('aeropuerto')).toBe('urbano');
  });
});

describe('movimientosDeViaje (RN-061, RN-062)', () => {
  it('efectivo urbano de $20.000: −$600', () => {
    const m = movimientosDeViaje({
      metodo: 'efectivo',
      base: { totalRedondeado: 20_000 },
      ambito: 'urbano',
    });
    expect(m).toEqual([{ tipo: 'comision_viaje_efectivo', monto: -600 }]);
  });
  it('tarjeta urbana de $20.000: +$19.400', () => {
    const m = movimientosDeViaje({
      metodo: 'electronico',
      base: { totalRedondeado: 20_000 },
      ambito: 'urbano',
    });
    expect(m).toEqual([{ tipo: 'ingreso_viaje_electronico', monto: 19_400 }]);
  });
  it('efectivo nacional de $240.000: −$12.000', () => {
    const m = movimientosDeViaje({
      metodo: 'efectivo',
      base: { totalRedondeado: 240_000 },
      ambito: 'nacional',
    });
    expect(sumarMovimientos(m)).toBe(-12_000);
  });
  it('electrónico acredita peajes y propina completos, sin comisión', () => {
    const m = movimientosDeViaje({
      metodo: 'electronico',
      base: { totalRedondeado: 20_000 },
      ambito: 'urbano',
      peajes: 9400,
      propina: 2000,
      viajeId: 'v1',
    });
    expect(m.map((x) => x.tipo)).toEqual(['ingreso_viaje_electronico', 'peaje', 'propina']);
    expect(sumarMovimientos(m)).toBe(19_400 + 9400 + 2000);
    expect(m.every((x) => x.viajeId === 'v1')).toBe(true);
  });
});

describe('cierre diario (RN-063)', () => {
  it('cruce neto: ingresos electrónicos contra comisiones de efectivo', () => {
    const cierre = calcularCierreDiario([
      { tipo: 'ingreso_viaje_electronico', monto: 19_400 },
      { tipo: 'comision_viaje_efectivo', monto: -600 },
    ]);
    expect(cierre).toEqual({ neto: 18_800, resultado: 'a_favor', deuda: 0, bloqueado: false });
  });
  it('con deuda, el conductor queda bloqueado y debe el valor neto', () => {
    const cierre = calcularCierreDiario([
      { tipo: 'comision_viaje_efectivo', monto: -600 },
      { tipo: 'comision_viaje_efectivo', monto: -12_000 },
    ]);
    expect(cierre).toMatchObject({
      neto: -12_600,
      resultado: 'a_cargo',
      deuda: 12_600,
      bloqueado: true,
    });
  });
  it('pagar la comisión lo habilita', () => {
    const cierre = calcularCierreDiario([{ tipo: 'pago_comision', monto: 12_600 }], -12_600);
    expect(cierre).toMatchObject({ neto: 0, resultado: 'en_cero', bloqueado: false });
  });
  it('arrastra el saldo de días anteriores', () => {
    const cierre = calcularCierreDiario([{ tipo: 'comision_viaje_efectivo', monto: -600 }], -1000);
    expect(cierre.deuda).toBe(1600);
  });
});

describe('decidirPago (RN-070, RN-074)', () => {
  it('paga si el saldo a favor alcanza el mínimo, acumula si no', () => {
    expect(decidirPago(calcularCierreDiario([{ tipo: 'ajuste', monto: 20_000 }]))).toBe('pagar');
    expect(decidirPago(calcularCierreDiario([{ tipo: 'ajuste', monto: 19_999 }]))).toBe('acumular');
  });
  it('cobra si hay deuda y no hace nada en cero', () => {
    expect(decidirPago(calcularCierreDiario([{ tipo: 'ajuste', monto: -1 }]))).toBe('cobrar');
    expect(decidirPago(calcularCierreDiario([]))).toBe('nada');
  });
});
