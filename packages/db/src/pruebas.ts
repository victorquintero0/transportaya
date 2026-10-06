// Ayudas para probar contra un PostgreSQL con PostGIS real. Las usan las pruebas de este paquete y las de la API.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { crearConexion, migrarBaseDeDatos } from './index.js';

/** Conexión de administración: con ella se crea una base nueva para cada archivo de pruebas. */
export const URL_ADMIN =
  process.env.TEST_DATABASE_URL ?? 'postgres://transportaya:transportaya@localhost:5432/postgres';

/**
 * ¿Hay un PostgreSQL con PostGIS disponible? En CI (`REQUIRE_DB=1`) su ausencia es un error:
 * las pruebas de integridad no pueden saltarse en silencio.
 */
export async function baseDisponible(): Promise<boolean> {
  const cliente = new pg.Client({ connectionString: URL_ADMIN });
  try {
    await cliente.connect();
    await cliente.end();
    return true;
  } catch (error) {
    if (process.env.REQUIRE_DB) throw error;
    return false;
  }
}

export async function crearBaseDePrueba() {
  const nombre = `ty_test_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`create database ${nombre}`);

  const url = new URL(URL_ADMIN);
  url.pathname = `/${nombre}`;
  const conexion = crearConexion(url.toString());
  await migrarBaseDeDatos(conexion);

  return {
    ...conexion,
    /** URL de la base temporal, para levantar otros procesos (la API) contra ella. */
    url: url.toString(),
    async eliminar() {
      await conexion.cerrar();
      await admin.query(`drop database ${nombre} with (force)`);
      await admin.end();
    },
  };
}

export type BaseDePrueba = Awaited<ReturnType<typeof crearBaseDePrueba>>;
