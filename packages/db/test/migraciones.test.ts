import { readdirSync, readFileSync } from 'node:fs';
import { ESTADOS_VIAJE, puedeTransitar } from '@transportaya/dominio';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RUTA_MIGRACIONES, migrarBaseDeDatos } from '../src/index.js';
import {
  CHECK,
  baseDisponible,
  crearBaseDePrueba,
  violacion,
  type BaseDePrueba,
} from './ayudas.js';
import { crearConductor, crearContexto, crearViaje } from './fixtures.js';

const hayBase = await baseDisponible();

describe('archivos de migración', () => {
  const archivos = readdirSync(RUTA_MIGRACIONES).filter((f) => f.endsWith('.sql'));
  const contenido = archivos
    .map((f) => readFileSync(`${RUTA_MIGRACIONES}/${f}`, 'utf8'))
    .join('\n');

  it('no dejan tipos geográficos entre comillas (defecto de drizzle-kit)', () => {
    expect(contenido).not.toMatch(/"geography\(/);
  });
  it('la tabla de posiciones queda particionada por día', () => {
    expect(contenido).toMatch(/PARTITION BY RANGE \("registrada_en"\)/);
  });
});

describe.skipIf(!hayBase)('migraciones y funciones', () => {
  let base: BaseDePrueba;
  beforeAll(async () => {
    base = await crearBaseDePrueba();
  });
  afterAll(async () => {
    await base.eliminar();
  });

  it('volver a migrar no hace nada', async () => {
    await expect(migrarBaseDeDatos(base)).resolves.toBeUndefined();
  });

  it('uuid_v7 genera UUID versión 7 que se ordenan por tiempo', async () => {
    const r = await base.db.execute<{ id: string }>(
      sql`select uuid_v7()::text as id from generate_series(1, 5)`,
    );
    const ids = r.rows.map((x) => x.id);
    for (const id of ids) expect(id[14]).toBe('7');
    const marcas = ids.map((id) => id.replaceAll('-', '').slice(0, 12));
    expect([...marcas].sort()).toEqual(marcas);
  });

  it('el código de viaje tiene el formato TY-XXXXXX', async () => {
    const r = await base.db.execute<{ c: string }>(sql`select generar_codigo_viaje() as c`);
    expect(r.rows[0]?.c).toMatch(/^TY-[0-9A-Z]{6}$/);
  });

  it('crea las particiones de los próximos 14 días y la partición por defecto', async () => {
    const r = await base.db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_inherits where inhparent = 'posicion_conductor'::regclass`,
    );
    expect(r.rows[0]?.n).toBe(15);
  });

  describe('la máquina de estados del viaje coincide con la del dominio', () => {
    it('acepta y rechaza exactamente las mismas transiciones (64 combinaciones)', async () => {
      const ctx = await crearContexto(base.db);
      const diferencias: string[] = [];

      for (const desde of ESTADOS_VIAJE) {
        // Una fila con todos los campos llenos cumple las restricciones de cualquier estado.
        const { conductorId, vehiculoId } = await crearConductor(base.db, ctx.ciudadId);
        const id = await base.db.transaction(async (tx) => {
          // Con los disparadores apagados se puede crear la fila directamente en el estado de partida.
          await tx.execute(sql`set local session_replication_role = replica`);
          return crearViaje(tx as unknown as BaseDePrueba['db'], ctx, {
            estado: desde,
            conductorId,
            vehiculoId,
            solicitadoEn: new Date('2026-10-06T10:00:00Z'),
            iniciadoEn: new Date('2026-10-06T10:10:00Z'),
            finalizadoEn: new Date('2026-10-06T10:30:00Z'),
            precioFinal: 15_000,
            totalCarrera: 15_000,
            comision: 450,
            comisionPb: 300,
            canceladoEn: new Date('2026-10-06T10:05:00Z'),
            canceladoPor: 'sistema',
          });
        });

        for (const hacia of ESTADOS_VIAJE) {
          const cliente = await base.pool.connect();
          let permitida = true;
          try {
            await cliente.query('begin');
            await cliente.query('update viaje set estado = $1 where id = $2', [hacia, id]);
          } catch {
            permitida = false;
          } finally {
            await cliente.query('rollback');
            cliente.release();
          }
          const esperada = desde === hacia || puedeTransitar(desde, hacia);
          if (permitida !== esperada) {
            diferencias.push(`${desde} → ${hacia}: base=${permitida}, dominio=${esperada}`);
          }
        }
      }
      expect(diferencias).toEqual([]);
    });

    it('un viaje nuevo solo puede empezar en programado o buscando_conductor', async () => {
      const ctx = await crearContexto(base.db);
      const v = await violacion(crearViaje(base.db, ctx, { estado: 'en_curso' }));
      expect(v.codigo).toBe(CHECK);
      expect(v.mensaje).toContain('empezar');
    });
  });
});
