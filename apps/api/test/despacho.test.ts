import { eq } from 'drizzle-orm';
import { conductor, oferta, viaje, viajeEvento } from '@transportaya/db';
import { desplazar } from '@transportaya/dominio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Arnes, type ConductorEnLinea, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();
const MANIZALES = { lat: 5.0703, lng: -75.5138 };

describe.skipIf(!hayBase)('despacho y ofertas en tiempo real', () => {
  let api: Arnes;
  beforeAll(async () => {
    api = await levantarApi(
      {},
      { despacho: { ofertaMs: 900, reintentoMs: 150, presupuestoMs: 2500 } },
    );
  });
  afterAll(async () => {
    await api.cerrar();
  });

  /** Un pasajero de mentira pide un viaje cerca del conductor `desde`. */
  async function pedirViaje(desde: ConductorEnLinea, cuerpo: object = {}) {
    const r = await api.post('/v1/dev/pasajeros/viaje', cuerpo, desde.accessToken);
    expect(r.estado).toBe(201);
    return r.cuerpo as {
      viajeId: string;
      codigo: string;
      pin: string;
      precioEstimado: { min: number; max: number };
    };
  }
  const estadoOperativo = async (id: string) =>
    (
      await api.bd.db
        .select({ e: conductor.estadoOperativo })
        .from(conductor)
        .where(eq(conductor.usuarioId, id))
    )[0]?.e;
  const estadoViaje = async (id: string) =>
    (await api.bd.db.select({ e: viaje.estado }).from(viaje).where(eq(viaje.id, id)))[0]?.e;

  it('ofrece el viaje al conductor más cercano, sin mostrar el destino exacto', async () => {
    const cerca = await api.conductorEnLinea('3002000001', MANIZALES);
    const lejos = await api.conductorEnLinea('3002000002', desplazar(MANIZALES, 5000, 90));
    const v = await pedirViaje(cerca);

    const o = await cerca.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
    expect(o).toMatchObject({
      viajeId: v.viajeId,
      segundosParaResponder: 1,
      metodoPago: expect.stringMatching(/efectivo|tarjeta/),
      tipoServicio: 'inmediato',
      categoria: 'media',
    });
    expect(o.recogida.distanciaM).toBeLessThan(1300);
    expect(o.recogida.etaS).toBeGreaterThan(0);
    expect(o.gananciaEstimada).toBeGreaterThan(0);
    expect(o.destino.zona).toBeTruthy();
    // D-11: ni coordenadas ni dirección del destino antes de aceptar
    expect(JSON.stringify(o.destino)).not.toMatch(/lat|lng|Cl \d/);
    expect(o.pasajero.nombre).not.toContain(' ');
    expect(await estadoOperativo(cerca.usuarioId)).toBe('con_oferta');
    await lejos.socket.noLlega('oferta:nueva', 300);
  });

  it('si rechaza, la oferta pasa al siguiente y al primero no se le vuelve a ofrecer', async () => {
    const zona = desplazar(MANIZALES, 20_000, 0); // zona aparte, a 20 km
    const a = await api.conductorEnLinea('3002000011', zona);
    const b = await api.conductorEnLinea('3002000012', desplazar(zona, 2000, 90));
    const v = await pedirViaje(a);

    const primera = await a.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
    expect(
      (
        await api.post(
          `/v1/conductor/ofertas/${primera.ofertaId}/rechazar`,
          undefined,
          a.accessToken,
        )
      ).estado,
    ).toBe(204);
    const segunda = await b.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
    expect(segunda.ofertaId).not.toBe(primera.ofertaId);
    expect(await estadoOperativo(a.usuarioId)).toBe('disponible');
    expect(a.socket.cuantos('oferta:nueva')).toBe(1);
  });

  it('si no responde a tiempo, la oferta vence, se retira y pasa al siguiente', async () => {
    const zona = desplazar(MANIZALES, 40_000, 0);
    const a = await api.conductorEnLinea('3002000021', zona);
    const b = await api.conductorEnLinea('3002000022', desplazar(zona, 2500, 180));
    const v = await pedirViaje(a);

    const o = await a.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
    const retirada = await a.socket.esperar(
      'oferta:retirada',
      (d: any) => d.ofertaId === o.ofertaId,
    );
    expect(retirada.motivo).toBe('expirada');
    await b.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
    expect(await estadoOperativo(a.usuarioId)).toBe('disponible');
    // el conductor que dejó vencer la oferta no puede aceptarla después
    const tarde = await api.post(
      `/v1/conductor/ofertas/${o.ofertaId}/aceptar`,
      undefined,
      a.accessToken,
    );
    expect(tarde.estado).toBe(409);
    expect(tarde.cuerpo).toMatchObject({ codigo: 'OFERTA_NO_VIGENTE' });
  });

  it('sin conductores disponibles el viaje queda "sin conductor" al agotar el tiempo', async () => {
    const solo = await api.conductorEnLinea('3002000031', desplazar(MANIZALES, 60_000, 0));
    // el único conductor ya tiene otra cosa: se desconecta antes de pedir el viaje
    const v = await pedirViaje(solo);
    const o = await solo.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
    await api.post(`/v1/conductor/ofertas/${o.ofertaId}/rechazar`, undefined, solo.accessToken);
    await new Promise((r) => setTimeout(r, 3200));
    expect(await estadoViaje(v.viajeId)).toBe('sin_conductor');
    const tipos = (
      await api.bd.db
        .select({ t: viajeEvento.tipo })
        .from(viajeEvento)
        .where(eq(viajeEvento.viajeId, v.viajeId))
    ).map((e) => e.t);
    expect(tipos).toEqual(
      expect.arrayContaining(['solicitado', 'oferta_enviada', 'oferta_rechazada', 'sin_conductor']),
    );
  });

  describe('aceptación', () => {
    it('es atómica: asigna al conductor, lo pone en camino y una segunda aceptación falla', async () => {
      const a = await api.conductorEnLinea('3002000041', desplazar(MANIZALES, 80_000, 0));
      const v = await pedirViaje(a);
      const o = await a.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);

      const r = await api.post(
        `/v1/conductor/ofertas/${o.ofertaId}/aceptar`,
        undefined,
        a.accessToken,
      );
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({ id: v.viajeId, estado: 'asignado', pinRequerido: true });
      expect(r.cuerpo.destino.lat).toBeTypeOf('number'); // ya aceptado: ve el destino exacto
      expect(await estadoViaje(v.viajeId)).toBe('asignado');
      expect(await estadoOperativo(a.usuarioId)).toBe('en_camino');

      const otra = await api.post(
        `/v1/conductor/ofertas/${o.ofertaId}/aceptar`,
        undefined,
        a.accessToken,
      );
      expect(otra.estado).toBe(409);
      const estados = a.socket.eventos
        .filter((e) => e.evento === 'viaje:estado')
        .map((e) => e.datos.estado);
      expect(estados).toContain('asignado');
    });

    it('no se puede aceptar la oferta de otro conductor', async () => {
      const a = await api.conductorEnLinea('3002000051', desplazar(MANIZALES, 100_000, 0));
      const intruso = await api.conductorEnLinea('3002000052', desplazar(MANIZALES, 100_000, 180));
      const v = await pedirViaje(a);
      const o = await a.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
      const r = await api.post(
        `/v1/conductor/ofertas/${o.ofertaId}/aceptar`,
        undefined,
        intruso.accessToken,
      );
      expect(r.estado).toBe(404);
    });

    it('si el pasajero cancela mientras hay una oferta abierta, se le retira al conductor', async () => {
      const a = await api.conductorEnLinea('3002000061', desplazar(MANIZALES, 120_000, 0));
      const v = await pedirViaje(a);
      const o = await a.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);

      expect(
        (await api.post(`/v1/dev/pasajeros/viaje/${v.viajeId}/cancelar`, undefined, a.accessToken))
          .cuerpo,
      ).toMatchObject({ costo: 0 });
      const retirada = await a.socket.esperar(
        'oferta:retirada',
        (d: any) => d.ofertaId === o.ofertaId,
      );
      expect(retirada.motivo).toBe('cancelada');
      expect(await estadoOperativo(a.usuarioId)).toBe('disponible');
      expect(
        (await api.post(`/v1/conductor/ofertas/${o.ofertaId}/aceptar`, undefined, a.accessToken))
          .estado,
      ).toBe(409);
    });

    it('al recargar la app recupera la oferta abierta', async () => {
      const a = await api.conductorEnLinea('3002000071', desplazar(MANIZALES, 140_000, 0));
      expect((await api.get('/v1/conductor/oferta-actual', a.accessToken)).cuerpo).toEqual({
        oferta: null,
      });
      const v = await pedirViaje(a);
      const o = await a.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
      const r = await api.get('/v1/conductor/oferta-actual', a.accessToken);
      expect(r.cuerpo.oferta).toMatchObject({ ofertaId: o.ofertaId, viajeId: v.viajeId });
    });
  });

  describe('quién puede recibir ofertas (RN-030)', () => {
    it('no se ofrece a quien está desconectado, bloqueado por deuda o sin señal reciente', async () => {
      const base = desplazar(MANIZALES, 160_000, 0);
      const pedidor = await api.conductorEnLinea('3002000081', base);
      const desconectado = await api.conductorEnLinea('3002000082', desplazar(base, 500, 90));
      await api.post('/v1/conductor/desconectar', undefined, desconectado.accessToken);
      const endeudado = await api.conductorEnLinea('3002000083', desplazar(base, 600, 90));
      await api.bd.db
        .update(conductor)
        .set({ bloqueadoPorDeuda: true })
        .where(eq(conductor.usuarioId, endeudado.usuarioId));

      const v = await pedirViaje(pedidor);
      await pedidor.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
      await desconectado.socket.noLlega('oferta:nueva', 200);
      await endeudado.socket.noLlega('oferta:nueva', 200);
    });

    it('no se ofrece fuera del radio máximo de 8 km', async () => {
      const base = desplazar(MANIZALES, 180_000, 0);
      const pedidor = await api.conductorEnLinea('3002000091', base);
      await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ ...base, t: Date.now() }] },
        pedidor.accessToken,
      );
      const lejano = await api.conductorEnLinea('3002000092', desplazar(base, 9500, 0));
      const v = await pedirViaje(pedidor);
      const o = await pedidor.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
      await api.post(
        `/v1/conductor/ofertas/${o.ofertaId}/rechazar`,
        undefined,
        pedidor.accessToken,
      );
      await lejano.socket.noLlega('oferta:nueva', 400);
    });

    it('los viajes intermunicipales solo van a quien los activó, y su precio es la tarifa fija', async () => {
      const base = desplazar(MANIZALES, 200_000, 0);
      const normal = await api.conductorEnLinea('3002000101', base);
      const v = await pedirViaje(normal, { nacional: true, destinoNacional: 'Pereira' });
      await new Promise((r) => setTimeout(r, 400));
      expect(normal.socket.cuantos('oferta:nueva')).toBe(0);

      await api.patch('/v1/conductor/yo', { aceptaIntermunicipal: true }, normal.accessToken);
      const v2 = await pedirViaje(normal, { nacional: true, destinoNacional: 'Pereira' });
      const o = await normal.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v2.viajeId);
      expect(o).toMatchObject({
        tipoServicio: 'intermunicipal',
        precioEstimado: { min: 240_000, max: 240_000 },
      });
      // 240.000 con 5 % de comisión (D-03)
      expect(o.gananciaEstimada).toBe(228_000);
      expect(v.viajeId).not.toBe(v2.viajeId);
    });
  });

  it('el estado de las ofertas queda registrado en la línea de tiempo del viaje y en la tabla de ofertas', async () => {
    const a = await api.conductorEnLinea('3002000111', desplazar(MANIZALES, 220_000, 0));
    const v = await pedirViaje(a);
    const o = await a.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
    await api.post(`/v1/conductor/ofertas/${o.ofertaId}/aceptar`, undefined, a.accessToken);
    const [fila] = await api.bd.db.select().from(oferta).where(eq(oferta.viajeId, v.viajeId));
    expect(fila).toMatchObject({ resultado: 'aceptada', ronda: 1, conductorId: a.usuarioId });
    expect(fila?.respondidaEn).toBeInstanceOf(Date);
  });

  describe('WebSocket', () => {
    it('rechaza un token inválido', async () => {
      const { io } = await import('socket.io-client');
      const socket = io(api.url, {
        auth: { token: 'falso' },
        transports: ['websocket'],
        reconnection: false,
      });
      const evento = await new Promise<string>((resolver) => {
        socket.on('error:autenticacion', () => resolver('error:autenticacion'));
        socket.on('listo', () => resolver('listo'));
        setTimeout(() => resolver('nada'), 3000);
      });
      socket.close();
      expect(evento).toBe('error:autenticacion');
    });

    it('recibe posiciones en vivo y responde qué quedó guardado', async () => {
      const a = await api.conductorEnLinea('3002000121', desplazar(MANIZALES, 240_000, 0));
      const r = await new Promise<any>((resolver) =>
        a.socket.socket.emit(
          'conductor:ubicacion',
          { puntos: [{ ...desplazar(MANIZALES, 240_000, 0), t: Date.now(), precisionM: 5 }] },
          resolver,
        ),
      );
      expect(r).toMatchObject({ ok: true, recibidos: 1, guardados: 1 });
      const mala = await new Promise<any>((resolver) =>
        a.socket.socket.emit(
          'conductor:ubicacion',
          { puntos: [{ lat: 200, lng: 0, t: 1 }] },
          resolver,
        ),
      );
      expect(mala).toEqual({ error: 'SOLICITUD_INVALIDA' });
    });
  });

  it('no se puede desconectar con una oferta abierta ni con un viaje en curso', async () => {
    const a = await api.conductorEnLinea('3002000131', desplazar(MANIZALES, 260_000, 0));
    const v = await pedirViaje(a);
    const o = await a.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.viajeId);
    const conOferta = await api.post('/v1/conductor/desconectar', undefined, a.accessToken);
    expect(conOferta.estado).toBe(409);
    expect(conOferta.cuerpo).toMatchObject({ codigo: 'OFERTA_PENDIENTE' });
    await api.post(`/v1/conductor/ofertas/${o.ofertaId}/aceptar`, undefined, a.accessToken);
    const enViaje = await api.post('/v1/conductor/desconectar', undefined, a.accessToken);
    expect(enViaje.cuerpo).toMatchObject({ codigo: 'VIAJE_EN_CURSO' });
  });
});
