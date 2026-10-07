import { expect, test, type Page } from '@playwright/test';

/** PNG de 1×1 píxel: el servidor valida el tipo real del archivo, no su extensión. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let capturas = 0;
async function captura(page: Page, nombre: string) {
  capturas += 1;
  await page.waitForTimeout(500); // deja terminar las animaciones
  await page.screenshot({
    fullPage: true,
    path: `capturas/${String(capturas).padStart(2, '0')}-${nombre}.png`,
  });
}

function celularNuevo(): string {
  return `3${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}

function enUnAnio(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation']);
  await context.addInitScript(() => {
    // GPS de mentira rápido, para que el viaje no tarde minutos de verdad.
    if (!localStorage.getItem('ty.ajustes')) {
      localStorage.setItem(
        'ty.ajustes',
        JSON.stringify({
          state: { gpsSimulado: true, velocidadSimulada: 4, sonido: false, vibracion: false },
          version: 0,
        }),
      );
    }
  });
});

test('conductor nuevo: registro, viaje con taxímetro, cobro en efectivo y pago de comisión', async ({
  page,
}) => {
  page.on('pageerror', (e) => console.log('ERROR EN LA PÁGINA:', e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/v1/'))
      void r.text().then((t) => console.log('HTTP', r.status(), r.url(), t.slice(0, 200)));
  });
  await test.step('entra con su celular y el código de demostración', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/entrar/);
    await captura(page, 'entrar');
    await page.getByLabel('Número de celular').fill(celularNuevo());
    await page.getByRole('button', { name: 'Recibir mi código' }).click();
    await expect(page.getByText('Modo demostración')).toBeVisible();
    await captura(page, 'codigo');
    await page.getByRole('button', { name: /Toca para usar el código/ }).click();
    await expect(page.getByText('Vamos a dejarte listo')).toBeVisible();
  });

  await test.step('registro: datos personales', async () => {
    await captura(page, 'registro-datos');
    await page.getByPlaceholder('Carlos Andrés Pérez').fill('Carlos Andrés Pérez');
    await page.getByRole('button', { name: 'Guardar y seguir' }).click();
    await expect(page.getByText('Marca', { exact: true })).toBeVisible();
  });

  await test.step('registro: vehículo del catálogo', async () => {
    await page.getByRole('button', { name: 'Chevrolet', exact: true }).click();
    await page.getByRole('button', { name: 'Spark GT', exact: true }).click();
    await page.getByPlaceholder('2019').fill('2022');
    await page.getByPlaceholder('ABC123').fill('TYX123');
    await page.getByRole('button', { name: 'Blanco', exact: true }).click();
    await captura(page, 'registro-vehiculo');
    await page.getByRole('button', { name: 'Guardar mi vehículo' }).click();
    await expect(page.getByText(/documentos cargados/)).toBeVisible(); // pasa solo al paso siguiente
  });

  await test.step('registro: documentos', async () => {
    const tipos = await page
      .locator('input[data-subir]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-subir')!));
    expect(tipos.length).toBeGreaterThanOrEqual(9);
    for (const [i, tipo] of tipos.entries()) {
      if (i === tipos.length - 1) await captura(page, 'registro-documentos');
      const tarjeta = page.locator(`[data-documento="${tipo}"]`);
      const fecha = tarjeta.locator('input[type=date]');
      if (await fecha.count()) await fecha.fill(enUnAnio());
      await tarjeta
        .locator('input[type=file]')
        .setInputFiles({ name: `${tipo}.png`, mimeType: 'image/png', buffer: PNG });
      // al subir el último documento la app pasa sola al paso siguiente
      await expect(
        tarjeta.getByText('En revisión').or(page.getByPlaceholder('@micuenta o 3001234567')),
      ).toBeVisible();
    }
  });

  await test.step('registro: cuenta de pago y envío a revisión', async () => {
    await page.getByPlaceholder('@micuenta o 3001234567').fill('@carlos.perez');
    await page.getByRole('button', { name: 'Guardar cuenta' }).click();
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible();
    await captura(page, 'registro-revision');
    await page.getByRole('button', { name: 'Enviar a revisión' }).click();
    await expect(page.getByText('¡Recibimos tu registro!')).toBeVisible();
    await captura(page, 'en-revision');
  });

  await test.step('cumplimiento aprueba (simulado) y entra a la jornada', async () => {
    await page.locator('#aprobar-demo').click();
    await expect(page.locator('#boton-conexion')).toBeVisible();
    await captura(page, 'inicio-desconectado');
  });

  await test.step('se conecta', async () => {
    await page.locator('#boton-conexion').click();
    await expect(page.locator('#estado-conexion')).toContainText('Buscando viajes');
    await captura(page, 'inicio-en-linea');
  });

  await test.step('llega un pasajero y acepta la oferta', async () => {
    await page.getByRole('link', { name: 'Perfil' }).click();
    await page.locator('#demo-pasajero').click();
    await expect(page.locator('[data-oferta]')).toBeVisible();
    await captura(page, 'oferta');
    await page.locator('#aceptar-oferta').click();
    await expect(page.getByText('Rumbo al pasajero')).toBeVisible();
    await captura(page, 'en-camino');
  });

  await test.step('llega a la recogida (el GPS simulado avanza) y espera', async () => {
    await expect(page.locator('#boton-llegue')).toBeEnabled({ timeout: 120_000 });
    await page.locator('#boton-llegue').click();
    await expect(page.locator('#reloj-espera')).toBeVisible();
    await captura(page, 'en-sitio');
    await page.locator('#pin-demo').click();
    await page.locator('#boton-iniciar').click();
    await expect(page.locator('#boton-finalizar')).toBeVisible();
  });

  await test.step('el taxímetro mide distancia y paradas mientras maneja', async () => {
    await expect
      .poll(async () => (await page.locator('#medida-distancia').textContent()) ?? '', {
        timeout: 60_000,
      })
      .not.toBe('0 m');
    await captura(page, 'taximetro');
    // el GPS simulado hace una parada de 14 s como de semáforo: el taxímetro debe contarla como tiempo detenido
    await expect
      .poll(async () => (await page.locator('#medida-detenido').textContent()) ?? '', {
        timeout: 120_000,
      })
      .not.toBe('0 s');
    await captura(page, 'taximetro-detenido');
    await page.locator('#boton-finalizar').click();
    await captura(page, 'finalizar-confirmar');
    await page.locator('#confirmar-finalizar').click();
    await expect(page.getByText('¡Viaje terminado!')).toBeVisible();
    await expect(page.getByText('Medición verificada')).toBeVisible();
    await captura(page, 'resumen');
  });

  await test.step('cobra en efectivo y califica', async () => {
    await page.locator('#resumen-seguir').click();
    await expect(page.locator('#cobrar-efectivo')).toBeVisible();
    await captura(page, 'cobro-efectivo');
    await page.locator('#confirmar-efectivo').click();
    await expect(page.getByText('¿Cómo fue el pasajero?')).toBeVisible();
    await page.getByRole('button', { name: '5 estrellas' }).click();
    await page.getByRole('button', { name: 'Amable' }).click();
    await captura(page, 'calificar');
    await page.locator('#enviar-calificacion').click();
    await page.getByRole('link', { name: 'Inicio' }).click();
    await expect(page.locator('#boton-conexion')).toBeVisible();
    await captura(page, 'inicio-tras-viaje');
  });

  await test.step('ve sus ganancias y paga la comisión', async () => {
    await page.getByRole('link', { name: 'Ganancias' }).click();
    await expect(page.locator('#deuda-valor')).toBeVisible();
    await captura(page, 'ganancias');
    await page.locator('#pagar-comision').click();
    await captura(page, 'pagar-comision');
    await page.locator('#simular-pago').click();
    await expect(page.getByText('Estás al día ✓')).toBeVisible();
    await captura(page, 'ganancias-al-dia');
  });
});
