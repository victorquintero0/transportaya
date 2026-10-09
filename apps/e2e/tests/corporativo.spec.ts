import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const OPERACION = 'http://localhost:5183';
const PASAJERO = 'http://localhost:5181';
const UBICACION = { latitude: 5.0548, longitude: -75.4945 };

let capturas = 0;
async function captura(page: Page, nombre: string) {
  capturas += 1;
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `capturas/corporativo-${String(capturas).padStart(2, '0')}-${nombre}.png`,
  });
}

async function contexto(browser: Browser, base: string): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: base === OPERACION ? { width: 1440, height: 900 } : { width: 412, height: 915 },
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    colorScheme: 'dark',
    baseURL: base,
    geolocation: UBICACION,
    permissions: ['geolocation'],
  });
  // El mapa de calles sale a internet: aquí se corta para usar siempre el esquemático.
  await context.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  return context;
}

/** Entra a la App Operación con la cuenta de demostración de un rol. Un código de segundo factor no sirve dos veces. */
async function ingresarComo(browser: Browser, rol: string) {
  const context = await contexto(browser, OPERACION);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`ERROR EN LA PÁGINA (${rol}):`, e.message));
  await page.goto('/');
  await page.locator(`[data-rol="${rol}"]`).click();
  const entro = await page
    .locator('#operador-nombre')
    .waitFor({ timeout: 6_000 })
    .then(() => true)
    .catch(() => false);
  if (!entro) {
    await page.waitForTimeout(31_000);
    await page.locator(`[data-rol="${rol}"]`).click();
  }
  await expect(page.locator('#operador-nombre')).toBeVisible();
  return { context, page };
}

const celular = () => `3${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

test('corporativo: finanzas crea la empresa, su administrador invita a un empleado, la política bloquea el viaje y luego lo deja reservar a cargo de la empresa', async ({
  browser,
}) => {
  test.setTimeout(6 * 60_000);
  const telefono = celular();
  const nombreEmpresa = `Seguros del Café ${telefono.slice(-4)} S.A.S.`;
  const nit = `9${telefono.slice(1, 9)}-1`;

  // ───────────────────────────────────────── finanzas crea la empresa
  const fin = await ingresarComo(browser, 'financiero');
  await test.step('finanzas crea una empresa cliente y a su administrador', async () => {
    const p = fin.page;
    await p.getByRole('link', { name: 'Empresas' }).click();
    await expect(p.locator('#kpis-empresas')).toBeVisible();
    await p.locator('#nueva-empresa').click();
    await p.locator('#empresa-nombre').fill(nombreEmpresa);
    await p.locator('#empresa-nit').fill(nit);
    await p.locator('#empresa-contacto').fill('Laura Restrepo');
    await p.locator('#empresa-descuento').fill('5');
    await p.locator('#empresa-cupo').fill('1000000');
    await p.getByRole('dialog').getByRole('button', { name: 'Crear' }).click();
    await expect(p.getByText('Empresa creada')).toBeVisible();
    await captura(p, 'empresas');

    await p.locator('#tabla-empresas tr', { hasText: nombreEmpresa }).click();
    await expect(p.locator('#resumen-empresa')).toContainText('5 %');
    await expect(p.locator('#resumen-empresa')).toContainText('Sin facturar');
    await captura(p, 'empresa-resumen');

    await p.getByRole('tab', { name: 'Administradores' }).click();
    await p.locator('#nuevo-administrador').click();
    await p.locator('#admin-nombre').fill('Laura Restrepo');
    await p.locator('#admin-email').fill(`laura.${telefono.slice(-6)}@seguros.test`);
    await p.locator('#admin-telefono').fill(celular());
    await p.getByRole('dialog').getByRole('button', { name: 'Crear' }).click();
    await expect(p.locator('#contrasena-temporal')).toBeVisible(); // se muestra una sola vez
    await p.getByRole('button', { name: 'Listo' }).click();
    await expect(p.getByText('laura.')).toBeVisible();
  });

  // ───────────────────────────────────────── el administrador de la empresa de demostración
  const adm = await ingresarComo(browser, 'empresa');
  await test.step('el administrador corporativo solo ve su portal', async () => {
    const p = adm.page;
    await expect(p.getByRole('heading', { name: /Constructora Andina/ })).toBeVisible();
    await expect(p.getByRole('link', { name: 'Mi empresa' })).toBeVisible();
    for (const prohibido of ['Torre de control', 'Viajes', 'Finanzas', 'Usuarios', 'Empresas'])
      await expect(p.getByRole('link', { name: prohibido, exact: true })).toHaveCount(0);
    await p.goto('/empresas'); // aunque conozca la dirección, no hay permiso: vuelve a su portal
    await expect(p.getByRole('heading', { name: /Constructora Andina/ })).toBeVisible();
    await captura(p, 'portal');
  });

  await test.step('crea un centro de costo y una política con tope bajo y motivo obligatorio', async () => {
    const p = adm.page;
    await p.getByRole('tab', { name: 'Centros de costo' }).click();
    await p.locator('#nuevo-centro').click();
    await p.locator('#centro-codigo').fill('VENTAS');
    await p.locator('#centro-nombre').fill('Área de ventas');
    await p.getByRole('dialog').getByRole('button', { name: 'Crear' }).click();
    await expect(p.locator('#tabla-centros')).toContainText('VENTAS');

    await p.getByRole('tab', { name: 'Políticas' }).click();
    await p.locator('#nueva-politica').click();
    await p.locator('#politica-nombre').fill('Oficina');
    await p.locator('#politica-monto').fill('5000');
    await p.locator('#politica-motivo').check();
    await p.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(p.locator('#tabla-politicas')).toContainText('hasta $ 5.000');
    await expect(p.locator('#tabla-politicas')).toContainText('pide motivo');
    await captura(p, 'politicas');
  });

  await test.step('invita a un empleado por su celular', async () => {
    const p = adm.page;
    await p.getByRole('tab', { name: 'Empleados' }).click();
    await p.locator('#invitar-empleado').click();
    await p.locator('#invitar-nombre').fill('Valentina Ríos Mejía');
    await p.locator('#invitar-telefono').fill(telefono);
    await p
      .getByRole('dialog')
      .getByLabel('Centro de costo')
      .selectOption({ label: 'VENTAS · Área de ventas' });
    await p.getByRole('dialog').getByLabel('Política').selectOption({ label: 'Oficina' });
    await p.getByRole('dialog').getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(p.locator('#tabla-empleados')).toContainText('Valentina Ríos Mejía');
    await expect(p.locator('#tabla-empleados')).toContainText('Invitado');
  });

  // ───────────────────────────────────────── el empleado
  const ctxPasajero = await contexto(browser, PASAJERO);
  const e = await ctxPasajero.newPage();
  e.on('pageerror', (err) => console.log('ERROR EN LA PÁGINA (pasajero):', err.message));

  await test.step('el empleado entra con ese celular y acepta la invitación', async () => {
    await e.goto('/');
    await e.getByLabel('Número de celular').fill(telefono);
    await e.getByRole('button', { name: 'Recibir mi código' }).click();
    await e.getByRole('button', { name: /Toca para usar el código/ }).click();
    await e.getByPlaceholder('Valentina Ríos').fill('Valentina Ríos Mejía');
    await e.getByRole('button', { name: 'Seguir' }).click();
    await e.locator('#acepto-terminos').click();
    await e.locator('#aceptar-terminos').click();
    await expect(e.locator('#origen-actual')).toBeVisible();
    await e.getByRole('link', { name: 'Cuenta' }).click();
    await expect(e.locator('[data-invitacion]')).toContainText('Constructora Andina');
    await captura(e, 'invitacion');
    await e.locator('#aceptar-invitacion').click();
    await expect(e.locator('#nombre-empresa')).toContainText('Constructora Andina');
    await captura(e, 'mi-empresa');
    await e.getByRole('link', { name: 'Inicio' }).click();
  });

  async function cotizarAlHospital() {
    await e.locator('#a-donde-vas').click();
    await e.locator('#campo-busqueda').fill('hospital');
    await e.locator('[data-resultado="hospital-de-caldas"]').click();
    await expect(e.locator('[data-categoria="media"]')).toBeVisible();
  }

  await test.step('la política bloquea el viaje antes de confirmar y dice por qué', async () => {
    await cotizarAlHospital();
    await e.locator('#elegir-pago').click();
    await e.getByRole('button', { name: /Empresa · Constructora Andina/ }).click();
    await expect(e.locator('#bloqueo-empresa')).toContainText(/permite hasta \$ 5\.000/);
    await expect(e.locator('#pedir-viaje')).toBeDisabled();
    await captura(e, 'bloqueo-politica');
    // puede viajar por su cuenta
    await e.locator('#pagar-como-persona').click();
    await expect(e.locator('#bloqueo-empresa')).toHaveCount(0);
    await expect(e.locator('#elegir-pago')).toContainText('Efectivo');
    await expect(e.locator('#pedir-viaje')).toBeEnabled();
  });

  await test.step('la empresa sube el tope de la política', async () => {
    const p = adm.page;
    await p.getByRole('tab', { name: 'Políticas' }).click();
    await p.locator('[id="editar-politica-Oficina"]').click();
    await p.locator('#politica-monto').fill('80000');
    await p.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(p.locator('#tabla-politicas')).toContainText('hasta $ 80.000');
  });

  await test.step('con el tope nuevo, reserva a cargo de la empresa con centro de costo y motivo', async () => {
    await e.reload(); // la cotización anterior se guardó con el tope viejo
    await expect(e.locator('#origen-actual')).toBeVisible();
    await cotizarAlHospital();
    await e.locator('#elegir-cuando').click();
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(Date.now() + 3 * 3_600_000));
    const v = (t: string) => f.find((x) => x.type === t)!.value;
    await e
      .locator('#reserva-fecha')
      .fill(`${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`);
    await e.locator('#reserva-confirmar-hora').click();
    await e.locator('#elegir-pago').click();
    await e.getByRole('button', { name: /Empresa · Constructora Andina/ }).click();
    await expect(e.locator('#bloqueo-empresa')).toHaveCount(0);
    // la política pide motivo: sin él no se puede confirmar
    await expect(e.locator('#pedir-viaje')).toBeDisabled();
    await expect(e.locator('#centro-costo')).toHaveValue(/.+/);
    await e.locator('#motivo-viaje').fill('Visita a cliente en Chinchiná');
    await expect(e.locator('#pedir-viaje')).toBeEnabled();
    await captura(e, 'cotizar-empresa');
    await e.locator('#pedir-viaje').click();
    await expect(e).toHaveURL(/\/reservas/);
    await expect(e.locator('[data-reserva]')).toHaveCount(1);
    await e.locator('[data-reserva]').click();
    await expect(e.locator('#cargo-empresa')).toContainText('Constructora Andina');
    await expect(e.locator('#cargo-empresa')).toContainText('Visita a cliente en Chinchiná');
    await captura(e, 'reserva-empresa');
  });

  await test.step('la empresa ve el viaje con su centro de costo y motivo', async () => {
    const p = adm.page;
    await p.getByRole('tab', { name: 'Viajes' }).click();
    await expect(p.locator('#tabla-viajes-empresa')).toContainText('Visita a cliente en Chinchiná');
    await expect(p.locator('#tabla-viajes-empresa')).toContainText('Área de ventas');
    await expect(p.locator('#tabla-viajes-empresa')).toContainText('Valentina Ríos Mejía');
    await p.getByRole('tab', { name: 'Resumen' }).click();
    await expect(p.locator('#resumen-empresa')).not.toContainText('Sin facturar$ 0');
    await captura(p, 'portal-viajes');
  });

  await test.step('finanzas ve a la empresa con lo que tiene sin facturar', async () => {
    const p = fin.page;
    await p.getByRole('link', { name: 'Empresas' }).click();
    await expect(p.locator('#tabla-empresas')).toContainText('Constructora Andina');
    await captura(p, 'empresas-consumo');
  });

  await fin.context.close();
  await adm.context.close();
  await ctxPasajero.close();
});
