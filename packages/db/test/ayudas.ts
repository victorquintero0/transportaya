import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { crearConexion, migrarBaseDeDatos } from '../src/index.js';

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
    async eliminar() {
      await conexion.cerrar();
      await admin.query(`drop database ${nombre} with (force)`);
      await admin.end();
    },
  };
}

export type BaseDePrueba = Awaited<ReturnType<typeof crearBaseDePrueba>>;

export interface Violacion {
  codigo?: string;
  restriccion?: string;
  mensaje: string;
}

/** Ejecuta algo que debe violar una regla de la base y devuelve el error de PostgreSQL. */
export async function violacion(operacion: PromiseLike<unknown>): Promise<Violacion> {
  try {
    await operacion;
  } catch (error) {
    const causa = ((error as { cause?: unknown }).cause ?? error) as {
      code?: string;
      constraint?: string;
      message: string;
    };
    return {
      ...(causa.code ? { codigo: causa.code } : {}),
      ...(causa.constraint ? { restriccion: causa.constraint } : {}),
      mensaje: causa.message,
    };
  }
  throw new Error('Se esperaba una violación de integridad, pero la operación tuvo éxito');
}

// Códigos de error de PostgreSQL usados en las pruebas.
export const UNICA = '23505';
export const CHECK = '23514';
export const FORANEA = '23503';
export const EXCLUSION = '23P01';
export const INTEGRIDAD = '23000';
