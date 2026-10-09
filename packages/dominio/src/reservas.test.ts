import { describe, expect, it } from 'vitest';
import {
  RESERVA_POR_DEFECTO,
  apareceEnTablero,
  cancelacionGratis,
  estadoDeReserva,
  finDeLaBusqueda,
  limiteConfirmacion,
  momentoAlerta,
  momentoDespacho,
  puedeSoltar,
  sePisan,
  seConfirmaAlTomar,
  validarAnticipacion,
} from './reservas.js';

const ahora = new Date('2026-10-08T14:00:00Z');
const en = (min: number) => new Date(ahora.getTime() + min * 60_000);

describe('reservas: anticipación (RN-080)', () => {
  it('pide 45 minutos como mínimo', () => {
    expect(validarAnticipacion(en(44), ahora)?.codigo).toBe('RESERVA_MUY_PRONTO');
    expect(validarAnticipacion(en(45), ahora)).toBeNull();
  });
  it('y 7 días como máximo', () => {
    expect(validarAnticipacion(en(7 * 24 * 60), ahora)).toBeNull();
    expect(validarAnticipacion(en(7 * 24 * 60 + 1), ahora)?.codigo).toBe('RESERVA_MUY_LEJOS');
  });
  it('respeta los parámetros que Operación cambie', () => {
    const p = { ...RESERVA_POR_DEFECTO, anticipacionMinMin: 120 };
    expect(validarAnticipacion(en(90), ahora, p)?.codigo).toBe('RESERVA_MUY_PRONTO');
  });
});

describe('reservas: línea de tiempo del servicio', () => {
  const servicio = en(24 * 60 + 5 * 60); // mañana, 5 h más tarde
  it('aparece en el tablero 24 h antes, se confirma hasta 60 min antes y se despacha a 30 min', () => {
    expect(servicio.getTime() - apareceEnTablero(servicio).getTime()).toBe(24 * 3_600_000);
    expect(servicio.getTime() - limiteConfirmacion(servicio).getTime()).toBe(60 * 60_000);
    expect(servicio.getTime() - momentoDespacho(servicio).getTime()).toBe(30 * 60_000);
    expect(servicio.getTime() - momentoAlerta(servicio).getTime()).toBe(15 * 60_000);
    expect(finDeLaBusqueda(servicio).getTime() - servicio.getTime()).toBe(10 * 60_000);
  });
  it('el orden tiene sentido: confirmar, luego despachar, luego avisar', () => {
    const s = en(600);
    expect(limiteConfirmacion(s) < momentoDespacho(s)).toBe(true);
    expect(momentoDespacho(s) < momentoAlerta(s)).toBe(true);
    expect(momentoAlerta(s) < s).toBe(true);
  });
});

describe('reservas: tomar, soltar y cancelar', () => {
  it('quien toma una reserva ya dentro de la última hora la confirma en ese momento', () => {
    expect(seConfirmaAlTomar(en(50), ahora)).toBe(true);
    expect(seConfirmaAlTomar(en(61), ahora)).toBe(false);
  });
  it('el conductor puede soltarla hasta 2 horas antes', () => {
    expect(puedeSoltar(en(121), ahora)).toBe(true);
    expect(puedeSoltar(en(119), ahora)).toBe(false);
  });
  it('el pasajero cancela gratis hasta 60 minutos antes (RN-084)', () => {
    expect(cancelacionGratis(en(61), ahora)).toBe(true);
    expect(cancelacionGratis(en(60), ahora)).toBe(true);
    expect(cancelacionGratis(en(59), ahora)).toBe(false);
  });
  it('dos reservas con menos de 90 minutos de diferencia se pisan', () => {
    expect(sePisan(en(100), en(150))).toBe(true);
    expect(sePisan(en(100), en(190))).toBe(false);
    expect(sePisan(en(190), en(100))).toBe(false);
  });
});

describe('reservas: estado para la operación', () => {
  const base = { reservaConductorId: null, reservaConfirmadaEn: null };
  it('distingue sin conductor, tomada y confirmada', () => {
    expect(estadoDeReserva({ estado: 'programado', ...base })).toBe('sin_conductor');
    expect(
      estadoDeReserva({ estado: 'programado', reservaConductorId: 'x', reservaConfirmadaEn: null }),
    ).toBe('tomada');
    expect(
      estadoDeReserva({
        estado: 'programado',
        reservaConductorId: 'x',
        reservaConfirmadaEn: ahora,
      }),
    ).toBe('confirmada');
  });
  it('y sigue el viaje una vez activado', () => {
    expect(estadoDeReserva({ estado: 'buscando_conductor', ...base })).toBe('buscando');
    expect(estadoDeReserva({ estado: 'asignado', ...base })).toBe('asignada');
    expect(estadoDeReserva({ estado: 'en_curso', ...base })).toBe('en_curso');
    expect(estadoDeReserva({ estado: 'finalizado', ...base })).toBe('cerrada');
  });
});
