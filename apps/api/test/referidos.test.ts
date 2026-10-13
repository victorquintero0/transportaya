import { desplazar } from '@transportaya/dominio';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ParametrosService } from '../src/operacion/parametros.service.js';
import { ReferidosService } from '../src/referidos/referidos.service.js';
import { baseDisponible, levantarApi, type Arnes, type ClienteSocket } from './arnes.js';

const hayBase = await baseDisponible();
const CENTRO = { lat: 5.0689, lng: -75.5174 };

/** Zonas separadas entre sí, dentro de la cobertura: los conductores de una prueba no atienden las de otra. */
let siguienteZona = 0;
const zona = () => desplazar(CENTRO, 22_000, (siguienteZona++ % 8) * 45);

describe.skipIf(!hayBase)('Referidos y puntos (RN-150 a RN-159)', () => {
  let api: Arnes;
  let financiero: string;
  let soporte: string;
  let monitor: string;
  let contador = 0;

  beforeAll(async () => {
    api = await levantarApi();
    financiero = (await api.ingresarOperacion('financiero')).accessToken;
    soporte = (await api.ingresarOperacion('soporte')).accessToken;
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });
  afterEach(async () => {
    await api.bd.db.execute(
      sql`update conductor set estado_operativo = 'desconectado' where estado_operativo <> 'desconectado'`,
    );
    await ponerParametros({});
  });

  const q = async (consulta: ReturnType<typeof sql>) =>
    (await api.bd.db.execute(consulta)).rows as any[];

  /** Cambia reglas del programa como lo haría Operación; lo que no se nombra vuelve a su valor por defecto. */
  async function ponerParametros(valores: Record<string, number>) {
    await api.bd.db.execute(sql`delete from parametro where clave like 'referidos.%'`);
    for (const [clave, valor] of Object.entries(valores))
      await api.bd.db.execute(
        sql`insert into parametro (clave, valor) values (${clave}, ${JSON.stringify(valor)}::jsonb)`,
      );
    api.servicio(ParametrosService).invalidar();
  }

  interface Persona {
    token: string;
    id: string;
    socket?: ClienteSocket;
  }

  async function pasajeroNuevo(nombre = 'Valentina Ríos Mejía'): Promise<Persona> {
    contador += 1;
    const s = await api.iniciarSesion(`31150${String(contador).padStart(5, '0')}`, 'pasajero');
    await api.patch('/v1/pasajero/yo', { nombre }, s.accessToken);
    await api.post('/v1/pasajero/terminos', { version: '2026-10' }, s.accessToken);
    return { token: s.accessToken, id: s.usuarioId };
  }

  async function conductorNuevo(z: { lat: number; lng: number }) {
    contador += 1;
    return api.conductorEnLinea(
      `31160${String(contador).padStart(5, '0')}`,
      desplazar(z, 400, 200),
    );
  }

  const resumen = async (token: string) => (await api.get<any>('/v1/referidos', token)).cuerpo;
  const codigoDe = async (token: string) => (await resumen(token)).codigo as string;
  const saldoDe = async (token: string) => (await resumen(token)).saldo as number;
  const usarCodigo = (token: string, codigo: string) =>
    api.post<any>('/v1/referidos/codigo', { codigo }, token);

  /** Suma puntos a mano, como lo haría finanzas. */
  async function darPuntos(usuarioId: string, puntos: number) {
    const r = await api.post(
      `/v1/op/referidos/personas/${usuarioId}/ajustar`,
      { puntos, motivo: 'Puntos de prueba para el caso' },
      financiero,
    );
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
  }

  /** Un viaje urbano de punta a punta entre un pasajero y un conductor que ya está en línea. */
  async function viaje(
    p: Persona,
    c: Awaited<ReturnType<typeof conductorNuevo>>,
    z: { lat: number; lng: number },
    extra: Record<string, unknown> = {},
    medicion = { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
  ) {
    const destino = desplazar(z, 2500, 90);
    const cot = await api.post<any>(
      '/v1/pasajero/cotizaciones',
      {
        origen: { ...z, direccion: 'Cra 23 # 62-14, Palogrande' },
        destino: { ...destino, direccion: 'Cl 65 # 30-10, Cable' },
      },
      p.token,
    );
    expect(cot.estado, JSON.stringify(cot.cuerpo)).toBe(200);
    const pedido = await api.post<any>(
      '/v1/pasajero/viajes',
      { cotizacionId: cot.cuerpo.opciones[0].id, metodoPago: 'efectivo', ...extra },
      p.token,
    );
    expect(pedido.estado, JSON.stringify(pedido.cuerpo)).toBe(201);
    const id = pedido.cuerpo.id as string;
    const oferta = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === id);
    const acept = await api.post<any>(
      `/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`,
      undefined,
      c.accessToken,
    );
    expect(acept.estado).toBe(200);
    await api.post(
      '/v1/conductor/ubicaciones',
      { puntos: [{ ...desplazar(acept.cuerpo.recogida, 30, 0), t: Date.now(), precisionM: 5 }] },
      c.accessToken,
    );
    await api.post(`/v1/conductor/viajes/${id}/llegue`, {}, c.accessToken);
    const pin = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje.pin;
    await api.post(`/v1/conductor/viajes/${id}/iniciar`, { pin }, c.accessToken);
    const fin = await api.post<any>(
      `/v1/conductor/viajes/${id}/finalizar`,
      medicion,
      c.accessToken,
    );
    expect(fin.estado, JSON.stringify(fin.cuerpo)).toBe(200);
    return { id, fin: fin.cuerpo, cotizacion: cot.cuerpo, pedido: pedido.cuerpo };
  }

  // ───────────────────────────────────────────────────────────────────────────── códigos

  describe('el código de cada persona', () => {
    it('se crea la primera vez, no cambia y tiene un formato fácil de decir', async () => {
      const a = await pasajeroNuevo('Ana Gómez');
      const codigo = await codigoDe(a.token);
      expect(codigo).toMatch(/^ANA-[2-9A-HJ-NP-Z]{4}$/);
      expect(await codigoDe(a.token)).toBe(codigo);
      expect(await codigoDe((await pasajeroNuevo('Ana Gómez')).token)).not.toBe(codigo);
    });

    it('el resumen trae lo que la pantalla necesita', async () => {
      const a = await pasajeroNuevo();
      const r = await resumen(a.token);
      expect(r).toMatchObject({
        activo: true,
        saldo: 0,
        valorPunto: 10,
        topeDescuentoPct: 30,
        puedeUsarCodigo: true,
        usoCodigo: null,
        invitados: [],
        totales: { invitados: 0, otorgados: 0, pendientes: 0, puntosGanados: 0 },
        recompensas: { invitarPasajero: 500, invitarConductor: 1500, bienvenidaPasajero: 300 },
      });
      expect(r.deuda).toBeUndefined();
    });

    it('sin sesión no se ve nada, y personal de Operación no usa la app', async () => {
      expect((await api.get('/v1/referidos')).estado).toBe(401);
      expect((await api.get('/v1/referidos', financiero)).estado).toBe(403);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────── usar un código

  describe('usar un código (RN-151)', () => {
    it('lo acepta con mayúsculas o minúsculas y con espacios, y queda pendiente', async () => {
      const a = await pasajeroNuevo('Valentina Ríos');
      const b = await pasajeroNuevo();
      const codigo = await codigoDe(a.token);
      const r = await usarCodigo(b.token, ` ${codigo.toLowerCase()} `);
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo).toMatchObject({ referidor: 'Valentina', puntosAlPrimerViaje: 300 });
      const mio = await resumen(b.token);
      expect(mio.usoCodigo).toMatchObject({ estado: 'pendiente', referidor: 'Valentina', codigo });
      expect(mio.puedeUsarCodigo).toBe(false);
      const suyo = await resumen(a.token);
      expect(suyo.totales).toMatchObject({ invitados: 1, pendientes: 1 });
      expect(suyo.invitados[0]).toMatchObject({ rol: 'pasajero', estado: 'pendiente' });
    });

    it('no deja usar el propio código, uno que no existe ni dos veces', async () => {
      const a = await pasajeroNuevo();
      const b = await pasajeroNuevo();
      const codigoA = await codigoDe(a.token);
      expect((await usarCodigo(a.token, codigoA)).cuerpo.codigo).toBe('CODIGO_PROPIO');
      const noExiste = await usarCodigo(b.token, 'ZZZ-2222');
      expect(noExiste.estado).toBe(404);
      expect(noExiste.cuerpo.codigo).toBe('CODIGO_NO_EXISTE');
      expect((await usarCodigo(b.token, 'x')).estado).toBe(400);
      expect((await usarCodigo(b.token, codigoA)).estado).toBe(200);
      const c = await pasajeroNuevo();
      const otro = await usarCodigo(b.token, await codigoDe(c.token));
      expect(otro.estado).toBe(409);
      expect(otro.cuerpo.codigo).toBe('YA_INVITADO');
    });

    it('solo en los primeros días de la cuenta y antes del primer viaje', async () => {
      const a = await pasajeroNuevo();
      const vieja = await pasajeroNuevo();
      await api.bd.db.execute(
        sql`update usuario set creado_en = now() - interval '10 days' where id = ${vieja.id}`,
      );
      const fuera = await usarCodigo(vieja.token, await codigoDe(a.token));
      expect(fuera.estado).toBe(409);
      expect(fuera.cuerpo.codigo).toBe('FUERA_DE_VENTANA');
      expect((await resumen(vieja.token)).puedeUsarCodigo).toBe(false);

      const z = zona();
      const c = await conductorNuevo(z);
      const viajera = await pasajeroNuevo();
      await viaje(viajera, c, z);
      const yaViajo = await usarCodigo(viajera.token, await codigoDe(a.token));
      expect(yaViajo.cuerpo.codigo).toBe('YA_VIAJO');
      c.socket.cerrar();
    });

    it('con el programa apagado no se aceptan códigos nuevos', async () => {
      const a = await pasajeroNuevo();
      const b = await pasajeroNuevo();
      await ponerParametros({ 'referidos.activo': 0 });
      const r = await usarCodigo(b.token, await codigoDe(a.token));
      expect(r.cuerpo.codigo).toBe('REFERIDOS_INACTIVOS');
      expect((await resumen(b.token)).puedeUsarCodigo).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────── entregar los puntos

  describe('los puntos llegan con el primer viaje (RN-153)', () => {
    it('quien invita y quien es invitado reciben sus puntos, una sola vez', async () => {
      const z = zona();
      const c = await conductorNuevo(z);
      const a = await pasajeroNuevo('Valentina Ríos');
      const b = await pasajeroNuevo('Camilo Duque');
      a.socket = await api.conectarSocket(a.token);
      b.socket = await api.conectarSocket(b.token);
      await usarCodigo(b.token, await codigoDe(a.token));
      expect(await saldoDe(a.token)).toBe(0);

      const { id } = await viaje(b, c, z);
      const aviso = await a.socket.esperar('puntos:ganados', () => true);
      expect(aviso).toMatchObject({ puntos: 500, motivo: 'invitado_viajo', saldo: 500 });
      expect(await b.socket.esperar('puntos:ganados', () => true)).toMatchObject({
        puntos: 300,
        motivo: 'bienvenida',
        saldo: 300,
      });
      expect(await saldoDe(a.token)).toBe(500);
      expect(await saldoDe(b.token)).toBe(300);

      const fila = (await q(sql`select * from referido where invitado_id = ${b.id}`))[0];
      expect(fila).toMatchObject({
        estado: 'otorgado',
        puntos_referidor: 500,
        puntos_invitado: 300,
        viaje_id: id,
      });
      expect((await resumen(a.token)).invitados[0]).toMatchObject({
        estado: 'otorgado',
        puntos: 500,
      });
      expect((await resumen(b.token)).usoCodigo).toMatchObject({ estado: 'otorgado', puntos: 300 });
      const mov = (await api.get<any>('/v1/referidos/movimientos', a.token)).cuerpo;
      expect(mov[0]).toMatchObject({ tipo: 'referido_referidor', puntos: 500, valor: 5000 });

      // el segundo viaje de la persona invitada no paga nada más
      await viaje(b, c, z);
      expect(await saldoDe(a.token)).toBe(500);
      expect(await saldoDe(b.token)).toBe(300);
      c.socket.cerrar();
      a.socket.cerrar();
      b.socket.cerrar();
    });

    it('un viaje demasiado barato no cuenta: los puntos esperan al siguiente', async () => {
      const z = zona();
      const c = await conductorNuevo(z);
      const a = await pasajeroNuevo();
      const b = await pasajeroNuevo();
      await usarCodigo(b.token, await codigoDe(a.token));
      await ponerParametros({ 'referidos.min_viaje': 500_000 });
      await viaje(b, c, z);
      expect(await saldoDe(a.token)).toBe(0);
      expect((await resumen(b.token)).usoCodigo.estado).toBe('pendiente');
      await ponerParametros({});
      await viaje(b, c, z);
      expect(await saldoDe(a.token)).toBe(500);
      c.socket.cerrar();
    });

    it('si el referidor es el conductor que lleva a su invitado, no se entrega nada (RN-154)', async () => {
      const z = zona();
      const c = await conductorNuevo(z);
      const b = await pasajeroNuevo();
      // El conductor tiene su código como cualquiera: lo pide desde la App Conductor
      const codigoConductor = await codigoDe(c.accessToken);
      expect((await usarCodigo(b.token, codigoConductor)).estado).toBe(200);
      await viaje(b, c, z);
      const fila = (
        await q(sql`select estado, motivo from referido where invitado_id = ${b.id}`)
      )[0];
      expect(fila.estado).toBe('rechazado');
      expect(fila.motivo).toMatch(/otra parte/);
      expect(await saldoDe(c.accessToken)).toBe(0);
      expect(await saldoDe(b.token)).toBe(0);
      c.socket.cerrar();
    });

    it('invitar a un conductor paga más, cuando este termina su primer viaje', async () => {
      const z = zona();
      const a = await pasajeroNuevo('Ana Gómez');
      const c = await conductorNuevo(z);
      const r = await usarCodigo(c.accessToken, await codigoDe(a.token));
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect((await resumen(c.accessToken)).usoCodigo).toMatchObject({ estado: 'pendiente' });
      await viaje(await pasajeroNuevo(), c, z);
      expect(await saldoDe(a.token)).toBe(1500);
      expect(await saldoDe(c.accessToken)).toBe(300);
      expect(
        (
          await q(
            sql`select rol_invitado::text as r from referido where invitado_id = ${c.usuarioId}`,
          )
        )[0].r,
      ).toBe('conductor');
      c.socket.cerrar();
    });

    it('con el tope del mes alcanzado, la persona invitada recibe sus puntos y el referidor no', async () => {
      const z = zona();
      const c = await conductorNuevo(z);
      const a = await pasajeroNuevo();
      const b1 = await pasajeroNuevo();
      const b2 = await pasajeroNuevo();
      await ponerParametros({ 'referidos.tope_mensual': 1 });
      const codigo = await codigoDe(a.token);
      await usarCodigo(b1.token, codigo);
      await usarCodigo(b2.token, codigo);
      await viaje(b1, c, z);
      await viaje(b2, c, z);
      expect(await saldoDe(a.token)).toBe(500);
      expect(await saldoDe(b1.token)).toBe(300);
      expect(await saldoDe(b2.token)).toBe(300);
      const f = (
        await q(sql`select puntos_referidor, motivo from referido where invitado_id = ${b2.id}`)
      )[0];
      expect(f.puntos_referidor).toBe(0);
      expect(f.motivo).toMatch(/tope/);
      c.socket.cerrar();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────── pagar con puntos

  describe('pagar parte del viaje con puntos (RN-155 a RN-157)', () => {
    it('la cotización dice cuánto se puede descontar en cada opción', async () => {
      const z = zona();
      const a = await pasajeroNuevo();
      await darPuntos(a.id, 1000);
      const cot = (
        await api.post<any>(
          '/v1/pasajero/cotizaciones',
          { origen: z, destino: desplazar(z, 2500, 90) },
          a.token,
        )
      ).cuerpo;
      expect(cot.puntos).toMatchObject({
        activo: true,
        saldo: 1000,
        valorPunto: 10,
        topeDescuentoPct: 30,
      });
      const o = cot.opciones[0];
      const tope = Math.floor(o.precio.max * 0.3);
      expect(o.puntos.puntos).toBe(Math.min(1000, Math.floor(tope / 10)));
      expect(o.puntos.descuento).toBe(o.puntos.puntos * 10);
    });

    it('en efectivo: el pasajero paga menos, el conductor cobra completo y TransporteYa le acredita la diferencia', async () => {
      const z = zona();
      const c = await conductorNuevo(z);
      const a = await pasajeroNuevo();
      await darPuntos(a.id, 1000);
      const { id, fin, pedido } = await viaje(a, c, z, { usarPuntos: true });

      // al pedir se apartan los puntos
      const separados = (await q(sql`select puntos_separados from viaje where id = ${id}`))[0]
        .puntos_separados;
      expect(separados).toBeGreaterThan(0);
      expect(pedido.puntos.separados).toBe(separados);

      // al terminar se usan los que el tope permite con el precio real y el resto vuelve
      const usados = Math.min(separados, Math.floor(Math.floor(fin.precioFinal * 0.3) / 10));
      expect(fin.descuentoPuntos).toBe(usados * 10);
      expect(fin.aPagar).toBe(fin.precioFinal - usados * 10);
      expect(fin.cobrarEnEfectivo).toBe(fin.aPagar);
      expect(await saldoDe(a.token)).toBe(1000 - usados);
      const v = (
        await q(
          sql`select puntos_usados, descuento_puntos, precio_final from viaje where id = ${id}`,
        )
      )[0];
      expect(v).toMatchObject({ puntos_usados: usados });
      expect(Number(v.descuento_puntos)).toBe(usados * 10);

      // el libro del conductor: comisión sobre el viaje completo y la diferencia a su favor
      const mov = await q(
        sql`select tipo::text as tipo, monto from movimiento_saldo where viaje_id = ${id} order by tipo`,
      );
      expect(mov).toEqual([
        { tipo: 'comision_viaje_efectivo', monto: String(-fin.comision) },
        { tipo: 'descuento_puntos', monto: String(usados * 10) },
      ]);
      expect((await q(sql`select monto from pago where viaje_id = ${id}`))[0].monto).toBe(
        String(fin.aPagar),
      );

      // el pasajero ve lo que pagó
      const detalle = (await api.get<any>(`/v1/pasajero/viajes/${id}`, a.token)).cuerpo;
      expect(detalle.puntos).toMatchObject({ usados, descuento: usados * 10 });
      expect(detalle.aPagar).toBe(fin.aPagar);

      // el recibo muestra el descuento como una línea y el total es lo que de verdad pagó
      const recibo = (await api.get<any>(`/v1/pasajero/viajes/${id}/recibo`, a.token)).cuerpo;
      expect(recibo.lineas).toContainEqual({
        concepto: `Descuento con ${usados} puntos`,
        valor: -usados * 10,
      });
      expect(recibo.total).toBe(fin.aPagar + detalle.propina);

      // el conductor confirma el efectivo que de verdad recibió
      const rec = await api.post<any>(
        `/v1/conductor/viajes/${id}/efectivo-recibido`,
        { monto: fin.aPagar },
        c.accessToken,
      );
      expect(rec.estado, JSON.stringify(rec.cuerpo)).toBe(200);
      expect(rec.cuerpo.completo).toBe(true);
      c.socket.cerrar();
    });

    it('con tarjeta el libro del conductor no cambia: ya cobra el viaje completo', async () => {
      const z = zona();
      const c = await conductorNuevo(z);
      const a = await pasajeroNuevo();
      await darPuntos(a.id, 1000);
      const tarjeta = await api.post<any>(
        '/v1/pasajero/metodos-pago',
        { token: 'tok_sim_referidos_1', marca: 'Visa', ultimos4: '4242' },
        a.token,
      );
      expect(tarjeta.estado, JSON.stringify(tarjeta.cuerpo)).toBeLessThan(300);
      const { id, fin } = await viaje(a, c, z, {
        usarPuntos: true,
        metodoPago: 'tarjeta',
        metodoPagoId: tarjeta.cuerpo.id,
      });
      expect(fin.descuentoPuntos).toBeGreaterThan(0);
      const mov = await q(
        sql`select tipo::text as tipo from movimiento_saldo where viaje_id = ${id}`,
      );
      expect(mov.map((m) => m.tipo)).toEqual(['ingreso_viaje_electronico']);
      c.socket.cerrar();
    });

    it('sin puntos no se puede pedir con puntos', async () => {
      const z = zona();
      const a = await pasajeroNuevo();
      const cot = (
        await api.post<any>(
          '/v1/pasajero/cotizaciones',
          { origen: z, destino: desplazar(z, 2500, 90) },
          a.token,
        )
      ).cuerpo;
      const r = await api.post<any>(
        '/v1/pasajero/viajes',
        { cotizacionId: cot.opciones[0].id, metodoPago: 'efectivo', usarPuntos: true },
        a.token,
      );
      expect(r.estado).toBe(409);
      expect(r.cuerpo.codigo).toBe('SIN_PUNTOS');
      // y no queda un viaje a medias
      expect((await api.get<any>('/v1/pasajero/viaje-actual', a.token)).cuerpo.viaje).toBeNull();
    });

    it('si el viaje se cancela, los puntos vuelven al instante (RN-156)', async () => {
      const z = zona();
      const a = await pasajeroNuevo();
      await darPuntos(a.id, 1000);
      const cot = (
        await api.post<any>(
          '/v1/pasajero/cotizaciones',
          { origen: z, destino: desplazar(z, 2500, 90) },
          a.token,
        )
      ).cuerpo;
      const pedido = await api.post<any>(
        '/v1/pasajero/viajes',
        { cotizacionId: cot.opciones[0].id, metodoPago: 'efectivo', usarPuntos: true },
        a.token,
      );
      expect(pedido.estado).toBe(201);
      expect(await saldoDe(a.token)).toBeLessThan(1000);
      const cancelado = await api.post(
        `/v1/pasajero/viajes/${pedido.cuerpo.id}/cancelar`,
        {},
        a.token,
      );
      expect(cancelado.estado, JSON.stringify(cancelado.cuerpo)).toBe(200);
      expect(await saldoDe(a.token)).toBe(1000);
      const mov = (await api.get<any>('/v1/referidos/movimientos', a.token)).cuerpo;
      expect(mov.map((m: any) => m.tipo).slice(0, 2)).toEqual(['reverso', 'canje_descuento']);
    });

    it('un viaje que se queda sin conductor devuelve los puntos, también por la red de seguridad', async () => {
      const z = zona();
      const a = await pasajeroNuevo();
      await darPuntos(a.id, 1000);
      const cot = (
        await api.post<any>(
          '/v1/pasajero/cotizaciones',
          { origen: z, destino: desplazar(z, 2500, 90) },
          a.token,
        )
      ).cuerpo;
      const pedido = await api.post<any>(
        '/v1/pasajero/viajes',
        { cotizacionId: cot.opciones[0].id, metodoPago: 'efectivo', usarPuntos: true },
        a.token,
      );
      expect(pedido.estado).toBe(201);
      await api.bd.db.execute(
        sql`update viaje set estado = 'sin_conductor' where id = ${pedido.cuerpo.id}`,
      );
      expect(await saldoDe(a.token)).toBeLessThan(1000);
      expect(await api.servicio(ReferidosService).liberarPendientes()).toBe(1);
      expect(await saldoDe(a.token)).toBe(1000);
      // idempotente: no devuelve dos veces
      expect(await api.servicio(ReferidosService).liberarPendientes()).toBe(0);
      expect(await saldoDe(a.token)).toBe(1000);
    });

    it('no se ajusta el precio de un viaje pagado con puntos', async () => {
      const z = zona();
      const c = await conductorNuevo(z);
      const a = await pasajeroNuevo();
      await darPuntos(a.id, 1000);
      const { id, fin } = await viaje(a, c, z, { usarPuntos: true });
      const supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
      const r = await api.post<any>(
        `/v1/op/viajes/${id}/ajustar-precio`,
        { precioFinal: fin.precioFinal - 1000, motivo: 'Corrección de prueba' },
        supervisor,
      );
      expect(r.estado).toBe(409);
      expect(r.cuerpo.codigo).toBe('VIAJE_CON_PUNTOS');
      c.socket.cerrar();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────── abono a la comisión

  describe('abonar la comisión con puntos (RN-158)', () => {
    /** Un conductor con una deuda real: un viaje en efectivo deja su comisión a cargo. */
    async function conductorConDeuda() {
      const z = zona();
      const c = await conductorNuevo(z);
      await viaje(await pasajeroNuevo(), c, z);
      const saldo = Number(
        (
          await q(
            sql`select saldo::text as s from saldo_conductor where conductor_id = ${c.usuarioId}`,
          )
        )[0].s,
      );
      expect(saldo).toBeLessThan(0);
      return { c, deuda: -saldo };
    }

    it('paga con puntos hasta la deuda y no más, y lo habilita si estaba bloqueado', async () => {
      const { c, deuda } = await conductorConDeuda();
      await darPuntos(c.usuarioId, 5000);
      await api.bd.db.execute(
        sql`update conductor set bloqueado_por_deuda = true where usuario_id = ${c.usuarioId}`,
      );
      const antes = await resumen(c.accessToken);
      expect(antes.deuda).toBe(deuda);
      expect(antes.abono).toMatchObject({ monto: deuda, puntos: Math.ceil(deuda / 10) });

      const r = await api.post<any>('/v1/referidos/abonar', {}, c.accessToken);
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo).toMatchObject({
        monto: deuda,
        puntos: Math.ceil(deuda / 10),
        deuda: 0,
        habilitado: true,
      });
      expect(await saldoDe(c.accessToken)).toBe(5000 - Math.ceil(deuda / 10));
      const fila = (
        await q(
          sql`select saldo::text as s from saldo_conductor where conductor_id = ${c.usuarioId}`,
        )
      )[0];
      expect(Number(fila.s)).toBe(0);
      expect(
        (
          await q(
            sql`select bloqueado_por_deuda as b from conductor where usuario_id = ${c.usuarioId}`,
          )
        )[0].b,
      ).toBe(false);
      const lib = await q(
        sql`select tipo::text as tipo, monto from movimiento_saldo where conductor_id = ${c.usuarioId} and tipo = 'abono_puntos'`,
      );
      expect(lib).toEqual([{ tipo: 'abono_puntos', monto: String(deuda) }]);
      // el movimiento de puntos apunta al abono
      expect(
        (
          await q(
            sql`select count(*)::int as n from movimiento_puntos where usuario_id = ${c.usuarioId} and tipo = 'canje_abono' and movimiento_saldo_id is not null`,
          )
        )[0].n,
      ).toBe(1);
      // ya no hay deuda: no se puede abonar otra vez
      const otra = await api.post<any>('/v1/referidos/abonar', {}, c.accessToken);
      expect(otra.estado).toBe(409);
      expect(otra.cuerpo.codigo).toBe('SIN_DEUDA');
      c.socket.cerrar();
    });

    it('con pocos puntos abona los que tiene; pide un mínimo y deja abonar menos', async () => {
      const { c, deuda } = await conductorConDeuda();
      await ponerParametros({ 'referidos.min_abono_puntos': 10 });
      await darPuntos(c.usuarioId, 15);
      // 15 puntos = $150 de una deuda mayor: pasa el mínimo y abona parte
      const parte = await api.post<any>('/v1/referidos/abonar', { puntos: 12 }, c.accessToken);
      expect(parte.estado, JSON.stringify(parte.cuerpo)).toBe(200);
      expect(parte.cuerpo).toMatchObject({
        puntos: 12,
        monto: 120,
        deuda: deuda - 120,
        habilitado: false,
      });
      // 3 puntos quedan: por debajo del mínimo y no saldan la deuda
      const poco = await api.post<any>('/v1/referidos/abonar', {}, c.accessToken);
      expect(poco.cuerpo.codigo).toBe('MINIMO_ABONO');
      c.socket.cerrar();
    });

    it('sin puntos no hay abono, y un pasajero no abona', async () => {
      const { c } = await conductorConDeuda();
      const r = await api.post<any>('/v1/referidos/abonar', {}, c.accessToken);
      expect(r.cuerpo.codigo).toBe('SIN_PUNTOS');
      const p = await pasajeroNuevo();
      expect((await api.post('/v1/referidos/abonar', {}, p.token)).estado).toBe(403);
      c.socket.cerrar();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────── Operación

  describe('Operación (OPE-14)', () => {
    it('soporte consulta; solo finanzas, supervisión y administración mueven puntos', async () => {
      const a = await pasajeroNuevo();
      expect((await api.get('/v1/op/referidos/resumen', soporte)).estado).toBe(200);
      expect((await api.get('/v1/op/referidos', soporte)).estado).toBe(200);
      expect((await api.get(`/v1/op/referidos/personas/${a.id}`, soporte)).estado).toBe(200);
      const ajuste = { puntos: 100, motivo: 'Cortesía de prueba por demora' };
      expect(
        (await api.post(`/v1/op/referidos/personas/${a.id}/ajustar`, ajuste, soporte)).estado,
      ).toBe(403);
      expect((await api.get('/v1/op/referidos/resumen', monitor)).estado).toBe(403);
      expect(
        (await api.post(`/v1/op/referidos/personas/${a.id}/ajustar`, ajuste, financiero)).estado,
      ).toBe(200);
      expect(await saldoDe(a.token)).toBe(100);
    });

    it('un ajuste pide motivo, no puede ser cero ni enorme, y queda en la auditoría', async () => {
      const a = await pasajeroNuevo();
      const url = `/v1/op/referidos/personas/${a.id}/ajustar`;
      expect((await api.post(url, { puntos: 50 }, financiero)).estado).toBe(400);
      expect(
        (await api.post(url, { puntos: 0, motivo: 'Sin cambio alguno' }, financiero)).estado,
      ).toBe(400);
      expect(
        (await api.post(url, { puntos: 1_000_000, motivo: 'Demasiados puntos' }, financiero))
          .estado,
      ).toBe(400);
      expect(
        (await api.post(url, { puntos: 400, motivo: 'Cortesía por una espera larga' }, financiero))
          .estado,
      ).toBe(200);
      const r = await api.post<any>(
        url,
        { puntos: -150, motivo: 'Se dieron de más por error' },
        financiero,
      );
      expect(r.cuerpo.saldo).toBe(250);
      const aud = await q(
        sql`select accion, motivo from auditoria where entidad_id = ${a.id} and accion = 'referidos.ajustar' order by ocurrido_en`,
      );
      expect(aud.map((x) => x.motivo)).toEqual([
        'Cortesía por una espera larga',
        'Se dieron de más por error',
      ]);
      const ficha = (await api.get<any>(`/v1/op/referidos/personas/${a.id}`, soporte)).cuerpo;
      expect(ficha).toMatchObject({ saldo: 250, valorPunto: 10 });
      expect(ficha.movimientos.map((m: any) => m.puntos)).toEqual([-150, 400]);
    });

    it('rechaza un referido pendiente y ya no entrega puntos', async () => {
      const z = zona();
      const c = await conductorNuevo(z);
      const a = await pasajeroNuevo();
      const b = await pasajeroNuevo();
      await usarCodigo(b.token, await codigoDe(a.token));
      const lista = (await api.get<any>('/v1/op/referidos?estado=pendiente', soporte)).cuerpo;
      const r = lista.find((x: any) => x.invitadoId === b.id);
      expect(r).toMatchObject({ estado: 'pendiente', rol: 'pasajero', referidorId: a.id });
      expect(
        (await api.post(`/v1/op/referidos/${r.id}/rechazar`, { motivo: 'No' }, financiero)).estado,
      ).toBe(400);
      const ok = await api.post<any>(
        `/v1/op/referidos/${r.id}/rechazar`,
        { motivo: 'Cuenta creada para cobrar puntos' },
        financiero,
      );
      expect(ok.estado, JSON.stringify(ok.cuerpo)).toBe(200);
      expect(
        (
          await api.post(
            `/v1/op/referidos/${r.id}/rechazar`,
            { motivo: 'Cuenta creada para cobrar puntos' },
            financiero,
          )
        ).estado,
      ).toBe(409);
      await viaje(b, c, z);
      expect(await saldoDe(a.token)).toBe(0);
      expect(await saldoDe(b.token)).toBe(0);
      c.socket.cerrar();
    });

    it('revierte un referido que ya pagó: marca rechazado y resta los puntos que entregó', async () => {
      const z = zona();
      const c = await conductorNuevo(z);
      const a = await pasajeroNuevo();
      const b = await pasajeroNuevo();
      await usarCodigo(b.token, await codigoDe(a.token));
      await viaje(b, c, z);
      expect(await saldoDe(a.token)).toBe(500);
      const r = (await api.get<any>('/v1/op/referidos?estado=otorgado', soporte)).cuerpo.find(
        (x: any) => x.invitadoId === b.id,
      );
      const ok = await api.post<any>(
        `/v1/op/referidos/${r.id}/revertir`,
        { motivo: 'Eran la misma persona con dos celulares' },
        financiero,
      );
      expect(ok.estado, JSON.stringify(ok.cuerpo)).toBe(200);
      expect(ok.cuerpo.puntosRestados).toBe(800);
      expect(await saldoDe(a.token)).toBe(0);
      expect(await saldoDe(b.token)).toBe(0);
      expect((await q(sql`select estado::text as e from referido where id = ${r.id}`))[0].e).toBe(
        'rechazado',
      );
      // lo que no pagó no se revierte
      expect(
        (
          await api.post(
            `/v1/op/referidos/${r.id}/revertir`,
            { motivo: 'Eran la misma persona' },
            financiero,
          )
        ).estado,
      ).toBe(409);
      c.socket.cerrar();
    });

    it('el resumen junta las cifras del programa y quiénes más invitan', async () => {
      const r = (await api.get<any>('/v1/op/referidos/resumen', soporte)).cuerpo;
      expect(r).toMatchObject({ activo: true, valorPunto: 10 });
      expect(r.referidos.otorgados).toBeGreaterThan(0);
      expect(r.puntos.emitidos).toBeGreaterThan(0);
      expect(r.costo.realizado).toBeGreaterThan(0);
      expect(r.masInvitan.length).toBeGreaterThan(0);
      expect(r.masInvitan[0]).toMatchObject({
        invitados: expect.any(Number),
        puntos: expect.any(Number),
      });
      const buscar = (await api.get<any>('/v1/op/referidos?q=ZZZNOEXISTE', soporte)).cuerpo;
      expect(buscar).toEqual([]);
    });
  });
});
