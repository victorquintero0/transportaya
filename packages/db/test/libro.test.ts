import {
  calcularCierreDiario,
  movimientosDeViaje,
  sumarMovimientos,
  type Movimiento,
} from '@transportaya/dominio';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditoria,
  cierreDiario,
  movimientoSaldo,
  pagoComision,
  usuario,
  viajeEvento,
} from '../src/index.js';
import {
  CHECK,
  INTEGRIDAD,
  UNICA,
  baseDisponible,
  crearBaseDePrueba,
  violacion,
  type BaseDePrueba,
} from './ayudas.js';
import { crearContexto, crearUsuario, crearViaje, type Contexto } from './fixtures.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('libro de movimientos del conductor', () => {
  let base: BaseDePrueba;
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  });
  afterAll(async () => {
    await base.eliminar();
  });

  /** Guarda en el libro los movimientos que el dominio calcula para un viaje. */
  async function contabilizar(ctx: Contexto, viajeId: string, movimientos: Movimiento[]) {
    await base.db.insert(movimientoSaldo).values(
      movimientos.map((m) => ({
        conductorId: ctx.conductorId,
        tipo: m.tipo,
        monto: m.monto,
        viajeId,
      })),
    );
  }

  async function saldoDeLaVista(conductorId: string) {
    const r = await base.db.execute<{ saldo: string; movimientos: number }>(
      sql`select saldo::text, movimientos from saldo_conductor where conductor_id = ${conductorId}`,
    );
    return { saldo: Number(r.rows[0]?.saldo), movimientos: r.rows[0]?.movimientos };
  }

  describe('inmutabilidad', () => {
    it('no se puede modificar, borrar ni vaciar el libro', async () => {
      const ctx = await crearContexto(base.db);
      const v = await crearViaje(base.db, ctx);
      await contabilizar(ctx, v, [{ tipo: 'comision_viaje_efectivo', monto: -600 }]);

      const modificar = await violacion(
        base.db.update(movimientoSaldo).set({ monto: -1 }).where(eq(movimientoSaldo.viajeId, v)),
      );
      expect(modificar.codigo).toBe(INTEGRIDAD);
      expect(modificar.mensaje).toContain('inmutable');

      const borrar = await violacion(
        base.db.delete(movimientoSaldo).where(eq(movimientoSaldo.viajeId, v)),
      );
      expect(borrar.mensaje).toContain('inmutable');

      const vaciar = await violacion(base.db.execute(sql`truncate movimiento_saldo`));
      expect(vaciar.mensaje).toContain('inmutable');
    });

    it('la auditoría y los eventos del viaje también son inmutables', async () => {
      const ctx = await crearContexto(base.db);
      const v = await crearViaje(base.db, ctx);
      const [a] = await base.db
        .insert(auditoria)
        .values({ accion: 'tarifa.publicar', entidad: 'tarifa', motivo: 'prueba' })
        .returning({ id: auditoria.id });
      const [e] = await base.db
        .insert(viajeEvento)
        .values({ viajeId: v, tipo: 'solicitado', actorTipo: 'pasajero' })
        .returning({ id: viajeEvento.id });

      expect(
        (await violacion(base.db.delete(auditoria).where(eq(auditoria.id, a!.id)))).mensaje,
      ).toContain('inmutable');
      expect(
        (
          await violacion(
            base.db.update(viajeEvento).set({ tipo: 'otro' }).where(eq(viajeEvento.id, e!.id)),
          )
        ).mensaje,
      ).toContain('inmutable');
    });

    it('la auditoría exige un nombre de acción con el formato entidad.accion', async () => {
      const v = await violacion(
        base.db.insert(auditoria).values({ accion: 'Mal Formato', entidad: 'x' }),
      );
      expect(v.restriccion).toBe('auditoria_accion');
    });
  });

  describe('signos y origen de cada tipo de movimiento (RN-061)', () => {
    it('el efectivo solo puede debitar y el electrónico solo acreditar', async () => {
      const ctx = await crearContexto(base.db);
      const v1 = await crearViaje(base.db, ctx);
      const v2 = await crearViaje(base.db, ctx);
      const efectivoPositivo = await violacion(
        base.db.insert(movimientoSaldo).values({
          conductorId: ctx.conductorId,
          tipo: 'comision_viaje_efectivo',
          monto: 600,
          viajeId: v1,
        }),
      );
      expect(efectivoPositivo.restriccion).toBe('movimiento_signo_y_origen');
      const electronicoNegativo = await violacion(
        base.db.insert(movimientoSaldo).values({
          conductorId: ctx.conductorId,
          tipo: 'ingreso_viaje_electronico',
          monto: -600,
          viajeId: v2,
        }),
      );
      expect(electronicoNegativo.restriccion).toBe('movimiento_signo_y_origen');
    });

    it('los movimientos de un viaje exigen el viaje y ninguno puede ser cero', async () => {
      const ctx = await crearContexto(base.db);
      const sinViaje = await violacion(
        base.db
          .insert(movimientoSaldo)
          .values({ conductorId: ctx.conductorId, tipo: 'propina', monto: 2000 }),
      );
      expect(sinViaje.restriccion).toBe('movimiento_signo_y_origen');
      const cero = await violacion(
        base.db
          .insert(movimientoSaldo)
          .values({ conductorId: ctx.conductorId, tipo: 'ajuste', monto: 0, motivo: 'x' }),
      );
      expect(cero.codigo).toBe(CHECK);
    });

    it('un viaje no se puede contabilizar dos veces', async () => {
      const ctx = await crearContexto(base.db);
      const v = await crearViaje(base.db, ctx);
      const fila = {
        conductorId: ctx.conductorId,
        tipo: 'comision_viaje_efectivo' as const,
        monto: -600,
        viajeId: v,
      };
      await base.db.insert(movimientoSaldo).values(fila);
      const duplicado = await violacion(base.db.insert(movimientoSaldo).values(fila));
      expect(duplicado.codigo).toBe(UNICA);
      expect(duplicado.restriccion).toBe('movimiento_viaje_tipo_uq');
    });

    it('un ajuste exige motivo y doble aprobación: quien lo crea no puede aprobarlo', async () => {
      const ctx = await crearContexto(base.db);
      const analista = await crearUsuario(base.db, 'Analista');
      const supervisor = await crearUsuario(base.db, 'Supervisor');
      const ajuste = { conductorId: ctx.conductorId, tipo: 'ajuste' as const, monto: 5000 };

      const sinMotivo = await violacion(
        base.db
          .insert(movimientoSaldo)
          .values({ ...ajuste, creadoPor: analista, aprobadoPor: supervisor }),
      );
      expect(sinMotivo.restriccion).toBe('movimiento_signo_y_origen');
      const mismaPersona = await violacion(
        base.db
          .insert(movimientoSaldo)
          .values({ ...ajuste, motivo: 'corrección', creadoPor: analista, aprobadoPor: analista }),
      );
      expect(mismaPersona.restriccion).toBe('movimiento_signo_y_origen');
      await expect(
        base.db.insert(movimientoSaldo).values({
          ...ajuste,
          motivo: 'corrección',
          creadoPor: analista,
          aprobadoPor: supervisor,
        }),
      ).resolves.toBeDefined();
    });

    it('el día del movimiento es el día calendario de Bogotá, no el de UTC', async () => {
      const ctx = await crearContexto(base.db);
      const v = await crearViaje(base.db, ctx);
      // 2026-10-06 03:00 UTC = 2026-10-05 22:00 en Bogotá
      await base.db.insert(movimientoSaldo).values({
        conductorId: ctx.conductorId,
        tipo: 'propina',
        monto: 1000,
        viajeId: v,
        creadoEn: new Date('2026-10-06T03:00:00Z'),
      });
      const [fila] = await base.db
        .select({ dia: movimientoSaldo.dia })
        .from(movimientoSaldo)
        .where(eq(movimientoSaldo.viajeId, v));
      expect(fila?.dia).toBe('2026-10-05');
    });
  });

  describe('saldo y cierre diario coinciden con el dominio', () => {
    it('la vista saldo_conductor suma lo mismo que calcula el dominio', async () => {
      const ctx = await crearContexto(base.db);
      const [v1, v2, v3] = [
        await crearViaje(base.db, ctx),
        await crearViaje(base.db, ctx),
        await crearViaje(base.db, ctx),
      ] as [string, string, string];

      const m1 = movimientosDeViaje({
        metodo: 'efectivo',
        base: { totalRedondeado: 20_000 },
        ambito: 'urbano',
      });
      const m2 = movimientosDeViaje({
        metodo: 'electronico',
        base: { totalRedondeado: 25_000 },
        ambito: 'urbano',
        peajes: 9400,
        propina: 2000,
      });
      const m3 = movimientosDeViaje({
        metodo: 'efectivo',
        base: { totalRedondeado: 240_000 },
        ambito: 'nacional',
      });
      await contabilizar(ctx, v1, m1);
      await contabilizar(ctx, v2, m2);
      await contabilizar(ctx, v3, m3);

      const todos = [...m1, ...m2, ...m3];
      const vista = await saldoDeLaVista(ctx.conductorId);
      expect(vista.saldo).toBe(sumarMovimientos(todos));
      expect(vista.saldo).toBe(-600 + (25_000 - 750 + 9400 + 2000) - 12_000);
      expect(vista.movimientos).toBe(todos.length);
    });

    it('un conductor sin movimientos tiene saldo cero', async () => {
      const ctx = await crearContexto(base.db);
      expect(await saldoDeLaVista(ctx.conductorId)).toEqual({ saldo: 0, movimientos: 0 });
    });

    it('el cierre con deuda se cobra por Bre-B y al conciliar el saldo queda en cero', async () => {
      const ctx = await crearContexto(base.db);
      const v1 = await crearViaje(base.db, ctx);
      const v2 = await crearViaje(base.db, ctx);
      const movs = [
        ...movimientosDeViaje({
          metodo: 'efectivo',
          base: { totalRedondeado: 20_000 },
          ambito: 'urbano',
        }),
        ...movimientosDeViaje({
          metodo: 'efectivo',
          base: { totalRedondeado: 240_000 },
          ambito: 'nacional',
        }),
      ];
      await contabilizar(ctx, v1, [movs[0]!]);
      await contabilizar(ctx, v2, [movs[1]!]);

      const cierre = calcularCierreDiario(movs);
      expect(cierre).toMatchObject({ resultado: 'a_cargo', deuda: 12_600, bloqueado: true });
      await base.db.insert(cierreDiario).values({
        conductorId: ctx.conductorId,
        dia: '2026-10-06',
        saldoInicial: 0,
        netoDia: cierre.neto,
        saldoFinal: cierre.neto,
        resultado: cierre.resultado,
        estado: 'por_cobrar',
      });

      // El conductor paga por Bre-B; al conciliar se registra el movimiento y el saldo vuelve a cero.
      const [pago] = await base.db
        .insert(pagoComision)
        .values({ conductorId: ctx.conductorId, monto: cierre.deuda, referencia: 'BREB-1' })
        .returning({ id: pagoComision.id });
      await base.db
        .update(pagoComision)
        .set({ estado: 'conciliado', conciliadoEn: new Date() })
        .where(eq(pagoComision.id, pago!.id));
      await base.db.insert(movimientoSaldo).values({
        conductorId: ctx.conductorId,
        tipo: 'pago_comision',
        monto: cierre.deuda,
        pagoComisionId: pago!.id,
      });

      expect((await saldoDeLaVista(ctx.conductorId)).saldo).toBe(0);
    });

    it('el cierre diario debe cuadrar y ser coherente con su resultado', async () => {
      const ctx = await crearContexto(base.db);
      const descuadra = await violacion(
        base.db.insert(cierreDiario).values({
          conductorId: ctx.conductorId,
          dia: '2026-10-07',
          saldoInicial: 0,
          netoDia: 1000,
          saldoFinal: 900,
          resultado: 'a_favor',
        }),
      );
      expect(descuadra.restriccion).toBe('cierre_diario_cuadra');
      const incoherente = await violacion(
        base.db.insert(cierreDiario).values({
          conductorId: ctx.conductorId,
          dia: '2026-10-07',
          saldoInicial: 0,
          netoDia: -500,
          saldoFinal: -500,
          resultado: 'a_favor',
        }),
      );
      expect(incoherente.restriccion).toBe('cierre_diario_resultado');
    });

    it('hay un solo cierre por conductor y día', async () => {
      const ctx = await crearContexto(base.db);
      const fila = {
        conductorId: ctx.conductorId,
        dia: '2026-10-08',
        saldoInicial: 0,
        netoDia: 0,
        saldoFinal: 0,
        resultado: 'en_cero' as const,
      };
      await base.db.insert(cierreDiario).values(fila);
      expect((await violacion(base.db.insert(cierreDiario).values(fila))).restriccion).toBe(
        'cierre_diario_conductor_dia_uq',
      );
    });

    it('un pago de comisión no se concilia dos veces con la misma referencia', async () => {
      const ctx = await crearContexto(base.db);
      const fila = { conductorId: ctx.conductorId, monto: 5000, referencia: 'BREB-DUP' };
      await base.db.insert(pagoComision).values(fila);
      expect((await violacion(base.db.insert(pagoComision).values(fila))).restriccion).toBe(
        'pago_comision_referencia_uq',
      );
    });
  });

  it('el teléfono de un usuario debe estar en formato E.164 y ser único', async () => {
    const malFormato = await violacion(
      base.db.insert(usuario).values({ telefono: '3001234567', nombre: 'x' }),
    );
    expect(malFormato.restriccion).toBe('usuario_telefono_e164');
    await base.db.insert(usuario).values({ telefono: '+573009999999', nombre: 'a' });
    const repetido = await violacion(
      base.db.insert(usuario).values({ telefono: '+573009999999', nombre: 'b' }),
    );
    expect(repetido.restriccion).toBe('usuario_telefono_uq');
  });
});
