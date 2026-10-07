import { conductor, pasajero, viaje } from '@transportaya/db';
import { desplazar } from '@transportaya/dominio';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDisponible, levantarApi, type Arnes, type ClienteSocket } from './arnes.js';

const hayBase = await baseDisponible();
const CENTRO = { lat: 5.0689, lng: -75.5174 };

/** Zonas separadas más de 16 km entre sí, dentro de la cobertura: así los conductores de una prueba no atienden otra. */
let siguienteZona = 0;
function zona() {
  const i = siguienteZona++ % 8;
  return desplazar(CENTRO, 22_000, i * 45);
}

describe.skipIf(!hayBase)('app del pasajero', () => {
  let api: Arnes;
  beforeAll(async () => {
    api = await levantarApi();
  });
  afterAll(async () => {
    await api.cerrar();
  });
  // Cada prueba empieza sin conductores en línea de las anteriores, para que no se atiendan entre sí.
  afterEach(async () => {
    await api.bd.db.execute(
      sql`update conductor set estado_operativo = 'desconectado' where estado_operativo <> 'desconectado'`,
    );
  });

  interface Pasajero {
    token: string;
    id: string;
    socket?: ClienteSocket;
  }

  async function nuevoPasajero(
    telefono: string,
    opciones: { sinTerminos?: boolean; nombre?: string } = {},
  ) {
    const s = await api.iniciarSesion(telefono, 'pasajero');
    const p: Pasajero = { token: s.accessToken, id: s.usuarioId };
    if (opciones.nombre !== '') {
      const r = await api.patch(
        '/v1/pasajero/yo',
        { nombre: opciones.nombre ?? 'Valentina Ríos Mejía' },
        p.token,
      );
      expect(r.estado).toBe(200);
    }
    if (!opciones.sinTerminos) {
      const t = await api.post('/v1/pasajero/terminos', { version: '2026-10' }, p.token);
      expect(t.estado).toBe(200);
    }
    return p;
  }

  async function cotizar(
    p: Pasajero,
    origen: { lat: number; lng: number },
    destino: { lat: number; lng: number },
  ) {
    const r = await api.post<any>(
      '/v1/pasajero/cotizaciones',
      {
        origen: { ...origen, direccion: 'Cra 23 # 62-14, Palogrande' },
        destino: { ...destino, direccion: 'Cl 65 # 30-10, Cable' },
      },
      p.token,
    );
    expect(r.estado).toBe(200);
    return r.cuerpo;
  }

  async function pedirViaje(
    p: Pasajero,
    origen: { lat: number; lng: number },
    destino: { lat: number; lng: number },
    extra: Record<string, unknown> = {},
  ) {
    const c = await cotizar(p, origen, destino);
    const r = await api.post<any>(
      '/v1/pasajero/viajes',
      { cotizacionId: c.opciones[0].id, metodoPago: 'efectivo', ...extra },
      p.token,
    );
    return { respuesta: r, cotizacion: c };
  }

  describe('cuenta', () => {
    it('PAS-01/02: un pasajero nuevo debe dar su nombre y aceptar los términos antes de pedir', async () => {
      const p = await nuevoPasajero('3002000001', { sinTerminos: true, nombre: '' });
      const yo = await api.get<any>('/v1/pasajero/yo', p.token);
      expect(yo.cuerpo.usuario.nombre).toBe('');
      expect(yo.cuerpo.terminos).toMatchObject({ aceptados: false, version: '2026-10' });

      const z = zona();
      const sin = await pedirViaje(p, z, desplazar(z, 2000, 90));
      expect(sin.respuesta.estado).toBe(409);
      expect(sin.respuesta.cuerpo.codigo).toBe('TERMINOS_PENDIENTES');

      expect(
        (await api.post('/v1/pasajero/terminos', { version: '1999-01' }, p.token)).cuerpo.codigo,
      ).toBe('VERSION_TERMINOS');
      await api.post('/v1/pasajero/terminos', { version: '2026-10' }, p.token);
      const sinNombre = await pedirViaje(p, z, desplazar(z, 2000, 90));
      expect(sinNombre.respuesta.cuerpo.codigo).toBe('PERFIL_INCOMPLETO');

      await api.patch(
        '/v1/pasajero/yo',
        { nombre: 'Laura Giraldo', email: 'laura@correo.co' },
        p.token,
      );
      const yo2 = await api.get<any>('/v1/pasajero/yo', p.token);
      expect(yo2.cuerpo).toMatchObject({
        usuario: { nombre: 'Laura Giraldo', email: 'laura@correo.co' },
        terminos: { aceptados: true },
        deuda: 0,
        viajeActivoId: null,
      });
    });

    it('los conductores no pueden usar las rutas del pasajero y viceversa', async () => {
      const c = await api.crearConductorHabilitado('3002000002');
      expect((await api.get('/v1/pasajero/yo', c.accessToken)).estado).toBe(403);
      const p = await nuevoPasajero('3002000003');
      expect((await api.get('/v1/conductor/yo', p.token)).estado).toBe(403);
      expect((await api.get('/v1/pasajero/yo')).estado).toBe(401);
    });

    it('PAS-03: contactos de confianza, con límite y sin repetir', async () => {
      const p = await nuevoPasajero('3002000004');
      const a = await api.post<any>(
        '/v1/pasajero/contactos',
        { nombre: 'Mamá', telefono: '310 555 1111' },
        p.token,
      );
      expect(a.cuerpo.telefono).toBe('+573105551111');
      expect(
        (
          await api.post(
            '/v1/pasajero/contactos',
            { nombre: 'Mamá 2', telefono: '3105551111' },
            p.token,
          )
        ).cuerpo.codigo,
      ).toBe('CONTACTO_REPETIDO');
      for (let i = 0; i < 4; i++)
        await api.post(
          '/v1/pasajero/contactos',
          { nombre: `Amigo ${i}`, telefono: `31055520${i}0` },
          p.token,
        );
      expect(
        (
          await api.post(
            '/v1/pasajero/contactos',
            { nombre: 'Uno más', telefono: '3105559999' },
            p.token,
          )
        ).cuerpo.codigo,
      ).toBe('DEMASIADOS_CONTACTOS');
      expect((await api.get<any>('/v1/pasajero/yo', p.token)).cuerpo.contactos).toHaveLength(5);
      expect(
        (await api.post('/v1/pasajero/contactos', { nombre: 'X', telefono: 'abc' }, p.token))
          .estado,
      ).toBe(400);
    });

    it('PAS-04: lugares guardados; "Casa" se reemplaza en vez de repetirse', async () => {
      const p = await nuevoPasajero('3002000005');
      await api.post(
        '/v1/pasajero/lugares-guardados',
        { etiqueta: 'Casa', direccion: 'Cl 50 # 20-10, Palogrande', lat: 5.05, lng: -75.49 },
        p.token,
      );
      await api.post(
        '/v1/pasajero/lugares-guardados',
        { etiqueta: 'casa', direccion: 'Cl 60 # 22-11, Cable', lat: 5.06, lng: -75.48 },
        p.token,
      );
      await api.post(
        '/v1/pasajero/lugares-guardados',
        { etiqueta: 'Gimnasio', direccion: 'Cra 25 # 40-10, Centro', lat: 5.07, lng: -75.51 },
        p.token,
      );
      const lugares = (await api.get<any>('/v1/pasajero/yo', p.token)).cuerpo.lugares;
      expect(lugares.map((l: any) => l.etiqueta).sort()).toEqual(['Gimnasio', 'casa']);
    });

    it('PAS-05: descargar mis datos y eliminar la cuenta', async () => {
      const p = await nuevoPasajero('3002000006');
      const datos = await api.get<any>('/v1/pasajero/mis-datos', p.token);
      expect(datos.cuerpo.perfil.usuario.nombre).toBe('Valentina Ríos Mejía');
      const r = await fetch(`${api.url}/v1/pasajero/cuenta`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${p.token}` },
      });
      expect(r.status).toBe(204);
      // la sesión quedó revocada y el número se puede volver a usar
      expect((await api.get('/v1/pasajero/yo', p.token)).estado).toBe(401);
      const otra = await api.iniciarSesion('3002000006', 'pasajero');
      expect(otra.nuevo).toBe(true);
      expect(otra.usuarioId).not.toBe(p.id);
    });
  });

  describe('lugares y rutas', () => {
    it('PAS-21: busca por nombre sin importar tildes, por alias y por barrio', async () => {
      const p = await nuevoPasajero('3002000010');
      const buscar = async (q: string) =>
        (await api.get<any>(`/v1/pasajero/lugares/buscar?q=${encodeURIComponent(q)}`, p.token))
          .cuerpo.resultados;
      expect((await buscar('catedral'))[0].titulo).toContain('Catedral');
      expect((await buscar('EXITO'))[0].titulo).toContain('Éxito');
      expect((await buscar('terminal')).some((r: any) => r.id === 'terminal')).toBe(true);
      expect((await buscar('aeropuerto'))[0].id).toBe('aeropuerto');
      expect(await buscar('zzzz')).toEqual([]);
      // lo que se guarda en el viaje termina en el barrio: es lo único del destino que ve el conductor (D-11)
      expect((await buscar('mall plaza'))[0].direccion).toBe('Mall Plaza Manizales, Fundadores');
    });

    it('PAS-21: entiende direcciones colombianas y las marca como aproximadas', async () => {
      const p = await nuevoPasajero('3002000011');
      for (const texto of [
        'Cra 23 # 62-14',
        'cr 23 no 62 14',
        'Calle 65 # 23-10',
        'kr 7 # 32-16',
      ]) {
        const r = (
          await api.get<any>(`/v1/pasajero/lugares/buscar?q=${encodeURIComponent(texto)}`, p.token)
        ).cuerpo.resultados;
        expect(r[0], texto).toMatchObject({ tipo: 'direccion', aproximada: true });
        expect(r[0].direccion).toMatch(/, [A-Za-zÁ-úñ ]+$/);
        expect(r[0].lat).toBeGreaterThan(4.9);
        expect(r[0].lat).toBeLessThan(5.2);
      }
      const dos = (
        await api.get<any>(
          `/v1/pasajero/lugares/buscar?q=${encodeURIComponent('Cra 23 # 62-14')}`,
          p.token,
        )
      ).cuerpo.resultados[0];
      const tres = (
        await api.get<any>(
          `/v1/pasajero/lugares/buscar?q=${encodeURIComponent('Cra 23 # 22-14')}`,
          p.token,
        )
      ).cuerpo.resultados[0];
      expect(dos.lat).not.toBe(tres.lat); // calles distintas, puntos distintos
    });

    it('PAS-20: le pone nombre al pin del mapa', async () => {
      const p = await nuevoPasajero('3002000012');
      const cerca = await api.get<any>(
        '/v1/pasajero/lugares/inversa?lat=5.0690&lng=-75.5175',
        p.token,
      );
      expect(cerca.cuerpo.titulo).toContain('Catedral');
      const lejos = await api.get<any>(
        '/v1/pasajero/lugares/inversa?lat=5.0530&lng=-75.4700',
        p.token,
      );
      expect(lejos.cuerpo.titulo).toMatch(/^Cra \d+ # \d+$/);
      expect((await api.get('/v1/pasajero/lugares/inversa?lat=abc&lng=1', p.token)).estado).toBe(
        400,
      );
    });

    it('PAS-21: sin texto muestra los destinos recientes', async () => {
      const p = await nuevoPasajero('3002000013');
      const z = zona();
      const { respuesta } = await pedirViaje(p, z, desplazar(z, 2000, 90));
      expect(respuesta.estado).toBe(201);
      await api.post(`/v1/pasajero/viajes/${respuesta.cuerpo.id}/cancelar`, undefined, p.token);
      const r = (await api.get<any>('/v1/pasajero/lugares/buscar?q=', p.token)).cuerpo;
      expect(r.recientes[0].direccion).toBe('Cl 65 # 30-10, Cable');
    });

    it('PAS-26: lista los destinos con tarifa fija que ya tienen ubicación', async () => {
      const p = await nuevoPasajero('3002000014');
      const { rutas } = (await api.get<any>('/v1/pasajero/rutas', p.token)).cuerpo;
      const pereira = rutas.find((r: any) => r.destino === 'Pereira');
      expect(pereira.soloIda).toBeGreaterThan(100_000);
      expect(rutas.find((r: any) => r.destino === 'Nevado del Ruiz')).toMatchObject({
        idaYVuelta: expect.any(Number),
      });
      // los destinos sin ubicación verificada no se ofrecen (D-29)
      expect(rutas.some((r: any) => r.destino === 'Kilometro 41')).toBe(false);
    });
  });

  describe('cotización', () => {
    it('PAS-22: tres categorías, con rango de precio y recargo de +$1.000 y +$2.000', async () => {
      const p = await nuevoPasajero('3002000020');
      const z = zona();
      const c = await cotizar(p, z, desplazar(z, 3000, 90));
      expect(c.opciones.map((o: any) => o.categoria)).toEqual(['media', 'media_alta', 'alta']);
      for (const o of c.opciones) {
        expect(o.precio.max).toBeGreaterThanOrEqual(o.precio.min);
        expect(o.precio.min % 100).toBe(0);
        expect(o.fijo).toBe(false);
      }
      expect(c.opciones.map((o: any) => o.recargoCategoria)).toEqual([0, 1000, 2000]);
      expect(c.opciones[1].precio.min).toBeGreaterThan(c.opciones[0].precio.min);
      expect(c.opciones[2].precio.max).toBeGreaterThan(c.opciones[1].precio.max);
      // el precio mínimo de un viaje corto no baja de la tarifa mínima de Manizales ($6.300 + recargos)
      expect(c.opciones[0].precio.max).toBeGreaterThanOrEqual(6300);
    });

    it('sin conductores cerca no hay tiempo de llegada; con uno en línea sí', async () => {
      const p = await nuevoPasajero('3002000021');
      const z = zona();
      const antes = await cotizar(p, z, desplazar(z, 2500, 0));
      expect(antes.opciones[0]).toMatchObject({ conductoresCerca: 0, etaRecogidaS: null });

      const c = await api.conductorEnLinea('3002000022', desplazar(z, 900, 200));
      const despues = await cotizar(p, z, desplazar(z, 2500, 0));
      expect(despues.opciones[0].conductoresCerca).toBe(1);
      expect(despues.opciones[0].etaRecogidaS).toBeGreaterThan(60);
      expect(despues.opciones[0].etaRecogidaS).toBeLessThan(600);
      // un Chevrolet Onix es de categoría Media: no puede atender Media Alta ni Alta salvo que acepte inferiores
      expect(despues.opciones[2].conductoresCerca).toBe(0);
      await api.post('/v1/conductor/desconectar', undefined, c.accessToken);
    });

    it('rechaza lo que está fuera de cobertura o demasiado cerca', async () => {
      const p = await nuevoPasajero('3002000023');
      const bogota = await api.post<any>(
        '/v1/pasajero/cotizaciones',
        { origen: { lat: 4.711, lng: -74.0721 }, destino: { lat: 4.7, lng: -74.05 } },
        p.token,
      );
      expect(bogota.cuerpo.codigo).toBe('FUERA_DE_COBERTURA');
      const z = zona();
      const lejano = await api.post<any>(
        '/v1/pasajero/cotizaciones',
        { origen: z, destino: { lat: 4.8133, lng: -75.6961 } },
        p.token,
      );
      expect(lejano.cuerpo.codigo).toBe('DESTINO_FUERA_DE_CIUDAD');
      const cerca = await api.post<any>(
        '/v1/pasajero/cotizaciones',
        { origen: z, destino: desplazar(z, 40, 0) },
        p.token,
      );
      expect(cerca.estado).toBe(400);
      expect((await api.post('/v1/pasajero/cotizaciones', { origen: z }, p.token)).estado).toBe(
        400,
      );
    });

    it('PAS-26: la tarifa fija de una ruta nacional es un valor cerrado, igual para todos', async () => {
      const p = await nuevoPasajero('3002000024');
      const z = zona();
      const r = await api.post<any>(
        '/v1/pasajero/cotizaciones',
        { origen: z, ruta: { destino: 'Pereira', modalidad: 'solo_ida' } },
        p.token,
      );
      expect(r.estado).toBe(200);
      expect(r.cuerpo.opciones).toHaveLength(1);
      expect(r.cuerpo.opciones[0]).toMatchObject({ fijo: true, tipoServicio: 'intermunicipal' });
      expect(r.cuerpo.opciones[0].precio.min).toBe(r.cuerpo.opciones[0].precio.max);
      const lista = (await api.get<any>('/v1/pasajero/rutas', p.token)).cuerpo.rutas;
      expect(r.cuerpo.opciones[0].precio.min).toBe(
        lista.find((x: any) => x.destino === 'Pereira').soloIda,
      );
      expect(
        (
          await api.post(
            '/v1/pasajero/cotizaciones',
            { origen: z, ruta: { destino: 'Marte', modalidad: 'solo_ida' } },
            p.token,
          )
        ).estado,
      ).toBe(404);
      expect(
        (
          await api.post(
            '/v1/pasajero/cotizaciones',
            { origen: z, ruta: { destino: 'Kilometro 41', modalidad: 'solo_ida' } },
            p.token,
          )
        ).cuerpo.codigo,
      ).toBe('RUTA_SIN_UBICACION');
    });
  });

  // ---------------------------------------------------------------------------------------------- viaje
  describe('viaje de punta a punta', () => {
    async function escenario(telP: string, telC: string, opciones: { sinSocket?: boolean } = {}) {
      const z = zona();
      const c = await api.conductorEnLinea(telC, desplazar(z, 500, 200));
      const p = await nuevoPasajero(telP);
      if (!opciones.sinSocket) p.socket = await api.conectarSocket(p.token);
      return { z, c, p, destino: desplazar(z, 2500, 90) };
    }

    async function aceptar(c: Awaited<ReturnType<Arnes['conductorEnLinea']>>, viajeId: string) {
      const oferta = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === viajeId);
      const r = await api.post<any>(
        `/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`,
        undefined,
        c.accessToken,
      );
      expect(r.estado).toBe(200);
      return { oferta, viaje: r.cuerpo };
    }

    async function posicionar(c: { accessToken: string }, punto: { lat: number; lng: number }) {
      return api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ ...punto, t: Date.now(), precisionM: 5, velocidadKmh: 20, rumbo: 90 }] },
        c.accessToken,
      );
    }

    async function llegarEIniciar(
      p: Pasajero,
      c: { accessToken: string },
      viajeId: string,
      recogida: { lat: number; lng: number },
    ) {
      await posicionar(c, desplazar(recogida, 30, 0));
      expect(
        (await api.post(`/v1/conductor/viajes/${viajeId}/llegue`, {}, c.accessToken)).estado,
      ).toBe(200);
      const pin = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje.pin;
      expect(pin).toMatch(/^[0-9]{4}$/);
      const r = await api.post(`/v1/conductor/viajes/${viajeId}/iniciar`, { pin }, c.accessToken);
      expect(r.estado).toBe(200);
    }

    const finalizarViaje = (
      c: { accessToken: string },
      viajeId: string,
      m = { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
    ) => api.post<any>(`/v1/conductor/viajes/${viajeId}/finalizar`, m, c.accessToken);

    it('PAS-24 a PAS-41: el pasajero pide, ve a su conductor llegar, viaja, paga y califica', async () => {
      const { z, c, p, destino } = await escenario('3002100001', '3002100002');
      const pedido = await pedirViaje(p, z, destino, { nota: 'Portería 2' });
      expect(pedido.respuesta.estado).toBe(201);
      const v = pedido.respuesta.cuerpo;
      expect(v).toMatchObject({
        estado: 'buscando_conductor',
        metodoPago: 'efectivo',
        nota: 'Portería 2',
        conductor: null,
        pin: null,
      });
      expect(v.cancelacion).toMatchObject({ gratis: true, costo: 0 });
      expect(new Date(v.busqueda.expiraEn).getTime()).toBeGreaterThan(Date.now());
      expect(v.precioEstimado.max).toBeGreaterThanOrEqual(v.precioEstimado.min);

      // el conductor ve la oferta: nombre de pila, calificación y solo la zona del destino (D-11)
      const oferta = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.id);
      expect(oferta.pasajero.nombre).toBe('Valentina');
      expect(oferta.destino.zona).toBe('Cable');
      expect(oferta.recogida.direccion).toContain('Palogrande');

      const aceptada = await api.post<any>(
        `/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`,
        undefined,
        c.accessToken,
      );
      expect(aceptada.estado).toBe(200);
      await p.socket!.esperar(
        'viaje:estado',
        (d: any) => d.viajeId === v.id && d.estado === 'asignado',
      );

      // PAS-30: nombre, calificación, vehículo y placa
      const asignado = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje;
      expect(asignado.estado).toBe('asignado');
      expect(asignado.pin).toMatch(/^[0-9]{4}$/);
      expect(asignado.conductor.nombre).toMatch(/^Carlos P\.$/);
      expect(asignado.conductor.vehiculo).toMatchObject({
        marca: 'Chevrolet',
        linea: 'Onix',
        color: 'Blanco',
        categoria: 'media',
      });
      expect(asignado.conductor.vehiculo.placa).toMatch(/^[A-Z]{3}[0-9]{2}[0-9A-Z]$/);
      expect(asignado.cancelacion.segundosGratisRestantes).toBeGreaterThan(0);

      // PAS-31: ve a su conductor moverse, con lo que falta para llegar; sin saturar (cada 1,5 s como máximo)
      await posicionar(c, desplazar(z, 400, 200));
      const pos1 = await p.socket!.esperar(
        'viaje:ubicacion_conductor',
        (d: any) => d.viajeId === v.id,
      );
      expect(pos1).toMatchObject({ hacia: 'recogida' });
      expect(pos1.distanciaM).toBeGreaterThan(300);
      expect(pos1.etaS).toBeGreaterThan(30);
      await posicionar(c, desplazar(z, 300, 200));
      expect(p.socket!.cuantos('viaje:ubicacion_conductor')).toBe(1);

      await llegarEIniciar(p, c, v.id, z);
      await p.socket!.esperar('viaje:estado', (d: any) => d.estado === 'en_sitio');
      await p.socket!.esperar('viaje:estado', (d: any) => d.estado === 'en_curso');
      const enCurso = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje;
      expect(enCurso).toMatchObject({ estado: 'en_curso', pin: null, cancelacion: null });
      expect(enCurso.conductor.hacia).toBe('destino');

      const fin = await finalizarViaje(c, v.id);
      expect(fin.estado).toBe(200);
      const evFin = await p.socket!.esperar('viaje:estado', (d: any) => d.estado === 'finalizado');
      expect(evFin.precioFinal).toBe(fin.cuerpo.precioFinal);

      // PAS-40: resumen; mientras no califique, la app lo sigue mostrando
      const resumen = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje;
      expect(resumen).toMatchObject({
        estado: 'finalizado',
        precioFinal: fin.cuerpo.precioFinal,
        puedeCalificar: true,
        puedeDarPropina: false,
      });

      // PAS-43: el recibo suma exactamente lo que pagó
      const recibo = (await api.get<any>(`/v1/pasajero/viajes/${v.id}/recibo`, p.token)).cuerpo;
      expect(recibo.lineas.reduce((t: number, l: any) => t + l.valor, 0)).toBe(
        fin.cuerpo.precioFinal,
      );
      expect(recibo.lineas[0]).toMatchObject({ concepto: 'Banderazo', valor: 3700 });
      expect(recibo.mediciones.distanciaM).toBe(3000);
      expect(recibo.conductor.vehiculo.linea).toBe('Onix');

      // PAS-41: calificación, una sola vez
      const cal = await api.post(
        `/v1/pasajero/viajes/${v.id}/calificacion`,
        { estrellas: 4, etiquetas: ['Amable'], comentario: 'Todo bien' },
        p.token,
      );
      expect(cal.estado).toBe(200);
      expect(
        (await api.post<any>(`/v1/pasajero/viajes/${v.id}/calificacion`, { estrellas: 5 }, p.token))
          .cuerpo.codigo,
      ).toBe('YA_CALIFICASTE');
      const [fila] = await api.bd.db
        .select()
        .from(conductor)
        .where(eq(conductor.usuarioId, c.usuarioId));
      expect(fila).toMatchObject({ calificacionPromedio: 4, calificacionesTotal: 1 });
      expect((await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje).toBeNull();

      // PAS-44: historial
      const hist = (await api.get<any>('/v1/pasajero/viajes', p.token)).cuerpo.viajes;
      expect(hist[0]).toMatchObject({
        id: v.id,
        estado: 'finalizado',
        calificacion: 4,
        precioFinal: fin.cuerpo.precioFinal,
      });
      expect(hist[0].placa).toBe(asignado.conductor.vehiculo.placa);
      expect(
        (await api.get<any>('/v1/pasajero/viajes?estado=cancelado', p.token)).cuerpo.viajes,
      ).toHaveLength(0);

      // los viajes de otra persona no se pueden ver
      const intruso = await nuevoPasajero('3002100003');
      expect((await api.get(`/v1/pasajero/viajes/${v.id}`, intruso.token)).estado).toBe(404);
      expect((await api.get(`/v1/pasajero/viajes/${v.id}/recibo`, intruso.token)).estado).toBe(404);
      expect(
        (await api.post(`/v1/pasajero/viajes/${v.id}/cancelar`, undefined, intruso.token)).estado,
      ).toBe(404);
    });

    it('un solo viaje a la vez, y una cotización sirve una sola vez y vence', async () => {
      const { z, p, destino } = await escenario('3002100010', '3002100011', { sinSocket: true });
      const primero = await pedirViaje(p, z, destino);
      expect(primero.respuesta.estado).toBe(201);
      const otro = await pedirViaje(p, z, destino);
      expect(otro.respuesta.cuerpo.codigo).toBe('VIAJE_EN_CURSO');
      await api.post(
        `/v1/pasajero/viajes/${primero.respuesta.cuerpo.id}/cancelar`,
        undefined,
        p.token,
      );
      const reusar = await api.post<any>(
        '/v1/pasajero/viajes',
        { cotizacionId: primero.cotizacion.opciones[0].id, metodoPago: 'efectivo' },
        p.token,
      );
      expect(reusar.cuerpo.codigo).toBe('COTIZACION_USADA');
      const c = await cotizar(p, z, destino);
      await api.bd.db.execute(
        sql`update cotizacion set expira_en = now() - interval '1 second' where id = ${c.opciones[0].id}`,
      );
      expect(
        (
          await api.post<any>(
            '/v1/pasajero/viajes',
            { cotizacionId: c.opciones[0].id, metodoPago: 'efectivo' },
            p.token,
          )
        ).cuerpo.codigo,
      ).toBe('COTIZACION_VENCIDA');
      // la cotización de otra persona no sirve
      const ajeno = await nuevoPasajero('3002100012');
      const c2 = await cotizar(p, z, destino);
      expect(
        (
          await api.post<any>(
            '/v1/pasajero/viajes',
            { cotizacionId: c2.opciones[0].id, metodoPago: 'efectivo' },
            ajeno.token,
          )
        ).estado,
      ).toBe(404);
    });

    it('si nadie acepta en el tiempo límite, el pasajero lo sabe y puede reintentar', async () => {
      const corto = await levantarApi({}, { despacho: { presupuestoMs: 900, reintentoMs: 200 } });
      try {
        const s = await corto.iniciarSesion('3002100020', 'pasajero');
        await corto.patch('/v1/pasajero/yo', { nombre: 'Camila Duque' }, s.accessToken);
        await corto.post('/v1/pasajero/terminos', { version: '2026-10' }, s.accessToken);
        const socket = await corto.conectarSocket(s.accessToken);
        const z = zona();
        const c = await corto.post<any>(
          '/v1/pasajero/cotizaciones',
          { origen: z, destino: desplazar(z, 2000, 90) },
          s.accessToken,
        );
        const v = await corto.post<any>(
          '/v1/pasajero/viajes',
          { cotizacionId: c.cuerpo.opciones[0].id, metodoPago: 'efectivo' },
          s.accessToken,
        );
        expect(v.estado).toBe(201);
        await socket.esperar('viaje:estado', (d: any) => d.estado === 'sin_conductor', 5000);
        // ya no tiene viaje activo: puede volver a pedir con la misma ruta
        expect(
          (await corto.get<any>('/v1/pasajero/viaje-actual', s.accessToken)).cuerpo.viaje,
        ).toBeNull();
        const c2 = await corto.post<any>(
          '/v1/pasajero/cotizaciones',
          { origen: z, destino: desplazar(z, 2000, 90) },
          s.accessToken,
        );
        expect(
          (
            await corto.post(
              '/v1/pasajero/viajes',
              { cotizacionId: c2.cuerpo.opciones[0].id, metodoPago: 'efectivo' },
              s.accessToken,
            )
          ).estado,
        ).toBe(201);
        const hist = (await corto.get<any>('/v1/pasajero/viajes', s.accessToken)).cuerpo.viajes;
        expect(hist[0].estado).toBe('sin_conductor');
      } finally {
        await corto.cerrar();
      }
    });

    it('RN-042: cancelar es gratis al buscar y en los primeros 2 minutos; después cuesta y queda como deuda en efectivo', async () => {
      const { z, c, p, destino } = await escenario('3002100030', '3002100031');
      // 1. mientras se busca
      const a = await pedirViaje(p, z, destino);
      const oferta = await c.socket.esperar(
        'oferta:nueva',
        (d: any) => d.viajeId === a.respuesta.cuerpo.id,
      );
      const gratis = await api.post<any>(
        `/v1/pasajero/viajes/${a.respuesta.cuerpo.id}/cancelar`,
        undefined,
        p.token,
      );
      expect(gratis.cuerpo).toEqual({ costo: 0 });
      await c.socket.esperar('oferta:retirada', (d: any) => d.ofertaId === oferta.ofertaId);

      // 2. con conductor, dentro de los 2 minutos
      const b = await pedirViaje(p, z, destino);
      await aceptar(c, b.respuesta.cuerpo.id);
      const dentro = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje;
      expect(dentro.cancelacion).toMatchObject({ gratis: true, costo: 0 });
      expect(
        (
          await api.post<any>(
            `/v1/pasajero/viajes/${b.respuesta.cuerpo.id}/cancelar`,
            undefined,
            p.token,
          )
        ).cuerpo.costo,
      ).toBe(0);
      await c.socket.esperar(
        'viaje:estado',
        (d: any) => d.viajeId === b.respuesta.cuerpo.id && d.estado === 'cancelado',
      );

      // 3. pasados los 2 minutos: se le avisa el costo ANTES de cancelar (HU-PAS-02)
      const d = await pedirViaje(p, z, destino);
      await aceptar(c, d.respuesta.cuerpo.id);
      await api.bd.db.execute(
        sql`update viaje set solicitado_en = solicitado_en - interval '5 minutes', aceptado_en = now() - interval '4 minutes' where id = ${d.respuesta.cuerpo.id}`,
      );
      const tarde = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje;
      expect(tarde.cancelacion).toMatchObject({
        gratis: false,
        costo: 4000,
        segundosGratisRestantes: null,
      });
      const cobrado = await api.post<any>(
        `/v1/pasajero/viajes/${d.respuesta.cuerpo.id}/cancelar`,
        undefined,
        p.token,
      );
      expect(cobrado.cuerpo.costo).toBe(4000);
      const [fila] = await api.bd.db.select().from(pasajero).where(eq(pasajero.usuarioId, p.id));
      expect(fila!.deudaPendiente).toBe(4000);

      // 4. con deuda no puede pedir otro viaje (RN-053) hasta pagarla con tarjeta
      const bloqueado = await pedirViaje(p, z, destino);
      expect(bloqueado.respuesta.cuerpo).toMatchObject({ codigo: 'DEUDA_PENDIENTE', deuda: 4000 });
      expect((await api.get<any>('/v1/pasajero/yo', p.token)).cuerpo.deuda).toBe(4000);
      const sinTarjeta = await api.post<any>(
        '/v1/pasajero/deuda/pagar',
        { metodoPagoId: '00000000-0000-4000-8000-000000000000' },
        p.token,
      );
      expect(sinTarjeta.estado).toBe(404);
      const tok = await api.post<any>(
        '/v1/dev/tarjetas/tokenizar',
        { numero: '4242 4242 4242 4242', vence: '12/30', cvc: '123' },
        p.token,
      );
      const tarjeta = await api.post<any>(
        '/v1/pasajero/metodos-pago',
        { token: tok.cuerpo.token, marca: tok.cuerpo.marca, ultimos4: tok.cuerpo.ultimos4 },
        p.token,
      );
      const pagada = await api.post<any>(
        '/v1/pasajero/deuda/pagar',
        { metodoPagoId: tarjeta.cuerpo.id },
        p.token,
      );
      expect(pagada.cuerpo.pagado).toBe(4000);
      expect((await pedirViaje(p, z, destino)).respuesta.estado).toBe(201);
    });

    it('RN-045: si el conductor cancela, el pasajero sigue en búsqueda sin costo; si no llega, ve la cancelación', async () => {
      const { z, c, p, destino } = await escenario('3002100040', '3002100041');
      const v = (await pedirViaje(p, z, destino)).respuesta.cuerpo;
      await aceptar(c, v.id);
      const cancelado = await api.post<any>(
        `/v1/conductor/viajes/${v.id}/cancelar`,
        { motivo: 'problema_vehiculo' },
        c.accessToken,
      );
      expect(cancelado.cuerpo.reasignado).toBe(true);
      const ev = await p.socket!.esperar('viaje:estado', (d: any) => d.reasignando === true);
      expect(ev.estado).toBe('buscando_conductor');
      const ahora = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje;
      expect(ahora).toMatchObject({ estado: 'buscando_conductor', conductor: null, pin: null });
      await api.post(`/v1/pasajero/viajes/${v.id}/cancelar`, undefined, p.token);
    });
  });

  // ---------------------------------------------------------------------------------------------- pagos
  describe('pagos con tarjeta', () => {
    async function agregarTarjeta(p: Pasajero, numero: string) {
      const tok = await api.post<any>(
        '/v1/dev/tarjetas/tokenizar',
        { numero, vence: '12/30', cvc: '123' },
        p.token,
      );
      expect(tok.estado).toBe(200);
      const r = await api.post<any>(
        '/v1/pasajero/metodos-pago',
        { token: tok.cuerpo.token, marca: tok.cuerpo.marca, ultimos4: tok.cuerpo.ultimos4 },
        p.token,
      );
      expect(r.estado).toBe(201);
      return r.cuerpo;
    }

    it('PAS-11: tokeniza sin guardar el número, valida la tarjeta y maneja la predeterminada', async () => {
      const p = await nuevoPasajero('3002200001');
      for (const mala of [
        { numero: '4242 4242 4242 4241', vence: '12/30', cvc: '123' }, // Luhn
        { numero: '4242 4242 4242 4242', vence: '01/20', cvc: '123' }, // vencida
        { numero: '4242 4242 4242 4242', vence: '13/30', cvc: '123' },
        { numero: '4242 4242 4242 4242', vence: '12/30', cvc: '1' },
      ]) {
        expect(
          (await api.post('/v1/dev/tarjetas/tokenizar', mala, p.token)).estado,
          JSON.stringify(mala),
        ).toBe(400);
      }
      const visa = await agregarTarjeta(p, '4242 4242 4242 4242');
      expect(visa).toMatchObject({ marca: 'Visa', ultimos4: '4242', predeterminado: true });
      const master = await agregarTarjeta(p, '5555 5555 5555 4444');
      expect(master).toMatchObject({ marca: 'Mastercard', predeterminado: false });
      expect(
        (
          await api.post<any>(
            '/v1/pasajero/metodos-pago',
            { token: 'tok_sim_repetido_xx', marca: 'Visa', ultimos4: '1111' },
            p.token,
          )
        ).estado,
      ).toBe(201);
      expect(
        (
          await api.post<any>(
            '/v1/pasajero/metodos-pago',
            { token: 'tok_sim_repetido_xx', marca: 'Visa', ultimos4: '1111' },
            p.token,
          )
        ).cuerpo.codigo,
      ).toBe('TARJETA_REPETIDA');

      expect(
        (await api.put(`/v1/pasajero/metodos-pago/${master.id}/predeterminado`, undefined, p.token))
          .estado,
      ).toBe(204);
      const lista = (await api.get<any>('/v1/pasajero/yo', p.token)).cuerpo.metodosPago;
      expect(lista.find((m: any) => m.predeterminado).ultimos4).toBe('4444');
      // nunca se guarda ni se devuelve el número completo ni el token
      expect(JSON.stringify(lista)).not.toMatch(/4242 4242|tok_sim/);

      const quitar = (id: string) =>
        fetch(`${api.url}/v1/pasajero/metodos-pago/${id}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${p.token}` },
        });
      expect((await quitar(master.id)).status).toBe(204);
      const despues = (await api.get<any>('/v1/pasajero/yo', p.token)).cuerpo.metodosPago;
      expect(despues.filter((m: any) => m.predeterminado)).toHaveLength(1); // otra pasa a ser la predeterminada
      expect((await quitar(master.id)).status).toBe(404);
    });

    it('pagar con tarjeta: sin tarjeta no se puede, y el viaje queda pagado al terminar; propina solo una vez y completa al conductor', async () => {
      const z = zona();
      const c = await api.conductorEnLinea('3002200011', desplazar(z, 500, 200));
      const p = await nuevoPasajero('3002200010');
      const destino = desplazar(z, 2500, 90);
      const sin = await pedirViaje(p, z, destino, { metodoPago: 'tarjeta' });
      expect(sin.respuesta.cuerpo.codigo).toBe('SIN_TARJETA');
      await agregarTarjeta(p, '4242 4242 4242 4242');

      const v = (await pedirViaje(p, z, destino, { metodoPago: 'tarjeta' })).respuesta.cuerpo;
      expect(v.metodoPago).toBe('tarjeta');
      const oferta = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.id);
      expect(oferta.metodoPago).toBe('tarjeta');
      await api.post(`/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`, undefined, c.accessToken);
      await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ ...desplazar(z, 20, 0), t: Date.now(), precisionM: 5 }] },
        c.accessToken,
      );
      await api.post(`/v1/conductor/viajes/${v.id}/llegue`, {}, c.accessToken);
      const pin = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje.pin;
      await api.post(`/v1/conductor/viajes/${v.id}/iniciar`, { pin }, c.accessToken);
      const fin = await api.post<any>(
        `/v1/conductor/viajes/${v.id}/finalizar`,
        { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
        c.accessToken,
      );
      expect(fin.cuerpo.cobrarEnEfectivo).toBe(0);

      const resumen = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje;
      expect(resumen).toMatchObject({ estadoPago: 'pagado', puedeDarPropina: true });
      expect(
        (await api.post<any>(`/v1/pasajero/viajes/${v.id}/propina`, { monto: 100 }, p.token))
          .estado,
      ).toBe(400);
      const antes = (await api.get<any>('/v1/conductor/saldo', c.accessToken)).cuerpo.saldo;
      expect(
        (await api.post<any>(`/v1/pasajero/viajes/${v.id}/propina`, { monto: 2000 }, p.token))
          .cuerpo,
      ).toEqual({ propina: 2000 });
      expect((await api.get<any>('/v1/conductor/saldo', c.accessToken)).cuerpo.saldo).toBe(
        antes + 2000,
      ); // sin comisión
      expect(
        (await api.post<any>(`/v1/pasajero/viajes/${v.id}/propina`, { monto: 2000 }, p.token))
          .cuerpo.codigo,
      ).toBe('YA_DIO_PROPINA');
      const recibo = (await api.get<any>(`/v1/pasajero/viajes/${v.id}/recibo`, p.token)).cuerpo;
      expect(recibo.lineas.at(-1)).toEqual({ concepto: 'Propina', valor: 2000 });
      expect(recibo.total).toBe(fin.cuerpo.precioFinal + 2000);
    });

    it('en efectivo no hay propina en la app', async () => {
      const z = zona();
      const c = await api.conductorEnLinea('3002200021', desplazar(z, 500, 200));
      const p = await nuevoPasajero('3002200020');
      const v = (await pedirViaje(p, z, desplazar(z, 2500, 90))).respuesta.cuerpo;
      const oferta = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.id);
      await api.post(`/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`, undefined, c.accessToken);
      await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ ...desplazar(z, 20, 0), t: Date.now(), precisionM: 5 }] },
        c.accessToken,
      );
      await api.post(`/v1/conductor/viajes/${v.id}/llegue`, {}, c.accessToken);
      const pin = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje.pin;
      await api.post(`/v1/conductor/viajes/${v.id}/iniciar`, { pin }, c.accessToken);
      const fin = await api.post<any>(
        `/v1/conductor/viajes/${v.id}/finalizar`,
        { distanciaM: 2800, tiempoDetenidoS: 0, duracionS: 15 },
        c.accessToken,
      );
      expect(fin.cuerpo.cobrarEnEfectivo).toBeGreaterThan(0);
      expect(
        (await api.post<any>(`/v1/pasajero/viajes/${v.id}/propina`, { monto: 1000 }, p.token))
          .cuerpo.codigo,
      ).toBe('PROPINA_NO_DISPONIBLE');
    });

    it('HU-PAS-04: si el banco rechaza el cobro, el viaje queda como deuda y no puede pedir otro hasta pagarla', async () => {
      const z = zona();
      const c = await api.conductorEnLinea('3002200031', desplazar(z, 500, 200));
      const p = await nuevoPasajero('3002200030');
      const destino = desplazar(z, 2500, 90);
      const mala = await agregarTarjeta(p, '4000 0000 0000 0002'); // la pasarela de prueba la rechaza al cobrar
      expect(mala.ultimos4).toBe('0002');
      const v = (await pedirViaje(p, z, destino, { metodoPago: 'tarjeta' })).respuesta.cuerpo;
      const oferta = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.id);
      await api.post(`/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`, undefined, c.accessToken);
      await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ ...desplazar(z, 20, 0), t: Date.now(), precisionM: 5 }] },
        c.accessToken,
      );
      await api.post(`/v1/conductor/viajes/${v.id}/llegue`, {}, c.accessToken);
      const pin = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje.pin;
      await api.post(`/v1/conductor/viajes/${v.id}/iniciar`, { pin }, c.accessToken);
      const fin = await api.post<any>(
        `/v1/conductor/viajes/${v.id}/finalizar`,
        { distanciaM: 3000, tiempoDetenidoS: 0, duracionS: 20 },
        c.accessToken,
      );

      const resumen = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje;
      expect(resumen.estadoPago).toBe('fallido');
      const yo = (await api.get<any>('/v1/pasajero/yo', p.token)).cuerpo;
      expect(yo.deuda).toBe(fin.cuerpo.precioFinal);
      // el conductor cobra igual: el riesgo del cobro fallido lo asume TransporteYa, no quien manejó
      expect(fin.cuerpo.gananciaNeta).toBeGreaterThan(0);
      expect(
        (await api.post<any>(`/v1/pasajero/viajes/${v.id}/propina`, { monto: 1000 }, p.token))
          .cuerpo.codigo,
      ).toBe('PROPINA_NO_DISPONIBLE');

      expect((await pedirViaje(p, z, destino)).respuesta.cuerpo.codigo).toBe('DEUDA_PENDIENTE');
      expect(
        (await api.post<any>('/v1/pasajero/deuda/pagar', { metodoPagoId: mala.id }, p.token)).cuerpo
          .codigo,
      ).toBe('COBRO_RECHAZADO');
      const buena = await agregarTarjeta(p, '4242 4242 4242 4242');
      expect(
        (await api.post<any>('/v1/pasajero/deuda/pagar', { metodoPagoId: buena.id }, p.token))
          .cuerpo.pagado,
      ).toBe(fin.cuerpo.precioFinal);
      expect((await api.get<any>('/v1/pasajero/yo', p.token)).cuerpo.deuda).toBe(0);
      const [fila] = await api.bd.db.select().from(viaje).where(eq(viaje.id, v.id));
      expect(fila!.estadoPago).toBe('pagado');
      expect((await pedirViaje(p, z, destino)).respuesta.estado).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------------------------- durante el viaje
  describe('durante el viaje', () => {
    async function viajeAsignado(telP: string, telC: string) {
      const z = zona();
      const c = await api.conductorEnLinea(telC, desplazar(z, 500, 200));
      const p = await nuevoPasajero(telP);
      p.socket = await api.conectarSocket(p.token);
      const v = (await pedirViaje(p, z, desplazar(z, 2500, 90))).respuesta.cuerpo;
      const oferta = await c.socket.esperar('oferta:nueva', (d: any) => d.viajeId === v.id);
      await api.post(`/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`, undefined, c.accessToken);
      return { z, c, p, v };
    }

    it('PAS-32: chat entre pasajero y conductor, solo durante el viaje', async () => {
      const { c, p, v } = await viajeAsignado('3002300001', '3002300002');
      const m1 = await api.post<any>(
        `/v1/pasajero/viajes/${v.id}/mensajes`,
        { cuerpo: '  Estoy en la portería 2  ' },
        p.token,
      );
      expect(m1.cuerpo).toMatchObject({ deQuien: 'pasajero', cuerpo: 'Estoy en la portería 2' });
      const recibido = await c.socket.esperar('viaje:mensaje', (d: any) => d.viajeId === v.id);
      expect(recibido.cuerpo).toBe('Estoy en la portería 2');

      const m2 = await api.post<any>(
        `/v1/conductor/viajes/${v.id}/mensajes`,
        { cuerpo: 'Ya voy, 2 minutos' },
        c.accessToken,
      );
      expect(m2.cuerpo.deQuien).toBe('conductor');
      await p.socket!.esperar('viaje:mensaje', (d: any) => d.cuerpo === 'Ya voy, 2 minutos');

      const lista = (await api.get<any>(`/v1/pasajero/viajes/${v.id}/mensajes`, p.token)).cuerpo
        .mensajes;
      expect(lista.map((m: any) => m.deQuien)).toEqual(['pasajero', 'conductor']);
      expect(
        (await api.get<any>(`/v1/conductor/viajes/${v.id}/mensajes`, c.accessToken)).cuerpo
          .mensajes,
      ).toHaveLength(2);

      expect(
        (await api.post(`/v1/pasajero/viajes/${v.id}/mensajes`, { cuerpo: '' }, p.token)).estado,
      ).toBe(400);
      const intruso = await nuevoPasajero('3002300003');
      expect((await api.get(`/v1/pasajero/viajes/${v.id}/mensajes`, intruso.token)).estado).toBe(
        404,
      );
      expect(
        (await api.post(`/v1/pasajero/viajes/${v.id}/mensajes`, { cuerpo: 'hola' }, intruso.token))
          .estado,
      ).toBe(404);

      await api.post(`/v1/pasajero/viajes/${v.id}/cancelar`, undefined, p.token);
      expect(
        (await api.post<any>(`/v1/pasajero/viajes/${v.id}/mensajes`, { cuerpo: 'hola' }, p.token))
          .cuerpo.codigo,
      ).toBe('CHAT_CERRADO');
    });

    it('PAS-34: el enlace del viaje es público, no muestra datos del pasajero y se puede revocar', async () => {
      const { z, c, p, v } = await viajeAsignado('3002300010', '3002300011');
      const enlace = await api.post<any>(
        `/v1/pasajero/viajes/${v.id}/compartir`,
        undefined,
        p.token,
      );
      expect(enlace.cuerpo.ruta).toMatch(/^\/c\/[A-Za-z0-9_-]{30,}$/);
      const token = enlace.cuerpo.ruta.slice(3);
      await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ ...desplazar(z, 300, 200), t: Date.now(), precisionM: 5 }] },
        c.accessToken,
      );

      const publico = await api.get<any>(`/v1/compartido/${token}`); // sin sesión
      expect(publico.estado).toBe(200);
      expect(publico.cuerpo).toMatchObject({
        estado: 'asignado',
        destino: { zona: 'Cable' },
        conductor: { nombre: 'Carlos' },
      });
      expect(publico.cuerpo.conductor.vehiculo.placa).toMatch(/^[A-Z]{3}/);
      expect(publico.cuerpo.conductor.posicion).not.toBeNull();
      const texto = JSON.stringify(publico.cuerpo);
      expect(texto).not.toMatch(/Valentina|Ríos|3002300010|pin/i); // nada del pasajero
      expect(
        (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje.compartido,
      ).toBe(true);
      expect((await api.get(`/v1/compartido/token-inventado`)).estado).toBe(404);

      expect(
        (
          await fetch(`${api.url}/v1/pasajero/viajes/${v.id}/compartir`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${p.token}` },
          })
        ).status,
      ).toBe(204);
      expect((await api.get(`/v1/compartido/${token}`)).estado).toBe(404);
      expect(
        (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje.compartido,
      ).toBe(false);
    });

    it('solo se comparte un viaje con conductor', async () => {
      const z = zona();
      const p = await nuevoPasajero('3002300020');
      const v = (await pedirViaje(p, z, desplazar(z, 2500, 90))).respuesta.cuerpo;
      expect(
        (await api.post<any>(`/v1/pasajero/viajes/${v.id}/compartir`, undefined, p.token)).cuerpo
          .codigo,
      ).toBe('ESTADO_INVALIDO');
    });

    it('PAS-35: el SOS crea una alerta crítica una sola vez y avisa cuántos contactos de confianza', async () => {
      const { z, p, v } = await viajeAsignado('3002300030', '3002300031');
      await api.post('/v1/pasajero/contactos', { nombre: 'Mamá', telefono: '3105551111' }, p.token);
      await api.post(
        '/v1/pasajero/contactos',
        { nombre: 'Hermano', telefono: '3105552222' },
        p.token,
      );
      const r = await api.post<any>('/v1/pasajero/sos', { lat: z.lat, lng: z.lng }, p.token);
      expect(r.cuerpo).toMatchObject({ linea: '123', contactosAvisados: 2 });
      const otra = await api.post<any>('/v1/pasajero/sos', {}, p.token);
      expect(otra.cuerpo.alertaId).toBe(r.cuerpo.alertaId);
      const filas = await api.bd.db.execute<any>(
        sql`select tipo, severidad, viaje_id, datos from alerta where id = ${r.cuerpo.alertaId}`,
      );
      expect(filas.rows[0]).toMatchObject({ tipo: 'sos', severidad: 'critica', viaje_id: v.id });
      expect(filas.rows[0].datos).toMatchObject({ origen: 'pasajero', pasajeroId: p.id });
    });

    it('PAS-50/51: reportar un problema o un objeto perdido de un viaje', async () => {
      const { p, v } = await viajeAsignado('3002300040', '3002300041');
      const r = await api.post<any>(
        '/v1/pasajero/soporte/tickets',
        {
          tipo: 'objeto_perdido',
          viajeId: v.id,
          asunto: 'Dejé mi chaqueta en el carro',
          detalle: 'Es azul, en el asiento de atrás',
        },
        p.token,
      );
      expect(r.estado).toBe(201);
      expect(r.cuerpo.respuestaEnHoras).toBe(24);
      const seg = await api.post<any>(
        '/v1/pasajero/soporte/tickets',
        { tipo: 'incidente_seguridad', asunto: 'El conductor iba muy rápido' },
        p.token,
      );
      expect(seg.cuerpo.respuestaEnHoras).toBe(2);
      const lista = (await api.get<any>('/v1/pasajero/soporte/tickets', p.token)).cuerpo.tickets;
      expect(lista).toHaveLength(2);
      expect(lista.find((t: any) => t.tipo === 'objeto_perdido').codigo).toMatch(/^TY-/);
      const intruso = await nuevoPasajero('3002300042');
      expect(
        (
          await api.post(
            '/v1/pasajero/soporte/tickets',
            { tipo: 'queja', viajeId: v.id, asunto: 'Algo ajeno' },
            intruso.token,
          )
        ).estado,
      ).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------------------------- conductores simulados
  describe('conductores simulados (modo demostración)', () => {
    it('atienden el viaje de verdad, de la oferta al cobro, y el pasajero lo sigue en vivo', async () => {
      const z = zona();
      const p = await nuevoPasajero('3002400001');
      p.socket = await api.conectarSocket(p.token);
      const creados = await api.post<any>(
        '/v1/dev/conductores-simulados',
        { ...z, cantidad: 1, velocidadMs: 45, cercaM: 300 },
        p.token,
      );
      expect(creados.estado).toBe(201);
      expect(creados.cuerpo.conductores).toHaveLength(1);
      const cot = await cotizar(p, z, desplazar(z, 700, 90));
      expect(cot.opciones[0].conductoresCerca).toBe(1);

      const v = (await pedirViaje(p, z, desplazar(z, 700, 90))).respuesta.cuerpo;
      await p.socket.esperar('viaje:estado', (d: any) => d.estado === 'asignado', 15_000);
      const asignado = (await api.get<any>('/v1/pasajero/viaje-actual', p.token)).cuerpo.viaje;
      expect(asignado.conductor.vehiculo.placa).toMatch(/^SIM/);
      await p.socket.esperar('viaje:ubicacion_conductor', () => true, 10_000);
      await p.socket.esperar('viaje:estado', (d: any) => d.estado === 'en_sitio', 30_000);
      await p.socket.esperar('viaje:estado', (d: any) => d.estado === 'en_curso', 30_000);
      const fin = await p.socket.esperar(
        'viaje:estado',
        (d: any) => d.estado === 'finalizado',
        60_000,
      );
      expect(fin.precioFinal).toBeGreaterThanOrEqual(6300);
      // el conductor simulado también cobró el efectivo y calificó al pasajero
      const [fila] = await api.bd.db.select().from(viaje).where(eq(viaje.id, v.id));
      expect(fila).toMatchObject({ estado: 'finalizado', estadoPago: 'pagado' });
      const [{ n }] = (
        await api.bd.db.execute<{ n: number }>(
          sql`select count(*)::int as n from calificacion where viaje_id = ${v.id} and a_usuario_id = ${p.id}`,
        )
      ).rows as [{ n: number }];
      expect(n).toBe(1);
      const detenidos = await fetch(`${api.url}/v1/dev/conductores-simulados`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${p.token}` },
      });
      expect((await detenidos.json()).detenidos).toBe(1);
    }, 120_000);

    it('no existen fuera del modo demostración', async () => {
      const produccion = await levantarApi({ SIMULADOR: 'false' });
      try {
        const s = await produccion.iniciarSesion('3002400010', 'pasajero');
        expect(
          (
            await produccion.post(
              '/v1/dev/conductores-simulados',
              { lat: 5.07, lng: -75.51 },
              s.accessToken,
            )
          ).estado,
        ).toBe(404);
        expect(
          (
            await produccion.post(
              '/v1/dev/tarjetas/tokenizar',
              { numero: '4242424242424242', vence: '12/30', cvc: '123' },
              s.accessToken,
            )
          ).estado,
        ).toBe(404);
      } finally {
        await produccion.cerrar();
      }
    });
  });
});
