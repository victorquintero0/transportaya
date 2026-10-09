import { expect, test } from '@playwright/test';

/**
 * La instalación y el modo sin conexión dependen del service worker, que solo existe en la compilación (no en el
 * servidor de desarrollo). Estas pruebas corren sobre `vite preview` con la app ya compilada.
 */
const APPS = [
  {
    nombre: 'pasajero',
    url: 'http://localhost:4191',
    titulo: 'TransporteYa',
    corto: 'TransporteYa',
  },
  {
    nombre: 'conductor',
    url: 'http://localhost:4192',
    titulo: 'TransporteYa Conductor',
    corto: 'TY Conductor',
  },
] as const;

for (const app of APPS) {
  test.describe(`PWA · ${app.nombre}`, () => {
    test('se puede instalar: manifest completo y service worker activo', async ({ page }) => {
      await page.goto(`${app.url}/diagnostico`);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await expect(page.locator('[data-prueba="sw"]')).toHaveAttribute('data-ok', 'true');
      await expect(page.locator('[data-prueba="seguro"]')).toHaveAttribute('data-ok', 'true');

      const href = await page.locator('link[rel="manifest"]').getAttribute('href');
      const manifiesto = await (await page.request.get(new URL(href!, app.url).toString())).json();
      expect(manifiesto).toMatchObject({
        name: app.titulo,
        short_name: app.corto,
        display: 'standalone',
        lang: 'es-CO',
        start_url: '/',
        scope: '/',
      });
      const iconos = manifiesto.icons as { sizes: string; purpose: string }[];
      expect(iconos.some((i) => i.sizes === '192x192')).toBe(true);
      expect(iconos.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
      expect(iconos.some((i) => i.purpose === 'maskable')).toBe(true);
      await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    });

    test('sin internet la app abre desde lo guardado y avisa la conexión', async ({
      page,
      context,
    }) => {
      await page.goto(`${app.url}/diagnostico`);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload(); // desde aquí el service worker controla la página

      await context.setOffline(true);
      await expect(page.locator('#aviso-conexion')).toHaveAttribute('data-conexion', 'perdida');
      await expect(page.locator('#aviso-conexion')).toContainText('Sin conexión');

      // recargar sin internet: la app sale del caché, no del servidor
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Diagnóstico del teléfono' })).toBeVisible();
      await expect(page.locator('#aviso-conexion')).toHaveAttribute('data-conexion', 'perdida');

      await context.setOffline(false);
      await expect(page.locator('#aviso-conexion')).toHaveAttribute('data-conexion', 'recuperada');
      await expect(page.locator('#aviso-conexion')).toHaveCount(0, { timeout: 6_000 });
    });
  });
}
