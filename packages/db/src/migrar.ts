import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Conexion } from './conexion.js';

/** Carpeta con las migraciones SQL, junto a `src` y a `dist`. */
export const RUTA_MIGRACIONES = fileURLToPath(new URL('../migraciones', import.meta.url));

/** Aplica las migraciones pendientes. Es idempotente: volver a correrla no hace nada. */
export async function migrarBaseDeDatos(conexion: Pick<Conexion, 'db'>): Promise<void> {
  await migrate(conexion.db, { migrationsFolder: RUTA_MIGRACIONES });
}
