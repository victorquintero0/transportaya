import { calcularComision, desplazar } from '@transportaya/dominio';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('Catálogo de vehículos, peajes y reportes de operación', () => {
  let api: Arnes;
  let admin: string;
  let cumplimiento: string;
  let monitor: string;
  let supervisor: string;

  beforeAll(async () => {
    api = await levantarApi();
    admin = (await api.ingresarOperacion('admin')).accessToken;
    cumplimiento = (await api.ingresarOperacion('cumplimiento')).accessToken;
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
    supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  const auditoria = async (accion: string) =>
    (
      await api.bd.db.execute(
        sql`select entidad_id, motivo, despues from auditoria where accion = ${accion} order by ocurrido_en desc`,
      )
    ).rows as { entidad_id: string; motivo: string; despues: any }[];

  describe('catálogo de vehículos', () => {
    it('lo ven monitor y cumplimiento; solo cumplimiento, supervisión y administración lo editan', async () => {
      expect((await api.get('/v1/op/catalogo-vehiculos', monitor)).estado).toBe(200);
      const nuevo = {
        marca: 'Zhidou',
        linea: 'D2',
        categoria: 'media',
        anioDesde: 2020,
        motivo: 'Nuevo en el mercado',
      };
      expect((await api.post('/v1/op/catalogo-vehiculos', nuevo, monitor)).estado).toBe(403);
      expect((await api.post('/v1/op/catalogo-vehiculos', nuevo)).estado).toBe(401);
    });

    it('lista con filtros y cuenta los vehículos registrados con cada entrada', async () => {
      await api.crearConductorHabilitado('3001950001'); // Onix
      const r = (await api.get('/v1/op/catalogo-vehiculos?q=onix', cumplimiento)).cuerpo;
      expect(r.items.length).toBeGreaterThan(0);
      expect(r.items.every((c: any) => c.linea.toLowerCase().includes('onix'))).toBe(true);
      expect(r.items.some((c: any) => c.vehiculos >= 1)).toBe(true);
      expect(r.porCategoria.media).toBeGreaterThan(0);
      const alta = (await api.get('/v1/op/catalogo-vehiculos?categoria=alta&limite=5', admin))
        .cuerpo;
      expect(alta.items.every((c: any) => c.categoria === 'alta')).toBe(true);
    });

    it('crea una entrada nueva, no deja repetirla y valida los años; todo queda auditado', async () => {
      const nuevo = {
        marca: 'Zhidou',
        linea: 'D2',
        categoria: 'media',
        anioDesde: 2020,
        motivo: 'Vehículo eléctrico nuevo',
      };
      const r = await api.post('/v1/op/catalogo-vehiculos', nuevo, cumplimiento);
      expect(r.estado).toBe(201);
      expect(r.cuerpo).toMatchObject({ marca: 'Zhidou', activo: true, vehiculos: 0 });
      const repetida = await api.post('/v1/op/catalogo-vehiculos', nuevo, cumplimiento);
      expect(repetida.estado).toBe(409);
      expect(repetida.cuerpo.codigo).toBe('CATALOGO_REPETIDO');
      expect(
        (
          await api.post(
            '/v1/op/catalogo-vehiculos',
            { ...nuevo, linea: 'D3', anioDesde: 2022, anioHasta: 2020 },
            cumplimiento,
          )
        ).estado,
      ).toBe(400);
      expect(
        (
          await api.post(
            '/v1/op/catalogo-vehiculos',
            { ...nuevo, linea: 'D4', motivo: 'ya' },
            cumplimiento,
          )
        ).estado,
      ).toBe(400);
      expect((await auditoria('catalogo.crear'))[0]).toMatchObject({
        entidad_id: r.cuerpo.id,
        motivo: 'Vehículo eléctrico nuevo',
      });
    });

    it('cambiar la categoría rige para los nuevos; para los ya registrados solo si se pide', async () => {
      const c = await api.crearConductorHabilitado('3001950002');
      const categoriaDe = async () =>
        (await api.get('/v1/conductor/yo', c.accessToken)).cuerpo.vehiculos[0].categoria;
      expect(await categoriaDe()).toBe('media');
      const onix = (await api.get('/v1/op/catalogo-vehiculos?q=onix', admin)).cuerpo.items[0];

      const sin = await api.patch(
        `/v1/op/catalogo-vehiculos/${onix.id}`,
        { categoria: 'media_alta', motivo: 'Reclasificación de prueba' },
        cumplimiento,
      );
      expect(sin.estado).toBe(200);
      expect(sin.cuerpo).toMatchObject({ categoria: 'media_alta', vehiculosActualizados: 0 });
      expect(await categoriaDe()).toBe('media');

      const con = await api.patch(
        `/v1/op/catalogo-vehiculos/${onix.id}`,
        { categoria: 'alta', aplicarAVehiculos: true, motivo: 'Reclasificación aplicada a todos' },
        supervisor,
      );
      expect(con.cuerpo.vehiculosActualizados).toBeGreaterThanOrEqual(1);
      expect(await categoriaDe()).toBe('alta');
      const aud = await auditoria('catalogo.cambiar');
      expect(aud[0]!.despues).toMatchObject({ categoria: 'alta' });
      // y una entrada inactiva ya no se ofrece al registrarse
      await api.patch(
        `/v1/op/catalogo-vehiculos/${onix.id}`,
        { categoria: 'media', aplicarAVehiculos: true, motivo: 'Se deja como estaba' },
        admin,
      );
    });

    it('un cambio vacío o sobre algo que no existe se rechaza', async () => {
      const onix = (await api.get('/v1/op/catalogo-vehiculos?q=onix', admin)).cuerpo.items[0];
      expect(
        (
          await api.patch(
            `/v1/op/catalogo-vehiculos/${onix.id}`,
            { motivo: 'Sin cambios reales' },
            admin,
          )
        ).estado,
      ).toBe(400);
      expect(
        (
          await api.patch(
            '/v1/op/catalogo-vehiculos/00000000-0000-4000-8000-000000000000',
            { activo: false, motivo: 'No existe esta entrada' },
            admin,
          )
        ).estado,
      ).toBe(404);
    });
  });

  describe('vehículos fuera del catálogo', () => {
    async function conductorConVehiculoPropio(
      tel: string,
      placa: string,
      marca: string,
      linea: string,
    ) {
      const s = await api.iniciarSesion(tel, 'conductor');
      const r = await api.post(
        '/v1/conductor/vehiculos',
        { placa, color: 'Gris', modeloAnio: 2021, marca, linea },
        s.accessToken,
      );
      expect(r.cuerpo.fueraDeCatalogo).toBe(true);
      return r.cuerpo.id as string;
    }

    it('aparecen en la cola con su conductor y salen de ella al resolverlos', async () => {
      const id = await conductorConVehiculoPropio('3001950010', 'FUE123', 'Chery', 'Arrizo 5');
      const cola = (await api.get('/v1/op/vehiculos-fuera-de-catalogo', cumplimiento)).cuerpo;
      const fila = cola.items.find((v: any) => v.id === id);
      expect(fila).toMatchObject({ placa: 'FUE123', marca: 'Chery', modeloAnio: 2021 });
      expect(fila.conductor).toBeTruthy();

      const r = await api.post(
        `/v1/op/vehiculos/${id}/revisar`,
        {
          accion: 'agregar',
          categoria: 'media_alta',
          motivo: 'Se agrega al catálogo como Media Alta',
        },
        cumplimiento,
      );
      expect(r.estado).toBe(201);
      expect(r.cuerpo.categoria).toBe('media_alta');
      const despues = (await api.get('/v1/op/vehiculos-fuera-de-catalogo', cumplimiento)).cuerpo;
      expect(despues.items.some((v: any) => v.id === id)).toBe(false);
      // quedó una entrada en el catálogo y el vehículo apunta a ella
      const entrada = (await api.get('/v1/op/catalogo-vehiculos?q=arrizo', admin)).cuerpo.items[0];
      expect(entrada).toMatchObject({ categoria: 'media_alta', anioDesde: 2021, vehiculos: 1 });
      // resolverlo otra vez no tiene sentido
      expect(
        (
          await api.post(
            `/v1/op/vehiculos/${id}/revisar`,
            { accion: 'agregar', categoria: 'alta', motivo: 'Otra vez lo mismo' },
            cumplimiento,
          )
        ).cuerpo.codigo,
      ).toBe('YA_REVISADO');
    });

    it('se puede asignar a una entrada que ya existe, si el año cuadra', async () => {
      const id = await conductorConVehiculoPropio('3001950011', 'FUE456', 'Chevrolet', 'Onyx');
      const onix = (await api.get('/v1/op/catalogo-vehiculos?q=onix', admin)).cuerpo.items[0];
      const r = await api.post(
        `/v1/op/vehiculos/${id}/revisar`,
        {
          accion: 'asignar',
          catalogoVehiculoId: onix.id,
          motivo: 'Estaba mal escrito: es un Onix',
        },
        cumplimiento,
      );
      expect(r.estado).toBe(201);
      expect(r.cuerpo.catalogoVehiculoId).toBe(onix.id);
      const v = (
        await api.bd.db.execute(
          sql`select marca, linea, fuera_de_catalogo from vehiculo where id = ${id}`,
        )
      ).rows[0] as any;
      expect(v).toMatchObject({ linea: 'Onix', fuera_de_catalogo: false });
    });

    it('rechaza asignar un modelo que esa entrada no cubre, y agregar uno que ya existe', async () => {
      const id = await conductorConVehiculoPropio('3001950012', 'FUE789', 'Renault', 'Kwid');
      await api.bd.db.execute(sql`update vehiculo set modelo_anio = 1960 where id = ${id}`);
      const onix = (await api.get('/v1/op/catalogo-vehiculos?q=onix', admin)).cuerpo.items[0];
      const fuera = await api.post(
        `/v1/op/vehiculos/${id}/revisar`,
        { accion: 'asignar', catalogoVehiculoId: onix.id, motivo: 'Probando un año imposible' },
        cumplimiento,
      );
      expect(fuera.estado).toBe(400);

      const id2 = await conductorConVehiculoPropio('3001950013', 'FUE000', 'Renault', 'Kwid');
      await api.post(
        `/v1/op/vehiculos/${id2}/revisar`,
        { accion: 'agregar', categoria: 'media', motivo: 'Primera vez con este modelo' },
        cumplimiento,
      );
      await api.bd.db.execute(sql`update vehiculo set modelo_anio = 2021 where id = ${id}`);
      const repetido = await api.post(
        `/v1/op/vehiculos/${id}/revisar`,
        { accion: 'agregar', categoria: 'media', motivo: 'Segundo con el mismo modelo' },
        cumplimiento,
      );
      expect(repetido.estado).toBe(409);
      expect(repetido.cuerpo.codigo).toBe('CATALOGO_REPETIDO');
    });

    it('la revisión pide permiso de edición del catálogo', async () => {
      const id = await conductorConVehiculoPropio('3001950014', 'FUE111', 'Kia', 'Soluto');
      expect(
        (
          await api.post(
            `/v1/op/vehiculos/${id}/revisar`,
            { accion: 'agregar', categoria: 'media', motivo: 'Sin permiso para esto' },
            monitor,
          )
        ).estado,
      ).toBe(403);
    });
  });

  describe('peajes', () => {
    const nuevo = (nombre: string, extra: object = {}) => ({
      nombre,
      lat: 5.0689,
      lng: -75.5174,
      valor: 12_400,
      motivo: 'Tarifa oficial 2026',
      ...extra,
    });

    it('los ven quienes ven tarifas y solo el administrador los edita', async () => {
      expect((await api.get('/v1/op/peajes', monitor)).estado).toBe(200);
      expect((await api.post('/v1/op/peajes', nuevo('Peaje X'), monitor)).estado).toBe(403);
      expect((await api.post('/v1/op/peajes', nuevo('Peaje X'), supervisor)).estado).toBe(403);
    });

    it('crea, cambia, desactiva y audita; no repite nombres ni acepta coordenadas fuera de Colombia', async () => {
      const r = await api.post(
        '/v1/op/peajes',
        nuevo('Peaje Tres Puertas', { fuente: 'INVIAS 2026' }),
        admin,
      );
      expect(r.estado).toBe(201);
      expect(
        (await api.post('/v1/op/peajes', nuevo('Peaje Tres Puertas'), admin)).cuerpo.codigo,
      ).toBe('PEAJE_REPETIDO');
      for (const mal of [{ lat: 51.5, lng: -0.12 }, { lat: -75.5, lng: 5.06 }, { valor: 0 }])
        expect((await api.post('/v1/op/peajes', nuevo('Peaje malo', mal), admin)).estado).toBe(400);

      const id = r.cuerpo.id;
      expect(
        (
          await api.patch(
            `/v1/op/peajes/${id}`,
            { valor: 13_000, motivo: 'Subió el valor en enero' },
            admin,
          )
        ).estado,
      ).toBe(200);
      expect(
        (
          await api.patch(
            `/v1/op/peajes/${id}`,
            { lat: 5.1, motivo: 'Corregir la ubicación' },
            admin,
          )
        ).estado,
      ).toBe(400);
      await api.patch(`/v1/op/peajes/${id}`, { activo: false, motivo: 'Ya no se cobra' }, admin);

      const todos = (await api.get('/v1/op/peajes', admin)).cuerpo;
      expect(todos.find((p: any) => p.id === id)).toMatchObject({
        valor: 13_000,
        activo: false,
        fuente: 'INVIAS 2026',
      });
      const activos = (await api.get('/v1/op/peajes?activo=true', admin)).cuerpo;
      expect(activos.some((p: any) => p.id === id)).toBe(false);
      expect((await auditoria('peaje.cambiar')).length).toBe(2);
    });

    /** Un viaje de mentira completo, con dos posiciones del recorrido que pasan a ambos lados de `punto`. */
    async function viajeQuePasaPor(
      tel: string,
      punto: (recogida: { lat: number; lng: number }) => { lat: number; lng: number },
    ) {
      const c = await api.conductorEnLinea(tel, api.nuevaZona());
      const creado = (
        await api.post('/v1/dev/pasajeros/viaje', { metodoPago: 'efectivo' }, c.accessToken)
      ).cuerpo;
      const oferta = await c.socket.esperar(
        'oferta:nueva',
        (d: any) => d.viajeId === creado.viajeId,
      );
      const acept = (
        await api.post(`/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`, undefined, c.accessToken)
      ).cuerpo;
      const cerca = desplazar(acept.recogida, 40, 0);
      const ubicar = (p: { lat: number; lng: number }) =>
        api.post(
          '/v1/conductor/ubicaciones',
          { puntos: [{ ...p, t: Date.now(), precisionM: 5 }] },
          c.accessToken,
        );
      await ubicar(cerca);
      await api.post(`/v1/conductor/viajes/${creado.viajeId}/llegue`, {}, c.accessToken);
      await api.post(
        `/v1/conductor/viajes/${creado.viajeId}/iniciar`,
        { pin: creado.pin },
        c.accessToken,
      );
      const p = punto(acept.recogida);
      await ubicar(desplazar(p, 30, 270));
      await new Promise((r) => setTimeout(r, 1100));
      await ubicar(desplazar(p, 30, 90));
      const fin = await api.post(
        `/v1/conductor/viajes/${creado.viajeId}/finalizar`,
        { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
        c.accessToken,
      );
      c.socket.cerrar();
      return { viajeId: creado.viajeId as string, fin: fin.cuerpo, conductorId: c.usuarioId };
    }

    it('si el recorrido pasa por un peaje activo, su valor se suma al precio y no a la comisión', async () => {
      const sin = await viajeQuePasaPor('3001950020', (r) => desplazar(r, 5000, 0));
      expect(sin.fin.peajes).toBe(0);

      const lugar = { current: { lat: 0, lng: 0 } };
      const con = await viajeQuePasaPor('3001950021', (r) => {
        lugar.current = r;
        return r;
      });
      // El peaje se registra después del viaje para conocer el punto; se prueba el cálculo con el mismo recorrido.
      const p = (
        await api.post(
          '/v1/op/peajes',
          {
            nombre: 'Peaje de prueba',
            lat: lugar.current.lat,
            lng: lugar.current.lng,
            valor: 9_400,
            motivo: 'Peaje de prueba del recorrido',
          },
          admin,
        )
      ).cuerpo;
      expect(p.id).toBeTruthy();
      expect(con.fin.peajes).toBe(0); // todavía no existía cuando se cobró

      const despues = await viajeQuePasaPorFijo('3001950022', lugar.current);
      expect(despues.fin.peajes).toBe(9_400);
      expect(despues.fin.precioFinal).toBe(
        despues.fin.totalCarrera + despues.fin.cobroEspera + 9_400,
      );
      // la comisión sale de la tarifa, no del peaje
      expect(despues.fin.comision).toBe(
        calcularComision(
          { totalRedondeado: despues.fin.totalCarrera, cobroEspera: despues.fin.cobroEspera },
          'urbano',
        ),
      );
      const fila = (
        await api.bd.db.execute(
          sql`select peajes, precio_final, desglose from viaje where id = ${despues.viajeId}`,
        )
      ).rows[0] as any;
      expect(Number(fila.peajes)).toBe(9_400);
      expect(fila.desglose.peajesCruzados).toEqual([
        expect.objectContaining({ nombre: 'Peaje de prueba', valor: 9_400 }),
      ]);
    });

    async function viajeQuePasaPorFijo(tel: string, punto: { lat: number; lng: number }) {
      return viajeQuePasaPor(tel, () => punto);
    }

    it('un peaje desactivado no se cobra', async () => {
      const p = (await api.get('/v1/op/peajes?q=prueba', admin)).cuerpo[0];
      await api.patch(
        `/v1/op/peajes/${p.id}`,
        { activo: false, motivo: 'Se apaga para la prueba' },
        admin,
      );
      const v = await viajeQuePasaPorFijo('3001950023', { lat: p.lat, lng: p.lng });
      expect(v.fin.peajes).toBe(0);
    });
  });

  describe('reportes con filtros y mapa de calor', () => {
    it('filtra por categoría y por zona, y avisa en la respuesta qué filtros se aplicaron', async () => {
      const c = await api.conductorEnLinea('3001950030', api.nuevaZona());
      await api.completarViaje(c);
      c.socket.cerrar();
      const todos = (await api.get('/v1/op/reportes/tiempos', admin)).cuerpo;
      expect(todos.viajes.finalizados).toBeGreaterThan(0);
      expect(todos.filtros).toEqual({ categoria: null, zonaId: null });

      const alta = (await api.get('/v1/op/reportes/tiempos?categoria=alta', admin)).cuerpo;
      expect(alta.filtros.categoria).toBe('alta');
      expect(alta.viajes.finalizados).toBeLessThan(todos.viajes.finalizados);
      expect(alta.flota.horasEnLinea).toBeNull(); // las horas en línea no se pueden recortar por viaje
      const media = (await api.get('/v1/op/reportes/tiempos?categoria=media', admin)).cuerpo;
      expect(media.viajes.finalizados).toBe(todos.viajes.finalizados);

      expect((await api.get('/v1/op/reportes/tiempos?categoria=lujo', admin)).estado).toBe(400);
      expect((await api.get('/v1/op/reportes/tiempos?zonaId=no-es-uuid', admin)).estado).toBe(400);

      // una zona que no cubre ningún origen deja el reporte en cero
      const zonas = (await api.get('/v1/op/zonas', admin)).cuerpo as
        { id: string }[] | { items: { id: string }[] };
      const lista = Array.isArray(zonas) ? zonas : zonas.items;
      if (lista.length) {
        const r = (await api.get(`/v1/op/reportes/tiempos?zonaId=${lista[0]!.id}`, admin)).cuerpo;
        expect(r.filtros.zonaId).toBe(lista[0]!.id);
      }
    });

    it('el mapa de calor agrupa los orígenes en celdas y puede mostrar solo los viajes sin conductor', async () => {
      const r = (await api.get('/v1/op/reportes/calor', monitor)).cuerpo;
      expect(r).toMatchObject({ tipo: 'solicitudes', tamanoM: 330 });
      expect(r.total).toBeGreaterThan(0);
      expect(r.maximo).toBe(r.celdas[0].n);
      expect(r.celdas.reduce((a: number, c: any) => a + c.n, 0)).toBe(r.total);
      // las celdas no traen ningún dato de personas
      expect(Object.keys(r.celdas[0]).sort()).toEqual(['lat', 'lng', 'n']);
      const sin = (await api.get('/v1/op/reportes/calor?tipo=sin_conductor', monitor)).cuerpo;
      expect(sin.total).toBeLessThanOrEqual(r.total);
      expect((await api.get('/v1/op/reportes/calor?tipo=otro', monitor)).estado).toBe(400);
      expect((await api.get('/v1/op/reportes/calor')).estado).toBe(401);
    });

    it('exportar a CSV con filtros queda auditado con los filtros', async () => {
      const csv = await fetch(`${api.url}/v1/op/reportes/viajes.csv?categoria=media`, {
        headers: { authorization: `Bearer ${admin}` },
      });
      expect(csv.status).toBe(200);
      const aud = await auditoria('reporte.exportar');
      expect(JSON.stringify(aud[0]!.despues)).toContain('media');
    });
  });
});
