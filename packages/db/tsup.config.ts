import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/pruebas.ts', 'src/semillas.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
});
