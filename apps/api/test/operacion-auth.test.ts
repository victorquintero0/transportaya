import { empleado } from '@transportaya/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codigoTotp } from '../src/operacion/totp.js';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('App Operación: ingreso con segundo factor y permisos', () => {
  let api: Arnes;
  beforeAll(async () => {
    api = await levantarApi();
  });
  afterAll(async () => {
    await api.cerrar();
  });

  it('crea una cuenta de demostración por rol y deja ingresar con el código', async () => {
    const demo = await api.get('/v1/op/auth/demo');
    expect(demo.estado).toBe(200);
    expect(demo.cuerpo.cuentas.map((c: any) => c.rol).sort()).toEqual(
      ['admin', 'cumplimiento', 'financiero', 'monitor', 'soporte', 'supervisor'].sort(),
    );
    const s = await api.ingresarOperacion('monitor');
    const yo = await api.get('/v1/op/yo', s.accessToken);
    expect(yo.estado).toBe(200);
    expect(yo.cuerpo).toMatchObject({ roles: ['monitor'] });
    expect(yo.cuerpo.permisos).toContain('viajes.despachar');
    expect(yo.cuerpo.permisos).not.toContain('tarifas.editar');
  });

  it('pide el código y rechaza uno incorrecto con un mensaje genérico', async () => {
    const demo = (await api.get('/v1/op/auth/demo')).cuerpo;
    const cuenta = demo.cuentas.find((c: any) => c.rol === 'soporte');
    const sinCodigo = await api.post('/v1/op/auth/ingresar', {
      email: cuenta.email,
      contrasena: demo.contrasena,
    });
    expect(sinCodigo.estado).toBe(401);
    expect(sinCodigo.cuerpo.codigo).toBe('TOTP_REQUERIDO');

    const malo = await api.post('/v1/op/auth/ingresar', {
      email: cuenta.email,
      contrasena: demo.contrasena,
      codigo: cuenta.codigo === '000000' ? '111111' : '000000',
    });
    expect(malo.estado).toBe(401);
    expect(malo.cuerpo.codigo).toBe('CREDENCIALES_INVALIDAS');

    const sinCuenta = await api.post('/v1/op/auth/ingresar', {
      email: 'nadie@transporteya.demo',
      contrasena: 'Cualquiera-123',
      codigo: '123456',
    });
    expect(sinCuenta.cuerpo.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('no deja usar dos veces el mismo código', async () => {
    const demo = (await api.get('/v1/op/auth/demo')).cuerpo;
    const cuenta = demo.cuentas.find((c: any) => c.rol === 'cumplimiento');
    const cuerpo = { email: cuenta.email, contrasena: demo.contrasena, codigo: cuenta.codigo };
    // la prueba anterior de ingresarOperacion pudo usar el mismo paso para otro rol; aquí usamos uno distinto
    expect((await api.post('/v1/op/auth/ingresar', cuerpo)).estado).toBe(200);
    expect((await api.post('/v1/op/auth/ingresar', cuerpo)).estado).toBe(401);
  });

  it('bloquea el correo tras varios intentos fallidos', async () => {
    const email = 'financiero@transporteya.demo';
    for (let i = 0; i < 5; i++) {
      const r = await api.post('/v1/op/auth/ingresar', {
        email,
        contrasena: 'mala-clave-1A',
        codigo: '123456',
      });
      expect(r.estado).toBe(401);
    }
    const r = await api.post('/v1/op/auth/ingresar', {
      email,
      contrasena: 'mala-clave-1A',
      codigo: '123456',
    });
    expect(r.estado).toBe(429);
    expect(r.cuerpo.codigo).toBe('CUENTA_BLOQUEADA_TEMPORAL');
  });

  it('enrola el segundo factor de una cuenta nueva y luego ingresa', async () => {
    const admin = await api.ingresarOperacion('admin');
    const nueva = await api.post(
      '/v1/op/usuarios',
      {
        nombre: 'Elena Nueva',
        telefono: '3105550001',
        email: 'elena@transporteya.co',
        roles: ['soporte'],
      },
      admin.accessToken,
    );
    expect(nueva.estado).toBe(201);
    const contrasena = nueva.cuerpo.contrasenaTemporal as string;
    expect(contrasena).toBeTruthy();

    const intento = await api.post('/v1/op/auth/ingresar', {
      email: 'elena@transporteya.co',
      contrasena,
    });
    expect(intento.cuerpo.codigo).toBe('TOTP_NO_CONFIGURADO');

    const enrol = await api.post('/v1/op/auth/enrolar', {
      email: 'elena@transporteya.co',
      contrasena,
    });
    expect(enrol.estado).toBe(200);
    expect(enrol.cuerpo.uri).toContain('otpauth://totp/');
    const ok = await api.post('/v1/op/auth/ingresar', {
      email: 'elena@transporteya.co',
      contrasena,
      codigo: codigoTotp(enrol.cuerpo.secreto),
    });
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo.usuario.roles).toEqual(['soporte']);

    // ya activo: no se puede volver a pedir el secreto
    const otra = await api.post('/v1/op/auth/enrolar', {
      email: 'elena@transporteya.co',
      contrasena,
    });
    expect(otra.estado).toBe(409);
    const [fila] = await api.bd.db
      .select()
      .from(empleado)
      .where(eq(empleado.email, 'elena@transporteya.co'));
    expect(fila!.totpActivo).toBe(true);
    expect(fila!.totpSecretoCifrado).not.toContain(enrol.cuerpo.secreto); // cifrado en la base
  });

  it('las rutas de operación exigen el permiso del rol', async () => {
    const monitor = await api.ingresarOperacion('monitor');
    const conductor = await api.iniciarSesion('3001230001', 'conductor');
    expect((await api.get('/v1/op/torre')).estado).toBe(401);
    expect((await api.get('/v1/op/torre', conductor.accessToken)).estado).toBe(403);
    expect((await api.get('/v1/op/torre', monitor.accessToken)).estado).toBe(200);
    // el monitor no ve finanzas ni administra usuarios
    expect((await api.get('/v1/op/finanzas/cierres', monitor.accessToken)).estado).toBe(403);
    expect((await api.get('/v1/op/usuarios', monitor.accessToken)).estado).toBe(403);
  });

  it('un empleado desactivado pierde el acceso de inmediato', async () => {
    const admin = await api.ingresarOperacion('admin');
    const demo = (await api.get('/v1/op/auth/demo')).cuerpo;
    const cuenta = demo.cuentas.find((c: any) => c.rol === 'supervisor');
    const sup = await api.post('/v1/op/auth/ingresar', {
      email: cuenta.email,
      contrasena: demo.contrasena,
      codigo: cuenta.codigo,
    });
    expect(sup.estado).toBe(200);
    expect((await api.get('/v1/op/torre', sup.cuerpo.accessToken)).estado).toBe(200);
    const r = await api.patch(
      `/v1/op/usuarios/${sup.cuerpo.usuario.id}`,
      { activo: false, motivo: 'Salió de la empresa' },
      admin.accessToken,
    );
    expect(r.estado).toBe(200);
    expect((await api.get('/v1/op/torre', sup.cuerpo.accessToken)).estado).toBe(401);
  });
});
