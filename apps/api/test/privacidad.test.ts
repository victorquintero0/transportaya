import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { RetencionService } from '../src/privacidad/retencion.service.js';
import { type Arnes, type ConductorListo, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('Protección de datos personales (Ley 1581)', () => {
  let api: Arnes;
  let admin: string;
  let supervisor: string;
  let soporte: string;
  let monitor: string;
  let version: string;

  beforeAll(async () => {
    api = await levantarApi();
    admin = (await api.ingresarOperacion('admin')).accessToken;
    supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
    soporte = (await api.ingresarOperacion('soporte')).accessToken;
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
    version = (await api.get('/v1/politica-datos')).cuerpo.version;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  async function pasajeroNuevo(telefono: string) {
    const s = await api.iniciarSesion(telefono, 'pasajero');
    await api.patch('/v1/pasajero/yo', { nombre: 'Valentina Ríos' }, s.accessToken);
    await api.post('/v1/pasajero/terminos', { version }, s.accessToken);
    return s;
  }

  describe('política de tratamiento de datos (RNF-61)', () => {
    it('es pública y trae versión, secciones y la advertencia de que falta la revisión de Legal', async () => {
      const r = await api.get('/v1/politica-datos');
      expect(r.estado).toBe(200);
      expect(r.cuerpo.version).toBe(version);
      expect(r.cuerpo.pendienteRevisionLegal).toBe(true);
      expect(r.cuerpo.secciones.length).toBeGreaterThan(5);
    });
  });

  describe('autorización del conductor (RNF-60)', () => {
    it('sin aceptar la política no puede enviar su registro a revisión', async () => {
      const c = await api.crearConductorHabilitado('3001900001', { sinTerminos: true });
      const antes = (await api.get('/v1/conductor/yo', c.accessToken)).cuerpo;
      expect(antes.terminos).toMatchObject({ version, aceptados: false, aceptoEn: null });
      expect(antes.onboarding.puedeEnviarRevision).toBe(false);

      const bloqueado = await api.post('/v1/conductor/enviar-revision', undefined, c.accessToken);
      expect(bloqueado.estado).toBe(400);
      expect(bloqueado.cuerpo.pendientes).toEqual(['terminos']);

      expect(
        (await api.post('/v1/conductor/terminos', { version: '1999-01' }, c.accessToken)).estado,
      ).toBe(409);
      const ok = await api.post('/v1/conductor/terminos', { version }, c.accessToken);
      expect(ok.cuerpo.terminos.aceptados).toBe(true);
      expect(ok.cuerpo.onboarding.puedeEnviarRevision).toBe(true);
      expect(
        (await api.post('/v1/conductor/enviar-revision', undefined, c.accessToken)).estado,
      ).toBe(200);
    });
  });

  describe('solicitudes de las personas', () => {
    it('quedan con la fecha límite de la ley: 10 días hábiles las consultas y 15 los reclamos', async () => {
      const p = await pasajeroNuevo('3001900010');
      const consulta = await api.post(
        '/v1/datos/solicitudes',
        { tipo: 'consulta', detalle: '¿Qué datos míos tienen?' },
        p.accessToken,
      );
      const reclamo = await api.post(
        '/v1/datos/solicitudes',
        { tipo: 'rectificacion', detalle: 'Mi nombre está mal escrito' },
        p.accessToken,
      );
      expect(consulta.estado).toBe(201);
      expect(consulta.cuerpo).toMatchObject({ estado: 'recibida', tipo: 'consulta' });
      const dias = (s: { venceEn: string }) => (Date.parse(s.venceEn) - Date.now()) / 86_400_000;
      // 10 días hábiles son entre 14 y 17 días de calendario según el día de la semana (y los festivos).
      expect(dias(consulta.cuerpo)).toBeGreaterThan(13);
      expect(dias(consulta.cuerpo)).toBeLessThan(18);
      expect(dias(reclamo.cuerpo)).toBeGreaterThan(dias(consulta.cuerpo));

      const mias = await api.get('/v1/datos/solicitudes', p.accessToken);
      expect(mias.cuerpo).toHaveLength(2);
    });

    it('valida el tipo y el detalle, y limita cuántas puede tener abiertas', async () => {
      const p = await pasajeroNuevo('3001900011');
      for (const mal of [
        { tipo: 'borrar_todo', detalle: 'quiero borrar todo' },
        { tipo: 'consulta', detalle: 'ya' },
        { tipo: 'consulta' },
      ])
        expect((await api.post('/v1/datos/solicitudes', mal, p.accessToken)).estado).toBe(400);
      for (let i = 0; i < 5; i++)
        expect(
          (
            await api.post(
              '/v1/datos/solicitudes',
              { tipo: 'consulta', detalle: `Consulta número ${i}` },
              p.accessToken,
            )
          ).estado,
        ).toBe(201);
      const sexta = await api.post(
        '/v1/datos/solicitudes',
        { tipo: 'consulta', detalle: 'Una más' },
        p.accessToken,
      );
      expect(sexta.estado).toBe(409);
      expect(sexta.cuerpo.codigo).toBe('DEMASIADAS_SOLICITUDES');
    });

    it('cada persona solo ve las suyas, y hay que haber iniciado sesión', async () => {
      const a = await pasajeroNuevo('3001900012');
      const b = await pasajeroNuevo('3001900013');
      await api.post(
        '/v1/datos/solicitudes',
        { tipo: 'consulta', detalle: 'Solo de la persona A' },
        a.accessToken,
      );
      expect((await api.get('/v1/datos/solicitudes', b.accessToken)).cuerpo).toHaveLength(0);
      expect((await api.get('/v1/datos/solicitudes')).estado).toBe(401);
      expect((await api.get('/v1/datos/solicitudes', supervisor)).estado).toBe(403);
    });
  });

  describe('descarga de mis datos (RNF-62)', () => {
    it('el pasajero recibe su perfil, lugares, contactos, viajes y solicitudes', async () => {
      const p = await pasajeroNuevo('3001900020');
      await api.post(
        '/v1/pasajero/contactos',
        { nombre: 'Mamá', telefono: '3105550000' },
        p.accessToken,
      );
      const r = await api.get('/v1/datos/exportar', p.accessToken);
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({
        rol: 'pasajero',
        perfil: { nombre: 'Valentina Ríos' },
        contactosDeConfianza: [{ nombre: 'Mamá' }],
        viajes: [],
      });
    });

    it('el conductor recibe su vehículo, documentos, cuenta de pago y viajes, sin el archivo ni el número de cuenta', async () => {
      const c = await api.crearConductorHabilitado('3001900021');
      const r = await api.get('/v1/datos/exportar', c.accessToken);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.rol).toBe('conductor');
      expect(r.cuerpo.vehiculos).toHaveLength(1);
      expect(r.cuerpo.documentos.length).toBeGreaterThan(5);
      expect(r.cuerpo.cuentaDePago).toHaveLength(1);
      expect(JSON.stringify(r.cuerpo)).not.toContain('valor_cifrado');
      expect(JSON.stringify(r.cuerpo)).not.toContain('archivo_clave');
    });
  });

  describe('atención desde la App Operación', () => {
    const cola = async (token: string, estado = 'abiertas') =>
      (await api.get(`/v1/op/privacidad/solicitudes?estado=${estado}`, token)).cuerpo;

    it('solo soporte, supervisión y administración las ven', async () => {
      expect((await api.get('/v1/op/privacidad/solicitudes', monitor)).estado).toBe(403);
      expect((await api.get('/v1/op/privacidad/solicitudes', soporte)).estado).toBe(200);
      expect((await api.get('/v1/op/privacidad/solicitudes')).estado).toBe(401);
    });

    it('la cola muestra a quién, qué y cuánto falta, con las más urgentes primero', async () => {
      const p = await pasajeroNuevo('3001900030');
      await api.post(
        '/v1/datos/solicitudes',
        { tipo: 'consulta', detalle: 'Quiero saber qué guardan' },
        p.accessToken,
      );
      const { total, filas } = await cola(soporte);
      expect(total).toBeGreaterThan(0);
      const mia = filas.find((f: any) => f.titular.id === p.usuarioId);
      expect(mia).toMatchObject({
        tipo: 'consulta',
        rol: 'pasajero',
        estado: 'recibida',
        semaforo: 'verde',
        titular: { nombre: 'Valentina Ríos' },
      });
      expect(mia.diasHabilesRestantes).toBeGreaterThanOrEqual(9);
      const vence = filas.map((f: any) => Date.parse(f.venceEn));
      expect([...vence].sort((a, b) => a - b)).toEqual(vence);
    });

    it('soporte toma y resuelve una consulta; no puede resolverla dos veces', async () => {
      const p = await pasajeroNuevo('3001900031');
      const s = (
        await api.post(
          '/v1/datos/solicitudes',
          { tipo: 'consulta', detalle: '¿Con quién comparten mis datos?' },
          p.accessToken,
        )
      ).cuerpo;
      const tomada = await api.post(`/v1/op/privacidad/solicitudes/${s.id}/tomar`, {}, soporte);
      expect(tomada.cuerpo.estado).toBe('en_tramite');

      const sinRespuesta = await api.post(
        `/v1/op/privacidad/solicitudes/${s.id}/resolver`,
        { resultado: 'aceptar', respuesta: 'ok' },
        soporte,
      );
      expect(sinRespuesta.estado).toBe(400);

      const r = await api.post(
        `/v1/op/privacidad/solicitudes/${s.id}/resolver`,
        {
          resultado: 'aceptar',
          respuesta: 'Con la pasarela de pagos y con el conductor de tu viaje.',
        },
        soporte,
      );
      expect(r.cuerpo).toMatchObject({ estado: 'aceptada' });
      expect(
        (
          await api.post(
            `/v1/op/privacidad/solicitudes/${s.id}/resolver`,
            { resultado: 'aceptar', respuesta: 'Otra vez' },
            soporte,
          )
        ).estado,
      ).toBe(409);

      // la persona ve la respuesta
      const mia = (await api.get('/v1/datos/solicitudes', p.accessToken)).cuerpo[0];
      expect(mia).toMatchObject({
        estado: 'aceptada',
        respuesta: 'Con la pasarela de pagos y con el conductor de tu viaje.',
      });
      // y quedó en la auditoría
      const aud = await api.bd.db.execute(
        sql`select accion, motivo from auditoria where entidad_id = ${s.id} order by ocurrido_en`,
      );
      expect(aud.rows.map((a: any) => a.accion)).toEqual([
        'privacidad.tomar',
        'privacidad.resolver',
      ]);
    });

    it('rechazar exige explicar el motivo a la persona', async () => {
      const p = await pasajeroNuevo('3001900032');
      const s = (
        await api.post(
          '/v1/datos/solicitudes',
          { tipo: 'rectificacion', detalle: 'Cambien mi calificación a 5' },
          p.accessToken,
        )
      ).cuerpo;
      const r = await api.post(
        `/v1/op/privacidad/solicitudes/${s.id}/resolver`,
        {
          resultado: 'rechazar',
          respuesta: 'La calificación no es un dato personal que se pueda corregir.',
        },
        soporte,
      );
      expect(r.cuerpo.estado).toBe('rechazada');
    });

    it('borrar los datos de un pasajero: solo supervisión o administración, y anonimiza la cuenta', async () => {
      const p = await pasajeroNuevo('3001900033');
      await api.post(
        '/v1/pasajero/contactos',
        { nombre: 'Mamá', telefono: '3105550001' },
        p.accessToken,
      );
      const s = (
        await api.post(
          '/v1/datos/solicitudes',
          { tipo: 'supresion', detalle: 'Ya no quiero usar TransporteYa' },
          p.accessToken,
        )
      ).cuerpo;
      const cuerpo = { resultado: 'aceptar', respuesta: 'Cuenta eliminada como lo pediste.' };

      const denegada = await api.post(
        `/v1/op/privacidad/solicitudes/${s.id}/resolver`,
        cuerpo,
        soporte,
      );
      expect(denegada.estado).toBe(403);
      expect(
        (await api.get(`/v1/op/privacidad/solicitudes/${s.id}`, soporte)).cuerpo.bloqueadores,
      ).toEqual([]);

      const r = await api.post(
        `/v1/op/privacidad/solicitudes/${s.id}/resolver`,
        cuerpo,
        supervisor,
      );
      expect(r.estado).toBe(201);
      expect(r.cuerpo.estado).toBe('ejecutada');

      const u = await api.bd.db.execute(
        sql`select nombre, email, telefono, estado from usuario where id = ${p.usuarioId}`,
      );
      expect(u.rows[0]).toMatchObject({
        nombre: 'Cuenta eliminada',
        email: null,
        estado: 'anonimizado',
      });
      expect((u.rows[0] as any).telefono).toMatch(/^\+99/);
      const contactos = await api.bd.db.execute(
        sql`select count(*)::int as n from contacto_confianza where pasajero_id = ${p.usuarioId}`,
      );
      expect((contactos.rows[0] as any).n).toBe(0);
      // no puede volver a usar la sesión que tenía, y el número queda libre para registrarse otra vez
      const refresco = await api.post('/v1/auth/refrescar', { refreshToken: p.refreshToken });
      expect(refresco.estado).toBe(401);
      const nueva = await api.iniciarSesion('3001900033', 'pasajero');
      expect(nueva.usuarioId).not.toBe(p.usuarioId);
      expect(nueva.nuevo).toBe(true);
    });

    it('un conductor con saldo pendiente no se puede borrar todavía, y se le dice por qué', async () => {
      const c = await api.conductorEnLinea('3001900034', api.nuevaZona());
      await api.completarViaje(c, { metodoPago: 'efectivo' }); // en efectivo debe la comisión
      const s = (
        await api.post(
          '/v1/datos/solicitudes',
          { tipo: 'revocatoria', detalle: 'Revoco mi autorización' },
          c.accessToken,
        )
      ).cuerpo;
      const detalle = (await api.get(`/v1/op/privacidad/solicitudes/${s.id}`, supervisor)).cuerpo;
      expect(detalle.bloqueadores.map((b: any) => b.codigo)).toContain('SALDO_PENDIENTE');

      const r = await api.post(
        `/v1/op/privacidad/solicitudes/${s.id}/resolver`,
        { resultado: 'aceptar', respuesta: 'Borramos tus datos.' },
        supervisor,
      );
      expect(r.estado).toBe(409);
      expect(r.cuerpo.codigo).toBe('NO_SE_PUEDE_BORRAR_AUN');
      // sigue abierta
      expect(
        (await api.get(`/v1/op/privacidad/solicitudes/${s.id}`, supervisor)).cuerpo.estado,
      ).toBe('recibida');
      c.socket.cerrar();
    });

    it('borrar a un conductor quita su identidad, sus documentos y su cuenta de pago, y conserva sus viajes', async () => {
      const c: ConductorListo = await api.crearConductorHabilitado('3001900035');
      const s = (
        await api.post(
          '/v1/datos/solicitudes',
          { tipo: 'supresion', detalle: 'Dejo de trabajar con ustedes' },
          c.accessToken,
        )
      ).cuerpo;
      const r = await api.post(
        `/v1/op/privacidad/solicitudes/${s.id}/resolver`,
        { resultado: 'aceptar', respuesta: 'Listo, tus datos fueron borrados.' },
        admin,
      );
      expect(r.cuerpo.estado).toBe('ejecutada');

      const q = async (consulta: ReturnType<typeof sql>) =>
        (await api.bd.db.execute(consulta)).rows[0] as any;
      expect(
        await q(sql`select nombre, estado from usuario where id = ${c.usuarioId}`),
      ).toMatchObject({
        nombre: 'Cuenta eliminada',
        estado: 'anonimizado',
      });
      expect(
        (await q(sql`select count(*)::int as n from documento where conductor_id = ${c.usuarioId}`))
          .n,
      ).toBe(0);
      expect(
        (
          await q(
            sql`select count(*)::int as n from cuenta_pago_conductor where conductor_id = ${c.usuarioId}`,
          )
        ).n,
      ).toBe(0);
      expect(
        await q(
          sql`select estado_habilitacion, estado_operativo from conductor where usuario_id = ${c.usuarioId}`,
        ),
      ).toMatchObject({ estado_habilitacion: 'bloqueado', estado_operativo: 'desconectado' });
      // el vehículo (con su placa) se conserva por seguridad y trazabilidad
      expect(
        (
          await q(
            sql`select count(*)::int as n from conductor_vehiculo where conductor_id = ${c.usuarioId}`,
          )
        ).n,
      ).toBe(1);
      expect((await api.post('/v1/auth/refrescar', { refreshToken: c.refreshToken })).estado).toBe(
        401,
      );
    });

    it('cuando el pasajero elimina su cuenta desde la app queda constancia de que ejerció el derecho', async () => {
      const p = await pasajeroNuevo('3001900036');
      const del = await fetch(`${api.url}/v1/pasajero/cuenta`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${p.accessToken}` },
      });
      expect(del.status).toBe(204);
      const f = (
        await api.bd.db.execute(
          sql`select tipo, estado, resuelta_por from solicitud_datos where usuario_id = ${p.usuarioId}`,
        )
      ).rows[0] as any;
      expect(f).toMatchObject({ tipo: 'supresion', estado: 'ejecutada', resuelta_por: null });
    });
  });

  describe('retención de datos (RNF-64)', () => {
    it('borra lo que cumplió su plazo, deja lo reciente y crea las particiones de los próximos días', async () => {
      const c = await api.conductorEnLinea('3001900040', api.nuevaZona());
      const { viajeId } = await api.completarViaje(c);
      const { db } = api.bd;
      const n = async (consulta: ReturnType<typeof sql>) =>
        ((await db.execute(consulta)).rows[0] as any).n as number;

      // un mensaje viejo y uno reciente
      await db.execute(sql`
        insert into viaje_mensaje (viaje_id, autor_id, cuerpo, creado_en) values
          (${viajeId}, ${c.usuarioId}, 'mensaje viejo', now() - interval '400 days'),
          (${viajeId}, ${c.usuarioId}, 'mensaje reciente', now() - interval '2 days')`);
      // posiciones de hace más de un año, en la partición por defecto
      await db.execute(sql`
        insert into posicion_conductor (conductor_id, registrada_en, ubicacion, estado_operativo)
        values (${c.usuarioId}, now() - interval '400 days',
                ST_SetSRID(ST_MakePoint(-75.51, 5.07), 4326)::geography, 'disponible')`);
      // el viaje terminó hace más de un año y tiene recorrido guardado
      await db.execute(sql`
        update viaje set
          solicitado_en = solicitado_en - interval '400 days',
          aceptado_en = aceptado_en - interval '400 days',
          en_sitio_en = en_sitio_en - interval '400 days',
          iniciado_en = iniciado_en - interval '400 days',
          finalizado_en = finalizado_en - interval '400 days',
          trayectoria = ST_GeogFromText('LINESTRING(-75.51 5.07, -75.52 5.08)')
        where id = ${viajeId}`);
      // un código y una sesión vencidos hace tiempo
      await db.execute(sql`
        insert into otp_codigo (telefono, codigo_hash, expira_en, creado_en)
        values ('+573000000000', 'hash', now() - interval '3 days', now() - interval '3 days')`);
      await db.execute(
        sql`update sesion set expira_en = now() - interval '40 days' where usuario_id = ${c.usuarioId}`,
      );

      const r = await api.servicio(RetencionService).aplicar();
      expect(r).toMatchObject({ posiciones: 1, mensajes: 1, trayectorias: 1 });
      expect(r.codigosOtp).toBeGreaterThanOrEqual(1);
      expect(r.sesiones).toBeGreaterThanOrEqual(1);

      expect(
        await n(sql`select count(*)::int as n from viaje_mensaje where viaje_id = ${viajeId}`),
      ).toBe(1);
      expect(
        await n(
          sql`select count(*)::int as n from viaje_mensaje where cuerpo = 'mensaje reciente'`,
        ),
      ).toBe(1);
      expect(
        await n(
          sql`select count(*)::int as n from viaje where id = ${viajeId} and trayectoria is null`,
        ),
      ).toBe(1);
      // el viaje y su precio se conservan
      expect(
        await n(
          sql`select count(*)::int as n from viaje where id = ${viajeId} and precio_final is not null`,
        ),
      ).toBe(1);
      // la partición de dentro de una semana ya existe
      expect(
        await n(
          sql`select count(*)::int as n from pg_class where relname = 'posicion_conductor_' || to_char((now() at time zone 'America/Bogota')::date + 7, 'YYYYMMDD')`,
        ),
      ).toBe(1);
      c.socket.cerrar();
    });

    it('los plazos son parámetros que Operación puede cambiar', async () => {
      const r = (await api.get('/v1/op/parametros', admin)).cuerpo as {
        clave: string;
        defecto: number;
      }[];
      const claves = Object.fromEntries(r.map((p) => [p.clave, p.defecto]));
      expect(claves).toMatchObject({
        'retencion.posiciones_dias': 180,
        'retencion.chats_dias': 180,
        'retencion.trayectorias_dias': 365,
      });
    });
  });
});
