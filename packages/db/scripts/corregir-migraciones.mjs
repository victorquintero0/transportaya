// drizzle-kit escribe los tipos personalizados entre comillas ("geography(Point,4326)"), lo que
// PostgreSQL leería como un nombre de tipo. Este script los deja como tipos válidos.
// Es idempotente: se corre después de cada `drizzle-kit generate` (ver el script `generar`).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = new URL('../migraciones/', import.meta.url).pathname;
let corregidos = 0;

for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith('.sql'))) {
  const ruta = join(carpeta, archivo);
  const original = readFileSync(ruta, 'utf8');
  const corregido = original.replace(/"(geography\((?:Point|Polygon|LineString),4326\))"/g, '$1');
  if (corregido !== original) {
    writeFileSync(ruta, corregido);
    corregidos += 1;
    console.log(`Corregido: ${archivo}`);
  }
}
console.log(corregidos === 0 ? 'Sin cambios' : `${corregidos} archivo(s) corregido(s)`);
