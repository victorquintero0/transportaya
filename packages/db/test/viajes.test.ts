import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  conductor,
  documento,
  oferta,
  sesionConductor,
  usuario,
  vehiculo,
  viaje,
} from '../src/index.js';
import {
  UNICA,
  baseDisponible,
  crearBaseDePrueba,
  violacion,
  type BaseDePrueba,
} from './ayudas.js';
import {
  crearConductor,
  crearContexto,
  crearUsuario,
  crearViaje,
  type Contexto,
} from './fixtures.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('viajes, ofertas y conductores', () => {
  let base: BaseDePrueba;
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  });
  afterAll(async () => {
    await base.eliminar();
  });

  async function asignar(
    ctx: Contexto,
    viajeId: string,
    estado: 'asignado' | 'en_sitio' | 'en_curso' = 'asignado',
  ) {
    await base.db
      .update(viaje)
      .set({
        estado,
        conductorId: ctx.conductorId,
        vehiculoId: ctx.vehiculoId,
        aceptadoEn: new Date(),
      })
      .where(eq(viaje.id, viajeId));
  }

  describe('viaje', () => {
    it('recorre el ciclo completo y la vista viaje_tiempos mide cada tramo', async () => {
      const ctx = await crearContexto(base.db);
      const t0 = new Date('2026-10-06T15:00:00Z').getTime();
      const en = (segundos: number) => new Date(t0 + segundos * 1000);
      const id = await crearViaje(base.db, ctx, { solicitadoEn: en(0) });

      await base.db
        .update(viaje)
        .set({
          estado: 'asignado',
          conductorId: ctx.conductorId,
          vehiculoId: ctx.vehiculoId,
          aceptadoEn: en(25),
        })
        .where(eq(viaje.id, id));
      await base.db
        .update(viaje)
        .set({ estado: 'en_sitio', enSitioEn: en(385) })
        .where(eq(viaje.id, id));
      await base.db
        .update(viaje)
        .set({ estado: 'en_curso', iniciadoEn: en(505) })
        .where(eq(viaje.id, id));
      await base.db
        .update(viaje)
        .set({
          estado: 'finalizado',
          finalizadoEn: en(1585),
          distanciaRealM: 6000,
          tiempoDetenidoS: 180,
          duracionS: 1080,
          totalCarrera: 16_800,
          precioFinal: 16_800,
          comision: 504,
          comisionPb: 300,
          estadoPago: 'pagado',
        })
        .where(eq(viaje.id, id));

      const r = await base.db.execute<Record<string, number>>(
        sql`select asignacion_s, llegada_s, espera_s, viaje_s, total_servicio_s, tiempo_detenido_s, distancia_real_m from viaje_tiempos where viaje_id = ${id}`,
      );
      expect(r.rows[0]).toEqual({
        asignacion_s: 25,
        llegada_s: 360,
        espera_s: 120,
        viaje_s: 1080,
        total_servicio_s: 1585,
        tiempo_detenido_s: 180,
        distancia_real_m: 6000,
      });
    });

    it('no se puede asignar un viaje sin conductor y vehículo', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      const v = await violacion(
        base.db.update(viaje).set({ estado: 'asignado' }).where(eq(viaje.id, id)),
      );
      expect(v.restriccion).toBe('viaje_conductor_asignado');
    });

    it('no se puede finalizar un viaje sin su precio, su comisión y sus tiempos', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      await asignar(ctx, id, 'asignado');
      await base.db.update(viaje).set({ estado: 'en_sitio' }).where(eq(viaje.id, id));
      await base.db
        .update(viaje)
        .set({ estado: 'en_curso', iniciadoEn: new Date() })
        .where(eq(viaje.id, id));
      const v = await violacion(
        base.db
          .update(viaje)
          .set({ estado: 'finalizado', finalizadoEn: new Date() })
          .where(eq(viaje.id, id)),
      );
      expect(v.restriccion).toBe('viaje_finalizado_completo');
    });

    it('un viaje cancelado exige quién y cuándo canceló', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      const v = await violacion(
        base.db.update(viaje).set({ estado: 'cancelado' }).where(eq(viaje.id, id)),
      );
      expect(v.restriccion).toBe('viaje_cancelado_completo');
    });

    it('los estados finales no se pueden reabrir', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      await base.db
        .update(viaje)
        .set({ estado: 'cancelado', canceladoEn: new Date(), canceladoPor: 'pasajero' })
        .where(eq(viaje.id, id));
      const v = await violacion(
        base.db.update(viaje).set({ estado: 'buscando_conductor' }).where(eq(viaje.id, id)),
      );
      expect(v.mensaje).toContain('no permitida');
    });

    it('la comisión no puede superar el precio y los montos no pueden ser negativos', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      const v = await violacion(
        base.db.update(viaje).set({ precioFinal: 1000, comision: 2000 }).where(eq(viaje.id, id)),
      );
      expect(v.restriccion).toBe('viaje_montos');
      const negativo = await violacion(
        base.db.update(viaje).set({ peajes: -1 }).where(eq(viaje.id, id)),
      );
      expect(negativo.restriccion).toBe('viaje_montos');
    });

    it('el tiempo detenido del taxímetro no puede superar la duración', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      const v = await violacion(
        base.db.update(viaje).set({ tiempoDetenidoS: 500, duracionS: 400 }).where(eq(viaje.id, id)),
      );
      expect(v.restriccion).toBe('viaje_mediciones');
    });

    it('los tiempos deben ir en orden y el PIN tener cuatro dígitos', async () => {
      const ctx = await crearContexto(base.db);
      const fueraDeOrden = await violacion(
        crearViaje(base.db, ctx, {
          solicitadoEn: new Date('2026-10-06T10:00:00Z'),
          aceptadoEn: new Date('2026-10-06T09:00:00Z'),
        }),
      );
      expect(fueraDeOrden.restriccion).toBe('viaje_orden_tiempos');
      const pin = await violacion(crearViaje(base.db, ctx, { pinInicio: '12' }));
      expect(pin.restriccion).toBe('viaje_pin_formato');
    });

    it('un conductor no puede tener dos viajes activos a la vez', async () => {
      const ctx = await crearContexto(base.db);
      const a = await crearViaje(base.db, ctx);
      const b = await crearViaje(base.db, ctx);
      await asignar(ctx, a);
      const v = await violacion(
        base.db
          .update(viaje)
          .set({ estado: 'asignado', conductorId: ctx.conductorId, vehiculoId: ctx.vehiculoId })
          .where(eq(viaje.id, b)),
      );
      expect(v.codigo).toBe(UNICA);
      expect(v.restriccion).toBe('viaje_un_activo_por_conductor_uq');
    });

    it('el código del viaje es único y se genera solo', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      const [fila] = await base.db
        .select({ codigo: viaje.codigo })
        .from(viaje)
        .where(eq(viaje.id, id));
      expect(fila?.codigo).toMatch(/^TY-[0-9A-Z]{6}$/);
      const repetido = await violacion(crearViaje(base.db, ctx, { codigo: fila!.codigo }));
      expect(repetido.restriccion).toBe('viaje_codigo_uq');
    });

    it('actualizado_en se mantiene solo', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      const [antes] = await base.db
        .select({ t: viaje.actualizadoEn })
        .from(viaje)
        .where(eq(viaje.id, id));
      await base.db.update(viaje).set({ notaConductor: 'portería 2' }).where(eq(viaje.id, id));
      const [despues] = await base.db
        .select({ t: viaje.actualizadoEn })
        .from(viaje)
        .where(eq(viaje.id, id));
      expect(despues!.t.getTime()).toBeGreaterThan(antes!.t.getTime());
    });
  });

  describe('ofertas (despacho)', () => {
    const nueva = (
      viajeId: string,
      conductorId: string,
      extra: Partial<typeof oferta.$inferInsert> = {},
    ) => ({
      viajeId,
      conductorId,
      expiraEn: new Date(Date.now() + 15_000),
      ...extra,
    });

    it('un conductor solo puede tener una oferta pendiente', async () => {
      const ctx = await crearContexto(base.db);
      const a = await crearViaje(base.db, ctx);
      const b = await crearViaje(base.db, ctx);
      await base.db.insert(oferta).values(nueva(a, ctx.conductorId));
      const v = await violacion(base.db.insert(oferta).values(nueva(b, ctx.conductorId)));
      expect(v.restriccion).toBe('oferta_una_pendiente_por_conductor_uq');
    });

    it('un viaje solo puede tener una oferta aceptada: la asignación es atómica', async () => {
      const ctx = await crearContexto(base.db);
      const otro = await crearConductor(base.db, ctx.ciudadId);
      const id = await crearViaje(base.db, ctx);
      const respondida = { resultado: 'aceptada' as const, respondidaEn: new Date() };
      await base.db.insert(oferta).values(nueva(id, ctx.conductorId, respondida));
      const v = await violacion(
        base.db.insert(oferta).values(nueva(id, otro.conductorId, { ronda: 2, ...respondida })),
      );
      expect(v.restriccion).toBe('oferta_una_aceptada_por_viaje_uq');
    });

    it('una oferta respondida debe tener fecha de respuesta y una pendiente no', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      const sinFecha = await violacion(
        base.db.insert(oferta).values(nueva(id, ctx.conductorId, { resultado: 'rechazada' })),
      );
      expect(sinFecha.restriccion).toBe('oferta_respuesta');
      const pendienteConFecha = await violacion(
        base.db.insert(oferta).values(nueva(id, ctx.conductorId, { respondidaEn: new Date() })),
      );
      expect(pendienteConFecha.restriccion).toBe('oferta_respuesta');
    });

    it('la oferta debe vencer después de enviarse', async () => {
      const ctx = await crearContexto(base.db);
      const id = await crearViaje(base.db, ctx);
      const v = await violacion(
        base.db
          .insert(oferta)
          .values(nueva(id, ctx.conductorId, { expiraEn: new Date(Date.now() - 1000) })),
      );
      expect(v.restriccion).toBe('oferta_expiracion');
    });
  });

  describe('conductores, vehículos y documentos', () => {
    it('un conductor no puede tener dos sesiones en línea abiertas', async () => {
      const ctx = await crearContexto(base.db);
      await base.db
        .insert(sesionConductor)
        .values({ conductorId: ctx.conductorId, vehiculoId: ctx.vehiculoId });
      const v = await violacion(
        base.db
          .insert(sesionConductor)
          .values({ conductorId: ctx.conductorId, vehiculoId: ctx.vehiculoId }),
      );
      expect(v.restriccion).toBe('sesion_conductor_abierta_uq');
      await base.db
        .update(sesionConductor)
        .set({ fin: new Date() })
        .where(eq(sesionConductor.conductorId, ctx.conductorId));
      await expect(
        base.db
          .insert(sesionConductor)
          .values({ conductorId: ctx.conductorId, vehiculoId: ctx.vehiculoId }),
      ).resolves.toBeDefined();
    });

    it('la placa debe tener formato válido y ser única', async () => {
      const mal = await violacion(
        base.db.insert(vehiculo).values({
          placa: 'abc123',
          marca: 'x',
          linea: 'y',
          modeloAnio: 2020,
          color: 'z',
          categoria: 'media',
        }),
      );
      expect(mal.restriccion).toBe('vehiculo_placa_formato');
      const fila = {
        placa: 'KJH45B',
        marca: 'x',
        linea: 'y',
        modeloAnio: 2020,
        color: 'z',
        categoria: 'media' as const,
      };
      await base.db.insert(vehiculo).values(fila);
      expect((await violacion(base.db.insert(vehiculo).values(fila))).restriccion).toBe(
        'vehiculo_placa_uq',
      );
    });

    it('un documento pertenece a un conductor o a un vehículo, nunca a ambos ni a ninguno', async () => {
      const ctx = await crearContexto(base.db);
      const base_ = { tipo: 'soat' as const, archivoClave: 'k' };
      const ninguno = await violacion(
        base.db.insert(documento).values({ ...base_, titular: 'vehiculo' }),
      );
      expect(ninguno.restriccion).toBe('documento_un_titular');
      const ambos = await violacion(
        base.db.insert(documento).values({
          ...base_,
          titular: 'vehiculo',
          vehiculoId: ctx.vehiculoId,
          conductorId: ctx.conductorId,
        }),
      );
      expect(ambos.restriccion).toBe('documento_un_titular');
      await expect(
        base.db
          .insert(documento)
          .values({ ...base_, titular: 'vehiculo', vehiculoId: ctx.vehiculoId }),
      ).resolves.toBeDefined();
    });

    it('rechazar un documento exige el motivo y aprobarlo, quién lo revisó', async () => {
      const ctx = await crearContexto(base.db);
      const revisor = await crearUsuario(base.db, 'Cumplimiento');
      const doc = {
        titular: 'conductor' as const,
        conductorId: ctx.conductorId,
        tipo: 'licencia_conduccion' as const,
        archivoClave: 'k',
      };
      expect(
        (await violacion(base.db.insert(documento).values({ ...doc, estado: 'rechazado' })))
          .restriccion,
      ).toBe('documento_rechazo_con_motivo');
      expect(
        (await violacion(base.db.insert(documento).values({ ...doc, estado: 'aprobado' })))
          .restriccion,
      ).toBe('documento_aprobado_revisado');
      await expect(
        base.db
          .insert(documento)
          .values({ ...doc, estado: 'aprobado', revisadoPor: revisor, revisadoEn: new Date() }),
      ).resolves.toBeDefined();
    });

    it('un conductor nuevo empieza sin registro completo y desconectado', async () => {
      const ctx = await crearContexto(base.db);
      const [c] = await base.db
        .select()
        .from(conductor)
        .where(eq(conductor.usuarioId, ctx.conductorId));
      expect(c).toMatchObject({
        estadoHabilitacion: 'registro_incompleto',
        estadoOperativo: 'desconectado',
        bloqueadoPorDeuda: false,
        aceptaCategoriaInferior: false,
      });
    });
  });

  it('el usuario anonimizado conserva un teléfono único (no se borra la fila)', async () => {
    const id = await crearUsuario(base.db, 'A borrar');
    await base.db
      .update(usuario)
      .set({ estado: 'anonimizado', nombre: 'Anonimizado', email: null })
      .where(eq(usuario.id, id));
    const [u] = await base.db
      .select({ estado: usuario.estado })
      .from(usuario)
      .where(eq(usuario.id, id));
    expect(u?.estado).toBe('anonimizado');
  });
});
