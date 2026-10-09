import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { solicitudDatos } from '../src/index.js';
import {
  CHECK,
  baseDisponible,
  crearBaseDePrueba,
  violacion,
  type BaseDePrueba,
} from './ayudas.js';
import { crearContexto } from './fixtures.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('privacidad y retención (Ley 1581, RNF-62, RNF-64)', () => {
  let base: BaseDePrueba;
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  });
  afterAll(async () => {
    await base.eliminar();
  });

  const nueva = (usuarioId: string, extra: Partial<typeof solicitudDatos.$inferInsert> = {}) => ({
    usuarioId,
    rol: 'pasajero',
    tipo: 'rectificacion',
    detalle: 'Mi nombre está mal escrito',
    venceEn: new Date(Date.now() + 15 * 86_400_000),
    ...extra,
  });

  describe('solicitudes sobre los datos personales', () => {
    it('queda en estado «recibida» y sin fecha de resolución', async () => {
      const ctx = await crearContexto(base.db);
      const [s] = await base.db.insert(solicitudDatos).values(nueva(ctx.pasajeroId)).returning();
      expect(s).toMatchObject({ estado: 'recibida', resueltaEn: null, respuesta: null });
    });

    it('no admite tipos, estados ni roles inventados', async () => {
      const ctx = await crearContexto(base.db);
      for (const extra of [{ tipo: 'borrar_todo' }, { estado: 'olvidada' }, { rol: 'interno' }])
        expect(
          await violacion(base.db.insert(solicitudDatos).values(nueva(ctx.pasajeroId, extra))),
        ).toMatchObject({ codigo: CHECK });
    });

    it('una solicitud resuelta debe decir cuándo, y una pendiente no puede tener fecha de resolución', async () => {
      const ctx = await crearContexto(base.db);
      expect(
        await violacion(
          base.db.insert(solicitudDatos).values(nueva(ctx.pasajeroId, { estado: 'aceptada' })),
        ),
      ).toMatchObject({ codigo: CHECK });
      expect(
        await violacion(
          base.db.insert(solicitudDatos).values(nueva(ctx.pasajeroId, { resueltaEn: new Date() })),
        ),
      ).toMatchObject({ codigo: CHECK });
    });

    it('rechazar exige explicarle a la persona por qué', async () => {
      const ctx = await crearContexto(base.db);
      expect(
        await violacion(
          base.db
            .insert(solicitudDatos)
            .values(nueva(ctx.pasajeroId, { estado: 'rechazada', resueltaEn: new Date() })),
        ),
      ).toMatchObject({ codigo: CHECK });
      await base.db.insert(solicitudDatos).values(
        nueva(ctx.pasajeroId, {
          estado: 'rechazada',
          resueltaEn: new Date(),
          respuesta: 'Debes un viaje',
        }),
      );
    });

    it('el detalle no puede estar vacío ni ser un libro', async () => {
      const ctx = await crearContexto(base.db);
      for (const detalle of ['', 'abc', 'x'.repeat(2001)])
        expect(
          await violacion(
            base.db.insert(solicitudDatos).values(nueva(ctx.pasajeroId, { detalle })),
          ),
        ).toMatchObject({ codigo: CHECK });
    });
  });

  describe('particiones de posiciones', () => {
    const posicion = (conductorId: string, cuando: string) => sql`
      insert into posicion_conductor (conductor_id, registrada_en, ubicacion, estado_operativo)
      values (${conductorId}, ${cuando}::timestamptz, ST_SetSRID(ST_MakePoint(-75.51, 5.07), 4326)::geography, 'disponible')`;
    const tabla = async (conductorId: string, cuando: string) =>
      (
        await base.db.execute<{ t: string }>(
          sql`select tableoid::regclass::text as t from posicion_conductor where conductor_id = ${conductorId} and registrada_en = ${cuando}::timestamptz`,
        )
      ).rows[0]?.t;

    it('crear la partición de un día con posiciones ya guardadas en la de por defecto las pasa a la nueva', async () => {
      const ctx = await crearContexto(base.db);
      const antes = '2032-05-06T15:00:00Z';
      const despues = '2032-05-06T16:00:00Z';
      const otroDia = '2032-05-07T15:00:00Z';
      for (const t of [antes, despues, otroDia])
        await base.db.execute(posicion(ctx.conductorId, t));
      expect(await tabla(ctx.conductorId, antes)).toBe('posicion_conductor_otras');

      const r = await base.db.execute<{ n: number }>(
        sql`select crear_particiones_posicion('2032-05-06', 1) as n`,
      );
      expect(r.rows[0]?.n).toBe(1);
      expect(await tabla(ctx.conductorId, antes)).toBe('posicion_conductor_20320506');
      expect(await tabla(ctx.conductorId, despues)).toBe('posicion_conductor_20320506');
      // lo de otro día se queda donde estaba
      expect(await tabla(ctx.conductorId, otroDia)).toBe('posicion_conductor_otras');
      const total = await base.db.execute<{ n: number }>(
        sql`select count(*)::int as n from posicion_conductor where conductor_id = ${ctx.conductorId}`,
      );
      expect(total.rows[0]?.n).toBe(3);
    });
  });
});
