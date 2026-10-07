import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ciudad,
  cotizacion,
  dinamicaZona,
  lugarGuardado,
  rutaFija,
  tarifa,
  tarifaRecargo,
  zona,
} from '../src/index.js';
import {
  CHECK,
  EXCLUSION,
  baseDisponible,
  crearBaseDePrueba,
  violacion,
  type BaseDePrueba,
} from './ayudas.js';
import { crearCiudad, crearContexto, crearPasajero, crearUsuario, crearViaje } from './fixtures.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('tarifas, rutas y dinámica', () => {
  let base: BaseDePrueba;
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  });
  afterAll(async () => {
    await base.eliminar();
  });

  const nuevaTarifa = (ciudadId: string, version: number, desde: string, hasta?: string) => ({
    ciudadId,
    version,
    base: 3700,
    valorKm: 1784,
    valorMinuto: 223,
    minima: 6300,
    vigenteDesde: new Date(desde),
    ...(hasta ? { vigenteHasta: new Date(hasta) } : {}),
  });

  it('no puede haber dos tarifas vigentes a la vez para la misma ciudad y servicio', async () => {
    const ciudadId = await crearCiudad(base.db);
    await base.db.insert(tarifa).values(nuevaTarifa(ciudadId, 1, '2026-01-01T00:00:00Z'));
    const v = await violacion(
      base.db.insert(tarifa).values(nuevaTarifa(ciudadId, 2, '2026-06-01T00:00:00Z')),
    );
    expect(v.codigo).toBe(EXCLUSION);
    expect(v.restriccion).toBe('tarifa_sin_traslape');
  });

  it('una tarifa nueva puede empezar justo cuando termina la anterior', async () => {
    const ciudadId = await crearCiudad(base.db);
    await base.db
      .insert(tarifa)
      .values(nuevaTarifa(ciudadId, 1, '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z'));
    await expect(
      base.db.insert(tarifa).values(nuevaTarifa(ciudadId, 2, '2026-06-01T00:00:00Z')),
    ).resolves.toBeDefined();
  });

  it('la versión de tarifa es única por ciudad y servicio, y los valores no pueden ser negativos', async () => {
    const ciudadId = await crearCiudad(base.db);
    await base.db
      .insert(tarifa)
      .values(nuevaTarifa(ciudadId, 1, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'));
    const repetida = await violacion(
      base.db.insert(tarifa).values(nuevaTarifa(ciudadId, 1, '2026-03-01T00:00:00Z')),
    );
    expect(repetida.restriccion).toBe('tarifa_version_uq');
    const negativa = await violacion(
      base.db
        .insert(tarifa)
        .values({ ...nuevaTarifa(ciudadId, 3, '2027-01-01T00:00:00Z'), minima: -1 }),
    );
    expect(negativa.restriccion).toBe('tarifa_valores_no_negativos');
  });

  it('un recargo es único por código, y por código y categoría cuando es de una categoría', async () => {
    const ciudadId = await crearCiudad(base.db);
    const [t] = await base.db
      .insert(tarifa)
      .values(nuevaTarifa(ciudadId, 1, '2026-01-01T00:00:00Z'))
      .returning({ id: tarifa.id });
    const fila = { tarifaId: t!.id, codigo: 'nocturno', nombre: 'Nocturno', valor: 1000 };
    await base.db.insert(tarifaRecargo).values(fila);
    expect((await violacion(base.db.insert(tarifaRecargo).values(fila))).restriccion).toBe(
      'tarifa_recargo_general_uq',
    );

    const alta = { ...fila, codigo: 'categoria', categoria: 'alta' as const, valor: 2000 };
    await base.db.insert(tarifaRecargo).values(alta);
    await expect(
      base.db.insert(tarifaRecargo).values({ ...alta, categoria: 'media_alta', valor: 1000 }),
    ).resolves.toBeDefined();
    expect((await violacion(base.db.insert(tarifaRecargo).values(alta))).restriccion).toBe(
      'tarifa_recargo_categoria_uq',
    );
  });

  it('una cotización usa una tarifa urbana o una ruta fija, nunca ambas ni ninguna', async () => {
    const ctx = await crearContexto(base.db);
    const [r] = await base.db
      .insert(rutaFija)
      .values({
        ciudadOrigenId: ctx.ciudadId,
        destino: 'Pereira',
        tarifa: 240_000,
        vigenteDesde: '2026-01-01',
      })
      .returning({ id: rutaFija.id });
    const comun = {
      pasajeroId: ctx.pasajeroId,
      ciudadId: ctx.ciudadId,
      categoria: 'media' as const,
      tipoServicio: 'intermunicipal' as const,
      origen: { lat: 5.07, lng: -75.51 },
      destino: { lat: 4.81, lng: -75.69 },
      precioMin: 240_000,
      precioMax: 240_000,
      expiraEn: new Date(Date.now() + 300_000),
    };
    expect((await violacion(base.db.insert(cotizacion).values(comun))).restriccion).toBe(
      'cotizacion_una_tarifa',
    );
    expect(
      (
        await violacion(
          base.db
            .insert(cotizacion)
            .values({ ...comun, tarifaId: ctx.tarifaId, rutaFijaId: r!.id }),
        )
      ).restriccion,
    ).toBe('cotizacion_una_tarifa');
    await expect(
      base.db.insert(cotizacion).values({ ...comun, rutaFijaId: r!.id }),
    ).resolves.toBeDefined();
  });

  it('una ruta fija no puede tener dos tarifas vigentes a la vez', async () => {
    const ciudadId = await crearCiudad(base.db);
    const ruta = { ciudadOrigenId: ciudadId, destino: 'Armenia', tarifa: 452_400 };
    await base.db.insert(rutaFija).values({ ...ruta, vigenteDesde: '2026-01-01' });
    const v = await violacion(
      base.db.insert(rutaFija).values({ ...ruta, tarifa: 470_000, vigenteDesde: '2026-07-01' }),
    );
    expect(v.restriccion).toBe('ruta_fija_sin_traslape');
    await expect(
      base.db.insert(rutaFija).values({
        ...ruta,
        modalidad: 'ida_y_vuelta',
        tarifa: 700_000,
        vigenteDesde: '2026-01-01',
      }),
    ).resolves.toBeDefined();
  });

  it('la dinámica manual no puede bajar de 1× ni traslaparse en la misma zona', async () => {
    const ciudadId = await crearCiudad(base.db);
    const analista = await crearUsuario(base.db, 'Monitor');
    const [z] = await base.db
      .insert(zona)
      .values({
        ciudadId,
        tipo: 'restringida',
        nombre: 'Centro',
        poligono: {
          type: 'Polygon',
          coordinates: [
            [
              [-75.52, 5.06],
              [-75.5, 5.06],
              [-75.5, 5.08],
              [-75.52, 5.08],
              [-75.52, 5.06],
            ],
          ],
        },
      })
      .returning({ id: zona.id });
    const fila = {
      zonaId: z!.id,
      multiplicador: 1.4,
      motivo: 'Evento',
      creadoPor: analista,
      desde: new Date('2026-10-06T20:00:00Z'),
      hasta: new Date('2026-10-06T23:00:00Z'),
    };
    await base.db.insert(dinamicaZona).values(fila);
    expect(
      (
        await violacion(
          base.db.insert(dinamicaZona).values({
            ...fila,
            desde: new Date('2026-10-06T22:00:00Z'),
            hasta: new Date('2026-10-07T01:00:00Z'),
          }),
        )
      ).restriccion,
    ).toBe('dinamica_zona_sin_traslape');
    expect(
      (
        await violacion(
          base.db.insert(dinamicaZona).values({
            ...fila,
            multiplicador: 0.8,
            desde: new Date('2026-10-08T00:00:00Z'),
            hasta: new Date('2026-10-08T01:00:00Z'),
          }),
        )
      ).restriccion,
    ).toBe('dinamica_zona_multiplicador');
  });
});

describe.skipIf(!hayBase)('geografía y posiciones', () => {
  let base: BaseDePrueba;
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  });
  afterAll(async () => {
    await base.eliminar();
  });

  it('un punto se guarda y se lee como { lat, lng } sin perder precisión', async () => {
    const pasajeroId = await crearPasajero(base.db);
    const original = { lat: 5.070312, lng: -75.513845 };
    const [fila] = await base.db
      .insert(lugarGuardado)
      .values({ pasajeroId, etiqueta: 'Casa', direccion: 'Cra 23 # 45-12', ubicacion: original })
      .returning({ u: lugarGuardado.ubicacion });
    expect(fila?.u.lat).toBeCloseTo(original.lat, 9);
    expect(fila?.u.lng).toBeCloseTo(original.lng, 9);
  });

  it('el área de servicio contiene los puntos de adentro y no los de afuera', async () => {
    const [c] = await base.db
      .insert(ciudad)
      .values({
        nombre: 'Área de prueba',
        departamento: 'Caldas',
        areaServicio: {
          type: 'Polygon',
          coordinates: [
            [
              [-75.56, 5.03],
              [-75.46, 5.03],
              [-75.46, 5.11],
              [-75.56, 5.11],
              [-75.56, 5.03],
            ],
          ],
        },
      })
      .returning({ id: ciudad.id });
    const dentro = await base.db.execute<{ ok: boolean }>(
      sql`select ST_Covers(area_servicio, ST_SetSRID(ST_MakePoint(-75.5138, 5.0703), 4326)::geography) as ok from ciudad where id = ${c!.id}`,
    );
    const fuera = await base.db.execute<{ ok: boolean }>(
      sql`select ST_Covers(area_servicio, ST_SetSRID(ST_MakePoint(-75.69, 4.81), 4326)::geography) as ok from ciudad where id = ${c!.id}`,
    );
    expect(dentro.rows[0]?.ok).toBe(true);
    expect(fuera.rows[0]?.ok).toBe(false);
  });

  it('encuentra los viajes cercanos usando el índice geográfico', async () => {
    const ctx = await crearContexto(base.db);
    await crearViaje(base.db, ctx, { origen: { lat: 5.0703, lng: -75.5138 } }); // Manizales
    await crearViaje(base.db, ctx, { origen: { lat: 4.8133, lng: -75.6961 } }); // Pereira, ~40 km
    const cerca = await base.db.execute<{ n: string }>(
      sql`select count(*) as n from viaje where ST_DWithin(origen, ST_SetSRID(ST_MakePoint(-75.5138, 5.0703), 4326)::geography, 3000)`,
    );
    expect(Number(cerca.rows[0]?.n)).toBe(1);

    await base.db.execute(sql`set enable_seqscan = off`);
    const plan = await base.db.execute<{ 'QUERY PLAN': string }>(
      sql`explain select id from viaje where ST_DWithin(origen, ST_SetSRID(ST_MakePoint(-75.5138, 5.0703), 4326)::geography, 3000)`,
    );
    expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toContain('viaje_origen_gix');
  });

  describe('posiciones del conductor (particionadas por día)', () => {
    const posicion = (conductorId: string, cuando: string) => sql`
      insert into posicion_conductor (conductor_id, registrada_en, ubicacion, estado_operativo)
      values (${conductorId}, ${cuando}::timestamptz, ST_SetSRID(ST_MakePoint(-75.51, 5.07), 4326)::geography, 'disponible')`;
    const tabla = async (conductorId: string, cuando: string) =>
      (
        await base.db.execute<{ t: string }>(
          sql`select tableoid::regclass::text as t from posicion_conductor where conductor_id = ${conductorId} and registrada_en = ${cuando}::timestamptz`,
        )
      ).rows[0]?.t;

    it('cada posición va a la partición de su día en hora de Bogotá', async () => {
      const ctx = await crearContexto(base.db);
      const hoy = (
        await base.db.execute<{ d: string }>(
          sql`select to_char((now() at time zone 'America/Bogota')::date, 'YYYYMMDD') as d`,
        )
      ).rows[0]!.d;
      const cuando = (
        await base.db.execute<{ t: string }>(
          sql`select ((now() at time zone 'America/Bogota')::date + time '23:30') at time zone 'America/Bogota' as t`,
        )
      ).rows[0]!.t;
      await base.db.execute(posicion(ctx.conductorId, cuando));
      expect(await tabla(ctx.conductorId, cuando)).toBe(`posicion_conductor_${hoy}`);
    });

    it('lo que no tiene partición propia cae en la partición por defecto y no se pierde', async () => {
      const ctx = await crearContexto(base.db);
      const cuando = '2031-03-04T12:00:00Z';
      await base.db.execute(posicion(ctx.conductorId, cuando));
      expect(await tabla(ctx.conductorId, cuando)).toBe('posicion_conductor_otras');
    });

    it('crear particiones es idempotente y eliminar borra las anteriores a la fecha', async () => {
      const ctx = await crearContexto(base.db);
      const creadas = (
        await base.db.execute<{ n: number }>(
          sql`select crear_particiones_posicion('2020-01-01', 3) as n`,
        )
      ).rows[0]?.n;
      expect(creadas).toBe(3);
      expect(
        (
          await base.db.execute<{ n: number }>(
            sql`select crear_particiones_posicion('2020-01-01', 3) as n`,
          )
        ).rows[0]?.n,
      ).toBe(0);

      await base.db.execute(posicion(ctx.conductorId, '2020-01-02T10:00:00-05:00'));
      expect(await tabla(ctx.conductorId, '2020-01-02T10:00:00-05:00')).toBe(
        'posicion_conductor_20200102',
      );

      const borradas = (
        await base.db.execute<{ n: number }>(
          sql`select eliminar_particiones_posicion('2020-01-03') as n`,
        )
      ).rows[0]?.n;
      expect(borradas).toBe(2);
      const resto = await base.db.execute<{ n: string }>(
        sql`select count(*) as n from pg_class where relname = 'posicion_conductor_20200103'`,
      );
      expect(Number(resto.rows[0]?.n)).toBe(1);
    });

    it('la posición exige un rumbo válido', async () => {
      const ctx = await crearContexto(base.db);
      const v = await violacion(
        base.db
          .execute(sql`insert into posicion_conductor (conductor_id, registrada_en, ubicacion, estado_operativo, rumbo)
          values (${ctx.conductorId}, now(), ST_SetSRID(ST_MakePoint(-75.51, 5.07), 4326)::geography, 'disponible', 400)`),
      );
      expect(v.codigo).toBe(CHECK);
    });
  });
});
