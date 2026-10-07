import { conductor, documento, usuario } from '@transportaya/db';
import { fechaBogota } from '@transportaya/dominio';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VencimientosService } from '../src/conductor/vencimientos.service.js';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('Conductores y pasajeros (OPE-04, OPE-05)', () => {
  let api: Arnes;
  let cumplimiento: string;
  let monitor: string;
  let soporte: string;
  let supervisor: string;
  beforeAll(async () => {
    api = await levantarApi();
    cumplimiento = (await api.ingresarOperacion('cumplimiento')).accessToken;
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
    soporte = (await api.ingresarOperacion('soporte')).accessToken;
    supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  const fila = async (id: string) =>
    (await api.bd.db.select().from(conductor).where(eq(conductor.usuarioId, id)))[0]!;

  describe('onboarding', () => {
    it('la cola muestra a quien está en revisión; se aprueban los documentos y se habilita', async () => {
      const c = await api.crearConductorHabilitado('3008200001', { sinAprobar: true });
      const cola = await api.get('/v1/op/conductores?estado=en_revision', cumplimiento);
      expect(cola.estado).toBe(200);
      expect(cola.cuerpo.enRevision).toBeGreaterThanOrEqual(1);
      const item = cola.cuerpo.items.find((x: any) => x.id === c.usuarioId);
      expect(item).toMatchObject({ estadoHabilitacion: 'en_revision' });
      expect(item.documentosPendientes).toBeGreaterThanOrEqual(9);

      // no se puede habilitar con documentos sin revisar
      const antes = await api.post(`/v1/op/conductores/${c.usuarioId}/habilitar`, {}, cumplimiento);
      expect(antes.estado).toBe(409);
      expect(antes.cuerpo.codigo).toBe('DOCUMENTOS_PENDIENTES');
      expect(antes.cuerpo.faltan.length).toBeGreaterThan(0);

      const ficha = (await api.get(`/v1/op/conductores/${c.usuarioId}`, cumplimiento)).cuerpo;
      expect(ficha.estadoHabilitacion).toBe('en_revision');
      expect(ficha.documentos.length).toBeGreaterThanOrEqual(9);
      expect(ficha.vehiculos[0].placa).toMatch(/^TY/);
      expect(ficha.cuentaPago.valor).toMatch(/^•+/); // la cuenta se muestra enmascarada
      expect(ficha.evaluacion.habilitado).toBe(false);

      // soporte no puede aprobar
      const doc0 = ficha.documentos[0];
      expect((await api.post(`/v1/op/documentos/${doc0.id}/aprobar`, {}, soporte)).estado).toBe(
        403,
      );

      // el archivo se puede ver y deja huella en la auditoría
      const archivo = await fetch(`${api.url}/v1/op/documentos/${doc0.id}/archivo`, {
        headers: { authorization: `Bearer ${cumplimiento}` },
      });
      expect(archivo.status).toBe(200);
      expect(archivo.headers.get('content-type')).toBe('image/png');

      for (const d of ficha.documentos) {
        const r = await api.post(`/v1/op/documentos/${d.id}/aprobar`, {}, cumplimiento);
        expect(r.estado).toBe(200);
      }
      // aprobar dos veces no se puede
      expect(
        (await api.post(`/v1/op/documentos/${doc0.id}/aprobar`, {}, cumplimiento)).estado,
      ).toBe(409);

      const habilitado = await api.post(
        `/v1/op/conductores/${c.usuarioId}/habilitar`,
        {},
        cumplimiento,
      );
      expect(habilitado.estado).toBe(204);
      expect((await fila(c.usuarioId)).estadoHabilitacion).toBe('habilitado');

      // el conductor ya puede conectarse
      const conectar = await api.post('/v1/conductor/conectar', api.nuevaZona(), c.accessToken);
      expect(conectar.estado).toBe(200);

      const aud = await api.get(
        `/v1/op/auditoria?entidad=conductor&entidadId=${c.usuarioId}`,
        supervisor,
      );
      expect(aud.cuerpo.items.map((i: any) => i.accion)).toContain('conductor.habilitar');
      const verDoc = await api.get(`/v1/op/auditoria?accion=documento.ver`, supervisor);
      expect(verDoc.cuerpo.total).toBeGreaterThanOrEqual(1);
    });

    it('rechazar un documento exige motivo y el conductor lo ve', async () => {
      const c = await api.crearConductorHabilitado('3008200002', { sinAprobar: true });
      const ficha = (await api.get(`/v1/op/conductores/${c.usuarioId}`, cumplimiento)).cuerpo;
      const doc = ficha.documentos.find((d: any) => d.tipo === 'selfie');
      expect(
        (await api.post(`/v1/op/documentos/${doc.id}/rechazar`, {}, cumplimiento)).estado,
      ).toBe(400);
      const r = await api.post(
        `/v1/op/documentos/${doc.id}/rechazar`,
        { motivo: 'La foto sale borrosa' },
        cumplimiento,
      );
      expect(r.estado).toBe(200);
      const [d] = await api.bd.db.select().from(documento).where(eq(documento.id, doc.id));
      expect(d).toMatchObject({ estado: 'rechazado', motivoRechazo: 'La foto sale borrosa' });
      const docs = (await api.get('/v1/conductor/documentos', c.accessToken)).cuerpo;
      const suyo = docs.historial.find((x: any) => x.id === doc.id);
      expect(suyo).toMatchObject({ estado: 'rechazado', motivoRechazo: 'La foto sale borrosa' });
    });

    it('devolver el registro lo pasa a rechazado con motivo', async () => {
      const c = await api.crearConductorHabilitado('3008200003', { sinAprobar: true });
      expect(
        (
          await api.post(
            `/v1/op/conductores/${c.usuarioId}/rechazar-registro`,
            { motivo: 'Faltan datos legibles' },
            cumplimiento,
          )
        ).estado,
      ).toBe(204);
      expect((await fila(c.usuarioId)).estadoHabilitacion).toBe('rechazado');
      // ya no está en revisión
      expect(
        (await api.post(`/v1/op/conductores/${c.usuarioId}/habilitar`, {}, cumplimiento)).estado,
      ).toBe(409);
    });
  });

  describe('suspender, bloquear y reactivar', () => {
    it('el monitor suspende; la revisión de vencimientos no lo reactiva sola; luego se reactiva con motivo', async () => {
      const c = await api.conductorEnLinea('3008200011', api.nuevaZona());
      expect(
        (await api.post(`/v1/op/conductores/${c.usuarioId}/suspender`, { motivo: '' }, monitor))
          .estado,
      ).toBe(400);
      const r = await api.post(
        `/v1/op/conductores/${c.usuarioId}/suspender`,
        { motivo: 'Queja grave en investigación' },
        monitor,
      );
      expect(r.estado).toBe(204);
      expect(await fila(c.usuarioId)).toMatchObject({
        estadoHabilitacion: 'suspendido',
        suspensionManual: true,
        estadoOperativo: 'desconectado',
      });
      expect(
        (await api.post('/v1/conductor/conectar', api.nuevaZona(), c.accessToken)).estado,
      ).toBe(409);

      await api.servicio(VencimientosService).revisar();
      expect((await fila(c.usuarioId)).estadoHabilitacion).toBe('suspendido');

      // el monitor no bloquea, solo suspende temporalmente
      expect(
        (
          await api.post(
            `/v1/op/conductores/${c.usuarioId}/bloquear`,
            { motivo: 'Fraude comprobado' },
            monitor,
          )
        ).estado,
      ).toBe(403);

      const re = await api.post(
        `/v1/op/conductores/${c.usuarioId}/reactivar`,
        { motivo: 'Se aclaró la queja' },
        monitor,
      );
      expect(re.estado).toBe(204);
      expect(await fila(c.usuarioId)).toMatchObject({
        estadoHabilitacion: 'habilitado',
        suspensionManual: false,
      });
      expect(
        (await api.post('/v1/conductor/conectar', api.nuevaZona(), c.accessToken)).estado,
      ).toBe(200);
    });

    it('bloquear cierra sus sesiones; solo cumplimiento o supervisión lo levantan', async () => {
      const c = await api.crearConductorHabilitado('3008200012');
      expect((await api.get('/v1/conductor/yo', c.accessToken)).estado).toBe(200);
      expect(
        (
          await api.post(
            `/v1/op/conductores/${c.usuarioId}/bloquear`,
            { motivo: 'Documentos falsificados' },
            cumplimiento,
          )
        ).estado,
      ).toBe(204);
      expect((await api.get('/v1/conductor/yo', c.accessToken)).estado).toBe(401);
      const [u] = await api.bd.db.select().from(usuario).where(eq(usuario.id, c.usuarioId));
      expect(u!.estado).toBe('bloqueado');

      expect(
        (
          await api.post(
            `/v1/op/conductores/${c.usuarioId}/reactivar`,
            { motivo: 'Intento del monitor' },
            monitor,
          )
        ).estado,
      ).toBe(403);
      expect(
        (
          await api.post(
            `/v1/op/conductores/${c.usuarioId}/reactivar`,
            { motivo: 'Se verificaron los documentos' },
            cumplimiento,
          )
        ).estado,
      ).toBe(204);
      expect((await fila(c.usuarioId)).estadoHabilitacion).toBe('habilitado');
      const otra = await api.iniciarSesion('3008200012', 'conductor');
      expect((await api.get('/v1/conductor/yo', otra.accessToken)).estado).toBe(200);
    });

    it('un documento vencido lo suspende y aprobar el nuevo lo devuelve', async () => {
      const c = await api.crearConductorHabilitado('3008200013');
      const soat = (
        await api.bd.db.select().from(documento).where(eq(documento.tipo, 'soat'))
      ).find((d) => d.vehiculoId === c.vehiculoId)!;
      await api.bd.db
        .update(documento)
        .set({ venceEn: fechaBogota(Date.now() - 3 * 86_400_000) })
        .where(eq(documento.id, soat.id));
      await api.servicio(VencimientosService).revisar();
      expect((await fila(c.usuarioId)).estadoHabilitacion).toBe('suspendido');

      const lista = (await api.get('/v1/op/vencimientos?dias=30', cumplimiento)).cuerpo;
      expect(lista.items.find((i: any) => i.id === soat.id)).toMatchObject({
        estado: 'vencido',
        conductorId: c.usuarioId,
      });

      // sube uno nuevo y cumplimiento lo aprueba
      const f = new FormData();
      f.set('tipo', 'soat');
      f.set('vehiculoId', c.vehiculoId);
      f.set('venceEn', `${new Date().getFullYear() + 1}-12-31`);
      f.set(
        'archivo',
        new Blob(
          [
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
              'base64',
            ),
          ],
          { type: 'image/png' },
        ),
        'soat.png',
      );
      expect(
        (await api.postForm('/v1/conductor/documentos', f, c.accessToken)).estado,
      ).toBeLessThan(300);
      const ficha = (await api.get(`/v1/op/conductores/${c.usuarioId}`, cumplimiento)).cuerpo;
      const nuevo = ficha.documentos.find(
        (d: any) => d.tipo === 'soat' && d.estado === 'pendiente',
      );
      expect(
        (await api.post(`/v1/op/documentos/${nuevo.id}/aprobar`, {}, cumplimiento)).estado,
      ).toBe(200);
      expect((await fila(c.usuarioId)).estadoHabilitacion).toBe('habilitado');
    });
  });

  describe('pasajeros', () => {
    it('ficha, bloqueo con motivo y desbloqueo; se ve en el historial', async () => {
      const p = await api.iniciarSesion('3008200101', 'pasajero');
      const lista = await api.get('/v1/op/pasajeros?q=3008200101', soporte);
      expect(lista.estado).toBe(200);
      expect(lista.cuerpo.items).toHaveLength(1);
      const ficha = (await api.get(`/v1/op/pasajeros/${p.usuarioId}`, soporte)).cuerpo;
      expect(ficha).toMatchObject({ id: p.usuarioId, estado: 'activo', deuda: 0 });

      // el monitor solo mira; soporte bloquea
      expect(
        (await api.post(`/v1/op/pasajeros/${p.usuarioId}/bloquear`, { motivo: 'Abuso' }, monitor))
          .estado,
      ).toBe(403);
      expect(
        (await api.post(`/v1/op/pasajeros/${p.usuarioId}/bloquear`, { motivo: '' }, soporte))
          .estado,
      ).toBe(400);
      expect(
        (
          await api.post(
            `/v1/op/pasajeros/${p.usuarioId}/bloquear`,
            { motivo: 'Insultos reiterados al conductor' },
            soporte,
          )
        ).estado,
      ).toBe(204);
      expect((await api.get('/v1/pasajero/yo', p.accessToken)).estado).toBe(401);
      expect((await api.get(`/v1/op/pasajeros/${p.usuarioId}`, soporte)).cuerpo.estado).toBe(
        'bloqueado',
      );
      expect(
        (
          await api.post(
            `/v1/op/pasajeros/${p.usuarioId}/bloquear`,
            { motivo: 'Otra vez más' },
            soporte,
          )
        ).estado,
      ).toBe(409);

      expect(
        (
          await api.post(
            `/v1/op/pasajeros/${p.usuarioId}/desbloquear`,
            { motivo: 'Pidió disculpas' },
            soporte,
          )
        ).estado,
      ).toBe(204);
      const historial = (await api.get(`/v1/op/pasajeros/${p.usuarioId}`, soporte)).cuerpo
        .historial;
      expect(historial.map((h: any) => h.accion)).toEqual([
        'pasajero.desbloquear',
        'pasajero.bloquear',
      ]);
    });
  });
});
