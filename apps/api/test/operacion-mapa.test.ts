import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('Proveedor del mapa (ADR-0009)', () => {
  let api: Arnes;
  let admin: string;
  let supervisor: string;
  let monitor: string;
  beforeAll(async () => {
    api = await levantarApi();
    admin = (await api.ingresarOperacion('admin')).accessToken;
    supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  it('sin configurar, las apps reciben OpenFreeMap, sin necesidad de sesión', async () => {
    const r = await api.get('/v1/mapa/config');
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toEqual({
      proveedor: 'openfreemap',
      estilo: 'https://tiles.openfreemap.org/styles/positron',
      estiloOscuro: null,
    });
  });

  it('solo supervisión y administración ven la configuración; solo el administrador la cambia', async () => {
    expect((await api.get('/v1/op/mapa', monitor)).estado).toBe(403);
    expect((await api.get('/v1/op/mapa', supervisor)).estado).toBe(200);
    const cambio = { proveedor: 'esquematico', motivo: 'Probar el cambio' };
    expect((await api.put('/v1/op/mapa', cambio, supervisor)).estado).toBe(403);
  });

  it('cambia a MapTiler con su clave: las apps reciben la dirección con la clave puesta y el administrador la ve enmascarada', async () => {
    const sinClave = await api.put(
      '/v1/op/mapa',
      { proveedor: 'maptiler', motivo: 'Mejor calidad de mapa' },
      admin,
    );
    expect(sinClave.estado).toBe(400);

    const r = await api.put(
      '/v1/op/mapa',
      { proveedor: 'maptiler', clave: 'clave-secreta-123', motivo: 'Mejor calidad de mapa' },
      admin,
    );
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ proveedor: 'maptiler', tieneClave: true });
    expect(r.cuerpo.claveEnmascarada).not.toContain('secreta');
    expect(r.cuerpo.estilo).toContain('{clave}'); // el administrador ve la plantilla, no la clave

    const publica = (await api.get('/v1/mapa/config')).cuerpo;
    expect(publica.estilo).toBe(
      'https://api.maptiler.com/maps/streets-v2/style.json?key=clave-secreta-123',
    );
    expect(publica.estiloOscuro).toContain('streets-v2-dark');

    // la clave no queda en la auditoría
    const aud = await api.get('/v1/op/auditoria?accion=mapa.', admin);
    expect(aud.cuerpo.total).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(aud.cuerpo.items)).not.toContain('clave-secreta-123');
    expect(aud.cuerpo.items[0]).toMatchObject({
      accion: 'mapa.cambiar',
      motivo: 'Mejor calidad de mapa',
    });
  });

  it('rechaza direcciones inseguras', async () => {
    for (const estilo of [
      'http://ejemplo.com/style.json',
      'javascript:alert(1)',
      'no es una dirección',
    ]) {
      const r = await api.put(
        '/v1/op/mapa',
        { proveedor: 'personalizado', estilo, motivo: 'Probar direcciones' },
        admin,
      );
      expect(r.estado).toBe(400);
    }
    const ok = await api.put(
      '/v1/op/mapa',
      {
        proveedor: 'personalizado',
        estilo: 'https://mapas.ejemplo.co/estilo.json',
        motivo: 'Servidor propio',
      },
      admin,
    );
    expect(ok.estado).toBe(200);
    expect((await api.get('/v1/mapa/config')).cuerpo.estilo).toBe(
      'https://mapas.ejemplo.co/estilo.json',
    );
  });

  it('el mapa esquemático no entrega direcciones; volver a OpenFreeMap deja el estilo por defecto', async () => {
    await api.put(
      '/v1/op/mapa',
      { proveedor: 'esquematico', motivo: 'Sin internet en la sede' },
      admin,
    );
    expect((await api.get('/v1/mapa/config')).cuerpo).toEqual({
      proveedor: 'esquematico',
      estilo: null,
      estiloOscuro: null,
    });
    await api.put(
      '/v1/op/mapa',
      { proveedor: 'openfreemap', motivo: 'Volver al mapa gratuito' },
      admin,
    );
    expect((await api.get('/v1/mapa/config')).cuerpo.estilo).toBe(
      'https://tiles.openfreemap.org/styles/positron',
    );
  });
});
