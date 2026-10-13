import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { movimientoPuntos, referido, usuario, viaje } from '../src/index.js';
import {
  CHECK,
  INTEGRIDAD,
  UNICA,
  baseDisponible,
  crearBaseDePrueba,
  violacion,
  type BaseDePrueba,
} from './ayudas.js';
import { crearContexto, crearPasajero, crearViaje } from './fixtures.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('referidos y puntos', () => {
  let base: BaseDePrueba;
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  });
  afterAll(async () => {
    await base.eliminar();
  });

  const invitar = async () => {
    const referidorId = await crearPasajero(base.db);
    const invitadoId = await crearPasajero(base.db);
    const [r] = await base.db
      .insert(referido)
      .values({ referidorId, invitadoId, rolInvitado: 'pasajero', codigo: 'ANA-7K3Q' })
      .returning({ id: referido.id });
    return { referidorId, invitadoId, referidoId: r!.id };
  };

  const punto = (usuarioId: string, tipo: 'ajuste' | 'canje_descuento', puntos: number) =>
    base.db.insert(movimientoPuntos).values({ usuarioId, tipo, puntos, valorPunto: 10 });

  it('una persona solo puede ser invitada una vez y no puede invitarse a sí misma', async () => {
    const { invitadoId } = await invitar();
    const otro = await crearPasajero(base.db);
    const repetida = await violacion(
      base.db
        .insert(referido)
        .values({ referidorId: otro, invitadoId, rolInvitado: 'pasajero', codigo: 'BEA-2222' }),
    );
    expect(repetida.codigo).toBe(UNICA);
    const propia = await violacion(
      base.db.insert(referido).values({
        referidorId: otro,
        invitadoId: otro,
        rolInvitado: 'pasajero',
        codigo: 'BEA-2222',
      }),
    );
    expect(propia.codigo).toBe(CHECK);
  });

  it('un referido pendiente no tiene fecha de resolución y uno resuelto sí', async () => {
    const { referidoId } = await invitar();
    const sinFecha = await violacion(
      base.db.update(referido).set({ estado: 'otorgado' }).where(eq(referido.id, referidoId)),
    );
    expect(sinFecha.codigo).toBe(CHECK);
    await base.db
      .update(referido)
      .set({ estado: 'otorgado', resueltoEn: new Date() })
      .where(eq(referido.id, referidoId));
  });

  it('cada referido paga una sola vez a cada parte', async () => {
    const { referidorId, invitadoId, referidoId } = await invitar();
    const dar = (usuarioId: string, tipo: 'referido_referidor' | 'referido_invitado') =>
      base.db
        .insert(movimientoPuntos)
        .values({ usuarioId, tipo, puntos: 500, valorPunto: 10, referidoId });
    await dar(referidorId, 'referido_referidor');
    await dar(invitadoId, 'referido_invitado');
    expect((await violacion(dar(referidorId, 'referido_referidor'))).codigo).toBe(UNICA);
    expect((await violacion(dar(invitadoId, 'referido_invitado'))).codigo).toBe(UNICA);
  });

  it('los signos del libro tienen sentido: los canjes restan y las recompensas suman', async () => {
    const id = await crearPasajero(base.db);
    expect((await violacion(punto(id, 'canje_descuento', 100))).codigo).toBe(CHECK);
    expect(
      (
        await violacion(
          base.db
            .insert(movimientoPuntos)
            .values({ usuarioId: id, tipo: 'reverso', puntos: -5, valorPunto: 10 }),
        )
      ).codigo,
    ).toBe(CHECK);
    expect((await violacion(punto(id, 'ajuste', 0))).codigo).toBe(CHECK);
    await punto(id, 'ajuste', -50); // un ajuste sí puede restar
  });

  it('el libro de puntos es inmutable', async () => {
    const id = await crearPasajero(base.db);
    await punto(id, 'ajuste', 80);
    const modificar = await violacion(
      base.db.update(movimientoPuntos).set({ puntos: 1 }).where(eq(movimientoPuntos.usuarioId, id)),
    );
    expect(modificar.codigo).toBe(INTEGRIDAD);
    expect(modificar.mensaje).toContain('inmutable');
    const borrar = await violacion(
      base.db.delete(movimientoPuntos).where(eq(movimientoPuntos.usuarioId, id)),
    );
    expect(borrar.mensaje).toContain('inmutable');
  });

  it('un viaje separa y devuelve puntos una sola vez', async () => {
    const ctx = await crearContexto(base.db);
    const v = await crearViaje(base.db, ctx);
    const mov = (tipo: 'canje_descuento' | 'reverso', puntos: number) =>
      base.db
        .insert(movimientoPuntos)
        .values({ usuarioId: ctx.pasajeroId, tipo, puntos, valorPunto: 10, viajeId: v });
    await mov('canje_descuento', -300);
    expect((await violacion(mov('canje_descuento', -100))).codigo).toBe(UNICA);
    await mov('reverso', 100);
    expect((await violacion(mov('reverso', 50))).codigo).toBe(UNICA);
  });

  it('el viaje usa a lo sumo los puntos que separó, y no se mezclan con lo corporativo', async () => {
    const ctx = await crearContexto(base.db);
    const v = await crearViaje(base.db, ctx);
    const mas = await violacion(
      base.db.update(viaje).set({ puntosSeparados: 100, puntosUsados: 150 }).where(eq(viaje.id, v)),
    );
    expect(mas.codigo).toBe(CHECK);
    await base.db
      .update(viaje)
      .set({ puntosSeparados: 100, puntosUsados: 80, descuentoPuntos: 800 })
      .where(eq(viaje.id, v));
  });

  it('el código de referido tiene un formato fijo y no se repite', async () => {
    const a = await crearPasajero(base.db);
    const b = await crearPasajero(base.db);
    expect(
      (
        await violacion(
          base.db.update(usuario).set({ codigoReferido: 'ana-7k3q' }).where(eq(usuario.id, a)),
        )
      ).codigo,
    ).toBe(CHECK);
    await base.db.update(usuario).set({ codigoReferido: 'CAR-9XYZ' }).where(eq(usuario.id, a));
    expect(
      (
        await violacion(
          base.db.update(usuario).set({ codigoReferido: 'CAR-9XYZ' }).where(eq(usuario.id, b)),
        )
      ).codigo,
    ).toBe(UNICA);
  });
});
