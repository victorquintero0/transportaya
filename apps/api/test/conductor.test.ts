import { eq } from 'drizzle-orm';
import {
  conductor,
  cuentaPagoConductor,
  posicionConductor,
  sesionConductor,
} from '@transportaya/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConexionService } from '../src/conductor/conexion.service.js';
import { type Arnes, PNG_MINIMO, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('conductor: registro, documentos y conexión', () => {
  let api: Arnes;
  beforeAll(async () => {
    api = await levantarApi();
  });
  afterAll(async () => {
    await api.cerrar();
  });

  const formulario = (
    campos: Record<string, string>,
    archivo?: { contenido: Buffer | string; nombre?: string },
  ) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    if (archivo) f.set('archivo', new Blob([archivo.contenido]), archivo.nombre ?? 'doc.png');
    return f;
  };

  describe('perfil y onboarding', () => {
    it('un conductor nuevo ve su registro incompleto y por qué no puede conectarse', async () => {
      const s = await api.iniciarSesion('3001110001');
      const r = await api.get('/v1/conductor/yo', s.accessToken);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.conductor).toMatchObject({
        estadoHabilitacion: 'registro_incompleto',
        estadoOperativo: 'desconectado',
      });
      expect(r.cuerpo.ciudad.nombre).toBe('Manizales');
      expect(r.cuerpo.onboarding.pasos.map((p: any) => [p.id, p.completo])).toEqual([
        ['datos', false],
        ['vehiculo', false],
        ['documentos', false],
        ['cuenta', false],
        ['revision', false],
      ]);
      expect(r.cuerpo.onboarding.puedeEnviarRevision).toBe(false);
      expect(r.cuerpo.conexion).toMatchObject({ puedeConectarse: false });
      expect(r.cuerpo.conexion.motivos[0]).toMatchObject({ codigo: 'NO_HABILITADO' });
    });

    it('las rutas del conductor no sirven a un pasajero', async () => {
      const s = await api.iniciarSesion('3001110002', 'pasajero');
      const r = await api.get('/v1/conductor/yo', s.accessToken);
      expect(r.estado).toBe(403);
      expect(r.cuerpo).toMatchObject({ codigo: 'ROL_NO_PERMITIDO' });
    });

    it('guarda el nombre y valida los datos', async () => {
      const s = await api.iniciarSesion('3001110003');
      expect((await api.patch('/v1/conductor/yo', { nombre: 'Al' }, s.accessToken)).estado).toBe(
        400,
      );
      expect(
        (await api.patch('/v1/conductor/yo', { email: 'no-es-correo' }, s.accessToken)).estado,
      ).toBe(400);
      const r = await api.patch(
        '/v1/conductor/yo',
        { nombre: '  María   Fernanda  López ', aceptaIntermunicipal: true },
        s.accessToken,
      );
      expect(r.cuerpo.usuario.nombre).toBe('María Fernanda López');
      expect(r.cuerpo.conductor.aceptaIntermunicipal).toBe(true);
      expect(r.cuerpo.onboarding.pasos[0]).toMatchObject({ id: 'datos', completo: true });
    });
  });

  describe('vehículos', () => {
    it('el catálogo agrupa las líneas por marca con su categoría', async () => {
      const s = await api.iniciarSesion('3001120001');
      const r = await api.get('/v1/catalogo-vehiculos', s.accessToken);
      const chevrolet = r.cuerpo.find((m: any) => m.marca === 'Chevrolet');
      expect(chevrolet.lineas.find((l: any) => l.linea === 'Onix')).toMatchObject({
        categoria: 'media',
      });
      expect(
        r.cuerpo
          .find((m: any) => m.marca === 'Toyota')
          .lineas.find((l: any) => l.linea === 'Fortuner'),
      ).toMatchObject({ categoria: 'alta' });
    });

    it('la categoría sale del catálogo y el primer vehículo queda activo', async () => {
      const s = await api.iniciarSesion('3001120002');
      const cat = (await api.get('/v1/catalogo-vehiculos', s.accessToken)).cuerpo;
      const mazda3 = cat
        .find((m: any) => m.marca === 'Mazda')
        .lineas.find((l: any) => l.linea === '3');
      const r = await api.post(
        '/v1/conductor/vehiculos',
        { placa: 'abc 123', color: 'Rojo', modeloAnio: 2021, catalogoVehiculoId: mazda3.id },
        s.accessToken,
      );
      expect(r.estado).toBe(201);
      expect(r.cuerpo).toMatchObject({ categoria: 'media_alta', fueraDeCatalogo: false });
      expect(r.cuerpo.perfil.vehiculos[0]).toMatchObject({
        placa: 'ABC123',
        activo: true,
        categoria: 'media_alta',
      });
    });

    it('un vehículo que no está en el catálogo queda en revisión manual', async () => {
      const s = await api.iniciarSesion('3001120003');
      const r = await api.post(
        '/v1/conductor/vehiculos',
        { placa: 'XYZ98K', color: 'Gris', modeloAnio: 2015, marca: 'Lifan', linea: '520' },
        s.accessToken,
      );
      expect(r.cuerpo).toMatchObject({ categoria: 'media', fueraDeCatalogo: true });
    });

    it('rechaza placas inválidas o repetidas, y vehículos sin identificar', async () => {
      const s = await api.iniciarSesion('3001120004');
      const base = { color: 'Negro', modeloAnio: 2020, marca: 'Kia', linea: 'Rio' };
      expect(
        (await api.post('/v1/conductor/vehiculos', { ...base, placa: '12345' }, s.accessToken))
          .estado,
      ).toBe(400);
      expect(
        (await api.post('/v1/conductor/vehiculos', { ...base, placa: 'KIA123' }, s.accessToken))
          .estado,
      ).toBe(201);
      const otro = await api.iniciarSesion('3001120005');
      const repetida = await api.post(
        '/v1/conductor/vehiculos',
        { ...base, placa: 'kia-123' },
        otro.accessToken,
      );
      expect(repetida.estado).toBe(409);
      expect(repetida.cuerpo).toMatchObject({ codigo: 'PLACA_REGISTRADA' });
      expect(
        (
          await api.post(
            '/v1/conductor/vehiculos',
            { placa: 'QWE456', color: 'Negro', modeloAnio: 2020 },
            otro.accessToken,
          )
        ).estado,
      ).toBe(400);
    });
  });

  describe('documentos', () => {
    async function conductorConVehiculo(tel: string) {
      const s = await api.iniciarSesion(tel);
      const v = await api.post(
        '/v1/conductor/vehiculos',
        {
          placa: `D${tel.slice(-5)}`.slice(0, 3).replace(/\d/g, 'D') + tel.slice(-3),
          color: 'Azul',
          modeloAnio: 2020,
          marca: 'Kia',
          linea: 'Rio',
        },
        s.accessToken,
      );
      return { ...s, vehiculoId: v.cuerpo.id as string };
    }

    it('sube un documento y queda en revisión', async () => {
      const s = await api.iniciarSesion('3001130001');
      const r = await api.postForm(
        '/v1/conductor/documentos',
        formulario({ tipo: 'documento_identidad' }, { contenido: PNG_MINIMO }),
        s.accessToken,
      );
      expect(r.estado).toBe(201);
      expect(r.cuerpo).toMatchObject({
        tipo: 'documento_identidad',
        titular: 'conductor',
        estado: 'pendiente',
      });
      const lista = await api.get('/v1/conductor/documentos', s.accessToken);
      expect(
        lista.cuerpo.requisitos.find((x: any) => x.tipo === 'documento_identidad'),
      ).toMatchObject({ estado: 'en_revision' });
      expect(lista.cuerpo.requisitos.find((x: any) => x.tipo === 'selfie')).toMatchObject({
        estado: 'falta',
      });
    });

    it('rechaza un archivo que no es lo que dice ser', async () => {
      const s = await api.iniciarSesion('3001130002');
      const r = await api.postForm(
        '/v1/conductor/documentos',
        formulario(
          { tipo: 'selfie' },
          { contenido: '<script>alert(1)</script> no soy una foto', nombre: 'foto.jpg' },
        ),
        s.accessToken,
      );
      expect(r.estado).toBe(400);
      expect(r.cuerpo.detail).toContain('foto');
    });

    it('exige fecha de vencimiento válida y no vencida donde corresponde', async () => {
      const s = await api.iniciarSesion('3001130003');
      const subir = (campos: Record<string, string>) =>
        api.postForm(
          '/v1/conductor/documentos',
          formulario({ tipo: 'licencia_conduccion', ...campos }, { contenido: PNG_MINIMO }),
          s.accessToken,
        );
      expect((await subir({})).estado).toBe(400);
      expect((await subir({ venceEn: '2020-01-01' })).cuerpo).toMatchObject({
        codigo: 'DOCUMENTO_VENCIDO',
      });
      expect((await subir({ venceEn: 'mañana' })).estado).toBe(400);
      expect((await subir({ venceEn: `${new Date().getFullYear() + 2}-01-15` })).estado).toBe(201);
    });

    it('un documento del vehículo exige el vehículo y que sea del conductor', async () => {
      const a = await conductorConVehiculo('3001130004');
      const b = await conductorConVehiculo('3001130005');
      const lejos = `${new Date().getFullYear() + 1}-06-30`;
      const sin = await api.postForm(
        '/v1/conductor/documentos',
        formulario({ tipo: 'soat', venceEn: lejos }, { contenido: PNG_MINIMO }),
        a.accessToken,
      );
      expect(sin.estado).toBe(400);
      const ajeno = await api.postForm(
        '/v1/conductor/documentos',
        formulario(
          { tipo: 'soat', venceEn: lejos, vehiculoId: b.vehiculoId },
          { contenido: PNG_MINIMO },
        ),
        a.accessToken,
      );
      expect(ajeno.estado).toBe(404);
      const propio = await api.postForm(
        '/v1/conductor/documentos',
        formulario(
          { tipo: 'soat', venceEn: lejos, vehiculoId: a.vehiculoId },
          { contenido: PNG_MINIMO },
        ),
        a.accessToken,
      );
      expect(propio.estado).toBe(201);
    });

    it('solo el dueño puede ver el archivo', async () => {
      const dueno = await api.iniciarSesion('3001130006');
      const otro = await api.iniciarSesion('3001130007');
      const doc = await api.postForm(
        '/v1/conductor/documentos',
        formulario({ tipo: 'selfie' }, { contenido: PNG_MINIMO }),
        dueno.accessToken,
      );
      const propio = await fetch(`${api.url}/v1/conductor/documentos/${doc.cuerpo.id}/archivo`, {
        headers: { authorization: `Bearer ${dueno.accessToken}` },
      });
      expect(propio.status).toBe(200);
      expect(propio.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await propio.arrayBuffer()).equals(PNG_MINIMO)).toBe(true);
      const ajeno = await fetch(`${api.url}/v1/conductor/documentos/${doc.cuerpo.id}/archivo`, {
        headers: { authorization: `Bearer ${otro.accessToken}` },
      });
      expect(ajeno.status).toBe(404);
    });

    it('rechaza archivos de más de 6 MB', async () => {
      const s = await api.iniciarSesion('3001130008');
      const grande = Buffer.concat([PNG_MINIMO, Buffer.alloc(6 * 1024 * 1024 + 10)]);
      const r = await api.postForm(
        '/v1/conductor/documentos',
        formulario({ tipo: 'selfie' }, { contenido: grande }),
        s.accessToken,
      );
      expect(r.estado).toBe(413);
    });
  });

  describe('cuenta de pago', () => {
    it('se guarda cifrada, se muestra enmascarada y reemplaza a la anterior', async () => {
      const s = await api.iniciarSesion('3001140001');
      const r = await api.put(
        '/v1/conductor/cuenta-pago',
        { tipo: 'llave_bre_b', valor: '3001234567' },
        s.accessToken,
      );
      expect(r.cuerpo).toMatchObject({
        tipo: 'llave_bre_b',
        valorEnmascarado: '•••• 4567',
        verificada: false,
      });

      const [fila] = await api.bd.db
        .select()
        .from(cuentaPagoConductor)
        .where(eq(cuentaPagoConductor.conductorId, s.usuarioId));
      expect(fila?.valorCifrado).not.toContain('3001234567');

      await api.put(
        '/v1/conductor/cuenta-pago',
        { tipo: 'llave_bre_b', valor: 'carlos@correo.com' },
        s.accessToken,
      );
      const todas = await api.bd.db
        .select()
        .from(cuentaPagoConductor)
        .where(eq(cuentaPagoConductor.conductorId, s.usuarioId));
      expect(todas).toHaveLength(2);
      expect(todas.filter((c) => c.activa)).toHaveLength(1);
    });

    it('valida la llave', async () => {
      const s = await api.iniciarSesion('3001140002');
      expect(
        (
          await api.put(
            '/v1/conductor/cuenta-pago',
            { tipo: 'llave_bre_b', valor: 'a' },
            s.accessToken,
          )
        ).estado,
      ).toBe(400);
      expect(
        (
          await api.put(
            '/v1/conductor/cuenta-pago',
            { tipo: 'llave_bre_b', valor: 'hola mundo' },
            s.accessToken,
          )
        ).estado,
      ).toBe(400);
      expect(
        (
          await api.put(
            '/v1/conductor/cuenta-pago',
            { tipo: 'efectivo', valor: '3001234567' },
            s.accessToken,
          )
        ).estado,
      ).toBe(400);
    });
  });

  describe('enviar a revisión y habilitación', () => {
    it('no deja enviar con pasos pendientes y dice cuáles', async () => {
      const s = await api.iniciarSesion('3001150001');
      const r = await api.post('/v1/conductor/enviar-revision', undefined, s.accessToken);
      expect(r.estado).toBe(400);
      expect(r.cuerpo.pendientes).toEqual(['datos', 'vehiculo', 'documentos', 'cuenta']);
    });

    it('el registro completo pasa a revisión y, aprobado, queda habilitado', async () => {
      const c = await api.crearConductorHabilitado('3001150002');
      const r = await api.get('/v1/conductor/yo', c.accessToken);
      expect(r.cuerpo.conductor.estadoHabilitacion).toBe('habilitado');
      expect(r.cuerpo.documentos).toMatchObject({ completo: true, habilitado: true });
      expect(r.cuerpo.conexion.puedeConectarse).toBe(true);
      expect(
        (await api.post('/v1/conductor/enviar-revision', undefined, c.accessToken)).estado,
      ).toBe(409);
    });

    it('el simulador solo aprueba a quien ya envió su registro', async () => {
      const s = await api.iniciarSesion('3001150003');
      const r = await api.post('/v1/dev/conductor/aprobar', undefined, s.accessToken);
      expect(r.estado).toBe(409);
      expect(r.cuerpo).toMatchObject({ codigo: 'NO_ESTA_EN_REVISION' });
    });
  });

  describe('conexión', () => {
    it('no se puede conectar sin estar habilitado', async () => {
      const s = await api.iniciarSesion('3001160001');
      const r = await api.post('/v1/conductor/conectar', {}, s.accessToken);
      expect(r.estado).toBe(409);
      expect(r.cuerpo).toMatchObject({ codigo: 'NO_PUEDE_CONECTARSE' });
      expect(r.cuerpo.motivos[0].codigo).toBe('NO_HABILITADO');
    });

    it('se conecta, queda disponible, abre una sesión y se desconecta', async () => {
      const c = await api.crearConductorHabilitado('3001160002');
      const r = await api.post(
        '/v1/conductor/conectar',
        { lat: 5.0703, lng: -75.5138 },
        c.accessToken,
      );
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({ estadoOperativo: 'disponible' });
      // conectarse dos veces no abre dos sesiones
      expect((await api.post('/v1/conductor/conectar', {}, c.accessToken)).estado).toBe(200);
      const abiertas = (
        await api.bd.db
          .select()
          .from(sesionConductor)
          .where(eq(sesionConductor.conductorId, c.usuarioId))
      ).filter((x) => !x.fin);
      expect(abiertas).toHaveLength(1);

      expect((await api.post('/v1/conductor/desconectar', undefined, c.accessToken)).estado).toBe(
        204,
      );
      const [yo] = await api.bd.db
        .select()
        .from(conductor)
        .where(eq(conductor.usuarioId, c.usuarioId));
      expect(yo?.estadoOperativo).toBe('desconectado');
      const cerradas = (
        await api.bd.db
          .select()
          .from(sesionConductor)
          .where(eq(sesionConductor.conductorId, c.usuarioId))
      ).filter((x) => x.fin);
      expect(cerradas).toHaveLength(1);
    });

    it('RN-063: con deuda pendiente no se conecta y se le dice cuánto debe', async () => {
      const c = await api.crearConductorHabilitado('3001160003');
      await api.bd.db
        .update(conductor)
        .set({ bloqueadoPorDeuda: true })
        .where(eq(conductor.usuarioId, c.usuarioId));
      const r = await api.post('/v1/conductor/conectar', {}, c.accessToken);
      expect(r.estado).toBe(409);
      expect(r.cuerpo.motivos.find((m: any) => m.codigo === 'DEUDA_PENDIENTE')).toBeDefined();
    });

    it('RN-111: un documento vencido impide conectarse', async () => {
      const c = await api.crearConductorHabilitado('3001160004');
      await api.bd.db.execute(
        (await import('drizzle-orm'))
          .sql`update documento set vence_en = current_date - 1 where tipo = 'soat' and vehiculo_id = ${c.vehiculoId}`,
      );
      const r = await api.post('/v1/conductor/conectar', {}, c.accessToken);
      expect(r.estado).toBe(409);
      const motivo = r.cuerpo.motivos.find((m: any) => m.codigo === 'DOCUMENTOS_NO_VIGENTES');
      expect(motivo.documentos).toEqual(['SOAT']);
    });

    it('no puede cambiar de vehículo mientras está conectado', async () => {
      const c = await api.crearConductorHabilitado('3001160005');
      await api.post('/v1/conductor/conectar', {}, c.accessToken);
      const r = await api.put(
        '/v1/conductor/vehiculo-activo',
        { vehiculoId: c.vehiculoId },
        c.accessToken,
      );
      expect(r.estado).toBe(409);
      expect(r.cuerpo).toMatchObject({ codigo: 'CONECTADO' });
    });
  });

  describe('ubicaciones y pérdida de señal', () => {
    it('no acepta posiciones de quien no está conectado', async () => {
      const c = await api.crearConductorHabilitado('3001170001');
      const r = await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ lat: 5.07, lng: -75.51, t: Date.now() }] },
        c.accessToken,
      );
      expect(r.estado).toBe(409);
      expect(r.cuerpo).toMatchObject({ codigo: 'DESCONECTADO' });
    });

    it('guarda un lote, ignora los repetidos y descarta horas imposibles', async () => {
      const c = await api.crearConductorHabilitado('3001170002');
      await api.post('/v1/conductor/conectar', { lat: 5.07, lng: -75.51 }, c.accessToken);
      const t = Date.now();
      const lote = [0, 4, 8].map((s) => ({
        lat: 5.07 + s * 1e-5,
        lng: -75.51,
        t: t - 60_000 + s * 1000,
        precisionM: 6.4,
        velocidadKmh: 22.5,
        rumbo: 359.6,
      }));
      const r1 = await api.post('/v1/conductor/ubicaciones', { puntos: lote }, c.accessToken);
      expect(r1.cuerpo).toEqual({ recibidos: 3, guardados: 3, descartados: 0 });
      // reenviar el mismo lote es seguro (por ejemplo, tras un corte de internet)
      expect(
        (await api.post('/v1/conductor/ubicaciones', { puntos: lote }, c.accessToken)).cuerpo,
      ).toMatchObject({ guardados: 0 });
      // una lectura del futuro y otra de hace una semana se descartan
      const raras = await api.post(
        '/v1/conductor/ubicaciones',
        {
          puntos: [
            { lat: 5.07, lng: -75.51, t: t + 3_600_000 },
            { lat: 5.07, lng: -75.51, t: t - 7 * 86_400_000 },
          ],
        },
        c.accessToken,
      );
      expect(raras.cuerpo).toEqual({ recibidos: 2, guardados: 0, descartados: 2 });

      const filas = await api.bd.db
        .select()
        .from(posicionConductor)
        .where(eq(posicionConductor.conductorId, c.usuarioId));
      expect(filas).toHaveLength(3);
      expect(filas[0]?.rumbo).toBe(0);
      expect(filas[0]?.ubicacion.lat).toBeCloseTo(5.07, 4);
    });

    it('valida coordenadas y el tamaño del lote', async () => {
      const c = await api.crearConductorHabilitado('3001170003');
      await api.post('/v1/conductor/conectar', {}, c.accessToken);
      expect(
        (
          await api.post(
            '/v1/conductor/ubicaciones',
            { puntos: [{ lat: 95, lng: -75, t: Date.now() }] },
            c.accessToken,
          )
        ).estado,
      ).toBe(400);
      expect(
        (await api.post('/v1/conductor/ubicaciones', { puntos: [] }, c.accessToken)).estado,
      ).toBe(400);
    });

    it('sin señal por más de un minuto deja de recibir ofertas; al volver la señal vuelve a estar disponible', async () => {
      const c = await api.crearConductorHabilitado('3001170004');
      await api.post('/v1/conductor/conectar', { lat: 5.07, lng: -75.51 }, c.accessToken);
      const conexion = api.servicio(ConexionService);

      expect(await conexion.marcarSinSenal(Date.now() + 30_000)).not.toContain(c.usuarioId);
      expect(await conexion.marcarSinSenal(Date.now() + 90_000)).toContain(c.usuarioId);
      const [yo] = await api.bd.db
        .select()
        .from(conductor)
        .where(eq(conductor.usuarioId, c.usuarioId));
      expect(yo?.estadoOperativo).toBe('sin_senal');

      await api.post(
        '/v1/conductor/ubicaciones',
        { puntos: [{ lat: 5.07, lng: -75.51, t: Date.now() }] },
        c.accessToken,
      );
      const [vuelta] = await api.bd.db
        .select()
        .from(conductor)
        .where(eq(conductor.usuarioId, c.usuarioId));
      expect(vuelta?.estadoOperativo).toBe('disponible');
    });
  });
});
