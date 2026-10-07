import { tarifa } from '@transportaya/db';
import { desc } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DespachoService } from '../src/viajes/despacho.service.js';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('Tarifas, zonas, dinámica y configuración (OPE-06, OPE-12)', () => {
  let api: Arnes;
  let admin: string;
  let supervisor: string;
  let monitor: string;
  let financiero: string;
  beforeAll(async () => {
    api = await levantarApi();
    admin = (await api.ingresarOperacion('admin')).accessToken;
    supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
    financiero = (await api.ingresarOperacion('financiero')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  describe('simulador', () => {
    it('calcula con la tarifa vigente: banderazo, kilómetros, recargo por aplicación y redondeo', async () => {
      // martes a mediodía, sin festivos cargados: 3.700 + 3 km × 1.784 + 800 puerta a puerta
      const r = await api.post(
        '/v1/op/tarifas/simular',
        {
          categoria: 'media',
          distanciaKm: 3,
          tiempoDetenidoMin: 0,
          instante: '2026-03-10T17:00:00Z',
        },
        monitor,
      );
      expect(r.estado).toBe(200);
      expect(r.cuerpo.recargosAplicados).toEqual(['puerta_a_puerta']);
      expect(r.cuerpo.desglose).toMatchObject({
        base: 3700,
        distancia: 5352,
        totalRedondeado: 9800,
      });
    });

    it('suma el recargo nocturno, la categoría y la dinámica', async () => {
      const r = await api.post(
        '/v1/op/tarifas/simular',
        {
          categoria: 'alta',
          distanciaKm: 5,
          tiempoDetenidoMin: 4,
          instante: '2026-03-10T03:00:00Z', // 22:00 en Bogotá
          multiplicador: 1.5,
        },
        monitor,
      );
      expect(r.cuerpo.recargosAplicados).toEqual(['nocturno', 'puerta_a_puerta', 'categoria']);
      // (3.700 + 5×1.784 + 4×223) × 1,5 = 20.268 + recargos 1.000 + 800 + 2.000 = 24.068 → 24.000
      expect(r.cuerpo.desglose.totalRedondeado).toBe(24_000);
    });

    it('respeta la mínima y el calendario de festivos', async () => {
      await api.post(
        '/v1/op/festivos',
        { fecha: '2026-03-10', nombre: 'Festivo de prueba' },
        admin,
      );
      const r = await api.post(
        '/v1/op/tarifas/simular',
        { distanciaKm: 0.2, tiempoDetenidoMin: 0, instante: '2026-03-10T17:00:00Z' },
        monitor,
      );
      expect(r.cuerpo.festivo).toBe(true);
      expect(r.cuerpo.recargosAplicados).toContain('dominical_festivo');
      expect(r.cuerpo.desglose.tarifaViaje).toBe(6300);
      await api.bd.db
        .execute(`delete from festivo where fecha = '2026-03-10'` as never)
        .catch(() => undefined);
    });

    it('el simulador exige sesión de operación', async () => {
      expect((await api.post('/v1/op/tarifas/simular', { distanciaKm: 1 })).estado).toBe(401);
    });
  });

  describe('versiones de tarifa', () => {
    it('solo el administrador crea una versión; la anterior se cierra donde empieza la nueva', async () => {
      const lista = (await api.get('/v1/op/tarifas', supervisor)).cuerpo;
      const vigente = lista.find((t: any) => t.estado === 'vigente');
      expect(vigente).toMatchObject({ base: 3700, valorKm: 1784, valorMinuto: 223, minima: 6300 });
      expect(vigente.recargos.length).toBeGreaterThanOrEqual(8);

      const nueva = {
        base: 3900,
        valorKm: 1850,
        valorMinuto: 230,
        minima: 6500,
        cancelacion: 4000,
        esperaMinuto: 250,
        esperaMinutosGratis: 3,
        fuente: 'Prueba',
        recargos: vigente.recargos.map((r: any) => ({
          codigo: r.codigo,
          nombre: r.nombre,
          tipo: r.tipo,
          valor: r.valor,
          categoria: r.categoria ?? undefined,
        })),
        motivo: 'Actualización de prueba',
      };
      expect((await api.post('/v1/op/tarifas', nueva, supervisor)).estado).toBe(403);
      expect((await api.post('/v1/op/tarifas', { ...nueva, motivo: 'x' }, admin)).estado).toBe(400);

      // programada a futuro: la actual sigue vigente
      const futura = new Date(Date.now() + 3 * 86_400_000).toISOString();
      const r = await api.post('/v1/op/tarifas', { ...nueva, vigenteDesde: futura }, admin);
      expect(r.estado).toBe(201);
      expect(r.cuerpo.version).toBe(2);
      const despues = (await api.get('/v1/op/tarifas', supervisor)).cuerpo;
      expect(despues.map((t: any) => [t.version, t.estado])).toEqual([
        [2, 'programada'],
        [1, 'vigente'],
      ]);
      expect(despues[1].vigenteHasta).toBe(futura);

      // el simulador compara con la versión programada antes de publicarla
      const sim = await api.post(
        '/v1/op/tarifas/simular',
        { tarifaId: r.cuerpo.id, distanciaKm: 3, instante: '2026-03-10T17:00:00Z' },
        monitor,
      );
      expect(sim.cuerpo.tarifa.version).toBe(2);
      expect(sim.cuerpo.desglose.base).toBe(3900);

      // no se puede empezar antes que la última versión
      const antes = await api.post(
        '/v1/op/tarifas',
        { ...nueva, vigenteDesde: new Date(Date.now() + 86_400_000).toISOString() },
        admin,
      );
      expect(antes.estado).toBe(409);
      const [ultima] = await api.bd.db.select().from(tarifa).orderBy(desc(tarifa.version)).limit(1);
      expect(ultima!.version).toBe(2);

      const aud = await api.get('/v1/op/auditoria?accion=tarifa.', supervisor);
      expect(aud.cuerpo.items[0]).toMatchObject({
        accion: 'tarifa.crear_version',
        motivo: 'Actualización de prueba',
      });
    });
  });

  describe('rutas fijas', () => {
    it('cambiar el valor crea una vigencia nueva y conserva la anterior', async () => {
      const lista = (await api.get('/v1/op/rutas-fijas?limite=5', financiero)).cuerpo;
      expect(lista.total).toBeGreaterThan(100);
      const ruta = lista.items[0];
      expect(
        (
          await api.patch(
            `/v1/op/rutas-fijas/${ruta.id}`,
            { tarifa: ruta.tarifa + 5000, motivo: 'Ajuste de prueba' },
            supervisor,
          )
        ).estado,
      ).toBe(403);
      expect(
        (await api.patch(`/v1/op/rutas-fijas/${ruta.id}`, { motivo: 'Sin cambios' }, admin)).estado,
      ).toBe(400);
      const r = await api.patch(
        `/v1/op/rutas-fijas/${ruta.id}`,
        { tarifa: ruta.tarifa + 5000, motivo: 'Ajuste de prueba' },
        admin,
      );
      expect(r.estado).toBe(204);
      const nueva = (
        await api.get(`/v1/op/rutas-fijas?q=${encodeURIComponent(ruta.destino)}`, financiero)
      ).cuerpo.items.find((x: any) => x.modalidad === ruta.modalidad);
      expect(nueva.tarifa).toBe(ruta.tarifa + 5000);
      const des = await api.patch(
        `/v1/op/rutas-fijas/${nueva.id}`,
        { activa: false, motivo: 'Ruta suspendida por obras' },
        admin,
      );
      expect(des.estado).toBe(204);
    });
  });

  describe('zonas y dinámica manual', () => {
    let zonaId: string;
    it('el administrador dibuja una zona y se valida el polígono', async () => {
      const anillo = [
        [-75.52, 5.06],
        [-75.5, 5.06],
        [-75.5, 5.08],
        [-75.52, 5.08],
      ];
      expect(
        (
          await api.post(
            '/v1/op/zonas',
            { nombre: 'Centro', tipo: 'punto_encuentro', anillo, motivo: 'Prueba' },
            supervisor,
          )
        ).estado,
      ).toBe(403);
      expect(
        (
          await api.post(
            '/v1/op/zonas',
            {
              nombre: 'Corbata',
              tipo: 'punto_encuentro',
              anillo: [
                [0, 0],
                [1, 1],
                [1, 0],
                [0, 1],
              ],
              motivo: 'Cruzada',
            },
            admin,
          )
        ).estado,
      ).toBe(400);
      const r = await api.post(
        '/v1/op/zonas',
        { nombre: 'Centro', tipo: 'punto_encuentro', anillo, motivo: 'Prueba' },
        admin,
      );
      expect(r.estado).toBe(201);
      zonaId = r.cuerpo.id;
      const zonas = (await api.get('/v1/op/zonas', monitor)).cuerpo;
      const z = zonas.find((x: any) => x.id === zonaId);
      expect(z.poligono.type).toBe('Polygon');
    });

    it('el monitor activa y desactiva la dinámica con límites', async () => {
      const desde = new Date();
      const hasta = new Date(Date.now() + 2 * 3_600_000);
      const base = {
        zonaId,
        multiplicador: 1.4,
        hasta: hasta.toISOString(),
        motivo: 'Lluvia fuerte en el centro',
      };
      expect((await api.post('/v1/op/dinamica', base, financiero)).estado).toBe(403);
      expect(
        (await api.post('/v1/op/dinamica', { ...base, multiplicador: 4 }, monitor)).estado,
      ).toBe(400);
      expect(
        (
          await api.post(
            '/v1/op/dinamica',
            { ...base, hasta: new Date(Date.now() + 20 * 3_600_000).toISOString() },
            monitor,
          )
        ).estado,
      ).toBe(400);
      const r = await api.post('/v1/op/dinamica', base, monitor);
      expect(r.estado).toBe(201);
      expect(desde.getTime()).toBeLessThan(hasta.getTime());

      const lista = (await api.get('/v1/op/dinamica', supervisor)).cuerpo;
      expect(lista.find((d: any) => d.id === r.cuerpo.id)).toMatchObject({
        estado: 'activa',
        multiplicador: 1.4,
        zona: 'Centro',
      });

      // el simulador no la aplica solo; la cotización sí (RN-024), y la desactivación la termina
      expect(
        (
          await api.post(
            `/v1/op/dinamica/${r.cuerpo.id}/desactivar`,
            { motivo: 'Pasó la lluvia' },
            monitor,
          )
        ).estado,
      ).toBe(204);
      const despues = (await api.get('/v1/op/dinamica', supervisor)).cuerpo;
      expect(despues.find((d: any) => d.id === r.cuerpo.id).estado).toBe('terminada');
      expect(
        (
          await api.post(
            `/v1/op/dinamica/${r.cuerpo.id}/desactivar`,
            { motivo: 'Otra vez' },
            monitor,
          )
        ).estado,
      ).toBe(409);
    });
  });

  describe('parámetros', () => {
    it('lista los parámetros con su valor y rango; solo el administrador los cambia', async () => {
      const lista = (await api.get('/v1/op/parametros', supervisor)).cuerpo;
      const oferta = lista.find((p: any) => p.clave === 'despacho.oferta_s');
      expect(oferta).toMatchObject({
        valor: 15,
        personalizado: false,
        unidad: 's',
        min: 5,
        max: 60,
      });
      expect((await api.get('/v1/op/parametros', monitor)).estado).toBe(403);

      const url = '/v1/op/parametros/despacho.oferta_s';
      expect((await api.put(url, { valor: 20, motivo: 'Probar' }, supervisor)).estado).toBe(403);
      expect((await api.put(url, { valor: 500, motivo: 'Fuera de rango' }, admin)).estado).toBe(
        400,
      );
      expect(
        (await api.put('/v1/op/parametros/no.existe', { valor: 1, motivo: 'No existe' }, admin))
          .estado,
      ).toBe(400);
      expect(
        (await api.put(url, { valor: 25, motivo: 'Conductores lentos en la zona' }, admin)).estado,
      ).toBe(200);

      const despues = (await api.get('/v1/op/parametros', supervisor)).cuerpo.find(
        (p: any) => p.clave === 'despacho.oferta_s',
      );
      expect(despues).toMatchObject({ valor: 25, personalizado: true });
      // se aplica en caliente al despacho
      expect((api.servicio(DespachoService) as any).p.ofertaMs).toBe(25_000);

      expect((await api.delete(url, { motivo: 'Volver al valor original' }, admin)).estado).toBe(
        204,
      );
      expect((api.servicio(DespachoService) as any).p.ofertaMs).toBe(15_000);
    });

    it('el ámbar del semáforo debe ser menor que el rojo', async () => {
      const r = await api.put(
        '/v1/op/parametros/semaforo.asignacion_ambar_s',
        { valor: 200, motivo: 'Prueba inválida' },
        admin,
      );
      expect(r.estado).toBe(400);
      expect(
        (
          await api.put(
            '/v1/op/parametros/semaforo.asignacion_ambar_s',
            { valor: 30, motivo: 'Más exigente' },
            admin,
          )
        ).estado,
      ).toBe(200);
    });
  });
});
