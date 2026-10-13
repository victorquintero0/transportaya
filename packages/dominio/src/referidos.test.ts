import { describe, expect, it } from 'vitest';
import {
  REGLAS_REFERIDOS_POR_DEFECTO as R,
  abonoConPuntos,
  decidirOtorgamiento,
  descuentoConPuntos,
  esCodigoValido,
  generarCodigo,
  liquidarPuntosDeViaje,
  normalizarCodigo,
  puntosDeReferido,
  validarAplicarCodigo,
} from './referidos.js';
import { movimientosDeViaje } from './saldos.js';

describe('códigos de referido', () => {
  it('se normalizan: mayúsculas, sin tildes ni espacios', () => {
    expect(normalizarCodigo(' ana-7k3q ')).toBe('ANA-7K3Q');
    expect(normalizarCodigo('Ána 7k3q')).toBe('ANA7K3Q');
    expect(normalizarCodigo('ana–7k3q')).toBe('ANA-7K3Q');
  });

  it('se generan con el nombre y caracteres que no se confunden', () => {
    const fijo = (...v: number[]) => {
      let i = 0;
      return () => v[i++ % v.length]!;
    };
    expect(generarCodigo('Valentina Ríos', fijo(0, 0.5, 0.99, 0.2))).toMatch(
      /^VALE-[2-9A-HJ-NP-Z]{4}$/,
    );
    expect(esCodigoValido(generarCodigo('Valentina Ríos', Math.random))).toBe(true);
    // un nombre sin letras suficientes usa el prefijo de la marca
    expect(generarCodigo('3', Math.random)).toMatch(/^TY-/);
    expect(generarCodigo('Al', Math.random)).toMatch(/^AL-/);
    // nunca salen 0, 1, I u O
    for (let i = 0; i < 300; i++)
      expect(generarCodigo('Ana', Math.random).slice(4)).not.toMatch(/[01IO]/);
  });

  it('reconoce los códigos bien formados', () => {
    expect(esCodigoValido('ANA-7K3Q')).toBe(true);
    expect(esCodigoValido('ANA-7K30')).toBe(false);
    expect(esCodigoValido('A-7K3Q')).toBe(false);
    expect(esCodigoValido('ana-7k3q')).toBe(false);
  });
});

describe('usar un código (RN-121)', () => {
  const ok = {
    reglas: R,
    codigoExiste: true,
    esPropio: false,
    yaInvitado: false,
    edadCuentaDias: 1,
    viajesTerminados: 0,
  };
  it('lo acepta una persona nueva que aún no ha viajado', () => {
    expect(validarAplicarCodigo(ok)).toEqual({ ok: true });
  });
  it.each([
    [{ reglas: { ...R, activo: false } }, 'REFERIDOS_INACTIVOS'],
    [{ codigoExiste: false }, 'CODIGO_NO_EXISTE'],
    [{ esPropio: true }, 'CODIGO_PROPIO'],
    [{ yaInvitado: true }, 'YA_INVITADO'],
    [{ viajesTerminados: 1 }, 'YA_VIAJO'],
    [{ edadCuentaDias: 8 }, 'FUERA_DE_VENTANA'],
  ])('lo rechaza: %j', (cambio, codigo) => {
    expect(validarAplicarCodigo({ ...ok, ...cambio })).toMatchObject({ ok: false, codigo });
  });
  it('en el último día de la ventana todavía sirve', () => {
    expect(validarAplicarCodigo({ ...ok, edadCuentaDias: 7 })).toEqual({ ok: true });
  });
});

describe('cuándo se entregan los puntos (RN-123)', () => {
  const base = {
    reglas: R,
    rolInvitado: 'pasajero' as const,
    precioFinal: 12_000,
    otorgadosEnElMes: 0,
  };
  it('con el primer viaje que llega al mínimo', () => {
    expect(decidirOtorgamiento(base)).toEqual({
      accion: 'otorgar',
      referidor: 500,
      invitado: 300,
      topeAlcanzado: false,
    });
  });
  it('un viaje demasiado barato no cuenta y se espera al siguiente', () => {
    expect(decidirOtorgamiento({ ...base, precioFinal: 4_900 })).toEqual({
      accion: 'esperar',
      motivo: 'VIAJE_MUY_BARATO',
    });
    expect(decidirOtorgamiento({ ...base, precioFinal: 5_000 }).accion).toBe('otorgar');
  });
  it('si el referidor fue la otra parte del viaje no se entrega nada', () => {
    expect(decidirOtorgamiento({ ...base, viajeConElReferidor: true })).toEqual({
      accion: 'rechazar',
      motivo: 'VIAJE_CON_EL_REFERIDOR',
    });
    expect(decidirOtorgamiento({ ...base, viajeConElReferidor: false }).accion).toBe('otorgar');
  });
  it('invitar a un conductor paga más al referidor', () => {
    expect(puntosDeReferido(R, 'conductor')).toEqual({ referidor: 1500, invitado: 300 });
    expect(decidirOtorgamiento({ ...base, rolInvitado: 'conductor' })).toMatchObject({
      referidor: 1500,
    });
  });
  it('con el tope del mes alcanzado, el referidor no recibe pero el invitado sí', () => {
    expect(decidirOtorgamiento({ ...base, otorgadosEnElMes: 20 })).toEqual({
      accion: 'otorgar',
      referidor: 0,
      invitado: 300,
      topeAlcanzado: true,
    });
    expect(decidirOtorgamiento({ ...base, otorgadosEnElMes: 19 })).toMatchObject({
      referidor: 500,
    });
  });
});

describe('descuento con puntos (RN-125, RN-126)', () => {
  it('llega al tope del 30 % del viaje o al saldo, lo que sea menor', () => {
    // viaje de $20.000: tope $6.000 = 600 puntos
    expect(descuentoConPuntos({ saldo: 5_000, precio: 20_000, reglas: R })).toEqual({
      puntos: 600,
      descuento: 6_000,
    });
    expect(descuentoConPuntos({ saldo: 250, precio: 20_000, reglas: R })).toEqual({
      puntos: 250,
      descuento: 2_500,
    });
  });
  it('no descuenta sin saldo, sin precio o con el programa apagado', () => {
    const cero = { puntos: 0, descuento: 0 };
    expect(descuentoConPuntos({ saldo: 0, precio: 20_000, reglas: R })).toEqual(cero);
    expect(descuentoConPuntos({ saldo: 100, precio: 0, reglas: R })).toEqual(cero);
    expect(
      descuentoConPuntos({ saldo: 100, precio: 20_000, reglas: { ...R, activo: false } }),
    ).toEqual(cero);
  });
  it('solo usa puntos enteros: nunca regala pesos de más', () => {
    // 30 % de $9.999 = $2.999 → 299 puntos = $2.990
    expect(descuentoConPuntos({ saldo: 1_000, precio: 9_999, reglas: R })).toEqual({
      puntos: 299,
      descuento: 2_990,
    });
  });
  it('al terminar, si el viaje salió más barato se devuelven los puntos que sobran', () => {
    // se separaron 600 puntos pensando en $20.000; el viaje final fue de $10.000 (tope 300 puntos)
    expect(liquidarPuntosDeViaje({ separados: 600, precioFinal: 10_000, reglas: R })).toEqual({
      usados: 300,
      devueltos: 300,
      descuento: 3_000,
    });
    // si salió igual o más caro se usan todos
    expect(liquidarPuntosDeViaje({ separados: 600, precioFinal: 25_000, reglas: R })).toEqual({
      usados: 600,
      devueltos: 0,
      descuento: 6_000,
    });
  });
});

describe('abono a la comisión (RN-128)', () => {
  it('abona hasta la deuda y no más', () => {
    expect(abonoConPuntos({ saldoPuntos: 5_000, deuda: 12_000, reglas: R })).toEqual({
      ok: true,
      puntos: 1_200,
      monto: 12_000,
    });
  });
  it('con menos puntos que la deuda, abona todos los que tiene', () => {
    expect(abonoConPuntos({ saldoPuntos: 800, deuda: 12_000, reglas: R })).toEqual({
      ok: true,
      puntos: 800,
      monto: 8_000,
    });
  });
  it('una deuda que no es múltiplo del valor del punto se salda sin pasarse', () => {
    expect(abonoConPuntos({ saldoPuntos: 5_000, deuda: 1_234, reglas: R })).toEqual({
      ok: true,
      puntos: 124,
      monto: 1_234,
    });
  });
  it('pide un mínimo salvo que con eso se salde toda la deuda', () => {
    expect(abonoConPuntos({ saldoPuntos: 400, deuda: 12_000, reglas: R })).toMatchObject({
      ok: false,
      codigo: 'MINIMO_ABONO',
    });
    expect(abonoConPuntos({ saldoPuntos: 400, deuda: 3_000, reglas: R })).toMatchObject({
      ok: true,
      puntos: 300,
    });
  });
  it('permite abonar menos de lo máximo', () => {
    expect(
      abonoConPuntos({ saldoPuntos: 5_000, deuda: 12_000, reglas: R, puntosPedidos: 600 }),
    ).toEqual({
      ok: true,
      puntos: 600,
      monto: 6_000,
    });
  });
  it('sin deuda o sin puntos no hay abono', () => {
    expect(abonoConPuntos({ saldoPuntos: 500, deuda: 0, reglas: R })).toMatchObject({
      codigo: 'SIN_DEUDA',
    });
    expect(abonoConPuntos({ saldoPuntos: 0, deuda: 5_000, reglas: R })).toMatchObject({
      codigo: 'SIN_PUNTOS',
    });
  });
});

describe('el libro del conductor con un descuento por puntos (RN-127)', () => {
  const base = { base: { totalRedondeado: 20_000 }, ambito: 'urbano' as const };
  it('en efectivo, TransporteYa le acredita lo que el pasajero descontó', () => {
    expect(movimientosDeViaje({ ...base, metodo: 'efectivo', descuentoPuntos: 3_000 })).toEqual([
      { tipo: 'comision_viaje_efectivo', monto: -600 },
      { tipo: 'descuento_puntos', monto: 3_000 },
    ]);
  });
  it('con tarjeta no cambia nada: ya cobra el viaje completo', () => {
    expect(movimientosDeViaje({ ...base, metodo: 'electronico', descuentoPuntos: 3_000 })).toEqual([
      { tipo: 'ingreso_viaje_electronico', monto: 19_400 },
    ]);
  });
  it('sin descuento es igual que antes', () => {
    expect(movimientosDeViaje({ ...base, metodo: 'efectivo' })).toEqual([
      { tipo: 'comision_viaje_efectivo', monto: -600 },
    ]);
  });
});
