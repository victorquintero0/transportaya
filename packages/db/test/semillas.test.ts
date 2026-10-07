import {
  TARIFA_TAXI_MANIZALES_2026 as TAXI,
  calcularTarifaUrbana,
  type Recargo,
} from '@transportaya/dominio';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalogoVehiculo, ciudad, rutaFija, tarifa, tarifaRecargo } from '../src/index.js';
import { sembrarManizales } from '../src/semillas.js';
import { baseDisponible, crearBaseDePrueba, violacion, type BaseDePrueba } from './ayudas.js';

const hayBase = await baseDisponible();

describe.skipIf(!hayBase)('carga inicial de Manizales', () => {
  let base: BaseDePrueba;
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  });
  afterAll(async () => {
    await base.eliminar();
  });

  it('es idempotente y carga la tarifa, los recargos, las 193 rutas y el catálogo', async () => {
    const a = await sembrarManizales(base);
    const b = await sembrarManizales(base);
    expect(b).toEqual(a);
    expect(a.rutas).toBe(193);
    expect(a.vehiculos).toBe(65);

    const cuenta = async (tabla: string) =>
      Number(
        (await base.db.execute<{ n: string }>(sql.raw(`select count(*) as n from ${tabla}`)))
          .rows[0]?.n,
      );
    expect(await cuenta('ruta_fija')).toBe(193);
    expect(await cuenta('catalogo_vehiculo')).toBe(65);
    expect(await cuenta('tarifa_recargo')).toBe(9);
  });

  it('Pereira está en $240.000 y Nevado del Ruiz tiene ida y ida y vuelta', async () => {
    await sembrarManizales(base);
    const [pereira] = await base.db
      .select({ t: rutaFija.tarifa })
      .from(rutaFija)
      .where(eq(rutaFija.destino, 'Pereira'));
    expect(pereira?.t).toBe(240_000);
    const nevado = await base.db
      .select({ m: rutaFija.modalidad, t: rutaFija.tarifa })
      .from(rutaFija)
      .where(eq(rutaFija.destino, 'Nevado del Ruiz'));
    expect(nevado.sort((x, y) => x.t - y.t)).toEqual([
      { m: 'solo_ida', t: 466_800 },
      { m: 'ida_y_vuelta', t: 706_800 },
    ]);
  });

  it('el catálogo respeta las tres categorías', async () => {
    await sembrarManizales(base);
    const r = await base.db.execute<{ categoria: string; n: string }>(
      sql`select categoria::text, count(*) as n from catalogo_vehiculo group by categoria order by categoria`,
    );
    expect(r.rows.map((x) => x.categoria)).toEqual(['alta', 'media', 'media_alta']);
  });

  it('la tarifa guardada en la base da el mismo precio que el dominio (ejemplo de RN-010)', async () => {
    await sembrarManizales(base);
    const [t] = await base.db
      .select()
      .from(tarifa)
      .innerJoin(ciudad, eq(ciudad.id, tarifa.ciudadId))
      .where(eq(ciudad.nombre, 'Manizales'));
    const filas = await base.db
      .select()
      .from(tarifaRecargo)
      .where(eq(tarifaRecargo.tarifaId, t!.tarifa.id));
    const recargo = (codigo: string): Recargo => {
      const f = filas.find((x) => x.codigo === codigo)!;
      return { nombre: f.codigo, tipo: 'fijo', valor: f.valor };
    };

    const r = calcularTarifaUrbana({
      parametros: {
        base: t!.tarifa.base,
        valorKm: t!.tarifa.valorKm,
        valorMinuto: t!.tarifa.valorMinuto,
        minima: t!.tarifa.minima,
      },
      distanciaM: 6000,
      tiempoCobrableS: 180,
      recargos: [recargo('nocturno'), recargo('puerta_a_puerta')],
    });
    expect(r.subtotal).toBe(15_073);
    expect(r.totalRedondeado).toBe(16_800);
  });

  it('los recargos por categoría guardados coinciden con los del dominio (D-22)', async () => {
    await sembrarManizales(base);
    const filas = await base.db
      .select({ categoria: tarifaRecargo.categoria, valor: tarifaRecargo.valor })
      .from(tarifaRecargo)
      .where(and(eq(tarifaRecargo.codigo, 'categoria')));
    const guardado = Object.fromEntries(filas.map((f) => [f.categoria, f.valor]));
    expect(guardado).toEqual({
      media_alta: TAXI.recargoCategoria.media_alta,
      alta: TAXI.recargoCategoria.alta,
    });
  });

  it('una categoría de catálogo inválida se rechaza', async () => {
    const v = await violacion(
      base.db
        .insert(catalogoVehiculo)
        .values({ marca: 'X', linea: 'Y', categoria: 'lujo' as never }),
    );
    expect(v.mensaje).toContain('categoria_vehiculo');
  });
});
