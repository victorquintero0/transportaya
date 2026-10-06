import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as esquema from './schema.js';

export function crearConexion(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool, { schema: esquema });
  return { db, pool, cerrar: () => pool.end() };
}

export type Conexion = ReturnType<typeof crearConexion>;
