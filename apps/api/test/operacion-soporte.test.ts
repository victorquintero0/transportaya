import { reembolso, ticket, viaje } from '@transportaya/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)(
  'Soporte, reembolsos, reportes y auditoría (OPE-03, OPE-08, OPE-11)',
  () => {
    let api: Arnes;
    let soporte: string;
    let financiero: string;
    let supervisor: string;
    let monitor: string;
    let admin: string;
    beforeAll(async () => {
      api = await levantarApi(
        {},
        { despacho: { ofertaMs: 3000, reintentoMs: 150, presupuestoMs: 8000 } },
      );
      soporte = (await api.ingresarOperacion('soporte')).accessToken;
      financiero = (await api.ingresarOperacion('financiero')).accessToken;
      supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
      monitor = (await api.ingresarOperacion('monitor')).accessToken;
      admin = (await api.ingresarOperacion('admin')).accessToken;
    });
    afterAll(async () => {
      await api.cerrar();
    });

    describe('bandeja de tickets', () => {
      it('un reporte del pasajero llega a la bandeja con su plazo; se asigna, se responde y se resuelve', async () => {
        const p = await api.iniciarSesion('3001400001', 'pasajero');
        const r = await api.post(
          '/v1/pasajero/soporte/tickets',
          {
            tipo: 'incidente_seguridad',
            asunto: 'El conductor iba muy rápido',
            detalle: 'Pasó varios semáforos en rojo',
          },
          p.accessToken,
        );
        expect(r.estado).toBe(201);

        const bandeja = (await api.get('/v1/op/tickets?estado=abiertos', soporte)).cuerpo;
        const t = bandeja.items.find((x: any) => x.id === r.cuerpo.id);
        expect(t).toMatchObject({
          tipo: 'incidente_seguridad',
          prioridad: 'alta',
          estado: 'abierto',
          sla: 'verde',
          asignadoA: null,
        });
        expect(bandeja.resumen.sinAsignar).toBeGreaterThanOrEqual(1);

        // el monitor solo mira
        expect((await api.get(`/v1/op/tickets/${t.id}`, monitor)).estado).toBe(200);
        expect(
          (
            await api.post(
              `/v1/op/tickets/${t.id}/mensajes`,
              { cuerpo: 'Hola', interno: false },
              monitor,
            )
          ).estado,
        ).toBe(403);

        const me = (await api.get('/v1/op/yo', soporte)).cuerpo;
        expect(
          (await api.patch(`/v1/op/tickets/${t.id}`, { asignadoA: me.id }, soporte)).estado,
        ).toBe(204);
        expect(
          (await api.get('/v1/op/tickets?asignado=yo&estado=abiertos', soporte)).cuerpo.items.some(
            (x: any) => x.id === t.id,
          ),
        ).toBe(true);

        expect(
          (
            await api.post(
              `/v1/op/tickets/${t.id}/mensajes`,
              { cuerpo: 'Es un caso serio, lo escalo.', interno: true },
              soporte,
            )
          ).estado,
        ).toBe(204);
        expect(
          (
            await api.post(
              `/v1/op/tickets/${t.id}/mensajes`,
              { cuerpo: 'Lamentamos lo ocurrido. Ya hablamos con el conductor.', interno: false },
              soporte,
            )
          ).estado,
        ).toBe(204);
        const d = (await api.get(`/v1/op/tickets/${t.id}`, soporte)).cuerpo;
        expect(d.estado).toBe('esperando_usuario');
        expect(d.usuario).toMatchObject({ tipo: 'pasajero', telefono: '+573001400001' });
        expect(d.mensajes.map((m: any) => [m.esEmpleado, m.interno])).toEqual([
          [false, false], // lo que escribió el pasajero
          [true, true],
          [true, false],
        ]);

        expect(
          (await api.patch(`/v1/op/tickets/${t.id}`, { estado: 'resuelto' }, soporte)).estado,
        ).toBe(204);
        const [fila] = await api.bd.db.select().from(ticket).where(eq(ticket.id, t.id));
        expect(fila!.resueltoEn).not.toBeNull();
        expect(
          (
            await api.post(
              `/v1/op/tickets/${t.id}/mensajes`,
              { cuerpo: 'Gracias', interno: true },
              soporte,
            )
          ).estado,
        ).toBe(204);
        expect(
          (await api.patch(`/v1/op/tickets/${t.id}`, { estado: 'cerrado' }, soporte)).estado,
        ).toBe(204);
        expect(
          (
            await api.post(
              `/v1/op/tickets/${t.id}/mensajes`,
              { cuerpo: 'Tarde', interno: true },
              soporte,
            )
          ).estado,
        ).toBe(409);
      });

      it('marca los tickets con el plazo vencido', async () => {
        const p = await api.iniciarSesion('3001400002', 'pasajero');
        const r = await api.post(
          '/v1/pasajero/soporte/tickets',
          { tipo: 'queja', asunto: 'Me cobraron peaje de más' },
          p.accessToken,
        );
        await api.bd.db
          .update(ticket)
          .set({ venceSlaEn: new Date(Date.now() - 3_600_000) })
          .where(eq(ticket.id, r.cuerpo.id));
        const vencidos = (await api.get('/v1/op/tickets?vencidos=true', soporte)).cuerpo;
        expect(vencidos.items.find((x: any) => x.id === r.cuerpo.id)).toMatchObject({
          sla: 'rojo',
        });
        expect(vencidos.resumen.vencidos).toBeGreaterThanOrEqual(1);
      });

      it('el plazo sale de los parámetros editables', async () => {
        expect(
          (
            await api.put(
              '/v1/op/parametros/soporte.sla_normal_h',
              { valor: 4, motivo: 'Más exigentes' },
              admin,
            )
          ).estado,
        ).toBe(200);
        const p = await api.iniciarSesion('3001400003', 'pasajero');
        const r = await api.post(
          '/v1/pasajero/soporte/tickets',
          { tipo: 'peticion', asunto: 'Quiero borrar mi cuenta' },
          p.accessToken,
        );
        expect(r.cuerpo.respuestaEnHoras).toBe(4);
        await api.delete(
          '/v1/op/parametros/soporte.sla_normal_h',
          { motivo: 'Volver al valor original' },
          admin,
        );
      });
    });

    describe('crear tickets y reembolsos desde un viaje', () => {
      it('soporte reembolsa hasta su límite; por encima, finanzas', async () => {
        const c = await api.conductorEnLinea('3001400011', api.nuevaZona());
        const hecho = await api.completarViaje(c, { metodoPago: 'tarjeta', distanciaM: 8000 });
        const d = (await api.get(`/v1/op/viajes/${hecho.viajeId}`, soporte)).cuerpo;
        expect(d.pasajero.id).toBeTruthy();

        expect(
          (
            await api.post(
              '/v1/op/tickets',
              {
                usuarioId: d.pasajero.id,
                tipo: 'cobro_incorrecto',
                viajeId: hecho.viajeId,
                asunto: 'Cobro mayor al esperado',
              },
              monitor,
            )
          ).estado,
        ).toBe(403);
        const t = await api.post(
          '/v1/op/tickets',
          {
            usuarioId: d.pasajero.id,
            tipo: 'cobro_incorrecto',
            viajeId: hecho.viajeId,
            asunto: 'Cobro mayor al esperado',
            detalle: 'Llamó la pasajera',
          },
          soporte,
        );
        expect(t.estado).toBe(201);
        const url = `/v1/op/tickets/${t.cuerpo.id}/reembolso`;
        const det = (await api.get(`/v1/op/tickets/${t.cuerpo.id}`, soporte)).cuerpo;
        expect(det.reembolsable).toMatchObject({ monto: hecho.precioFinal, reembolsado: 0 });
        expect(
          (await api.get(`/v1/op/viajes/${hecho.viajeId}`, soporte)).cuerpo.tickets,
        ).toHaveLength(1);

        expect((await api.post(url, { monto: 2000, motivo: 'x' }, soporte)).estado).toBe(400);
        expect(
          (
            await api.post(
              url,
              { monto: 2000, motivo: 'Diferencia por tarifa mal calculada' },
              monitor,
            )
          ).estado,
        ).toBe(403);
        const r1 = await api.post(
          url,
          { monto: 2000, motivo: 'Diferencia por tarifa mal calculada' },
          soporte,
        );
        expect(r1.estado).toBe(201);
        expect(r1.cuerpo.restante).toBe(hecho.precioFinal - 2000);
        const [v] = await api.bd.db.select().from(viaje).where(eq(viaje.id, hecho.viajeId));
        expect(v!.estadoPago).toBe('reembolsado_parcial');

        // por encima del límite de soporte
        await api.put(
          '/v1/op/parametros/soporte.reembolso_limite_cop',
          { valor: 1000, motivo: 'Límite bajo de prueba' },
          admin,
        );
        const sobre = await api.post(
          url,
          { monto: 3000, motivo: 'Reembolso adicional acordado' },
          soporte,
        );
        expect(sobre.estado).toBe(403);
        expect(sobre.cuerpo.codigo).toBe('LIMITE_REEMBOLSO');
        expect(
          (await api.post(url, { monto: 3000, motivo: 'Reembolso adicional acordado' }, financiero))
            .estado,
        ).toBe(201);
        await api.delete(
          '/v1/op/parametros/soporte.reembolso_limite_cop',
          { motivo: 'Volver al valor original' },
          admin,
        );

        // no se puede devolver más de lo cobrado
        const exceso = await api.post(
          url,
          { monto: hecho.precioFinal, motivo: 'Intento de devolver de más' },
          financiero,
        );
        expect(exceso.estado).toBe(409);
        expect(exceso.cuerpo.codigo).toBe('MONTO_EXCEDE_COBRO');
        const filas = await api.bd.db.select().from(reembolso);
        expect(filas.filter((f) => f.ticketId === t.cuerpo.id)).toHaveLength(2);

        // devolver el resto lo deja totalmente reembolsado
        const resto = hecho.precioFinal - 5000;
        expect(
          (await api.post(url, { monto: resto, motivo: 'Cobro anulado por completo' }, supervisor))
            .estado,
        ).toBe(201);
        expect(
          (await api.get(`/v1/op/viajes/${hecho.viajeId}`, soporte)).cuerpo.viaje.estadoPago,
        ).toBe('reembolsado');
      });

      it('un viaje en efectivo no se reembolsa', async () => {
        const c = await api.conductorEnLinea('3001400012', api.nuevaZona());
        const hecho = await api.completarViaje(c, { metodoPago: 'efectivo' });
        const d = (await api.get(`/v1/op/viajes/${hecho.viajeId}`, soporte)).cuerpo;
        const t = await api.post(
          '/v1/op/tickets',
          {
            usuarioId: d.pasajero.id,
            tipo: 'cobro_incorrecto',
            viajeId: hecho.viajeId,
            asunto: 'Pagó de más en efectivo',
          },
          soporte,
        );
        const r = await api.post(
          `/v1/op/tickets/${t.cuerpo.id}/reembolso`,
          { monto: 1000, motivo: 'Intento sobre un cobro en efectivo' },
          soporte,
        );
        expect(r.estado).toBe(409);
        expect(r.cuerpo.codigo).toBe('SIN_COBRO_ELECTRONICO');
      });
    });

    describe('reportes de tiempos y movimientos', () => {
      it('calcula los indicadores de la operación en el rango', async () => {
        const c = await api.conductorEnLinea('3001400021', api.nuevaZona());
        await api.completarViaje(c, { metodoPago: 'efectivo' });
        await api.completarViaje(c, { metodoPago: 'tarjeta' });

        expect((await api.get('/v1/op/reportes/tiempos', soporte)).estado).toBe(403);
        const r = (await api.get('/v1/op/reportes/tiempos', financiero)).cuerpo;
        expect(r.viajes.solicitudes).toBeGreaterThanOrEqual(2);
        expect(r.viajes.finalizados).toBeGreaterThanOrEqual(2);
        expect(r.dinero.ingresosBrutos).toBeGreaterThan(0);
        expect(r.dinero.viajesEfectivo).toBeGreaterThanOrEqual(1);
        expect(r.dinero.viajesElectronico).toBeGreaterThanOrEqual(1);
        expect(r.ofertas.tasaAceptacion).toBeGreaterThan(0);
        expect(r.tiempos.asignacionMediaS).not.toBeNull();
        expect(r.porDia.length).toBeGreaterThanOrEqual(1);
        expect(r.porHora.reduce((a: number, h: any) => a + h.solicitudes, 0)).toBe(
          r.viajes.solicitudes,
        );
        const suyo = r.conductores.find((x: any) => x.id === c.usuarioId);
        expect(suyo.viajes).toBe(2);
        expect(suyo.horasEnLinea).toBeGreaterThanOrEqual(0);

        // rango inválido
        expect(
          (await api.get('/v1/op/reportes/tiempos?desde=2026-01-10&hasta=2026-01-01', financiero))
            .estado,
        ).toBe(400);
        expect(
          (await api.get('/v1/op/reportes/tiempos?desde=2025-01-01&hasta=2026-01-01', financiero))
            .estado,
        ).toBe(400);
      });

      it('exporta CSV con codificación para Excel y deja constancia', async () => {
        const r = await fetch(`${api.url}/v1/op/reportes/viajes.csv`, {
          headers: { authorization: `Bearer ${supervisor}` },
        });
        expect(r.status).toBe(200);
        expect(r.headers.get('content-type')).toContain('text/csv');
        const bytes = new Uint8Array(await r.arrayBuffer());
        expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM para Excel
        const texto = new TextDecoder().decode(bytes);
        expect(texto).toContain('codigo,solicitado,estado');
        expect(texto.split('\n').length).toBeGreaterThan(3);
        const sinPermiso = await fetch(`${api.url}/v1/op/reportes/viajes.csv`, {
          headers: { authorization: `Bearer ${soporte}` },
        });
        expect(sinPermiso.status).toBe(403);
        const aud = await api.get('/v1/op/auditoria?accion=reporte.exportar', supervisor);
        expect(aud.cuerpo.total).toBeGreaterThanOrEqual(1);
      });
    });

    describe('usuarios internos y auditoría', () => {
      it('el administrador cambia roles; no puede quitarse el suyo ni desactivarse', async () => {
        const lista = (await api.get('/v1/op/usuarios', supervisor)).cuerpo;
        expect(lista).toHaveLength(6);
        const yo = (await api.get('/v1/op/yo', admin)).cuerpo;
        expect(
          (
            await api.patch(
              `/v1/op/usuarios/${yo.id}`,
              { roles: ['soporte'], motivo: 'Probar' },
              admin,
            )
          ).estado,
        ).toBe(409);
        expect(
          (await api.patch(`/v1/op/usuarios/${yo.id}`, { activo: false, motivo: 'Probar' }, admin))
            .estado,
        ).toBe(409);
        // supervisión puede ver pero no gestionar
        expect(
          (
            await api.patch(
              `/v1/op/usuarios/${yo.id}`,
              { roles: ['admin'], motivo: 'Probar' },
              supervisor,
            )
          ).estado,
        ).toBe(403);

        const otro = lista.find((u: any) => u.roles[0] === 'soporte');
        const r = await api.patch(
          `/v1/op/usuarios/${otro.id}`,
          { roles: ['soporte', 'financiero'], motivo: 'Cubre también conciliación' },
          admin,
        );
        expect(r.estado).toBe(200);
        expect(r.cuerpo.permisos).toContain('finanzas.operar');
        // y el cambio rige de inmediato, sin volver a ingresar
        expect((await api.get('/v1/op/finanzas/resumen', soporte)).estado).toBe(200);
        await api.patch(
          `/v1/op/usuarios/${otro.id}`,
          { roles: ['soporte'], motivo: 'Termina la cobertura' },
          admin,
        );
        expect((await api.get('/v1/op/finanzas/resumen', soporte)).estado).toBe(403);
      });

      it('restablecer la contraseña da una temporal y cierra las sesiones; reiniciar el segundo factor también', async () => {
        const nuevo = await api.post(
          '/v1/op/usuarios',
          {
            nombre: 'Tomás Temporal',
            telefono: '3105550077',
            email: 'tomas@transporteya.co',
            roles: ['monitor'],
          },
          admin,
        );
        expect(nuevo.estado).toBe(201);
        expect(
          (
            await api.post(
              '/v1/op/usuarios',
              {
                nombre: 'Repetido',
                telefono: '3105550078',
                email: 'tomas@transporteya.co',
                roles: ['monitor'],
              },
              admin,
            )
          ).estado,
        ).toBe(409);
        const r = await api.post(
          `/v1/op/usuarios/${nuevo.cuerpo.id}/restablecer-contrasena`,
          { motivo: 'La olvidó' },
          admin,
        );
        expect(r.estado).toBe(200);
        expect(r.cuerpo.contrasenaTemporal).toBeTruthy();
        expect(
          (
            await api.post(
              `/v1/op/usuarios/${nuevo.cuerpo.id}/reiniciar-segundo-factor`,
              { motivo: 'Perdió el celular' },
              admin,
            )
          ).estado,
        ).toBe(204);
        const aud = await api.get(`/v1/op/auditoria?entidadId=${nuevo.cuerpo.id}`, supervisor);
        expect(aud.cuerpo.items.map((i: any) => i.accion)).toEqual(
          expect.arrayContaining([
            'empleado.crear',
            'empleado.restablecer_contrasena',
            'empleado.reiniciar_totp',
          ]),
        );
        // la contraseña temporal no queda en la auditoría
        expect(JSON.stringify(aud.cuerpo.items)).not.toContain(r.cuerpo.contrasenaTemporal);
      });

      it('la auditoría se filtra y solo la ve supervisión o administración', async () => {
        expect((await api.get('/v1/op/auditoria', financiero)).estado).toBe(403);
        const r = (await api.get('/v1/op/auditoria?limite=5&accion=sesion.', supervisor)).cuerpo;
        expect(r.items.length).toBeLessThanOrEqual(5);
        expect(r.items[0]).toMatchObject({ accion: 'sesion.ingresar', entidad: 'empleado' });
        expect(r.total).toBeGreaterThanOrEqual(5);
      });
    });
  },
);
