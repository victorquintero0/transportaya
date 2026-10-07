import { alerta, ajusteSaldo, conductor, reembolso, viaje, viajeEvento } from '@transportaya/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Arnes, type ConductorEnLinea, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('Torre de control y viajes (OPE-01, OPE-02)', () => {
  let api: Arnes;
  let monitor: string;
  let soporte: string;
  let supervisor: string;
  beforeAll(async () => {
    api = await levantarApi(
      {},
      { despacho: { ofertaMs: 6000, reintentoMs: 200, presupuestoMs: 300_000 } },
    );
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
    soporte = (await api.ingresarOperacion('soporte')).accessToken;
    supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  /** Dos conductores en línea en la misma zona y un viaje pedido por un pasajero simulado. */
  async function escena(tel: string) {
    const zona = api.nuevaZona();
    const a = await api.conductorEnLinea(tel + '1', zona);
    const b = await api.conductorEnLinea(tel + '2', zona);
    const creado = await api.post('/v1/dev/pasajeros/viaje', {}, a.accessToken);
    expect(creado.estado).toBe(201);
    return { a, b, viajeId: creado.cuerpo.viajeId as string, pin: creado.cuerpo.pin as string };
  }
  const estadoDe = async (id: string) =>
    (await api.bd.db.select().from(viaje).where(eq(viaje.id, id)))[0]!;
  const quien = (cs: ConductorEnLinea[], id: string | null) => cs.find((c) => c.usuarioId === id);

  it('la torre muestra flota, viajes activos con semáforo, sin asignar y KPIs', async () => {
    const { a, viajeId } = await escena('300710001');
    const r = await api.get('/v1/op/torre', monitor);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.kpis.conductoresEnLinea).toBeGreaterThanOrEqual(2);
    expect(r.cuerpo.kpis.solicitudesUltimaHora).toBeGreaterThanOrEqual(1);
    const v = r.cuerpo.viajesActivos.find((x: any) => x.id === viajeId);
    expect(v).toMatchObject({ estado: 'buscando_conductor', semaforo: 'verde' });
    expect(r.cuerpo.sinAsignar.some((x: any) => x.id === viajeId)).toBe(true);
    const f = r.cuerpo.flota.find((x: any) => x.id === a.usuarioId);
    expect(f.posicion).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
    await api.post(`/v1/op/viajes/${viajeId}/cancelar`, { motivo: 'Fin de la prueba' }, supervisor);
  });

  it('el semáforo pasa a ámbar y rojo según los parámetros', async () => {
    const { viajeId } = await escena('300710011');
    await api.bd.db
      .update(viaje)
      .set({ solicitadoEn: new Date(Date.now() - 60_000) })
      .where(eq(viaje.id, viajeId));
    const ambar = (await api.get('/v1/op/torre', monitor)).cuerpo.viajesActivos.find(
      (x: any) => x.id === viajeId,
    );
    expect(ambar.semaforo).toBe('ambar');
    await api.bd.db
      .update(viaje)
      .set({ solicitadoEn: new Date(Date.now() - 100_000) })
      .where(eq(viaje.id, viajeId));
    const rojo = (await api.get('/v1/op/torre', monitor)).cuerpo.viajesActivos.find(
      (x: any) => x.id === viajeId,
    );
    expect(rojo.semaforo).toBe('rojo');
    await api.post(`/v1/op/viajes/${viajeId}/cancelar`, { motivo: 'Fin de la prueba' }, supervisor);
  });

  it('despacho manual: asigna al conductor elegido, retira la oferta y queda en la línea de tiempo', async () => {
    const { a, b, viajeId } = await escena('300710021');
    // soporte no despacha
    expect(
      (await api.post(`/v1/op/viajes/${viajeId}/despachar`, { conductorId: b.usuarioId }, soporte))
        .estado,
    ).toBe(403);

    const r = await api.post(
      `/v1/op/viajes/${viajeId}/despachar`,
      { conductorId: b.usuarioId },
      monitor,
    );
    expect(r.estado).toBe(204);
    const v = await estadoDe(viajeId);
    expect(v).toMatchObject({ estado: 'asignado', conductorId: b.usuarioId });
    await b.socket.esperar(
      'viaje:estado',
      (d: any) => d.viajeId === viajeId && d.estado === 'asignado',
    );
    // el otro conductor queda libre y sin oferta
    const [fa] = await api.bd.db
      .select()
      .from(conductor)
      .where(eq(conductor.usuarioId, a.usuarioId));
    expect(fa!.estadoOperativo).toBe('disponible');

    const d = (await api.get(`/v1/op/viajes/${viajeId}`, monitor)).cuerpo;
    expect(d.viaje.estado).toBe('asignado');
    expect(d.conductor.id).toBe(b.usuarioId);
    expect(d.eventos.find((e: any) => e.tipo === 'asignado')).toMatchObject({
      actorTipo: 'operacion',
    });
    expect(d.acciones).toMatchObject({ despachar: false, reasignar: true, cancelar: true });
    expect(d.ofertas.length).toBeGreaterThanOrEqual(1);

    // ya asignado: no se puede despachar de nuevo
    const otra = await api.post(
      `/v1/op/viajes/${viajeId}/despachar`,
      { conductorId: a.usuarioId },
      monitor,
    );
    expect(otra.estado).toBe(409);
    expect(otra.cuerpo.codigo).toBe('ESTADO_INVALIDO');

    await api.post(`/v1/op/viajes/${viajeId}/cancelar`, { motivo: 'Fin de la prueba' }, supervisor);
  });

  it('no despacha a un conductor ocupado', async () => {
    const { a, b, viajeId } = await escena('300710031');
    await api.post(`/v1/op/viajes/${viajeId}/despachar`, { conductorId: b.usuarioId }, monitor);
    const segundo = await api.post('/v1/dev/pasajeros/viaje', {}, a.accessToken);
    const r = await api.post(
      `/v1/op/viajes/${segundo.cuerpo.viajeId}/despachar`,
      { conductorId: b.usuarioId },
      monitor,
    );
    expect(r.estado).toBe(409);
    expect(r.cuerpo.codigo).toBe('CONDUCTOR_NO_DISPONIBLE');
    for (const id of [viajeId, segundo.cuerpo.viajeId])
      await api.post(`/v1/op/viajes/${id}/cancelar`, { motivo: 'Fin de la prueba' }, supervisor);
  });

  it('reasigna a otro conductor y libera al anterior', async () => {
    const { a, b, viajeId } = await escena('300710041');
    await api.post(`/v1/op/viajes/${viajeId}/despachar`, { conductorId: b.usuarioId }, monitor);
    const sinMotivo = await api.post(
      `/v1/op/viajes/${viajeId}/reasignar`,
      { conductorId: a.usuarioId, motivo: 'x' },
      monitor,
    );
    expect(sinMotivo.estado).toBe(400);
    const r = await api.post(
      `/v1/op/viajes/${viajeId}/reasignar`,
      { conductorId: a.usuarioId, motivo: 'El conductor reportó un problema con el vehículo' },
      monitor,
    );
    expect(r.estado).toBe(204);
    expect(await estadoDe(viajeId)).toMatchObject({ estado: 'asignado', conductorId: a.usuarioId });
    const [fb] = await api.bd.db
      .select()
      .from(conductor)
      .where(eq(conductor.usuarioId, b.usuarioId));
    expect(fb!.estadoOperativo).toBe('disponible');
    const tipos = (
      await api.bd.db.select().from(viajeEvento).where(eq(viajeEvento.viajeId, viajeId))
    ).map((e) => e.tipo);
    expect(tipos).toContain('reasignado_por_operacion');
    await api.post(`/v1/op/viajes/${viajeId}/cancelar`, { motivo: 'Fin de la prueba' }, supervisor);
  });

  it('cancela un viaje con motivo, libera al conductor y avisa a ambos', async () => {
    const { a, b, viajeId } = await escena('300710051');
    await api.post(`/v1/op/viajes/${viajeId}/despachar`, { conductorId: b.usuarioId }, monitor);
    expect(
      (await api.post(`/v1/op/viajes/${viajeId}/cancelar`, { motivo: 'no' }, monitor)).estado,
    ).toBe(400);
    const r = await api.post(
      `/v1/op/viajes/${viajeId}/cancelar`,
      { motivo: 'El pasajero llamó para cancelar' },
      monitor,
    );
    expect(r.estado).toBe(204);
    expect(await estadoDe(viajeId)).toMatchObject({
      estado: 'cancelado',
      canceladoPor: 'operacion',
      motivoCancelacion: 'El pasajero llamó para cancelar',
    });
    const aviso = await b.socket.esperar('viaje:estado', (d: any) => d.estado === 'cancelado');
    expect(aviso.canceladoPor).toBe('operacion');
    const [fb] = await api.bd.db
      .select()
      .from(conductor)
      .where(eq(conductor.usuarioId, b.usuarioId));
    expect(fb!.estadoOperativo).toBe('disponible');
    expect(quien([a, b], b.usuarioId)).toBeTruthy();
    // ya cancelado: no se puede cancelar otra vez
    expect(
      (
        await api.post(
          `/v1/op/viajes/${viajeId}/cancelar`,
          { motivo: 'Otra vez por error' },
          monitor,
        )
      ).estado,
    ).toBe(409);
    const auditoria = await api.get(
      `/v1/op/auditoria?entidad=viaje&entidadId=${viajeId}`,
      supervisor,
    );
    expect(auditoria.cuerpo.items.map((i: any) => i.accion)).toContain('viaje.cancelar');
  });

  it('búsqueda de viajes por código, conductor, placa y estado', async () => {
    const c = await api.conductorEnLinea('3007100611', api.nuevaZona());
    const hecho = await api.completarViaje(c, { metodoPago: 'efectivo' });
    const [fila] = await api.bd.db.select().from(viaje).where(eq(viaje.id, hecho.viajeId));
    const porCodigo = await api.get(`/v1/op/viajes?q=${fila!.codigo}`, soporte);
    expect(porCodigo.cuerpo.items).toHaveLength(1);
    expect(porCodigo.cuerpo.items[0]).toMatchObject({ id: hecho.viajeId, estado: 'finalizado' });
    const finalizados = await api.get('/v1/op/viajes?estado=finalizado&limite=5', soporte);
    expect(finalizados.cuerpo.total).toBeGreaterThanOrEqual(1);
    expect((await api.get('/v1/op/viajes?q=zzzz-no-existe', soporte)).cuerpo.items).toHaveLength(0);
    const recorrido = await api.get(`/v1/op/viajes/${hecho.viajeId}/recorrido`, soporte);
    expect(recorrido.estado).toBe(200);
    expect(Array.isArray(recorrido.cuerpo)).toBe(true);
  });

  it('ajustar el precio: solo supervisión, recalcula la comisión y deja el ajuste de saldo pendiente', async () => {
    const c = await api.conductorEnLinea('3007100711', api.nuevaZona());
    const hecho = await api.completarViaje(c, { metodoPago: 'efectivo' });
    const url = `/v1/op/viajes/${hecho.viajeId}/ajustar-precio`;
    expect(
      (await api.post(url, { precioFinal: 8000, motivo: 'Descuento por demora' }, monitor)).estado,
    ).toBe(403);
    expect((await api.post(url, { precioFinal: 8000, motivo: 'corto' }, supervisor)).estado).toBe(
      400,
    );
    expect(
      (
        await api.post(
          url,
          { precioFinal: hecho.precioFinal, motivo: 'Sin cambio real' },
          supervisor,
        )
      ).estado,
    ).toBe(400);

    const r = await api.post(
      url,
      { precioFinal: hecho.precioFinal + 5000, motivo: 'El peaje no quedó incluido' },
      supervisor,
    );
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({
      precioAnterior: hecho.precioFinal,
      precioFinal: hecho.precioFinal + 5000,
    });
    expect(r.cuerpo.comision).toBeGreaterThan(hecho.comision);
    // efectivo: la comisión subió, el conductor debe un poco más (ajuste negativo pendiente)
    expect(r.cuerpo.diferenciaConductor).toBeLessThan(0);
    const [aj] = await api.bd.db
      .select()
      .from(ajusteSaldo)
      .where(eq(ajusteSaldo.id, r.cuerpo.ajusteSaldoId));
    expect(aj).toMatchObject({
      estado: 'pendiente',
      conductorId: c.usuarioId,
      monto: r.cuerpo.diferenciaConductor,
    });
    const [v] = await api.bd.db.select().from(viaje).where(eq(viaje.id, hecho.viajeId));
    expect(v!.precioFinal).toBe(hecho.precioFinal + 5000);
    expect(v!.comision).toBe(r.cuerpo.comision);
  });

  it('una tarjeta ya cobrada solo puede bajar y genera reembolso', async () => {
    const c = await api.conductorEnLinea('3007100811', api.nuevaZona());
    const hecho = await api.completarViaje(c, { metodoPago: 'tarjeta' });
    const url = `/v1/op/viajes/${hecho.viajeId}/ajustar-precio`;
    const sube = await api.post(
      url,
      { precioFinal: hecho.precioFinal + 2000, motivo: 'Intento de cobrar más' },
      supervisor,
    );
    expect(sube.estado).toBe(409);
    expect(sube.cuerpo.codigo).toBe('NO_SE_PUEDE_COBRAR_MAS');
    const baja = await api.post(
      url,
      { precioFinal: hecho.precioFinal - 1500, motivo: 'Error en el taxímetro' },
      supervisor,
    );
    expect(baja.estado).toBe(200);
    const [r] = await api.bd.db
      .select()
      .from(reembolso)
      .where(eq(reembolso.id, baja.cuerpo.reembolsoId));
    expect(r!.monto).toBe(1500);
    expect(baja.cuerpo.diferenciaConductor).toBeLessThan(0);
  });

  it('alertas: se toman, nadie más las cierra y el cierre pide una nota', async () => {
    const c = await api.conductorEnLinea('3007100911', api.nuevaZona());
    const sos = await api.post('/v1/conductor/sos', {}, c.accessToken);
    expect(sos.estado).toBe(200);
    const lista = (await api.get('/v1/op/alertas', monitor)).cuerpo;
    const a = lista.find((x: any) => x.id === sos.cuerpo.alertaId);
    expect(a).toMatchObject({ tipo: 'sos', severidad: 'critica', estado: 'abierta' });
    // la crítica va primero
    expect(lista[0].severidad).toBe('critica');

    // soporte solo mira
    expect((await api.post(`/v1/op/alertas/${a.id}/tomar`, {}, soporte)).estado).toBe(403);
    expect((await api.post(`/v1/op/alertas/${a.id}/tomar`, {}, monitor)).estado).toBe(204);
    const otra = await api.post(`/v1/op/alertas/${a.id}/tomar`, {}, supervisor);
    expect(otra.estado).toBe(409);
    expect(otra.cuerpo.codigo).toBe('ALERTA_YA_TOMADA');
    expect(
      (
        await api.post(
          `/v1/op/alertas/${a.id}/cerrar`,
          { nota: 'Falsa alarma confirmada' },
          supervisor,
        )
      ).estado,
    ).toBe(409);
    expect((await api.post(`/v1/op/alertas/${a.id}/cerrar`, { nota: 'ok' }, monitor)).estado).toBe(
      400,
    );
    expect(
      (
        await api.post(
          `/v1/op/alertas/${a.id}/cerrar`,
          { nota: 'Hablé con el conductor: falsa alarma' },
          monitor,
        )
      ).estado,
    ).toBe(204);
    const [fila] = await api.bd.db.select().from(alerta).where(eq(alerta.id, a.id));
    expect(fila).toMatchObject({
      estado: 'cerrada',
      notaCierre: 'Hablé con el conductor: falsa alarma',
    });
  });

  it('las pantallas conectadas reciben avisos en tiempo real', async () => {
    const mon = await api.conectarSocket(monitor);
    const c = await api.conductorEnLinea('3007101011', api.nuevaZona());
    await mon.esperar('torre:cambio');
    const sos = await api.post('/v1/conductor/sos', {}, c.accessToken);
    const aviso = await mon.esperar('alerta:nueva', (d: any) => d.id === sos.cuerpo.alertaId, 6000);
    expect(aviso).toMatchObject({ tipo: 'sos', severidad: 'critica' });
    // quien no puede ver la torre no recibe nada
    const sinTorre = await api.conectarSocket(
      (await api.ingresarOperacion('financiero')).accessToken,
    );
    await sinTorre.noLlega('torre:cambio', 1200);
  });
});
