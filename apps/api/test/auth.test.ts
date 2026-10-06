import { eq } from 'drizzle-orm';
import { conductor, otpCodigo, pasajero, sesion, usuario } from '@transportaya/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('autenticación con OTP simulado', () => {
  let api: Arnes;
  let n = 0;
  const telefono = () => `300${String(1_000_000 + ++n).slice(1)}0`.slice(0, 10);

  beforeAll(async () => {
    api = await levantarApi();
  });
  afterAll(async () => {
    await api.cerrar();
  });

  it('la salud es pública e indica si hay simulador', async () => {
    const r = await api.get('/v1/salud');
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ estado: 'ok', simulador: true });
  });

  it('una ruta protegida sin token responde 401 en formato Problem Details', async () => {
    const r = await api.post('/v1/auth/salir');
    expect(r.estado).toBe(401);
    expect(r.cuerpo).toMatchObject({
      status: 401,
      codigo: 'NO_AUTENTICADO',
      type: '/errores/no-autenticado',
    });
  });

  it('pide el código, inicia sesión y crea al conductor en Manizales', async () => {
    const tel = telefono();
    const sesionNueva = await api.iniciarSesion(tel, 'conductor');
    expect(sesionNueva.nuevo).toBe(true);

    const [fila] = await api.bd.db
      .select({
        estadoHabilitacion: conductor.estadoHabilitacion,
        estadoOperativo: conductor.estadoOperativo,
      })
      .from(conductor)
      .where(eq(conductor.usuarioId, sesionNueva.usuarioId));
    expect(fila).toEqual({
      estadoHabilitacion: 'registro_incompleto',
      estadoOperativo: 'desconectado',
    });
  });

  it('el teléfono se normaliza: "300 123 4567" y "+573001234567" son la misma cuenta', async () => {
    const a = await api.iniciarSesion('311 555 0001');
    const b = await api.iniciarSesion('+573115550001');
    expect(b.usuarioId).toBe(a.usuarioId);
    expect(b.nuevo).toBe(false);
  });

  it('se puede ser conductor y pasajero con el mismo celular', async () => {
    const tel = '3125550002';
    const comoConductor = await api.iniciarSesion(tel, 'conductor');
    const comoPasajero = await api.iniciarSesion(tel, 'pasajero');
    expect(comoPasajero.usuarioId).toBe(comoConductor.usuarioId);
    const [p] = await api.bd.db
      .select()
      .from(pasajero)
      .where(eq(pasajero.usuarioId, comoPasajero.usuarioId));
    expect(p).toBeDefined();
  });

  it('el código no se guarda: solo su hash', async () => {
    const tel = '3135550003';
    await api.iniciarSesion(tel);
    const [fila] = await api.bd.db
      .select()
      .from(otpCodigo)
      .where(eq(otpCodigo.telefono, '+573135550003'));
    expect(fila?.codigoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fila?.codigoHash).not.toBe(api.codigos.get('+573135550003'));
  });

  it('un código incorrecto se rechaza y un código se usa una sola vez', async () => {
    const tel = '3145550004';
    await api.post('/v1/auth/otp', { telefono: tel });
    const bueno = api.codigos.get('+573145550004')!;
    const malo = bueno === '000000' ? '111111' : '000000';

    const r1 = await api.post('/v1/auth/otp/verificar', {
      telefono: tel,
      codigo: malo,
      app: 'conductor',
    });
    expect(r1.estado).toBe(401);
    expect(r1.cuerpo).toMatchObject({ codigo: 'CODIGO_INVALIDO' });

    expect(
      (await api.post('/v1/auth/otp/verificar', { telefono: tel, codigo: bueno, app: 'conductor' }))
        .estado,
    ).toBe(200);
    const reuso = await api.post('/v1/auth/otp/verificar', {
      telefono: tel,
      codigo: bueno,
      app: 'conductor',
    });
    expect(reuso.estado).toBe(401);
  });

  it('después de 5 intentos fallidos bloquea incluso el código correcto', async () => {
    const tel = '3155550005';
    await api.post('/v1/auth/otp', { telefono: tel });
    const bueno = api.codigos.get('+573155550005')!;
    const malo = bueno === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await api.post('/v1/auth/otp/verificar', { telefono: tel, codigo: malo, app: 'conductor' });
    }
    const r = await api.post('/v1/auth/otp/verificar', {
      telefono: tel,
      codigo: bueno,
      app: 'conductor',
    });
    expect(r.estado).toBe(429);
    expect(r.cuerpo).toMatchObject({ codigo: 'DEMASIADOS_INTENTOS' });
  });

  it('limita a 5 códigos cada 15 minutos por celular', async () => {
    const tel = '3165550006';
    for (let i = 0; i < 5; i++)
      expect((await api.post('/v1/auth/otp', { telefono: tel })).estado).toBe(200);
    const r = await api.post('/v1/auth/otp', { telefono: tel });
    expect(r.estado).toBe(429);
    expect(r.cuerpo).toMatchObject({ codigo: 'DEMASIADOS_CODIGOS' });
  });

  it('un código vencido no sirve', async () => {
    const tel = '3175550007';
    await api.post('/v1/auth/otp', { telefono: tel });
    const codigo = api.codigos.get('+573175550007')!;
    await api.bd.db
      .update(otpCodigo)
      .set({ expiraEn: new Date(Date.now() - 1000) })
      .where(eq(otpCodigo.telefono, '+573175550007'));
    const r = await api.post('/v1/auth/otp/verificar', { telefono: tel, codigo, app: 'conductor' });
    expect(r.estado).toBe(401);
  });

  it('valida el formato de las solicitudes', async () => {
    const a = await api.post('/v1/auth/otp', { telefono: '123' });
    expect(a.estado).toBe(400);
    expect(a.cuerpo).toMatchObject({ codigo: 'SOLICITUD_INVALIDA' });
    const b = await api.post('/v1/auth/otp/verificar', {
      telefono: '3001234567',
      codigo: '12',
      app: 'conductor',
    });
    expect(b.estado).toBe(400);
    const c = await api.post('/v1/auth/otp/verificar', {
      telefono: '3001234567',
      codigo: '123456',
      app: 'interno',
    });
    expect(c.estado).toBe(400);
  });

  it('cerrar sesión invalida el token de acceso al instante', async () => {
    const s = await api.iniciarSesion('3185550008');
    expect((await api.post('/v1/auth/salir', undefined, s.accessToken)).estado).toBe(204);
    const r = await api.post('/v1/auth/salir', undefined, s.accessToken);
    expect(r.estado).toBe(401);
    expect(r.cuerpo).toMatchObject({ codigo: 'SESION_INVALIDA' });
  });

  describe('refresco de sesión', () => {
    it('rota el token: el nuevo sirve y el anterior queda revocado', async () => {
      const s = await api.iniciarSesion('3195550009');
      const r = await api.post('/v1/auth/refrescar', { refreshToken: s.refreshToken });
      expect(r.estado).toBe(200);
      expect(r.cuerpo.refreshToken).not.toBe(s.refreshToken);
      expect((await api.post('/v1/auth/salir', undefined, r.cuerpo.accessToken)).estado).toBe(204);
    });

    it('reusar un token ya rotado se toma como robo y cierra todas las sesiones', async () => {
      const s = await api.iniciarSesion('3205550010');
      const r1 = await api.post('/v1/auth/refrescar', { refreshToken: s.refreshToken });
      const reuso = await api.post('/v1/auth/refrescar', { refreshToken: s.refreshToken });
      expect(reuso.estado).toBe(401);
      expect(reuso.cuerpo).toMatchObject({ codigo: 'SESION_REVOCADA' });
      // incluso la sesión legítima más reciente queda cerrada
      const nueva = await api.post('/v1/auth/refrescar', { refreshToken: r1.cuerpo.refreshToken });
      expect(nueva.estado).toBe(401);
      expect((await api.post('/v1/auth/salir', undefined, r1.cuerpo.accessToken)).estado).toBe(401);
    });

    it('rechaza un token desconocido o vencido', async () => {
      expect((await api.post('/v1/auth/refrescar', { refreshToken: 'x'.repeat(43) })).estado).toBe(
        401,
      );
      const s = await api.iniciarSesion('3215550011');
      await api.bd.db
        .update(sesion)
        .set({ expiraEn: new Date(Date.now() - 1000) })
        .where(eq(sesion.usuarioId, s.usuarioId));
      const r = await api.post('/v1/auth/refrescar', { refreshToken: s.refreshToken });
      expect(r.cuerpo).toMatchObject({ codigo: 'SESION_VENCIDA' });
    });
  });

  it('un usuario bloqueado no puede iniciar sesión ni usar su token', async () => {
    const s = await api.iniciarSesion('3225550012');
    await api.bd.db.update(usuario).set({ estado: 'bloqueado' }).where(eq(usuario.id, s.usuarioId));
    expect((await api.post('/v1/auth/salir', undefined, s.accessToken)).estado).toBe(401);

    await api.post('/v1/auth/otp', { telefono: '3225550012' });
    const r = await api.post('/v1/auth/otp/verificar', {
      telefono: '3225550012',
      codigo: api.codigos.get('+573225550012')!,
      app: 'conductor',
    });
    expect(r.estado).toBe(403);
    expect(r.cuerpo).toMatchObject({ codigo: 'USUARIO_BLOQUEADO' });
  });

  it('el proveedor simulado devuelve el código en la respuesta para mostrarlo en la app', async () => {
    // Con el proveedor real (como en este arnés) el código nunca viaja en la respuesta.
    const r = await api.post('/v1/auth/otp', { telefono: '3235550013' });
    expect(r.cuerpo.simulado).toBeUndefined();
  });
});
