import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DespachoService } from '../src/viajes/despacho.service.js';
import { ReservasService } from '../src/viajes/reservas.service.js';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

const CENTRO = { lat: 5.0689, lng: -75.5174, direccion: 'Cra 23 # 62-30, Palogrande' };
const DESTINO = { lat: 5.0548, lng: -75.4945, direccion: 'Cl 20 # 21-10, Chipre' };
const DESPUES = { lat: 5.0589, lng: -75.5174 };

describe.skipIf(!hayBase)('Reservas: viajes programados (RN-080 a RN-085)', () => {
  let api: Arnes;
  let monitor: string;
  let soporte: string;
  let admin: string;
  let contador = 0;

  beforeAll(async () => {
    api = await levantarApi();
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
    soporte = (await api.ingresarOperacion('soporte')).accessToken;
    admin = (await api.ingresarOperacion('admin')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  const q = async (consulta: ReturnType<typeof sql>) =>
    (await api.bd.db.execute(consulta)).rows as any[];
  const enMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

  async function pasajeroNuevo() {
    contador += 1;
    const s = await api.iniciarSesion(`31050${String(contador).padStart(5, '0')}`, 'pasajero');
    await api.patch('/v1/pasajero/yo', { nombre: 'Valentina Ríos' }, s.accessToken);
    const version = (await api.get('/v1/politica-datos')).cuerpo.version;
    await api.post('/v1/pasajero/terminos', { version }, s.accessToken);
    return s;
  }

  /** Reserva un viaje para dentro de `min` minutos y devuelve su id. La hora real se acomoda después con SQL. */
  async function reservar(
    p: { accessToken: string },
    min = 180,
    o: { categoria?: string; metodoPago?: 'efectivo' | 'tarjeta'; origen?: typeof CENTRO } = {},
  ) {
    const c = await api.post(
      '/v1/pasajero/cotizaciones',
      { origen: o.origen ?? CENTRO, destino: DESTINO, programadoPara: enMin(min) },
      p.accessToken,
    );
    expect(c.estado).toBe(200);
    const opcion = c.cuerpo.opciones.find((x: any) => x.categoria === (o.categoria ?? 'media'));
    const r = await api.post(
      '/v1/pasajero/viajes',
      { cotizacionId: opcion.id, metodoPago: o.metodoPago ?? 'efectivo' },
      p.accessToken,
    );
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo.id as string;
  }

  const moverA = (id: string, min: number) =>
    api.bd.db.execute(
      sql`update viaje set programado_para = now() + make_interval(mins => ${min}) where id = ${id}`,
    );

  describe('cotizar y reservar (PAS-27)', () => {
    it('exige entre 45 minutos y 7 días de anticipación', async () => {
      const p = await pasajeroNuevo();
      const pedir = (programadoPara: string) =>
        api.post(
          '/v1/pasajero/cotizaciones',
          { origen: CENTRO, destino: DESTINO, programadoPara },
          p.accessToken,
        );
      const pronto = await pedir(enMin(30));
      expect(pronto.estado).toBe(400);
      expect(pronto.cuerpo.codigo).toBe('RESERVA_MUY_PRONTO');
      const lejos = await pedir(enMin(8 * 24 * 60));
      expect(lejos.cuerpo.codigo).toBe('RESERVA_MUY_LEJOS');
      const bien = await pedir(enMin(180));
      expect(bien.estado).toBe(200);
      expect(bien.cuerpo.programadoPara).toBeTruthy();
    });

    it('se cotiza con los recargos de la hora del servicio, sin dinámica ni conductores cerca', async () => {
      const p = await pasajeroNuevo();
      const manana = new Date(Date.now() + 36 * 3_600_000).toLocaleDateString('en-CA', {
        timeZone: 'America/Bogota',
      });
      const a = async (hora: string) =>
        (
          await api.post(
            '/v1/pasajero/cotizaciones',
            { origen: CENTRO, destino: DESTINO, programadoPara: `${manana}T${hora}-05:00` },
            p.accessToken,
          )
        ).cuerpo;
      const noche = await a('02:00:00');
      const dia = await a('14:00:00');
      const precio = (c: any) => c.opciones.find((x: any) => x.categoria === 'media').precio.max;
      expect(precio(noche)).toBeGreaterThan(precio(dia)); // el recargo nocturno aplica a la hora del servicio
      expect(dia.opciones[0]).toMatchObject({
        dinamica: null,
        conductoresCerca: 0,
        etaRecogidaS: null,
      });
    });

    it('la reserva queda «programada»: no busca conductor y no es el viaje actual', async () => {
      const p = await pasajeroNuevo();
      const id = await reservar(p);
      const v = (await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo;
      expect(v).toMatchObject({
        estado: 'programado',
        reserva: { estado: 'sin_conductor', conductorConfirmado: false },
      });
      expect(v.programadoPara).toBeTruthy();
      expect((await api.get('/v1/pasajero/viaje-actual', p.accessToken)).cuerpo.viaje).toBeNull();
      const lista = (await api.get('/v1/pasajero/reservas', p.accessToken)).cuerpo.reservas;
      expect(lista).toHaveLength(1);
      expect(await q(sql`select count(*)::int as n from oferta where viaje_id = ${id}`)).toEqual([
        { n: 0 },
      ]);
    });

    it('permite reservar aunque haya un viaje en curso, pero no dos reservas a la misma hora ni más de cinco', async () => {
      const p = await pasajeroNuevo();
      await reservar(p, 180);
      const c = await api.post(
        '/v1/pasajero/cotizaciones',
        { origen: CENTRO, destino: DESTINO, programadoPara: enMin(200) },
        p.accessToken,
      );
      const pisa = await api.post(
        '/v1/pasajero/viajes',
        { cotizacionId: c.cuerpo.opciones[0].id, metodoPago: 'efectivo' },
        p.accessToken,
      );
      expect(pisa.estado).toBe(409);
      expect(pisa.cuerpo.codigo).toBe('RESERVA_SE_PISA');
      for (const min of [400, 600, 800, 1000]) await reservar(p, min);
      const sexta = await api.post(
        '/v1/pasajero/cotizaciones',
        { origen: CENTRO, destino: DESTINO, programadoPara: enMin(1400) },
        p.accessToken,
      );
      const r = await api.post(
        '/v1/pasajero/viajes',
        { cotizacionId: sexta.cuerpo.opciones[0].id, metodoPago: 'efectivo' },
        p.accessToken,
      );
      expect(r.cuerpo.codigo).toBe('DEMASIADAS_RESERVAS');
    });
  });

  describe('tablero del conductor (CON-30)', () => {
    it('ve las reservas de las próximas 24 horas que su vehículo atiende, y no las demás', async () => {
      const c = await api.crearConductorHabilitado('3001960001');
      const p = await pasajeroNuevo();
      const cerca = await reservar(p, 300);
      const lejos = await reservar(p, 3000);
      const alta = await reservar(p, 600, { categoria: 'alta' });
      const { disponibles } = (await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo;
      const ids = disponibles.map((d: any) => d.id);
      expect(ids).toContain(cerca);
      expect(ids).not.toContain(lejos); // faltan más de 24 h
      expect(ids).not.toContain(alta); // su vehículo es Media
      const carta = disponibles.find((d: any) => d.id === cerca);
      expect(carta.destino.zona).toBe('Chipre'); // solo la zona del destino, no la dirección (D-11)
      expect(JSON.stringify(carta)).not.toContain('Cl 20 # 21-10');
      expect(carta.gananciaEstimada).toBeGreaterThan(0);
    });

    it('un conductor no habilitado ve el tablero vacío', async () => {
      const c = await api.crearConductorHabilitado('3001960002', { sinAprobar: true });
      const p = await pasajeroNuevo();
      await reservar(p, 300);
      expect((await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.disponibles).toEqual(
        [],
      );
    });

    it('si dos conductores toman la misma reserva a la vez, solo uno se la queda', async () => {
      const a = await api.crearConductorHabilitado('3001960003');
      const b = await api.crearConductorHabilitado('3001960004');
      const p = await pasajeroNuevo();
      const id = await reservar(p, 300);
      const [ra, rb] = await Promise.all([
        api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, a.accessToken),
        api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, b.accessToken),
      ]);
      expect([ra.estado, rb.estado].sort()).toEqual([200, 409]);
      const perdedor = ra.estado === 409 ? ra : rb;
      expect(perdedor.cuerpo.codigo).toBe('RESERVA_TOMADA');
      // desaparece del tablero del otro
      const otro = ra.estado === 409 ? a : b;
      expect(
        (await api.get('/v1/conductor/reservas', otro.accessToken)).cuerpo.disponibles.map(
          (d: any) => d.id,
        ),
      ).not.toContain(id);
    });

    it('tomar y confirmar: el pasajero ve a su conductor solo cuando la confirma', async () => {
      const c = await api.crearConductorHabilitado('3001960005');
      const p = await pasajeroNuevo();
      const id = await reservar(p, 300);
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      let mias = (await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.mias;
      expect(mias[0]).toMatchObject({ id, estado: 'tomada', puedeSoltar: true });
      expect(mias[0].confirmarAntesDe).toBeTruthy();
      let v = (await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo;
      expect(v.reserva).toMatchObject({ estado: 'tomada', conductorConfirmado: false });
      expect(v.conductor).toBeNull();

      await api.post(`/v1/conductor/reservas/${id}/confirmar`, undefined, c.accessToken);
      mias = (await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.mias;
      expect(mias[0]).toMatchObject({ estado: 'confirmada', confirmarAntesDe: null });
      v = (await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo;
      expect(v.reserva).toMatchObject({ estado: 'confirmada', conductorConfirmado: true });
      expect(v.conductor.vehiculo.placa).toBeTruthy();
      const eventos = await q(
        sql`select tipo from viaje_evento where viaje_id = ${id} order by ocurrido_en`,
      );
      expect(eventos.map((e) => e.tipo)).toEqual([
        'solicitado',
        'reserva_tomada',
        'reserva_confirmada',
      ]);
    });

    it('una reserva tomada dentro de la última hora se confirma al tomarla', async () => {
      const c = await api.crearConductorHabilitado('3001960006');
      const p = await pasajeroNuevo();
      const id = await reservar(p, 300);
      await moverA(id, 50);
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      expect((await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.mias[0].estado).toBe(
        'confirmada',
      );
    });

    it('no puede tomar dos reservas con menos de hora y media de diferencia', async () => {
      const c = await api.crearConductorHabilitado('3001960007');
      const p1 = await pasajeroNuevo();
      const p2 = await pasajeroNuevo();
      const a = await reservar(p1, 300);
      const b = await reservar(p2, 340);
      await api.post(`/v1/conductor/reservas/${a}/tomar`, undefined, c.accessToken);
      const r = await api.post(`/v1/conductor/reservas/${b}/tomar`, undefined, c.accessToken);
      expect(r.estado).toBe(409);
      expect(r.cuerpo.codigo).toBe('RESERVA_SE_PISA');
      // y la que se pisa ya ni aparece en su tablero
      expect(
        (await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.disponibles.map(
          (d: any) => d.id,
        ),
      ).not.toContain(b);
    });

    it('puede soltarla hasta dos horas antes; después, solo con soporte', async () => {
      const c = await api.crearConductorHabilitado('3001960008');
      const p = await pasajeroNuevo();
      const id = await reservar(p, 400);
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      expect(
        (await api.post(`/v1/conductor/reservas/${id}/soltar`, undefined, c.accessToken)).estado,
      ).toBe(200);
      expect(
        (await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.disponibles.map(
          (d: any) => d.id,
        ),
      ).toContain(id);

      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      await moverA(id, 90);
      const tarde = await api.post(`/v1/conductor/reservas/${id}/soltar`, undefined, c.accessToken);
      expect(tarde.estado).toBe(409);
      expect(tarde.cuerpo.codigo).toBe('SOLTAR_CON_SOPORTE');
    });
  });

  describe('trabajo periódico: liberar, activar y alertar', () => {
    const mantener = () => api.servicio(ReservasService).mantener();

    it('las reservas que nadie confirmó a tiempo vuelven al tablero', async () => {
      const c = await api.crearConductorHabilitado('3001960010');
      const p = await pasajeroNuevo();
      const id = await reservar(p, 400);
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      await moverA(id, 55); // ya pasó la hora límite de confirmación (60 min antes)
      await api.bd.db.execute(sql`update viaje set reserva_confirmada_en = null where id = ${id}`);
      const r = await mantener();
      expect(r.liberadas).toBeGreaterThanOrEqual(1);
      expect(await q(sql`select reserva_conductor_id from viaje where id = ${id}`)).toEqual([
        { reserva_conductor_id: null },
      ]);
      const tipos = await q(
        sql`select tipo from viaje_evento where viaje_id = ${id} order by ocurrido_en`,
      );
      expect(tipos.map((t) => t.tipo)).toContain('reserva_liberada');
    });

    it('a la hora del despacho una reserva sin conductor pasa a buscar y se le ofrece a quien está cerca', async () => {
      const c = await api.conductorEnLinea('3001960011', DESPUES);
      const p = await pasajeroNuevo();
      const id = await reservar(p, 400);
      await moverA(id, 25);
      const r = await mantener();
      expect(r.activadas).toBeGreaterThanOrEqual(1);
      const oferta = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === id);
      expect(oferta.recogida.direccion).toBe(CENTRO.direccion);
      const v = (await q(sql`select estado, busqueda_desde from viaje where id = ${id}`))[0];
      expect(v.estado).toBe('buscando_conductor');
      expect(v.busqueda_desde).not.toBeNull();
      const aceptada = await api.post(
        `/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`,
        undefined,
        c.accessToken,
      );
      expect(aceptada.estado).toBe(200);
      expect((await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo.estado).toBe(
        'asignado',
      );
      c.socket.cerrar();
    });

    it('el conductor que confirmó la reserva se asigna solo, sin oferta, y completa el viaje con precio normal', async () => {
      const c = await api.conductorEnLinea('3001960012', DESPUES);
      const p = await pasajeroNuevo();
      const id = await reservar(p, 400);
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      await api.post(`/v1/conductor/reservas/${id}/confirmar`, undefined, c.accessToken);
      await moverA(id, 28);
      await mantener();
      await c.socket.esperar(
        'viaje:estado',
        (d: any) => d.viajeId === id && d.estado === 'asignado',
      );
      expect(await q(sql`select conductor_id from viaje where id = ${id}`)).toEqual([
        { conductor_id: c.usuarioId },
      ]);
      const eventos = await q(
        sql`select tipo, actor_tipo from viaje_evento where viaje_id = ${id} order by ocurrido_en`,
      );
      expect(eventos.map((e) => e.tipo)).toEqual([
        'solicitado',
        'reserva_tomada',
        'reserva_confirmada',
        'reserva_activada',
        'asignado',
      ]);
      expect(eventos.at(-1)!.actor_tipo).toBe('sistema');

      // el viaje sigue como cualquier otro
      const detalle = (await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo;
      expect(detalle.estado).toBe('asignado');
      await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ lat: CENTRO.lat + 0.0003, lng: CENTRO.lng, t: Date.now(), precisionM: 5 }] },
        c.accessToken,
      );
      await api.post(`/v1/conductor/viajes/${id}/llegue`, {}, c.accessToken);
      await api.post(`/v1/conductor/viajes/${id}/iniciar`, { pin: detalle.pin }, c.accessToken);
      const fin = await api.post(
        `/v1/conductor/viajes/${id}/finalizar`,
        { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
        c.accessToken,
      );
      expect(fin.estado).toBe(200);
      expect(fin.cuerpo.precioFinal).toBeGreaterThan(0);
      expect(fin.cuerpo.comision).toBeGreaterThan(0);
      c.socket.cerrar();
    });

    it('si el conductor de la reserva no está disponible, se sigue buscando sin darla por perdida y se asigna cuando se conecte', async () => {
      const c = await api.crearConductorHabilitado('3001960013'); // desconectado
      const p = await pasajeroNuevo();
      const id = await reservar(p, 400);
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      await api.post(`/v1/conductor/reservas/${id}/confirmar`, undefined, c.accessToken);
      await moverA(id, 28);
      await mantener();
      await new Promise((r) => setTimeout(r, 400));
      expect((await q(sql`select estado from viaje where id = ${id}`))[0].estado).toBe(
        'buscando_conductor',
      );
      await api.post('/v1/conductor/conectar', DESPUES, c.accessToken);
      await api.servicio(DespachoService).intentar(id);
      expect(
        (await q(sql`select estado, conductor_id from viaje where id = ${id}`))[0],
      ).toMatchObject({
        estado: 'asignado',
        conductor_id: c.usuarioId,
      });
    });

    it('una reserva no se da por «sin conductor» a los 2 minutos: se busca hasta un rato después de su hora', async () => {
      const p = await pasajeroNuevo();
      const id = await reservar(p, 400);
      await moverA(id, 12);
      await mantener();
      // lleva 10 minutos buscando, más que el presupuesto de un viaje inmediato
      await api.bd.db.execute(
        sql`update viaje set busqueda_desde = now() - interval '10 minutes' where id = ${id}`,
      );
      await api.servicio(DespachoService).intentar(id);
      expect((await q(sql`select estado from viaje where id = ${id}`))[0].estado).toBe(
        'buscando_conductor',
      );
      // pero después de su hora más la espera extra, sí
      await moverA(id, -20);
      await api.servicio(DespachoService).intentar(id);
      expect((await q(sql`select estado from viaje where id = ${id}`))[0].estado).toBe(
        'sin_conductor',
      );
    });

    it('quien tiene una reserva confirmada próxima no recibe otras ofertas', async () => {
      const c = await api.conductorEnLinea('3001960014', DESPUES);
      const p1 = await pasajeroNuevo();
      const reserva = await reservar(p1, 400);
      await api.post(`/v1/conductor/reservas/${reserva}/tomar`, undefined, c.accessToken);
      await api.post(`/v1/conductor/reservas/${reserva}/confirmar`, undefined, c.accessToken);
      await moverA(reserva, 40); // empieza dentro de 45 minutos
      const disp = await api
        .servicio(DespachoService)
        .disponibilidad(
          (await q(sql`select id from ciudad limit 1`))[0].id,
          CENTRO,
          'media',
          'inmediato',
        );
      expect(disp.conductores).toBe(0);
      await moverA(reserva, 120);
      const libre = await api
        .servicio(DespachoService)
        .disponibilidad(
          (await q(sql`select id from ciudad limit 1`))[0].id,
          CENTRO,
          'media',
          'inmediato',
        );
      expect(libre.conductores).toBeGreaterThanOrEqual(1);
      c.socket.cerrar();
    });

    it('si a 15 minutos sigue sin conductor se avisa a la operación, una sola vez', async () => {
      const p = await pasajeroNuevo();
      const id = await reservar(p, 400);
      await moverA(id, 10);
      const r1 = await mantener();
      expect(r1.alertas).toBeGreaterThanOrEqual(1);
      await mantener();
      const alertas = await q(
        sql`select tipo, severidad, datos from alerta where viaje_id = ${id}`,
      );
      expect(alertas).toHaveLength(1);
      expect(alertas[0]).toMatchObject({ tipo: 'reserva_sin_conductor', severidad: 'alta' });
    });
  });

  describe('cancelar una reserva (RN-084)', () => {
    it('es gratis con más de una hora de anticipación', async () => {
      const p = await pasajeroNuevo();
      const id = await reservar(p, 300);
      const antes = (await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo;
      expect(antes.cancelacion).toMatchObject({ costo: 0, gratis: true });
      const r = await api.post(`/v1/pasajero/viajes/${id}/cancelar`, {}, p.accessToken);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.costo).toBe(0);
      expect(
        (await q(sql`select estado, estado_pago from viaje where id = ${id}`))[0],
      ).toMatchObject({
        estado: 'cancelado',
        estado_pago: 'no_aplica',
      });
    });

    it('con menos de una hora cuesta la tarifa de cancelación y, en efectivo, queda como deuda', async () => {
      const p = await pasajeroNuevo();
      const id = await reservar(p, 300);
      await moverA(id, 45);
      const antes = (await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo;
      expect(antes.cancelacion.gratis).toBe(false);
      const r = await api.post(`/v1/pasajero/viajes/${id}/cancelar`, {}, p.accessToken);
      expect(r.cuerpo.costo).toBe(antes.cancelacion.costo);
      expect(r.cuerpo.costo).toBeGreaterThan(0);
      expect((await api.get('/v1/pasajero/yo', p.accessToken)).cuerpo.deuda).toBe(r.cuerpo.costo);
      // sin conductor confirmado, no hay movimiento en ningún libro de conductor
      expect(
        await q(sql`select count(*)::int as n from movimiento_saldo where viaje_id = ${id}`),
      ).toEqual([{ n: 0 }]);
    });

    it('si ya tenía conductor confirmado, la tarifa de cancelación es suya (menos la comisión)', async () => {
      const c = await api.crearConductorHabilitado('3001960020');
      const p = await pasajeroNuevo();
      const id = await reservar(p, 300);
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      await api.post(`/v1/conductor/reservas/${id}/confirmar`, undefined, c.accessToken);
      await moverA(id, 40);
      const r = await api.post(`/v1/pasajero/viajes/${id}/cancelar`, {}, p.accessToken);
      expect(r.cuerpo.costo).toBeGreaterThan(0);
      const mov = await q(sql`select tipo, monto from movimiento_saldo where viaje_id = ${id}`);
      expect(mov).toHaveLength(1);
      expect(mov[0].tipo).toBe('cancelacion');
      expect(Number(mov[0].monto)).toBeGreaterThan(0);
      expect(Number(mov[0].monto)).toBeLessThan(r.cuerpo.costo);
      // y la reserva desaparece del tablero y de «mis reservas» del conductor
      expect((await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.mias).toEqual([]);
    });
  });

  describe('operación (OPE-09)', () => {
    it('lista las reservas por hora con su estado y marca las que están en riesgo', async () => {
      const p = await pasajeroNuevo();
      const id = await reservar(p, 500);
      const normal = (await api.get('/v1/op/reservas', monitor)).cuerpo;
      const fila = normal.items.find((r: any) => r.id === id);
      expect(fila).toMatchObject({
        estadoReserva: 'sin_conductor',
        enRiesgo: false,
        categoria: 'media',
      });
      expect(fila.despachoEn).toBeTruthy();
      expect(normal.resumen.sinConductor).toBeGreaterThanOrEqual(1);

      await moverA(id, 20);
      const riesgo = (await api.get('/v1/op/reservas', monitor)).cuerpo;
      expect(riesgo.items.find((r: any) => r.id === id).enRiesgo).toBe(true);
      expect(riesgo.resumen.enRiesgo).toBeGreaterThanOrEqual(1);
      expect(
        (await api.get('/v1/op/reservas?estado=confirmada', monitor)).cuerpo.items.every(
          (r: any) => r.estadoReserva === 'confirmada',
        ),
      ).toBe(true);
      expect((await api.get('/v1/op/reservas')).estado).toBe(401);
    });

    it('asigna y libera un conductor a mano; solo quien puede despachar', async () => {
      const c = await api.crearConductorHabilitado('3001960030');
      const p = await pasajeroNuevo();
      const id = await reservar(p, 500);
      expect(
        (
          await api.post(
            `/v1/op/reservas/${id}/asignar`,
            { conductorId: c.usuarioId, motivo: 'Cliente frecuente' },
            soporte,
          )
        ).estado,
      ).toBe(403);

      const candidatos = (await api.get(`/v1/op/reservas/${id}/conductores`, monitor)).cuerpo;
      expect(candidatos.map((x: any) => x.id)).toContain(c.usuarioId);

      const r = await api.post(
        `/v1/op/reservas/${id}/asignar`,
        { conductorId: c.usuarioId, motivo: 'Cliente frecuente' },
        monitor,
      );
      expect(r.estado).toBe(200);
      expect(
        (await api.get(`/v1/pasajero/viajes/${id}`, p.accessToken)).cuerpo.reserva,
      ).toMatchObject({ estado: 'confirmada' });
      expect((await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.mias[0]).toMatchObject(
        { id, estado: 'confirmada' },
      );
      const aud = await q(
        sql`select accion, motivo from auditoria where entidad_id = ${id} order by ocurrido_en`,
      );
      expect(aud.map((a) => a.accion)).toEqual(['reserva.asignar']);

      // ya tiene conductor: el candidato ya no choca consigo mismo, pero otra reserva cercana sí
      const p2 = await pasajeroNuevo();
      const otra = await reservar(p2, 530);
      const pisa = await api.post(
        `/v1/op/reservas/${otra}/asignar`,
        { conductorId: c.usuarioId, motivo: 'Otra reserva' },
        monitor,
      );
      expect(pisa.estado).toBe(409);
      expect(pisa.cuerpo.codigo).toBe('RESERVA_SE_PISA');

      const libre = await api.post(
        `/v1/op/reservas/${id}/liberar`,
        { motivo: 'El conductor avisó que no puede' },
        monitor,
      );
      expect(libre.estado).toBe(200);
      expect((await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.mias).toEqual([]);
      expect(
        (
          await api.post(
            `/v1/op/reservas/${id}/liberar`,
            { motivo: 'Otra vez sin conductor' },
            monitor,
          )
        ).estado,
      ).toBe(409);
    });

    it('una reserva que ya está buscando conductor se despacha desde Viajes, no desde aquí', async () => {
      const c = await api.crearConductorHabilitado('3001960031');
      const p = await pasajeroNuevo();
      const id = await reservar(p, 500);
      await moverA(id, 25);
      await api.servicio(ReservasService).mantener();
      const r = await api.post(
        `/v1/op/reservas/${id}/asignar`,
        { conductorId: c.usuarioId, motivo: 'Probando el estado' },
        monitor,
      );
      expect(r.estado).toBe(409);
      expect(r.cuerpo.detail).toContain('Viajes');
    });

    it('la operación puede cancelar una reserva programada', async () => {
      const c = await api.crearConductorHabilitado('3001960032');
      const p = await pasajeroNuevo();
      const id = await reservar(p, 500);
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      const r = await api.post(
        `/v1/op/viajes/${id}/cancelar`,
        { motivo: 'El pasajero llamó para cancelar' },
        monitor,
      );
      expect(r.estado).toBeLessThan(300);
      expect((await q(sql`select estado from viaje where id = ${id}`))[0].estado).toBe('cancelado');
    });
  });

  describe('plazos configurables', () => {
    it('Operación puede cambiar los plazos, pero deben ir en orden: confirmar, despachar, avisar', async () => {
      const cambiar = (clave: string, valor: number) =>
        api.put(
          `/v1/op/parametros/${clave}`,
          { valor, motivo: 'Probar los plazos de las reservas' },
          admin,
        );
      expect((await cambiar('reservas.alerta_min', 40)).estado).toBe(400); // no puede pasar al despacho (30)
      expect((await cambiar('reservas.despacho_min', 10)).estado).toBe(400); // quedaría por debajo de la alerta (15)
      expect((await cambiar('reservas.confirmar_min', 20)).estado).toBe(400); // por debajo del despacho
      expect((await cambiar('reservas.confirmar_min', 90)).estado).toBe(200);
      const p = await pasajeroNuevo();
      const id = await reservar(p, 300);
      await moverA(id, 80); // con 90 min de plazo, ya pasó la hora de confirmar
      const c = await api.crearConductorHabilitado('3001960040');
      await api.post(`/v1/conductor/reservas/${id}/tomar`, undefined, c.accessToken);
      expect((await api.get('/v1/conductor/reservas', c.accessToken)).cuerpo.mias[0].estado).toBe(
        'confirmada',
      );
      await api.delete(
        '/v1/op/parametros/reservas.confirmar_min',
        { motivo: 'Volver al valor por defecto' },
        admin,
      );
    });
  });
});
