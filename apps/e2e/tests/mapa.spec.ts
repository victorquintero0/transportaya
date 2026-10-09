import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { llamar } from './ayudas-api.js';

const OPERACION = 'http://localhost:5183';
const PASAJERO = 'http://localhost:5181';
const UBICACION = { latitude: 5.0548, longitude: -75.4945 };

/** Un estilo de MapLibre mínimo (solo un fondo): así la prueba no depende de internet ni de los mosaicos de nadie. */
const ESTILO_FALSO = {
  version: 8,
  name: 'prueba',
  sources: {},
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#dfe8d8' } }],
};

/**
 * `toBeVisible` no basta: el lienzo puede tener tamaño y estar recortado por un contenedor de alto 0 (pasó cuando la hoja
 * de MapLibre pisó `absolute` de Tailwind). Se comprueba que el contenedor del mapa ocupe todo su sitio.
 */
async function expectMapaConTamano(mapa: Locator) {
  const caja = await mapa.boundingBox();
  const real = await mapa.locator('[data-mapa-real]').boundingBox();
  expect(real?.height ?? 0).toBeGreaterThan(200);
  expect(real?.height ?? 0).toBeCloseTo(caja?.height ?? 0, -1);
  expect(real?.width ?? 0).toBeCloseTo(caja?.width ?? 0, -1);
}

async function conEstiloFalso(context: BrowserContext) {
  await context.route('https://tiles.openfreemap.org/**', (r) =>
    r.fulfill({ json: ESTILO_FALSO, headers: { 'access-control-allow-origin': '*' } }),
  );
}
async function sinInternet(context: BrowserContext) {
  await context.route('https://tiles.openfreemap.org/**', (r) => r.abort());
}

async function nuevoContexto(browser: Browser, base: string) {
  const context = await browser.newContext({
    viewport: base === OPERACION ? { width: 1440, height: 900 } : { width: 412, height: 915 },
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    colorScheme: 'dark',
    baseURL: base,
    geolocation: UBICACION,
    permissions: ['geolocation'],
  });
  return context;
}

async function entrarPasajero(page: Page) {
  const celular = `3${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  await page.goto('/');
  await page.getByLabel('Número de celular').fill(celular);
  await page.getByRole('button', { name: 'Recibir mi código' }).click();
  await page.getByRole('button', { name: /Toca para usar el código/ }).click();
  await page.getByPlaceholder('Valentina Ríos').fill('Valentina Ríos Mejía');
  await page.getByRole('button', { name: 'Seguir' }).click();
  await page.locator('#acepto-terminos').click();
  await page.locator('#aceptar-terminos').click();
  await expect(page.locator('#origen-actual')).toBeVisible();
}

async function entrarAdmin(page: Page) {
  await page.goto('/');
  await page.locator('[data-rol="admin"]').click();
  // Un código de segundo factor no sirve dos veces: si otro test acaba de entrar como administrador, se espera a la ventana siguiente.
  const entro = await page
    .locator('#operador-nombre')
    .waitFor({ timeout: 6_000 })
    .then(() => true)
    .catch(() => false);
  if (!entro) {
    await page.waitForTimeout(31_000);
    await page.locator('[data-rol="admin"]').click();
  }
  await expect(page.locator('#operador-nombre')).toBeVisible();
}

test('mapa: se ve el mapa de calles, cae al esquemático sin internet y el administrador cambia de proveedor sin tocar código', async ({
  browser,
}) => {
  test.setTimeout(4 * 60_000);

  await test.step('por defecto el servidor indica OpenFreeMap', async () => {
    const c = await llamar<{ proveedor: string; estilo: string }>('GET', '/v1/mapa/config');
    expect(c.proveedor).toBe('openfreemap');
    expect(c.estilo).toBe('https://tiles.openfreemap.org/styles/positron');
  });

  const ctxOp = await nuevoContexto(browser, OPERACION);
  await conEstiloFalso(ctxOp);
  const op = await ctxOp.newPage();
  op.on('pageerror', (e) => console.log('ERROR EN LA PÁGINA (operación):', e.message));

  await test.step('la torre de control muestra el mapa de calles (MapLibre)', async () => {
    await entrarAdmin(op);
    await op.getByRole('link', { name: 'Torre de control' }).click();
    const mapa = op.getByRole('img', { name: 'Mapa de la operación' });
    await expect(mapa).toHaveAttribute('data-mapa', 'real', { timeout: 30_000 });
    await expect(mapa.locator('canvas.maplibregl-canvas')).toBeVisible();
    await expectMapaConTamano(mapa);
    await op.waitForTimeout(500);
    await op.screenshot({ path: 'capturas/mapa-01-torre-real.png' });
  });

  await test.step('la app del pasajero muestra el mapa de calles', async () => {
    const ctx = await nuevoContexto(browser, PASAJERO);
    await conEstiloFalso(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('ERROR EN LA PÁGINA (pasajero):', e.message));
    await entrarPasajero(p);
    const mapa = p.getByRole('img', { name: 'Mapa del viaje' });
    await expect(mapa).toHaveAttribute('data-mapa', 'real', { timeout: 30_000 });
    await expect(mapa.locator('canvas.maplibregl-canvas')).toBeVisible();
    await expectMapaConTamano(mapa);
    await p.waitForTimeout(500);
    await p.screenshot({ path: 'capturas/mapa-02-pasajero-real.png' });
    await ctx.close();
  });

  await test.step('sin internet (el proveedor no responde) la app sigue con el mapa esquemático', async () => {
    const ctx = await nuevoContexto(browser, PASAJERO);
    await sinInternet(ctx);
    const p = await ctx.newPage();
    await entrarPasajero(p);
    const mapa = p.getByRole('img', { name: 'Mapa del viaje' });
    await expect(mapa).toBeVisible();
    await expect(mapa).toHaveAttribute('data-mapa', 'esquematico');
    await expect(mapa.locator('canvas')).toHaveCount(0);
    await p.waitForTimeout(500);
    await p.screenshot({ path: 'capturas/mapa-03-pasajero-respaldo.png' });
    await ctx.close();
  });

  await test.step('el administrador cambia a «mapa esquemático» desde Configuración', async () => {
    await op.getByRole('link', { name: 'Configuración' }).click();
    const panel = op.locator('#panel-mapa');
    await expect(panel).toContainText('OpenFreeMap');
    await panel.getByRole('radio', { name: /Mapa esquemático/ }).check();
    await panel.locator('#guardar-mapa').click();
    await op.getByRole('dialog').locator('textarea').fill('Prueba del respaldo sin internet');
    await op.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(op.getByText('Mapa actualizado')).toBeVisible();
    await op.screenshot({ path: 'capturas/mapa-04-configuracion.png' });

    const c = await llamar<{ proveedor: string; estilo: string | null }>('GET', '/v1/mapa/config');
    expect(c).toMatchObject({ proveedor: 'esquematico', estilo: null });

    // al volver a abrir la torre ya se ve el esquemático
    await op.reload();
    await op.getByRole('link', { name: 'Torre de control' }).click();
    await expect(op.getByRole('img', { name: 'Mapa de la operación' })).toHaveAttribute(
      'data-mapa',
      'esquematico',
    );
  });

  await test.step('y lo vuelve a poner en OpenFreeMap', async () => {
    await op.getByRole('link', { name: 'Configuración' }).click();
    const panel = op.locator('#panel-mapa');
    await panel.getByRole('radio', { name: /OpenFreeMap/ }).check();
    await panel.locator('#guardar-mapa').click();
    await op.getByRole('dialog').locator('textarea').fill('Se restablece el mapa de calles');
    await op.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(op.getByText('Mapa actualizado')).toBeVisible();
    const c = await llamar<{ proveedor: string }>('GET', '/v1/mapa/config');
    expect(c.proveedor).toBe('openfreemap');
  });

  await ctxOp.close();
});
