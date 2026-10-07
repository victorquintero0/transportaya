import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const API = process.env['E2E_API_PUERTO'] ?? '3100';
const WEB = 5182;
const WEB_PASAJERO = 5181;
const WEB_OPERACION = 5183;

// En esta máquina el navegador viene preinstalado; en otras, Playwright usa el suyo.
const chromium = process.env['PLAYWRIGHT_CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'tests',
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    ...devices['Pixel 7'],
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    colorScheme: 'dark',
    launchOptions: existsSync(chromium) ? { executablePath: chromium } : {},
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'conductor',
      testMatch: /conductor\.spec\.ts/,
      use: { baseURL: `http://localhost:${WEB}` },
    },
    {
      name: 'pasajero',
      testMatch: /pasajero\.spec\.ts/,
      use: { baseURL: `http://localhost:${WEB_PASAJERO}` },
    },
    {
      // La App Operación es de escritorio: pantalla grande y sin emulación de celular.
      name: 'operacion',
      testMatch: /operacion\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: `http://localhost:${WEB_OPERACION}`,
        locale: 'es-CO',
        timezoneId: 'America/Bogota',
        colorScheme: 'dark',
        launchOptions: existsSync(chromium) ? { executablePath: chromium } : {},
      },
    },
  ],
  webServer: [
    {
      command: 'node scripts/arrancar-api.mjs',
      url: `http://localhost:${API}/v1/salud`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { E2E_API_PUERTO: API },
    },
    {
      command: `pnpm --filter @transportaya/conductor dev --port ${WEB} --strictPort`,
      url: `http://localhost:${WEB}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API}` },
    },
    {
      command: `pnpm --filter @transportaya/pasajero dev --port ${WEB_PASAJERO} --strictPort`,
      url: `http://localhost:${WEB_PASAJERO}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API}` },
    },
    {
      command: `pnpm --filter @transportaya/operacion dev --port ${WEB_OPERACION} --strictPort`,
      url: `http://localhost:${WEB_OPERACION}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API}` },
    },
  ],
});
