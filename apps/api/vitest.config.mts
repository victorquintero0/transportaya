import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 120_000,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Cada archivo crea su propia base: se pueden correr en paralelo.
  },
});
