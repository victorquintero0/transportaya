import { expect, test } from '@playwright/test';

const APPS = [
  { nombre: 'pasajero', url: 'http://localhost:5181', campo: '[aria-label="Número de celular"]' },
  { nombre: 'conductor', url: 'http://localhost:5182', campo: '[aria-label="Número de celular"]' },
  { nombre: 'operacion', url: 'http://localhost:5183', campo: '#email' },
];

test.describe('Marca animada', () => {
  for (const app of APPS) {
    test(`${app.nombre}: la pantalla de arranque arma el logo, el carro sale y se ve la app`, async ({
      page,
    }) => {
      const errores: string[] = [];
      page.on('pageerror', (e) => errores.push(e.message));
      await page.goto(`${app.url}/?splash`);
      const splash = page.locator('[data-splash]');
      await expect(splash).toBeVisible();
      // el logo se arma: aparece el nombre completo y las piezas del dibujo
      await expect(splash.locator('[data-p="burbuja"]')).toBeVisible();
      // el nombre termina de escribirse: se mira cada cuadro (no cada segundo) para fotografiar el logo recién armado
      await page.waitForFunction(
        () => {
          const l = document.querySelectorAll('[data-splash] [data-l]');
          return Number(getComputedStyle(l[l.length - 1]!).opacity) > 0.98;
        },
        null,
        { polling: 'raf', timeout: 8_000 },
      );
      if (app.nombre === 'pasajero')
        await page.screenshot({ path: 'capturas/marca-01-arranque.png' });
      // y se va sola, dejando ver la app
      await expect(splash).toHaveCount(0, { timeout: 10_000 });
      await expect(page.locator(app.campo)).toBeVisible();
      expect(errores).toEqual([]);
    });
  }

  test('tocar la pantalla de arranque la salta', async ({ page }) => {
    await page.goto('http://localhost:5181/?splash');
    const splash = page.locator('[data-splash]');
    await expect(splash).toBeVisible();
    await page.mouse.click(100, 300);
    await expect(splash).toHaveCount(0, { timeout: 2_000 });
  });

  test('con el navegador automatizado no aparece sola (no frena las demás pruebas)', async ({
    page,
  }) => {
    await page.goto('http://localhost:5181/');
    await expect(page.getByLabel('Número de celular')).toBeVisible();
    await expect(page.locator('[data-splash]')).toHaveCount(0);
  });

  test('la pantalla se ve igual en tema claro y respeta "menos movimiento"', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      colorScheme: 'light',
      reducedMotion: 'reduce',
      viewport: { width: 412, height: 915 },
    });
    const p = await ctx.newPage();
    await p.goto('http://localhost:5181/?splash');
    const splash = p.locator('[data-splash]');
    await expect(splash).toBeVisible();
    // sin animar: el logo ya está armado desde el primer momento
    await expect(splash.locator('[data-l]').last()).toHaveCSS('opacity', '1');
    await expect(splash).toHaveCount(0, { timeout: 5_000 });
    await ctx.close();
  });
});
