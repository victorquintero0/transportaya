// Copia los iconos de @transportaya/ui a public/marca para que el manifiesto de la PWA los pueda servir.
// public/marca está en .gitignore: la fuente de verdad es packages/ui.
import { copyFileSync, mkdirSync } from 'node:fs';

const origen = new URL('../../../packages/ui/src/marca/', import.meta.url);
const destino = new URL('../public/marca/', import.meta.url);
mkdirSync(destino, { recursive: true });
for (const archivo of [
  'icono-192.png',
  'icono-512.png',
  'icono-maskable-512.png',
  'apple-touch-icon.png',
  'favicon-32.png',
  'logo-oscuro.png',
  'logo-claro.png',
  'marca-verde.png',
  'marca-blanca.png',
]) {
  copyFileSync(new URL(archivo, origen), new URL(archivo, destino));
}
