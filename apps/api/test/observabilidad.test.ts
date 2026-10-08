import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('Observabilidad (RNF-80 a 83)', () => {
  let api: Arnes;
  let supervisor: string;
  let monitor: string;
  beforeAll(async () => {
    api = await levantarApi();
    supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  it('/v1/listo dice si la instancia puede atender tráfico', async () => {
    const r = await api.get('/v1/listo');
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ estado: 'ok', baseDatos: true, tareasAtrasadas: [] });
  });

  it('cada respuesta trae un identificador de solicitud; si la app manda uno válido, se respeta', async () => {
    const sin = await fetch(`${api.url}/v1/salud`);
    expect(sin.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);

    const propio = await fetch(`${api.url}/v1/salud`, {
      headers: { 'x-request-id': 'app-pasajero-0001' },
    });
    expect(propio.headers.get('x-request-id')).toBe('app-pasajero-0001');

    const raro = await fetch(`${api.url}/v1/salud`, { headers: { 'x-request-id': 'mal hecho' } });
    expect(raro.headers.get('x-request-id')).not.toBe('mal hecho');
  });

  it('las métricas usan la plantilla de la ruta, no la dirección real', async () => {
    await api.get('/v1/viajes/00000000-0000-0000-0000-000000000001', monitor);
    await api.get('/v1/ruta-que-no-existe-xyz');
    const texto = await (await fetch(`${api.url}/v1/metricas`)).text();
    expect(texto).toContain('ty_http_solicitudes_total');
    expect(texto).toContain('ty_http_duracion_segundos_bucket');
    expect(texto).toContain('ty_bd_conexiones');
    expect(texto).not.toContain('00000000-0000-0000-0000-000000000001');
    expect(texto).not.toContain('ruta-que-no-existe-xyz');
    expect(texto).toMatch(/ruta="sin_ruta"/);
  });

  it('con METRICAS_TOKEN, las métricas piden el token', async () => {
    const protegida = await levantarApi({ METRICAS_TOKEN: 'token-de-metricas-0123456789' });
    try {
      expect((await fetch(`${protegida.url}/v1/metricas`)).status).toBe(401);
      expect(
        (
          await fetch(`${protegida.url}/v1/metricas`, {
            headers: { authorization: 'Bearer otro-token-equivocado-123' },
          })
        ).status,
      ).toBe(401);
      const ok = await fetch(`${protegida.url}/v1/metricas`, {
        headers: { authorization: 'Bearer token-de-metricas-0123456789' },
      });
      expect(ok.status).toBe(200);
    } finally {
      await protegida.cerrar();
    }
  });

  it('un error 500 devuelve el identificador de la solicitud para que soporte lo encuentre', async () => {
    // Un UUID mal formado en una ruta que consulta la base provoca un error que la API no espera.
    const r = await fetch(`${api.url}/v1/op/viajes/no-es-un-uuid`, {
      headers: { authorization: `Bearer ${supervisor}` },
    });
    if (r.status === 500) {
      const cuerpo = await r.json();
      expect(cuerpo.idSolicitud).toBe(r.headers.get('x-request-id'));
    } else {
      expect([400, 404]).toContain(r.status);
    }
  });

  it('la pantalla Sistema es solo para supervisión y administración', async () => {
    expect((await api.get('/v1/op/sistema', monitor)).estado).toBe(403);
    expect((await api.get('/v1/op/sistema')).estado).toBe(401);
    expect((await api.get('/v1/op/sistema', supervisor)).estado).toBe(200);
  });

  it('Sistema resume la salud: base, tareas, tráfico, tiempo real y negocio', async () => {
    const socket = await api.conectarSocket(supervisor);
    const r = (await api.get('/v1/op/sistema', supervisor)).cuerpo;
    expect(r).toMatchObject({
      estado: 'ok',
      problemas: [],
      entorno: 'test',
      baseDatos: { ok: true },
    });
    expect(r.baseDatos.latenciaMs).toBeGreaterThanOrEqual(0);
    expect(r.baseDatos.pool.total).toBeGreaterThan(0);
    expect(r.tareas.map((t: { nombre: string }) => t.nombre).sort()).toEqual([
      'cierre_diario',
      'reservas',
      'retencion',
      'vencimientos',
      'vigilar_senal',
    ]);
    expect(r.http.ultimos15min.solicitudes).toBeGreaterThan(0);
    expect(r.http.serie).toHaveLength(30);
    expect(r.tiempoReal.interno).toBeGreaterThanOrEqual(1);
    expect(r.negocio).toMatchObject({ viajesActivos: expect.any(Object) });
    socket.cerrar();
  });

  it('los errores de las apps se aceptan, se cuentan y tienen tope por dirección', async () => {
    const enviar = (cuerpo: unknown) =>
      fetch(`${api.url}/v1/telemetria/errores`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
    expect(
      (
        await enviar({
          app: 'pasajero',
          mensaje: 'Cannot read properties of undefined',
          ruta: '/viajes',
        })
      ).status,
    ).toBe(204);
    expect((await enviar({ app: 'otra', mensaje: 'x' })).status).toBe(400);
    expect((await enviar({ app: 'conductor', mensaje: '' })).status).toBe(400);

    const sistema = (await api.get('/v1/op/sistema', supervisor)).cuerpo;
    expect(sistema.erroresDeApps15min).toBeGreaterThanOrEqual(1);

    let limitado = false;
    for (let i = 0; i < 30 && !limitado; i++)
      limitado = (await enviar({ app: 'conductor', mensaje: `error ${i}` })).status === 429;
    expect(limitado).toBe(true);
  });
});
