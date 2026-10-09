import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoTareasService } from './estado-tareas.service.js';
import { MetricasService } from './metricas.service.js';

const bdFalsa = { pool: { totalCount: 0, idleCount: 0, waitingCount: 0 }, db: {} } as never;

describe('Registro de tareas programadas', () => {
  let metricas: MetricasService;
  let tareas: EstadoTareasService;
  beforeEach(() => {
    vi.useFakeTimers();
    metricas = new MetricasService(bdFalsa);
    tareas = new EstadoTareasService(metricas);
    tareas.registrar('t', 'Prueba', 15_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    metricas.onModuleDestroy();
  });

  it('anota las ejecuciones buenas y cuánto tardaron', async () => {
    await tareas.correr('t', async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    const [t] = tareas.estado();
    expect(t).toMatchObject({ ejecuciones: 1, fallos: 0, ultimoError: null, atrasada: false });
    expect(t!.ultimaDuracionMs).toBeGreaterThanOrEqual(40);
    expect(t!.ultimoExitoEn).not.toBeNull();
  });

  it('una tarea que falla no lanza el error: lo anota y lo cuenta', async () => {
    const r = await tareas.correr('t', async () => {
      throw new Error('se cayó la base');
    });
    expect(r).toBeUndefined();
    expect(tareas.estado()[0]).toMatchObject({
      ejecuciones: 1,
      fallos: 1,
      ultimoError: 'se cayó la base',
    });
    expect(await metricas.registro.getSingleMetricAsString('ty_tarea_ejecuciones_total')).toContain(
      'tarea="t",resultado="error"} 1',
    );
  });

  it('queda atrasada si pasa más del doble de su cadencia sin terminar bien', async () => {
    await tareas.correr('t', async () => 1);
    await vi.advanceTimersByTimeAsync(15_000 * 2 + 29_000);
    expect(tareas.estado()[0]!.atrasada).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(tareas.estado()[0]!.atrasada).toBe(true);
    await tareas.correr('t', async () => 1);
    expect(tareas.estado()[0]!.atrasada).toBe(false);
  });

  it('una tarea que nunca ha corrido también se atrasa', async () => {
    await vi.advanceTimersByTimeAsync(15_000 * 2 + 31_000);
    expect(tareas.estado()[0]!.atrasada).toBe(true);
  });
});

describe('Ventanas de métricas', () => {
  it('resume las solicitudes de los últimos minutos con sus percentiles', () => {
    const m = new MetricasService(bdFalsa);
    for (const ms of [10, 20, 30, 40, 1000]) m.solicitud('GET', '/v1/x', 200, ms);
    m.solicitud('POST', '/v1/y', 404, 5);
    m.solicitud('POST', '/v1/y', 500, 7);
    const r = m.http(15);
    expect(r).toMatchObject({ solicitudes: 7, errores4xx: 1, errores5xx: 1 });
    expect(r.p95Ms).toBe(1000);
    expect(r.p50Ms).toBe(20);
    expect(m.serie(3).at(-1)).toMatchObject({ solicitudes: 7, errores5xx: 1 });
    m.onModuleDestroy();
  });
});
