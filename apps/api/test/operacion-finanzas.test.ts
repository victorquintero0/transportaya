import {
  ajusteSaldo,
  cierreDiario,
  conductor,
  movimientoSaldo,
  pagoConductor,
} from '@transportaya/db';
import { fechaBogota } from '@transportaya/dominio';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Arnes, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('Finanzas: cierre, cobranza, pagos y ajustes (OPE-07)', () => {
  let api: Arnes;
  let financiero: string;
  let supervisor: string;
  let admin: string;
  let monitor: string;
  beforeAll(async () => {
    api = await levantarApi(
      {},
      { despacho: { ofertaMs: 3000, reintentoMs: 150, presupuestoMs: 8000 } },
    );
    financiero = (await api.ingresarOperacion('financiero')).accessToken;
    supervisor = (await api.ingresarOperacion('supervisor')).accessToken;
    admin = (await api.ingresarOperacion('admin')).accessToken;
    monitor = (await api.ingresarOperacion('monitor')).accessToken;
  });
  afterAll(async () => {
    await api.cerrar();
  });

  const hoy = () => fechaBogota(new Date());
  const fila = async (id: string) =>
    (await api.bd.db.select().from(conductor).where(eq(conductor.usuarioId, id)))[0]!;

  it('quien no es de finanzas no ve nada de dinero', async () => {
    expect((await api.get('/v1/op/finanzas/resumen', monitor)).estado).toBe(403);
    expect((await api.get('/v1/op/finanzas/resumen', financiero)).estado).toBe(200);
  });

  it('ejecuta el cierre, lista los cierres del día y la cobranza, y concilia el pago que habilita', async () => {
    const c = await api.conductorEnLinea('3009300001', api.nuevaZona());
    const v = await api.completarViaje(c, { metodoPago: 'efectivo' });

    expect(
      (await api.post('/v1/op/finanzas/cierres/ejecutar', { dia: hoy() }, monitor)).estado,
    ).toBe(403);
    expect(
      (await api.post('/v1/op/finanzas/cierres/ejecutar', { dia: '2999-01-01' }, financiero))
        .estado,
    ).toBe(400);
    const ejec = await api.post('/v1/op/finanzas/cierres/ejecutar', { dia: hoy() }, financiero);
    expect(ejec.estado).toBe(200);
    expect(ejec.cuerpo.aCobrar).toBeGreaterThanOrEqual(1);

    const cierres = (await api.get(`/v1/op/finanzas/cierres?dia=${hoy()}`, financiero)).cuerpo;
    const suyo = cierres.items.find((x: any) => x.conductorId === c.usuarioId);
    expect(suyo).toMatchObject({
      resultado: 'a_cargo',
      estado: 'por_cobrar',
      saldoFinal: -v.comision,
      bloqueado: true,
    });
    expect(cierres.totales.aCargo).toBeGreaterThanOrEqual(v.comision);

    // el cierre no se repite
    const otra = await api.post('/v1/op/finanzas/cierres/ejecutar', { dia: hoy() }, financiero);
    expect(otra.cuerpo.conductores).toBe(0);

    // el conductor reporta el pago por Bre-B
    const rep = await api.post(
      '/v1/conductor/pagos-comision',
      { monto: Math.max(v.comision, 1000), referencia: 'BREB-OP-1' },
      c.accessToken,
    );
    expect(rep.estado).toBe(201);
    const cobranza = (await api.get('/v1/op/finanzas/cobranza', financiero)).cuerpo;
    expect(cobranza.bloqueados.find((b: any) => b.id === c.usuarioId)).toMatchObject({
      deuda: v.comision,
    });
    const pendiente = cobranza.pagosPorConciliar.find((p: any) => p.id === rep.cuerpo.id);
    expect(pendiente).toMatchObject({ referencia: 'BREB-OP-1', conductorId: c.usuarioId });

    const conciliar = await api.post(
      `/v1/op/finanzas/pagos-comision/${rep.cuerpo.id}/conciliar`,
      {},
      financiero,
    );
    expect(conciliar.estado).toBe(200);
    expect(conciliar.cuerpo).toMatchObject({ habilitado: true });
    expect((await fila(c.usuarioId)).bloqueadoPorDeuda).toBe(false);
    // conciliar otra vez no acredita dos veces
    expect(
      (await api.post(`/v1/op/finanzas/pagos-comision/${rep.cuerpo.id}/conciliar`, {}, financiero))
        .cuerpo.yaConciliado,
    ).toBe(true);
    const libro = (
      await api.get(`/v1/op/finanzas/conductores/${c.usuarioId}/movimientos`, financiero)
    ).cuerpo;
    expect(libro.movimientos.filter((m: any) => m.tipo === 'pago_comision')).toHaveLength(1);
    expect(libro.saldo).toBe(Math.max(v.comision, 1000) - v.comision); // el pago mínimo es $1.000
    const aud = await api.get('/v1/op/auditoria?accion=pago_comision.', supervisor);
    expect(aud.cuerpo.items[0].accion).toBe('pago_comision.conciliar');
  });

  it('rechazar un pago de comisión deja constancia y no habilita', async () => {
    const c = await api.conductorEnLinea('3009300002', api.nuevaZona());
    const v = await api.completarViaje(c, { metodoPago: 'efectivo' });
    await api.post('/v1/op/finanzas/cierres/ejecutar', { dia: hoy() }, financiero);
    const rep = await api.post(
      '/v1/conductor/pagos-comision',
      { monto: Math.max(v.comision, 1000), referencia: 'BREB-OP-2' },
      c.accessToken,
    );
    expect(
      (await api.post(`/v1/op/finanzas/pagos-comision/${rep.cuerpo.id}/rechazar`, {}, financiero))
        .estado,
    ).toBe(400);
    expect(
      (
        await api.post(
          `/v1/op/finanzas/pagos-comision/${rep.cuerpo.id}/rechazar`,
          { motivo: 'No aparece en el extracto' },
          financiero,
        )
      ).estado,
    ).toBe(204);
    expect((await fila(c.usuarioId)).bloqueadoPorDeuda).toBe(true);
    expect(
      (await api.post(`/v1/op/finanzas/pagos-comision/${rep.cuerpo.id}/conciliar`, {}, financiero))
        .cuerpo.yaConciliado,
    ).toBe(true);
    expect(
      (
        await api.post(
          `/v1/op/finanzas/pagos-comision/${rep.cuerpo.id}/rechazar`,
          { motivo: 'Otra vez' },
          financiero,
        )
      ).estado,
    ).toBe(409);
  });

  it('habilitar a mano exige motivo y queda en la auditoría', async () => {
    const c = await api.conductorEnLinea('3009300003', api.nuevaZona());
    await api.completarViaje(c, { metodoPago: 'efectivo' });
    await api.post('/v1/op/finanzas/cierres/ejecutar', { dia: hoy() }, financiero);
    expect((await fila(c.usuarioId)).bloqueadoPorDeuda).toBe(true);
    const url = `/v1/op/finanzas/conductores/${c.usuarioId}/habilitar`;
    expect((await api.post(url, { motivo: '' }, financiero)).estado).toBe(400);
    expect(
      (await api.post(url, { motivo: 'Pagó en efectivo en la oficina' }, monitor)).estado,
    ).toBe(403);
    expect(
      (await api.post(url, { motivo: 'Pagó en efectivo en la oficina' }, financiero)).estado,
    ).toBe(204);
    expect((await fila(c.usuarioId)).bloqueadoPorDeuda).toBe(false);
    expect((await api.post(url, { motivo: 'Segunda vez' }, financiero)).estado).toBe(409);
    const aud = await api.get(
      `/v1/op/auditoria?accion=conductor.habilitar_por_deuda&entidadId=${c.usuarioId}`,
      supervisor,
    );
    expect(aud.cuerpo.items[0]).toMatchObject({
      motivo: 'Pagó en efectivo en la oficina',
      antes: { bloqueadoPorDeuda: true },
    });
  });

  it('pagos al conductor: se envían, se confirman y se descuentan del libro', async () => {
    const c = await api.conductorEnLinea('3009300004', api.nuevaZona());
    const v = await api.completarViaje(c, { metodoPago: 'tarjeta', distanciaM: 12_000 });
    await api.post('/v1/op/finanzas/cierres/ejecutar', { dia: hoy() }, financiero);
    const pagos = (await api.get('/v1/op/finanzas/pagos-conductor', financiero)).cuerpo;
    const p = pagos.find((x: any) => x.conductorId === c.usuarioId);
    expect(p).toMatchObject({ monto: v.gananciaNeta, estado: 'pendiente' });
    expect(p.cuenta).toMatch(/^•+/);
    expect(
      (await api.post(`/v1/op/finanzas/pagos-conductor/${p.id}/confirmar`, {}, monitor)).estado,
    ).toBe(403);
    expect(
      (await api.post(`/v1/op/finanzas/pagos-conductor/${p.id}/enviar`, {}, financiero)).estado,
    ).toBe(204);
    expect(
      (await api.post(`/v1/op/finanzas/pagos-conductor/${p.id}/enviar`, {}, financiero)).estado,
    ).toBe(409);
    const conf = await api.post(
      `/v1/op/finanzas/pagos-conductor/${p.id}/confirmar`,
      {},
      financiero,
    );
    expect(conf.estado).toBe(200);
    const [pc] = await api.bd.db.select().from(pagoConductor).where(eq(pagoConductor.id, p.id));
    expect(pc!.estado).toBe('confirmada');
    const [cierre] = await api.bd.db
      .select()
      .from(cierreDiario)
      .where(and(eq(cierreDiario.conductorId, c.usuarioId), eq(cierreDiario.dia, hoy())));
    expect(cierre!.estado).toBe('pagado');
    expect(
      (await api.get(`/v1/op/finanzas/conductores/${c.usuarioId}/movimientos`, financiero)).cuerpo
        .saldo,
    ).toBe(0);
  });

  describe('ajustes con doble aprobación', () => {
    it('quien propone no aprueba; el financiero no aprueba; otra persona de supervisión sí', async () => {
      const c = await api.crearConductorHabilitado('3009300005');
      const body = {
        conductorId: c.usuarioId,
        monto: -4000,
        motivo: 'Cobro duplicado de un viaje en efectivo',
      };
      expect((await api.post('/v1/op/finanzas/ajustes', body, monitor)).estado).toBe(403);
      expect(
        (await api.post('/v1/op/finanzas/ajustes', { ...body, monto: 0 }, financiero)).estado,
      ).toBe(400);
      expect(
        (await api.post('/v1/op/finanzas/ajustes', { ...body, motivo: 'corto' }, financiero))
          .estado,
      ).toBe(400);
      const prop = await api.post('/v1/op/finanzas/ajustes', body, financiero);
      expect(prop.estado).toBe(201);
      const id = prop.cuerpo.id;

      // el financiero que lo propuso no tiene permiso de aprobar
      expect((await api.post(`/v1/op/finanzas/ajustes/${id}/aprobar`, {}, financiero)).estado).toBe(
        403,
      );
      // un supervisor que propone otro no puede aprobar el suyo
      const propio = await api.post(
        '/v1/op/finanzas/ajustes',
        { ...body, monto: 1500, motivo: 'Corrección a favor del conductor' },
        supervisor,
      );
      const auto = await api.post(
        `/v1/op/finanzas/ajustes/${propio.cuerpo.id}/aprobar`,
        {},
        supervisor,
      );
      expect(auto.estado).toBe(403);
      expect(auto.cuerpo.codigo).toBe('DOBLE_APROBACION');

      // sin aprobar no se mueve el libro
      expect(
        (await api.get(`/v1/op/finanzas/conductores/${c.usuarioId}/movimientos`, financiero)).cuerpo
          .saldo,
      ).toBe(0);

      const ok = await api.post(`/v1/op/finanzas/ajustes/${id}/aprobar`, {}, supervisor);
      expect(ok.estado).toBe(200);
      expect(ok.cuerpo.saldo).toBe(-4000);
      const [mov] = await api.bd.db
        .select()
        .from(movimientoSaldo)
        .where(
          and(eq(movimientoSaldo.conductorId, c.usuarioId), eq(movimientoSaldo.tipo, 'ajuste')),
        );
      expect(mov).toMatchObject({ monto: -4000 });
      expect(mov!.creadoPor).not.toBe(mov!.aprobadoPor);
      // no se aprueba dos veces
      expect((await api.post(`/v1/op/finanzas/ajustes/${id}/aprobar`, {}, admin)).estado).toBe(409);

      // el otro lo rechaza el administrador
      expect(
        (
          await api.post(
            `/v1/op/finanzas/ajustes/${propio.cuerpo.id}/rechazar`,
            { motivo: 'No hay soporte' },
            admin,
          )
        ).estado,
      ).toBe(204);
      const [rech] = await api.bd.db
        .select()
        .from(ajusteSaldo)
        .where(eq(ajusteSaldo.id, propio.cuerpo.id));
      expect(rech).toMatchObject({ estado: 'rechazado', motivoResolucion: 'No hay soporte' });

      const lista = (await api.get('/v1/op/finanzas/ajustes?estado=aprobado', financiero)).cuerpo;
      expect(lista.find((a: any) => a.id === id)).toMatchObject({
        conductor: expect.any(String),
        estado: 'aprobado',
        propuestoPor: 'Fabián Financiero',
      });
    });

    it('un ajuste a favor que cubre la deuda habilita al conductor', async () => {
      const c = await api.conductorEnLinea('3009300006', api.nuevaZona());
      const v = await api.completarViaje(c, { metodoPago: 'efectivo' });
      await api.post('/v1/op/finanzas/cierres/ejecutar', { dia: hoy() }, financiero);
      expect((await fila(c.usuarioId)).bloqueadoPorDeuda).toBe(true);
      const prop = await api.post(
        '/v1/op/finanzas/ajustes',
        {
          conductorId: c.usuarioId,
          monto: v.comision,
          motivo: 'Se le debía esta comisión por una promoción',
        },
        financiero,
      );
      const ok = await api.post(`/v1/op/finanzas/ajustes/${prop.cuerpo.id}/aprobar`, {}, admin);
      expect(ok.cuerpo).toMatchObject({ saldo: 0, habilitado: true });
      expect((await fila(c.usuarioId)).bloqueadoPorDeuda).toBe(false);
    });
  });
});
