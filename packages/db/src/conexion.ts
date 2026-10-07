import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as esquema from './schema.js';

export function crearConexion(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  let cerrando = false;
  // Una conexión inactiva puede morir (reinicio de la base, red, cierre forzado). Sin este manejador, Node
  // lo convierte en una excepción sin capturar y tumba el proceso. El pool descarta esa conexión y abre otra.
  pool.on('error', (error) => {
    if (!cerrando) console.error(`[db] Se perdió una conexión inactiva: ${error.message}`);
  });
  const db = drizzle(pool, { schema: esquema });
  return {
    db,
    pool,
    cerrar: () => {
      cerrando = true;
      return pool.end();
    },
  };
}

export type Conexion = ReturnType<typeof crearConexion>;
