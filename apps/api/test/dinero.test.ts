import { and, eq, sql } from 'drizzle-orm';
import {
  alerta,
  cierreDiario,
  conductor,
  documento,
  movimientoSaldo,
  pagoComision,
  pagoConductor,
} from '@transportaya/db';
import { fechaBogota } from '@transportaya/dominio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VencimientosService } from '../src/conductor/vencimientos.service.js';
import { CierresService } from '../src/dinero/cierres.service.js';
import { PagosService } from '../src/dinero/pagos.service.js';
import { type Arnes, type ConductorEnLinea, baseDisponible, levantarApi } from './arnes.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('ganancias, saldo, cierre diario y pagos', () => {
  let api: Arnes;
  beforeAll(async () => {
    api = await levantarApi(
      {},
      { despacho: { ofertaMs: 2000, reintentoMs: 150, presupuestoMs: 4000 } },
    );
  });
  afterAll(async () => {
    await api.cerrar();
  });

  const hoy = () => fechaBogota(new Date());
  const enLinea = (tel: string) => api.conductorEnLinea(tel, api.nuevaZona());
  const fila = async (id: string) =>
    (await api.bd.db.select().from(conductor).where(eq(conductor.usuarioId, id)))[0]!;
  const saldo = async (id: string) =>
    (await api.get('/v1/conductor/saldo', await tokenDe(id))).cuerpo;
  const tokens = new Map<string, string>();
  const tokenDe = async (id: string) => tokens.get(id)!;
  const registrar = async (c: ConductorEnLinea) => {
    tokens.set(c.usuarioId, c.accessToken);
    return c;
  };

  describe('ganancias', () => {
    it('suma los viajes del día, separa efectivo y electrónico, y descuenta la comisión', async () => {
      const c = await registrar(await enLinea('3004000001'));
      const v1 = await api.completarViaje(c, { metodoPago: 'efectivo' });
      const v2 = await api.completarViaje(c, { metodoPago: 'tarjeta' });

      const r = await api.get('/v1/conductor/ganancias?periodo=hoy', c.accessToken);
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({
        desde: hoy(),
        hasta: hoy(),
        viajes: 2,
        cancelacionesCobradas: 0,
      });
      expect(r.cuerpo.bruto).toBe(v1.precioFinal + v2.precioFinal);
      expect(r.cuerpo.comision).toBe(v1.comision + v2.comision);
      expect(r.cuerpo.neto).toBe(v1.gananciaNeta + v2.gananciaNeta);
      expect(r.cuerpo.efectivo).toBe(v1.precioFinal);
      expect(r.cuerpo.electronico).toBe(v2.precioFinal);
      expect(r.cuerpo.distanciaM).toBe(6000);
      expect(r.cuerpo.promedioPorViaje).toBe(Math.round(r.cuerpo.neto / 2));
      expect(r.cuerpo.porDia).toEqual([
        { dia: hoy(), viajes: 2, bruto: r.cuerpo.bruto, neto: r.cuerpo.neto },
      ]);
    });

    it('otros periodos y rangos', async () => {
      const c = await registrar(await enLinea('3004000002'));
      await api.completarViaje(c);
      expect(
        (await api.get('/v1/conductor/ganancias?periodo=ayer', c.accessToken)).cuerpo,
      ).toMatchObject({ viajes: 0, bruto: 0 });
      expect(
        (await api.get('/v1/conductor/ganancias?periodo=semana', c.accessToken)).cuerpo.viajes,
      ).toBe(1);
      expect(
        (await api.get('/v1/conductor/ganancias?periodo=mes', c.accessToken)).cuerpo.viajes,
      ).toBe(1);
      expect(
        (await api.get(`/v1/conductor/ganancias?desde=${hoy()}&hasta=${hoy()}`, c.accessToken))
          .cuerpo.viajes,
      ).toBe(1);
      expect((await api.get(`/v1/conductor/ganancias?desde=${hoy()}`, c.accessToken)).estado).toBe(
        400,
      );
      expect(
        (await api.get('/v1/conductor/ganancias?desde=2026-10-10&hasta=2026-10-01', c.accessToken))
          .estado,
      ).toBe(400);
      expect((await api.get('/v1/conductor/ganancias?periodo=siglo', c.accessToken)).estado).toBe(
        400,
      );
    });

    it('mide las horas conectado y qué tanto tiempo estuvo con viaje', async () => {
      const c = await registrar(await enLinea('3004000003'));
      await api.completarViaje(c);
      await api.bd.db.execute(
        sql`update sesion_conductor set inicio = now() - interval '2 hours' where conductor_id = ${c.usuarioId}`,
      );
      const r = (await api.get('/v1/conductor/ganancias?periodo=hoy', c.accessToken)).cuerpo;
      // la sesión puede haber empezado ayer en Bogotá si la prueba corre justo después de la medianoche
      expect(r.horasConectado).toBeGreaterThan(0);
      expect(r.utilizacion).toBeGreaterThanOrEqual(0);
      expect(r.utilizacion).toBeLessThanOrEqual(1);
    });
  });

  describe('saldo y libro', () => {
    it('el libro muestra cada movimiento con el saldo resultante', async () => {
      const c = await registrar(await enLinea('3004000011'));
      const efectivo = await api.completarViaje(c, { metodoPago: 'efectivo' });
      const tarjeta = await api.completarViaje(c, { metodoPago: 'tarjeta' });

      const s = (await api.get('/v1/conductor/saldo', c.accessToken)).cuerpo;
      expect(s.saldo).toBe(-efectivo.comision + tarjeta.gananciaNeta);
      expect(s).toMatchObject({ bloqueadoPorDeuda: false, datosPago: { titular: 'TransporteYa' } });

      const m = (await api.get('/v1/conductor/movimientos', c.accessToken)).cuerpo.movimientos;
      expect(m.map((x: any) => x.tipo)).toEqual([
        'ingreso_viaje_electronico',
        'comision_viaje_efectivo',
      ]);
      expect(m[0].saldoDespues).toBe(s.saldo);
      expect(m[1].saldoDespues).toBe(-efectivo.comision);
      expect(m[0].viaje).toMatch(/^TY-/);

      const paginado = (
        await api.get(
          `/v1/conductor/movimientos?limite=1&antes=${encodeURIComponent(m[0].creadoEn)}`,
          c.accessToken,
        )
      ).cuerpo.movimientos;
      expect(paginado.map((x: any) => x.tipo)).toEqual(['comision_viaje_efectivo']);
    });

    it('un conductor nuevo tiene saldo cero', async () => {
      const c = await registrar(await enLinea('3004000012'));
      expect((await api.get('/v1/conductor/saldo', c.accessToken)).cuerpo).toMatchObject({
        saldo: 0,
        deuda: 0,
        aFavor: 0,
      });
    });
  });

  describe('cierre diario (RN-063, D-04)', () => {
    it('con deuda de comisión queda bloqueado, no puede conectarse y se le avisa en vivo', async () => {
      const c = await registrar(await enLinea('3004000021'));
      const v = await api.completarViaje(c, { metodoPago: 'efectivo' });

      const r = await api.servicio(CierresService).cerrarConductor(c.usuarioId, hoy());
      expect(r).toMatchObject({
        resultado: 'a_cargo',
        saldoFinal: -v.comision,
        decision: 'cobrar',
        bloqueado: true,
      });
      const [cierre] = await api.bd.db
        .select()
        .from(cierreDiario)
        .where(eq(cierreDiario.conductorId, c.usuarioId));
      expect(cierre).toMatchObject({
        saldoInicial: 0,
        netoDia: -v.comision,
        saldoFinal: -v.comision,
        estado: 'por_cobrar',
      });

      expect(await fila(c.usuarioId)).toMatchObject({
        bloqueadoPorDeuda: true,
        estadoOperativo: 'desconectado',
      });
      const aviso = await c.socket.esperar(
        'conductor:estado',
        (d: any) => d.motivo === 'deuda_pendiente',
      );
      expect(aviso.estadoOperativo).toBe('desconectado');

      const conectar = await api.post('/v1/conductor/conectar', {}, c.accessToken);
      expect(conectar.estado).toBe(409);
      expect(
        conectar.cuerpo.motivos.find((m: any) => m.codigo === 'DEUDA_PENDIENTE'),
      ).toMatchObject({ deuda: v.comision });
    });

    it('al pagar la comisión por Bre-B se concilia, queda en cero y puede conectarse de nuevo', async () => {
      const c = await registrar(await enLinea('3004000022'));
      const v = await api.completarViaje(c, { metodoPago: 'efectivo' });
      await api.servicio(CierresService).cerrarConductor(c.usuarioId, hoy());

      const r = await api.post('/v1/dev/pagos-comision/simular', {}, c.accessToken);
      expect(r.cuerpo).toMatchObject({ saldo: 0, deuda: 0, bloqueadoPorDeuda: false });
      const [pago] = await api.bd.db
        .select()
        .from(pagoComision)
        .where(eq(pagoComision.conductorId, c.usuarioId));
      expect(pago).toMatchObject({ estado: 'conciliado', monto: v.comision });
      const [mov] = await api.bd.db
        .select()
        .from(movimientoSaldo)
        .where(
          and(
            eq(movimientoSaldo.conductorId, c.usuarioId),
            eq(movimientoSaldo.tipo, 'pago_comision'),
          ),
        );
      expect(mov?.monto).toBe(v.comision);
      const [cierre] = await api.bd.db
        .select()
        .from(cierreDiario)
        .where(eq(cierreDiario.conductorId, c.usuarioId));
      expect(cierre?.estado).toBe('cobrado');
      await c.socket.esperar('conductor:estado', (d: any) => d.motivo === 'comision_pagada');

      expect(
        (await api.post('/v1/conductor/conectar', { ...api.nuevaZona() }, c.accessToken)).estado,
      ).toBe(200);
    });

    it('cruce neto: si lo electrónico supera la comisión del efectivo, no se bloquea y se le paga lo que queda', async () => {
      const c = await registrar(await enLinea('3004000023'));
      const efectivo = await api.completarViaje(c, { metodoPago: 'efectivo' });
      const tarjeta = await api.completarViaje(c, { metodoPago: 'tarjeta', distanciaM: 40_000 }); // un viaje largo
      const neto = tarjeta.gananciaNeta - efectivo.comision;
      expect(neto).toBeGreaterThan(20_000);

      const r = await api.servicio(CierresService).cerrarConductor(c.usuarioId, hoy());
      expect(r).toMatchObject({
        resultado: 'a_favor',
        saldoFinal: neto,
        decision: 'pagar',
        bloqueado: false,
      });
      expect((await fila(c.usuarioId)).bloqueadoPorDeuda).toBe(false);
      const [p] = await api.bd.db
        .select()
        .from(pagoConductor)
        .where(eq(pagoConductor.conductorId, c.usuarioId));
      expect(p).toMatchObject({ estado: 'pendiente', monto: neto });

      // el banco entrega el dinero: se descuenta del libro y el saldo queda en cero
      const entrega = await api.post('/v1/dev/pagos/entregar', {}, c.accessToken);
      expect(entrega.cuerpo).toEqual({ pagos: 1, total: neto });
      expect((await saldo(c.usuarioId)).saldo).toBe(0);
      expect(
        (
          await api.bd.db
            .select()
            .from(cierreDiario)
            .where(eq(cierreDiario.conductorId, c.usuarioId))
        )[0]?.estado,
      ).toBe('pagado');
      // entregar dos veces no paga dos veces
      expect((await api.post('/v1/dev/pagos/entregar', {}, c.accessToken)).cuerpo).toEqual({
        pagos: 0,
        total: 0,
      });
    });

    it('RN-074: un saldo a favor menor a $20.000 se acumula y no genera pago', async () => {
      const c = await registrar(await enLinea('3004000024'));
      const tarjeta = await api.completarViaje(c, { metodoPago: 'tarjeta', distanciaM: 1500 });
      expect(tarjeta.gananciaNeta).toBeLessThan(20_000);
      const r = await api.servicio(CierresService).cerrarConductor(c.usuarioId, hoy());
      expect(r).toMatchObject({ resultado: 'a_favor', decision: 'acumular' });
      expect(
        await api.bd.db
          .select()
          .from(pagoConductor)
          .where(eq(pagoConductor.conductorId, c.usuarioId)),
      ).toHaveLength(0);
      expect(
        (
          await api.bd.db
            .select()
            .from(cierreDiario)
            .where(eq(cierreDiario.conductorId, c.usuarioId))
        )[0]?.estado,
      ).toBe('abierto');
    });

    it('un cierre no se repite, y el del día siguiente arrastra el saldo', async () => {
      const c = await registrar(await enLinea('3004000025'));
      const v = await api.completarViaje(c, { metodoPago: 'efectivo' });
      const servicio = api.servicio(CierresService);
      expect(await servicio.cerrarConductor(c.usuarioId, hoy())).not.toBeNull();
      expect(await servicio.cerrarConductor(c.usuarioId, hoy())).toBeNull(); // ya estaba cerrado

      const manana = fechaBogota(Date.now() + 86_400_000);
      const sig = await servicio.cerrarConductor(c.usuarioId, manana);
      expect(sig).toMatchObject({
        saldoInicial: -v.comision,
        netoDia: 0,
        saldoFinal: -v.comision,
        resultado: 'a_cargo',
      });
    });

    it('cerrarDia recorre a todos los conductores con movimientos o deuda', async () => {
      const a = await registrar(await enLinea('3004000026'));
      const b = await registrar(await enLinea('3004000027'));
      await api.completarViaje(a, { metodoPago: 'efectivo' });
      const dia = fechaBogota(Date.now() + 5 * 86_400_000); // un día aparte, sin cierres previos
      const r = await api.servicio(CierresService).cerrarDia(dia);
      const ids = r.map((x) => x.conductorId);
      expect(ids).toContain(a.usuarioId); // arrastra deuda
      expect(ids).not.toContain(b.usuarioId); // sin movimientos ni saldo
    });

    it('el simulador permite rehacer el cierre de hoy y el conductor ve sus cierres', async () => {
      const c = await registrar(await enLinea('3004000028'));
      await api.completarViaje(c, { metodoPago: 'efectivo' });
      const primero = await api.post('/v1/dev/cierre', {}, c.accessToken);
      expect(primero.cuerpo.cierre).toMatchObject({ resultado: 'a_cargo' });
      expect((await api.post('/v1/dev/cierre', {}, c.accessToken)).cuerpo.cierre).toBeNull();
      expect(
        (await api.post('/v1/dev/cierre', { rehacer: true }, c.accessToken)).cuerpo.cierre,
      ).toMatchObject({ resultado: 'a_cargo' });
      const lista = (await api.get('/v1/conductor/cierres', c.accessToken)).cuerpo;
      expect(lista.cierres).toHaveLength(1);
      expect(lista.cierres[0]).toMatchObject({
        dia: hoy(),
        resultado: 'a_cargo',
        estado: 'por_cobrar',
      });
    });
  });

  describe('pago de comisión reportado por el conductor', () => {
    it('queda pendiente hasta que finanzas lo concilie; conciliar dos veces no acredita dos veces', async () => {
      const c = await registrar(await enLinea('3004000031'));
      const v = await api.completarViaje(c, { metodoPago: 'efectivo' });
      await api.servicio(CierresService).cerrarConductor(c.usuarioId, hoy());

      const r = await api.post(
        '/v1/conductor/pagos-comision',
        { monto: v.comision >= 1000 ? v.comision : 1000, referencia: 'BREB-7788' },
        c.accessToken,
      );
      expect(r.estado).toBe(201);
      expect((await saldo(c.usuarioId)).pagosEnRevision).toHaveLength(1);
      expect((await fila(c.usuarioId)).bloqueadoPorDeuda).toBe(true); // todavía no está conciliado

      const pagos = api.servicio(PagosService);
      const uno = await pagos.conciliarPagoComision(r.cuerpo.id, null);
      expect(uno).toMatchObject({ yaConciliado: false });
      const dos = await pagos.conciliarPagoComision(r.cuerpo.id, null);
      expect(dos.yaConciliado).toBe(true);
      expect(
        await api.bd.db
          .select()
          .from(movimientoSaldo)
          .where(
            and(
              eq(movimientoSaldo.conductorId, c.usuarioId),
              eq(movimientoSaldo.tipo, 'pago_comision'),
            ),
          ),
      ).toHaveLength(1);
    });

    it('rechaza la misma referencia dos veces y valida montos', async () => {
      const c = await registrar(await enLinea('3004000032'));
      expect(
        (
          await api.post(
            '/v1/conductor/pagos-comision',
            { monto: 5000, referencia: 'BREB-0001' },
            c.accessToken,
          )
        ).estado,
      ).toBe(201);
      const repetida = await api.post(
        '/v1/conductor/pagos-comision',
        { monto: 5000, referencia: 'BREB-0001' },
        c.accessToken,
      );
      expect(repetida.estado).toBe(409);
      expect(repetida.cuerpo).toMatchObject({ codigo: 'REFERENCIA_REPETIDA' });
      expect(
        (
          await api.post(
            '/v1/conductor/pagos-comision',
            { monto: 50, referencia: 'BREB-0002' },
            c.accessToken,
          )
        ).estado,
      ).toBe(400);
      expect(
        (
          await api.post(
            '/v1/conductor/pagos-comision',
            { monto: 5000, referencia: 'x' },
            c.accessToken,
          )
        ).estado,
      ).toBe(400);
    });

    it('pagar más de lo que debe deja saldo a favor; sin deuda el simulador no inventa pagos', async () => {
      const c = await registrar(await enLinea('3004000033'));
      expect((await api.post('/v1/dev/pagos-comision/simular', {}, c.accessToken)).estado).toBe(
        409,
      );
      await api.completarViaje(c, { metodoPago: 'efectivo' });
      const r = await api.post('/v1/dev/pagos-comision/simular', { monto: 20_000 }, c.accessToken);
      expect(r.cuerpo.saldo).toBeGreaterThan(0);
    });
  });

  describe('vencimiento de documentos (RN-112)', () => {
    it('al vencer el SOAT se suspende al conductor, se le desconecta y se avisa; renovado, vuelve a habilitarse', async () => {
      const c = await registrar(await enLinea('3004000041'));
      await api.bd.db.execute(
        sql`update documento set vence_en = (now() at time zone 'America/Bogota')::date - 1 where tipo = 'soat' and vehiculo_id = ${c.vehiculoId}`,
      );

      const r = await api.servicio(VencimientosService).revisar();
      expect(r.documentosVencidos).toBeGreaterThanOrEqual(1);
      expect(r.suspendidos).toContain(c.usuarioId);
      expect(await fila(c.usuarioId)).toMatchObject({
        estadoHabilitacion: 'suspendido',
        estadoOperativo: 'desconectado',
      });
      await c.socket.esperar('conductor:estado', (d: any) => d.motivo === 'documento_vencido');
      const [al] = await api.bd.db
        .select()
        .from(alerta)
        .where(and(eq(alerta.tipo, 'documento_vencido'), eq(alerta.conductorId, c.usuarioId)));
      expect(al?.datos).toMatchObject({ documentos: ['SOAT'] });

      const intento = await api.post('/v1/conductor/conectar', {}, c.accessToken);
      expect(intento.cuerpo.motivos[0]).toMatchObject({ codigo: 'NO_HABILITADO' });

      // renueva: sube el SOAT nuevo y cumplimiento lo aprueba
      await api.bd.db.insert(documento).values({
        titular: 'vehiculo',
        vehiculoId: c.vehiculoId,
        tipo: 'soat',
        archivoClave: 'renovado',
        estado: 'aprobado',
        venceEn: `${new Date().getFullYear() + 2}-01-31`,
        revisadoPor: c.usuarioId,
        revisadoEn: new Date(),
      });
      const despues = await api.servicio(VencimientosService).revisar();
      expect(despues.reactivados).toContain(c.usuarioId);
      expect((await fila(c.usuarioId)).estadoHabilitacion).toBe('habilitado');
    });

    it('un documento por vencer en menos de 30 días no suspende, solo avisa en la app', async () => {
      const c = await registrar(await enLinea('3004000042'));
      await api.bd.db.execute(
        sql`update documento set vence_en = (now() at time zone 'America/Bogota')::date + 10 where tipo = 'soat' and vehiculo_id = ${c.vehiculoId}`,
      );
      expect((await api.servicio(VencimientosService).revisar()).suspendidos).not.toContain(
        c.usuarioId,
      );
      const perfil = (await api.get('/v1/conductor/yo', c.accessToken)).cuerpo;
      expect(perfil.documentos.requisitos.find((x: any) => x.tipo === 'soat')).toMatchObject({
        estado: 'por_vencer',
        diasParaVencer: 10,
      });
      expect(perfil.conexion.puedeConectarse).toBe(true);
    });
  });
});
