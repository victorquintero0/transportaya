import { and, eq, sql } from 'drizzle-orm';
import {
  alerta,
  calificacion,
  conductor,
  movimientoSaldo,
  pago,
  pasajero,
  ticket,
  viaje,
} from '@transportaya/db';
import {
  calcularTarifaUrbana,
  desplazar,
  resumirTrayectoria,
  type Coordenada,
  type PuntoGps,
} from '@transportaya/dominio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ViajesService } from '../src/viajes/viajes.service.js';
import { type Arnes, type ConductorEnLinea, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();
const MANIZALES = { lat: 5.0703, lng: -75.5138 };

describe.skipIf(!hayBase)('ciclo del viaje del conductor', () => {
  let api: Arnes;
  let zona = 0;
  beforeAll(async () => {
    api = await levantarApi(
      {},
      { despacho: { ofertaMs: 1500, reintentoMs: 150, presupuestoMs: 4000 } },
    );
  });
  afterAll(async () => {
    await api.cerrar();
  });

  /** Cada prueba trabaja en su propia zona para que las ofertas no se crucen. */
  const nuevaZona = (): Coordenada => desplazar(MANIZALES, 30_000 * ++zona, 45);

  interface Viaje {
    conductor: ConductorEnLinea;
    viajeId: string;
    pin: string;
    recogida: Coordenada;
  }

  /** Un conductor en línea que acepta un viaje de mentira. */
  async function viajeAceptado(
    telefono: string,
    cuerpo: object = {},
    centro = nuevaZona(),
  ): Promise<Viaje> {
    const c = await api.conductorEnLinea(telefono, centro);
    const r = await api.post('/v1/dev/pasajeros/viaje', cuerpo, c.accessToken);
    expect(r.estado).toBe(201);
    const o = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === r.cuerpo.viajeId);
    const acept = await api.post(
      `/v1/conductor/ofertas/${o.ofertaId}/aceptar`,
      undefined,
      c.accessToken,
    );
    expect(acept.estado).toBe(200);
    return {
      conductor: c,
      viajeId: r.cuerpo.viajeId,
      pin: r.cuerpo.pin,
      recogida: { lat: acept.cuerpo.recogida.lat, lng: acept.cuerpo.recogida.lng },
    };
  }

  const token = (v: Viaje) => v.conductor.accessToken;
  const ubicar = (v: Viaje, p: Coordenada) =>
    api.post(
      '/v1/conductor/ubicaciones',
      { puntos: [{ ...p, t: Date.now(), precisionM: 5 }] },
      token(v),
    );
  const llegar = async (v: Viaje) => {
    await ubicar(v, desplazar(v.recogida, 40, 0));
    return api.post(`/v1/conductor/viajes/${v.viajeId}/llegue`, {}, token(v));
  };
  const empezar = async (v: Viaje) => {
    await llegar(v);
    return api.post(`/v1/conductor/viajes/${v.viajeId}/iniciar`, { pin: v.pin }, token(v));
  };
  /** Mueve hacia atrás todos los tiempos del viaje, para simular que ya pasó rato sin esperar de verdad. */
  const retroceder = (viajeId: string, segundos: number) =>
    api.bd.db
      .execute(sql`update viaje set solicitado_en = solicitado_en - make_interval(secs => ${segundos}),
      aceptado_en = aceptado_en - make_interval(secs => ${segundos}), en_sitio_en = en_sitio_en - make_interval(secs => ${segundos}),
      iniciado_en = iniciado_en - make_interval(secs => ${segundos}) where id = ${viajeId}`);

  /** Un recorrido de 10 minutos: 3 km, un semáforo de 2 minutos y 1,8 km más, con una lectura cada 4 s. */
  function recorrido(desde: Coordenada, finMs: number): PuntoGps[] {
    const inicio = finMs - 600_000;
    const puntos: PuntoGps[] = [];
    const en = (m: number) => desplazar(desde, m, 0);
    for (let s = 0; s <= 300; s += 4)
      puntos.push({ ...en(10 * s), instanteMs: inicio + s * 1000, precisionM: 5 });
    for (let s = 302; s <= 420; s += 2)
      puntos.push({
        ...desplazar(en(3000), s % 4 === 0 ? 0.8 : 0.3, (s * 53) % 360),
        instanteMs: inicio + s * 1000,
        precisionM: 5,
      });
    for (let s = 424; s <= 600; s += 4)
      puntos.push({ ...en(3000 + 10 * (s - 420)), instanteMs: inicio + s * 1000, precisionM: 5 });
    return puntos;
  }
  const enviarRecorrido = async (v: Viaje, puntos: PuntoGps[]) => {
    // Las lecturas reales de antes de iniciar quedaron con la hora de hoy; al "retroceder" el viaje caerían dentro de él.
    await api.bd.db.execute(sql`delete from posicion_conductor where viaje_id = ${v.viajeId}`);
    const r = await api.post(
      '/v1/conductor/ubicaciones',
      {
        puntos: puntos.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          t: p.instanteMs,
          precisionM: p.precisionM,
        })),
      },
      token(v),
    );
    expect(r.cuerpo.guardados).toBe(puntos.length);
  };
  const viajeActual = async (v: Viaje) =>
    (await api.get('/v1/conductor/viaje-actual', token(v))).cuerpo.viaje;
  const fila = async (id: string) =>
    (await api.bd.db.select().from(viaje).where(eq(viaje.id, id)))[0]!;
  const saldo = async (conductorId: string) =>
    Number(
      (
        await api.bd.db.execute<{ saldo: string }>(
          sql`select saldo::text from saldo_conductor where conductor_id = ${conductorId}`,
        )
      ).rows[0]?.saldo,
    );

  describe('llegada e inicio', () => {
    it('RN-040: "llegué" solo a menos de 150 m de la recogida', async () => {
      const v = await viajeAceptado('3003000001');
      await ubicar(v, desplazar(v.recogida, 600, 90));
      const lejos = await api.post(`/v1/conductor/viajes/${v.viajeId}/llegue`, {}, token(v));
      expect(lejos.estado).toBe(409);
      expect(lejos.cuerpo).toMatchObject({ codigo: 'LEJOS_DE_LA_RECOGIDA', radioM: 150 });
      expect(lejos.cuerpo.distanciaM).toBeGreaterThan(500);

      await ubicar(v, desplazar(v.recogida, 90, 90));
      const cerca = await api.post(`/v1/conductor/viajes/${v.viajeId}/llegue`, {}, token(v));
      expect(cerca.estado).toBe(200);
      expect(cerca.cuerpo).toMatchObject({
        estado: 'en_sitio',
        tiempos: { enSitioEn: expect.any(String) },
      });
      expect(
        (
          await api.bd.db
            .select()
            .from(conductor)
            .where(eq(conductor.usuarioId, v.conductor.usuarioId))
        )[0]?.estadoOperativo,
      ).toBe('en_sitio');
    });

    it('el PIN equivocado no deja iniciar, cuenta los intentos y el correcto sí', async () => {
      const v = await viajeAceptado('3003000002');
      await llegar(v);
      const malo = v.pin === '0000' ? '1111' : '0000';
      const mal = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/iniciar`,
        { pin: malo },
        token(v),
      );
      expect(mal.estado).toBe(409);
      expect(mal.cuerpo).toMatchObject({ codigo: 'PIN_INCORRECTO', intentosRestantes: 4 });
      expect(
        (await api.post(`/v1/conductor/viajes/${v.viajeId}/iniciar`, {}, token(v))).cuerpo,
      ).toMatchObject({ codigo: 'PIN_INCORRECTO' });
      const bien = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/iniciar`,
        { pin: v.pin },
        token(v),
      );
      expect(bien.estado).toBe(200);
      expect(bien.cuerpo.estado).toBe('en_curso');
      expect(
        (
          await api.bd.db
            .select()
            .from(conductor)
            .where(eq(conductor.usuarioId, v.conductor.usuarioId))
        )[0]?.estadoOperativo,
      ).toBe('en_viaje');
    });

    it('tras 5 PIN equivocados se bloquea el inicio', async () => {
      const v = await viajeAceptado('3003000003');
      await llegar(v);
      const malo = v.pin === '0000' ? '1111' : '0000';
      for (let i = 0; i < 5; i++)
        await api.post(`/v1/conductor/viajes/${v.viajeId}/iniciar`, { pin: malo }, token(v));
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/iniciar`,
        { pin: v.pin },
        token(v),
      );
      expect(r.estado).toBe(429);
      expect(r.cuerpo).toMatchObject({ codigo: 'PIN_BLOQUEADO' });
    });

    it('no se puede iniciar sin haber llegado, ni operar el viaje de otro conductor', async () => {
      const v = await viajeAceptado('3003000004');
      expect(
        (await api.post(`/v1/conductor/viajes/${v.viajeId}/iniciar`, { pin: v.pin }, token(v)))
          .cuerpo,
      ).toMatchObject({ codigo: 'ESTADO_INVALIDO' });
      const otro = await api.conductorEnLinea('3003000005', nuevaZona());
      expect(
        (await api.post(`/v1/conductor/viajes/${v.viajeId}/llegue`, {}, otro.accessToken)).estado,
      ).toBe(404);
    });

    it('el viaje actual trae la tarifa y los recargos para mostrar el taxímetro en vivo', async () => {
      const v = await viajeAceptado('3003000006');
      const a = await viajeActual(v);
      expect(a.tarifa).toMatchObject({
        base: 3700,
        valorKm: 1784,
        valorMinuto: 223,
        minima: 6300,
        multiplicadorDinamico: 1,
      });
      expect(a.tarifa.recargos.map((r: any) => r.nombre)).toContain('puerta_a_puerta');
      expect(a.pinRequerido).toBe(true);
      expect(a).not.toHaveProperty('pin');
    });
  });

  describe('finalizar: taxímetro, precio y dinero', () => {
    it('el taxímetro coincide con el servidor: se cobra la tarifa del decreto y se registra la comisión del 3 %', async () => {
      const v = await viajeAceptado('3003000011', { metodoPago: 'efectivo' });
      await empezar(v);
      await retroceder(v.viajeId, 700);
      const pts = recorrido(v.recogida, Date.now() - 100_000);
      await enviarRecorrido(v, pts);
      const medida = resumirTrayectoria(pts);
      expect(medida.tiempoDetenidoS).toBeGreaterThanOrEqual(110);

      const a = await viajeActual(v);
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        {
          distanciaM: medida.distanciaM,
          tiempoDetenidoS: medida.tiempoDetenidoS,
          duracionS: medida.duracionS,
        },
        token(v),
      );
      expect(r.estado).toBe(200);

      const esperado = calcularTarifaUrbana({
        parametros: {
          base: a.tarifa.base,
          valorKm: a.tarifa.valorKm,
          valorMinuto: a.tarifa.valorMinuto,
          minima: a.tarifa.minima,
        },
        distanciaM: medida.distanciaM,
        tiempoCobrableS: medida.tiempoDetenidoS,
        recargos: a.tarifa.recargos,
      });
      expect(r.cuerpo.totalCarrera).toBe(esperado.totalRedondeado);
      expect(r.cuerpo.precioFinal).toBe(esperado.totalRedondeado); // sin espera ni peajes
      expect(r.cuerpo.comision).toBe(Math.round(esperado.totalRedondeado * 0.03));
      expect(r.cuerpo.gananciaNeta).toBe(r.cuerpo.precioFinal - r.cuerpo.comision);
      expect(r.cuerpo.cobrarEnEfectivo).toBe(r.cuerpo.precioFinal);
      expect(r.cuerpo.mediciones).toMatchObject({ verificadas: true, usadaServidor: false });
      expect(r.cuerpo.totalCarrera % 100).toBe(0); // aproximado por defecto a la centena

      const f = await fila(v.viajeId);
      expect(f).toMatchObject({
        estado: 'finalizado',
        estadoPago: 'pendiente',
        comisionPb: 300,
        distanciaTaximetroM: medida.distanciaM,
        tiempoDetenidoS: medida.tiempoDetenidoS,
      });
      // efectivo: el conductor ya tiene el dinero, solo se le debita la comisión
      const mov = await api.bd.db
        .select()
        .from(movimientoSaldo)
        .where(eq(movimientoSaldo.viajeId, v.viajeId));
      expect(mov).toHaveLength(1);
      expect(mov[0]).toMatchObject({ tipo: 'comision_viaje_efectivo', monto: -r.cuerpo.comision });
      expect(await saldo(v.conductor.usuarioId)).toBe(-r.cuerpo.comision);
      expect(
        (await api.bd.db.select().from(pago).where(eq(pago.viajeId, v.viajeId)))[0],
      ).toMatchObject({ tipo: 'efectivo', estado: 'pendiente', monto: r.cuerpo.precioFinal });
      expect(
        (
          await api.bd.db
            .select()
            .from(conductor)
            .where(eq(conductor.usuarioId, v.conductor.usuarioId))
        )[0]?.estadoOperativo,
      ).toBe('disponible');
    });

    it('con tarjeta el conductor recibe lo cobrado menos la comisión y el pago queda hecho', async () => {
      const v = await viajeAceptado('3003000012', { metodoPago: 'tarjeta' });
      await empezar(v);
      await retroceder(v.viajeId, 700);
      const pts = recorrido(v.recogida, Date.now() - 100_000);
      await enviarRecorrido(v, pts);
      const m = resumirTrayectoria(pts);
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: m.distanciaM, tiempoDetenidoS: m.tiempoDetenidoS, duracionS: m.duracionS },
        token(v),
      );
      expect(r.cuerpo.cobrarEnEfectivo).toBe(0);
      const f = await fila(v.viajeId);
      expect(f.estadoPago).toBe('pagado');
      const mov = await api.bd.db
        .select()
        .from(movimientoSaldo)
        .where(eq(movimientoSaldo.viajeId, v.viajeId));
      expect(mov.map((x) => [x.tipo, x.monto])).toEqual([
        ['ingreso_viaje_electronico', r.cuerpo.precioFinal - r.cuerpo.comision],
      ]);
      expect(await saldo(v.conductor.usuarioId)).toBe(r.cuerpo.gananciaNeta);
    });

    it('si el taxímetro reporta de más, el servidor lo corrige con la trayectoria y avisa a la operación', async () => {
      const v = await viajeAceptado('3003000013', { metodoPago: 'efectivo' });
      await empezar(v);
      await retroceder(v.viajeId, 700);
      const pts = recorrido(v.recogida, Date.now() - 100_000);
      await enviarRecorrido(v, pts);
      const real = resumirTrayectoria(pts);

      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        {
          distanciaM: real.distanciaM * 2,
          tiempoDetenidoS: real.tiempoDetenidoS,
          duracionS: real.duracionS,
        },
        token(v),
      );
      expect(r.estado).toBe(200);
      expect(r.cuerpo.mediciones).toMatchObject({ usadaServidor: true });
      expect(r.cuerpo.mediciones.cobradas.distanciaM).toBe(real.distanciaM);
      const [al] = await api.bd.db
        .select()
        .from(alerta)
        .where(and(eq(alerta.viajeId, v.viajeId), eq(alerta.tipo, 'diferencia_taximetro')));
      expect(al).toMatchObject({ severidad: 'media', estado: 'abierta' });
      const f = await fila(v.viajeId);
      expect(f.distanciaTaximetroM).toBe(real.distanciaM * 2); // lo que dijo el taxímetro queda guardado
      expect(f.distanciaRealM).toBe(real.distanciaM); // con lo que se cobró
    });

    it('sin trayectoria suficiente no se puede verificar y se usa el taxímetro, dejándolo anotado', async () => {
      const v = await viajeAceptado('3003000014', { metodoPago: 'efectivo' });
      await empezar(v);
      await retroceder(v.viajeId, 700);
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: 4000, tiempoDetenidoS: 100, duracionS: 600 },
        token(v),
      );
      expect(r.cuerpo.mediciones).toMatchObject({ verificadas: false, usadaServidor: false });
      expect((await fila(v.viajeId)).desglose).toMatchObject({
        mediciones: { usada: 'taximetro_sin_verificar' },
      });
    });

    it('rechaza mediciones imposibles', async () => {
      const v = await viajeAceptado('3003000015');
      await empezar(v);
      const mas = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: 1000, tiempoDetenidoS: 500, duracionS: 100 },
        token(v),
      );
      expect(mas.estado).toBe(400); // detenido más tiempo del que duró
      const larga = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: 1000, tiempoDetenidoS: 10, duracionS: 5000 },
        token(v),
      );
      expect(larga.estado).toBe(400); // duración que no cuadra con la hora del viaje
      expect((await fila(v.viajeId)).estado).toBe('en_curso');
    });

    it('la espera en sitio se cobra pasados los 3 minutos gratis (RN-041)', async () => {
      const v = await viajeAceptado('3003000016', { metodoPago: 'tarjeta' });
      await llegar(v);
      await api.bd.db.execute(
        sql`update viaje set solicitado_en = solicitado_en - interval '10 minutes', aceptado_en = aceptado_en - interval '10 minutes', en_sitio_en = now() - interval '290 seconds' where id = ${v.viajeId}`,
      );
      await api.post(`/v1/conductor/viajes/${v.viajeId}/iniciar`, { pin: v.pin }, token(v));
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: 1500, tiempoDetenidoS: 0, duracionS: 100 },
        token(v),
      );
      // 4 min 50 s en sitio − 3 gratis = 1 min 50 s → 2 min (o fracción) × $250
      expect(r.cuerpo.cobroEspera).toBe(500);
      expect(r.cuerpo.precioFinal).toBe(r.cuerpo.totalCarrera + 500);
    });

    it('no se puede finalizar dos veces', async () => {
      const v = await viajeAceptado('3003000017');
      await empezar(v);
      await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: 1500, tiempoDetenidoS: 0, duracionS: 30 },
        token(v),
      );
      expect(
        (
          await api.post(
            `/v1/conductor/viajes/${v.viajeId}/finalizar`,
            { distanciaM: 1500, tiempoDetenidoS: 0, duracionS: 30 },
            token(v),
          )
        ).estado,
      ).toBe(409);
    });

    it('un viaje intermunicipal cobra la tarifa fija sin recalcular y con 5 % de comisión (RN-012.4, D-03)', async () => {
      const centro = nuevaZona();
      const c = await api.conductorEnLinea('3003000018', centro);
      await api.patch('/v1/conductor/yo', { aceptaIntermunicipal: true }, c.accessToken);
      const r0 = await api.post(
        '/v1/dev/pasajeros/viaje',
        { nacional: true, destinoNacional: 'Pereira', metodoPago: 'efectivo' },
        c.accessToken,
      );
      const o = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === r0.cuerpo.viajeId);
      const acept = await api.post(
        `/v1/conductor/ofertas/${o.ofertaId}/aceptar`,
        undefined,
        c.accessToken,
      );
      expect(acept.cuerpo.rutaFija).toMatchObject({ destino: 'Pereira', tarifa: 240_000 });
      const v: Viaje = {
        conductor: c,
        viajeId: r0.cuerpo.viajeId,
        pin: r0.cuerpo.pin,
        recogida: { lat: acept.cuerpo.recogida.lat, lng: acept.cuerpo.recogida.lng },
      };
      await empezar(v);
      await retroceder(v.viajeId, 3000);
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: 52_000, tiempoDetenidoS: 120, duracionS: 2900 },
        token(v),
      );
      expect(r.cuerpo).toMatchObject({
        totalCarrera: 240_000,
        precioFinal: 240_000,
        comision: 12_000,
        cobroEspera: 0,
      });
      expect((await fila(v.viajeId)).comisionPb).toBe(500);
      expect(await saldo(c.usuarioId)).toBe(-12_000);
    });
  });

  describe('cobro en efectivo (RN-055)', () => {
    async function finalizado(tel: string) {
      const v = await viajeAceptado(tel, { metodoPago: 'efectivo' });
      await empezar(v);
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
        token(v),
      );
      return { v, total: r.cuerpo.precioFinal as number };
    }

    it('al confirmar el valor completo el pago queda hecho, y solo se confirma una vez', async () => {
      const { v, total } = await finalizado('3003000021');
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/efectivo-recibido`,
        { monto: total },
        token(v),
      );
      expect(r.cuerpo).toEqual({ completo: true, faltante: 0 });
      expect((await fila(v.viajeId)).estadoPago).toBe('pagado');
      expect(
        (
          await api.post(
            `/v1/conductor/viajes/${v.viajeId}/efectivo-recibido`,
            { monto: total },
            token(v),
          )
        ).cuerpo,
      ).toMatchObject({ codigo: 'YA_CONFIRMADO' });
    });

    it('si recibió menos, queda deuda del pasajero y un ticket para soporte', async () => {
      const { v, total } = await finalizado('3003000022');
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/efectivo-recibido`,
        { monto: total - 3000 },
        token(v),
      );
      expect(r.cuerpo).toEqual({ completo: false, faltante: 3000 });
      const f = await fila(v.viajeId);
      expect(f.estadoPago).toBe('fallido');
      expect(
        (await api.bd.db.select().from(pasajero).where(eq(pasajero.usuarioId, f.pasajeroId)))[0]
          ?.deudaPendiente,
      ).toBe(3000);
      const [t] = await api.bd.db.select().from(ticket).where(eq(ticket.viajeId, v.viajeId));
      expect(t).toMatchObject({ tipo: 'cobro_incorrecto', prioridad: 'alta' });
    });
  });

  describe('cancelaciones', () => {
    it('RN-043: por pasajero ausente solo después de 5 minutos en sitio, y cobra la tarifa de cancelación', async () => {
      const v = await viajeAceptado('3003000031', { metodoPago: 'efectivo' });
      await llegar(v);
      const pronto = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/cancelar`,
        { motivo: 'pasajero_ausente' },
        token(v),
      );
      expect(pronto.estado).toBe(409);
      expect(pronto.cuerpo).toMatchObject({ codigo: 'AUN_NO_PUEDE_CANCELAR' });
      expect(pronto.cuerpo.segundosRestantes).toBeGreaterThan(250);

      await api.bd.db.execute(
        sql`update viaje set solicitado_en = solicitado_en - interval '7 minutes', aceptado_en = aceptado_en - interval '7 minutes', en_sitio_en = en_sitio_en - interval '6 minutes' where id = ${v.viajeId}`,
      );
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/cancelar`,
        { motivo: 'pasajero_ausente' },
        token(v),
      );
      expect(r.cuerpo).toMatchObject({
        reasignado: false,
        tarifaCancelacion: 4000,
        gananciaNeta: 4000 - 120,
      });
      const f = await fila(v.viajeId);
      expect(f).toMatchObject({
        estado: 'cancelado',
        canceladoPor: 'conductor',
        motivoCancelacion: 'pasajero_ausente',
      });
      expect(
        (
          await api.bd.db
            .select()
            .from(movimientoSaldo)
            .where(eq(movimientoSaldo.viajeId, v.viajeId))
        )[0],
      ).toMatchObject({ tipo: 'cancelacion', monto: 3880 });
      expect(
        (await api.bd.db.select().from(pasajero).where(eq(pasajero.usuarioId, f.pasajeroId)))[0]
          ?.deudaPendiente,
      ).toBe(4000);
    });

    it('RN-045: cualquier otro motivo devuelve el viaje a despacho, sin costo, y no se le ofrece otra vez a quien canceló', async () => {
      const centro = nuevaZona();
      const a = await api.conductorEnLinea('3003000041', centro);
      const b = await api.conductorEnLinea('3003000042', desplazar(centro, 2500, 270));
      const creado = await api.post('/v1/dev/pasajeros/viaje', {}, a.accessToken);
      const o = await a.socket.esperar(
        'oferta:nueva',
        (d: any) => d.viajeId === creado.cuerpo.viajeId,
      );
      await api.post(`/v1/conductor/ofertas/${o.ofertaId}/aceptar`, undefined, a.accessToken);

      const r = await api.post(
        `/v1/conductor/viajes/${creado.cuerpo.viajeId}/cancelar`,
        { motivo: 'problema_vehiculo', detalle: 'Se pinchó una llanta' },
        a.accessToken,
      );
      expect(r.cuerpo).toEqual({ reasignado: true });
      const f = await fila(creado.cuerpo.viajeId);
      expect(f).toMatchObject({ conductorId: null, vehiculoId: null });
      expect(f.estado === 'buscando_conductor' || f.estado === 'asignado').toBe(true);
      await b.socket.esperar('oferta:nueva', (d: any) => d.viajeId === creado.cuerpo.viajeId);
      expect(a.socket.cuantos('oferta:nueva')).toBe(1);
      expect(
        await api.bd.db
          .select()
          .from(movimientoSaldo)
          .where(eq(movimientoSaldo.viajeId, creado.cuerpo.viajeId)),
      ).toHaveLength(0);
    });

    it('si el conductor ya llegó y no puede continuar, el viaje también vuelve a despacho', async () => {
      const centro = nuevaZona();
      const v = await viajeAceptado('3003000043', {}, centro);
      await llegar(v);
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/cancelar`,
        { motivo: 'emergencia' },
        token(v),
      );
      expect(r.cuerpo).toEqual({ reasignado: true });
      expect((await fila(v.viajeId)).enSitioEn).toBeNull();
    });

    it('RN-045: más de 3 cancelaciones en 24 horas generan una alerta para cumplimiento', async () => {
      const centro = nuevaZona();
      const c = await api.conductorEnLinea('3003000044', centro);
      for (let i = 0; i < 4; i++) {
        const creado = await api.post('/v1/dev/pasajeros/viaje', {}, c.accessToken);
        const o = await c.socket.esperar(
          'oferta:nueva',
          (d: any) => d.viajeId === creado.cuerpo.viajeId,
        );
        await api.post(`/v1/conductor/ofertas/${o.ofertaId}/aceptar`, undefined, c.accessToken);
        await api.post(
          `/v1/conductor/viajes/${creado.cuerpo.viajeId}/cancelar`,
          { motivo: 'otro' },
          c.accessToken,
        );
        await api.post(
          `/v1/dev/pasajeros/viaje/${creado.cuerpo.viajeId}/cancelar`,
          undefined,
          c.accessToken,
        ); // el pasajero desiste y se corta la búsqueda
      }
      const alertas = await api.bd.db
        .select()
        .from(alerta)
        .where(
          and(eq(alerta.tipo, 'cancelaciones_repetidas'), eq(alerta.conductorId, c.usuarioId)),
        );
      expect(alertas).toHaveLength(1);
      expect(alertas[0]?.severidad).toBe('baja');
    });

    it('no se puede cancelar un viaje en curso desde la app', async () => {
      const v = await viajeAceptado('3003000045');
      await empezar(v);
      expect(
        (await api.post(`/v1/conductor/viajes/${v.viajeId}/cancelar`, { motivo: 'otro' }, token(v)))
          .cuerpo,
      ).toMatchObject({ codigo: 'ESTADO_INVALIDO' });
    });

    it('RN-042: si cancela el pasajero, gratis en los primeros 2 minutos y después se le cobra al pasajero', async () => {
      const v = await viajeAceptado('3003000046', { metodoPago: 'efectivo' });
      await api.bd.db.execute(
        sql`update viaje set solicitado_en = solicitado_en - interval '5 minutes', aceptado_en = now() - interval '4 minutes' where id = ${v.viajeId}`,
      );
      const r = await api.post(
        `/v1/dev/pasajeros/viaje/${v.viajeId}/cancelar`,
        undefined,
        token(v),
      );
      expect(r.cuerpo).toMatchObject({ costo: 4000, gananciaNeta: 3880 });
      await v.conductor.socket.esperar(
        'viaje:estado',
        (d: any) => d.viajeId === v.viajeId && d.estado === 'cancelado',
      );
      const f = await fila(v.viajeId);
      expect(f).toMatchObject({ estado: 'cancelado', canceladoPor: 'pasajero' });
      expect(
        (
          await api.bd.db
            .select()
            .from(conductor)
            .where(eq(conductor.usuarioId, v.conductor.usuarioId))
        )[0]?.estadoOperativo,
      ).toBe('disponible');

      const gratis = await viajeAceptado('3003000047');
      expect(
        (
          await api.post(
            `/v1/dev/pasajeros/viaje/${gratis.viajeId}/cancelar`,
            undefined,
            token(gratis),
          )
        ).cuerpo,
      ).toMatchObject({ costo: 0 });
    });
  });

  describe('calificación, SOS y vigilancia', () => {
    async function terminado(tel: string) {
      const v = await viajeAceptado(tel, { metodoPago: 'tarjeta' });
      await empezar(v);
      await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
        token(v),
      );
      return v;
    }

    it('califica al pasajero una sola vez y actualiza su promedio', async () => {
      const v = await terminado('3003000051');
      const r = await api.post(
        `/v1/conductor/viajes/${v.viajeId}/calificacion`,
        { estrellas: 2, etiquetas: ['impuntual'], comentario: 'Tardó mucho' },
        token(v),
      );
      expect(r.estado).toBe(200);
      const f = await fila(v.viajeId);
      const [p] = await api.bd.db
        .select()
        .from(pasajero)
        .where(eq(pasajero.usuarioId, f.pasajeroId));
      expect(p?.calificacionPromedio).toBe(2);
      expect(p?.calificacionesTotal).toBe(1);
      expect(
        (
          await api.post(
            `/v1/conductor/viajes/${v.viajeId}/calificacion`,
            { estrellas: 5 },
            token(v),
          )
        ).cuerpo,
      ).toMatchObject({ codigo: 'YA_CALIFICASTE' });
      expect(
        (
          await api.post(
            `/v1/conductor/viajes/${v.viajeId}/calificacion`,
            { estrellas: 9 },
            token(v),
          )
        ).estado,
      ).toBe(400);
    });

    it('RN-124: una etiqueta de seguridad abre un ticket de seguridad', async () => {
      const v = await terminado('3003000052');
      await api.post(
        `/v1/conductor/viajes/${v.viajeId}/calificacion`,
        { estrellas: 1, etiquetas: ['acoso'] },
        token(v),
      );
      expect(
        (await api.bd.db.select().from(ticket).where(eq(ticket.viajeId, v.viajeId)))[0],
      ).toMatchObject({ tipo: 'incidente_seguridad', prioridad: 'alta' });
      expect(
        await api.bd.db.select().from(calificacion).where(eq(calificacion.viajeId, v.viajeId)),
      ).toHaveLength(1);
    });

    it('solo se puede calificar un viaje finalizado y dentro de las 24 horas', async () => {
      const v = await viajeAceptado('3003000053');
      expect(
        (
          await api.post(
            `/v1/conductor/viajes/${v.viajeId}/calificacion`,
            { estrellas: 5 },
            token(v),
          )
        ).cuerpo,
      ).toMatchObject({ codigo: 'ESTADO_INVALIDO' });
      await empezar(v);
      await api.post(
        `/v1/conductor/viajes/${v.viajeId}/finalizar`,
        { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
        token(v),
      );
      await api.bd.db.execute(
        sql`update viaje set finalizado_en = now() - interval '25 hours', iniciado_en = now() - interval '26 hours', en_sitio_en = now() - interval '27 hours', aceptado_en = now() - interval '28 hours', solicitado_en = now() - interval '29 hours' where id = ${v.viajeId}`,
      );
      expect(
        (
          await api.post(
            `/v1/conductor/viajes/${v.viajeId}/calificacion`,
            { estrellas: 5 },
            token(v),
          )
        ).cuerpo,
      ).toMatchObject({ codigo: 'CALIFICACION_VENCIDA' });
    });

    it('RN-130: el SOS crea una alerta crítica con el viaje y no se duplica', async () => {
      const v = await viajeAceptado('3003000054');
      await empezar(v);
      const r = await api.post(
        '/v1/conductor/sos',
        { lat: v.recogida.lat, lng: v.recogida.lng },
        token(v),
      );
      expect(r.cuerpo).toMatchObject({ linea: '123' });
      const [al] = await api.bd.db.select().from(alerta).where(eq(alerta.id, r.cuerpo.alertaId));
      expect(al).toMatchObject({
        tipo: 'sos',
        severidad: 'critica',
        viajeId: v.viajeId,
        conductorId: v.conductor.usuarioId,
      });
      expect((await api.post('/v1/conductor/sos', {}, token(v))).cuerpo.alertaId).toBe(
        r.cuerpo.alertaId,
      );
    });

    it('perder la señal con un viaje en curso genera una alerta alta, una sola vez', async () => {
      const v = await viajeAceptado('3003000055');
      await empezar(v);
      const servicio = api.servicio(ViajesService);
      expect(await servicio.vigilarSenal(Date.now() + 10_000)).not.toContain(v.viajeId);
      expect(await servicio.vigilarSenal(Date.now() + 120_000)).toContain(v.viajeId);
      expect(await servicio.vigilarSenal(Date.now() + 130_000)).not.toContain(v.viajeId);
      const [al] = await api.bd.db
        .select()
        .from(alerta)
        .where(and(eq(alerta.viajeId, v.viajeId), eq(alerta.tipo, 'perdida_senal')));
      expect(al?.severidad).toBe('alta');
    });

    it('el historial muestra lo ganado en cada viaje', async () => {
      const v = await terminado('3003000056');
      const r = await api.get('/v1/conductor/viajes', token(v));
      expect(r.cuerpo.viajes).toHaveLength(1);
      expect(r.cuerpo.viajes[0]).toMatchObject({
        id: v.viajeId,
        estado: 'finalizado',
        metodoPago: 'tarjeta',
      });
      expect(r.cuerpo.viajes[0].gananciaNeta).toBe(
        r.cuerpo.viajes[0].precioFinal - r.cuerpo.viajes[0].comision,
      );
    });
  });
});
