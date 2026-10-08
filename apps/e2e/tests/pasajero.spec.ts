import { expect, test, type Page } from '@playwright/test';
import { crearConductor, llamar } from './ayudas-api.js';

let capturas = 0;
async function captura(page: Page, nombre: string) {
  capturas += 1;
  await page.waitForTimeout(500); // deja terminar las animaciones
  await page.screenshot({
    path: `capturas/pasajero-${String(capturas).padStart(2, '0')}-${nombre}.png`,
  });
}

function celularNuevo(): string {
  return `3${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}

/** Palogrande, Manizales: el pasajero está aquí y va al Hospital de Caldas, a unos 400 m. */
const UBICACION = { latitude: 5.0548, longitude: -75.4945 };

test.beforeEach(async ({ context }) => {
  // El mapa de calles sale a internet: aquí se corta para que la prueba use siempre el mapa esquemático (lo de los
  // mapas reales se prueba en mapa.spec.ts), sin depender de la red ni de la tarjeta gráfica de quien corre la prueba.
  await context.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(UBICACION);
});

async function entrar(page: Page, celular = celularNuevo()) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar/);
  await page.getByLabel('Número de celular').fill(celular);
  await page.getByRole('button', { name: 'Recibir mi código' }).click();
  await page.getByRole('button', { name: /Toca para usar el código/ }).click();
}

async function onboarding(page: Page, nombre = 'Valentina Ríos Mejía') {
  await expect(page.getByText('¡Bienvenido!')).toBeVisible();
  await page.getByPlaceholder('Valentina Ríos').fill(nombre);
  await page.getByRole('button', { name: 'Seguir' }).click();
  await expect(page.getByText('Tus datos, con tu permiso')).toBeVisible();
  await page.locator('#acepto-terminos').click();
  await page.locator('#aceptar-terminos').click();
}

test('pasajero nuevo: pide un viaje, lo sigue en vivo, lo paga en efectivo y lo califica', async ({
  page,
  context,
}) => {
  page.on('pageerror', (e) => console.log('ERROR EN LA PÁGINA:', e.message));

  await test.step('entra con su celular y se presenta', async () => {
    await entrar(page);
    await captura(page, 'bienvenida');
    await onboarding(page);
    // el permiso ya está dado: la app lo detecta y fija la recogida sin molestarlo
    await expect(page.locator('#origen-actual')).toBeVisible();
    await captura(page, 'inicio-con-ubicacion');
  });

  await test.step('pone conductores de prueba cerca', async () => {
    await page.getByRole('link', { name: 'Cuenta' }).click();
    await page.locator('#demo-conductores').click();
    await expect(page.getByText('Hay 3 conductores de prueba cerca de ti')).toBeVisible();
    await captura(page, 'cuenta');
    await page.getByRole('link', { name: 'Inicio' }).click();
    await captura(page, 'inicio');
  });

  await test.step('busca el destino y ve las categorías con su precio', async () => {
    await page.locator('#a-donde-vas').click();
    await page.locator('#campo-busqueda').fill('hospital');
    await expect(page.locator('[data-resultado="hospital-de-caldas"]')).toBeVisible();
    await captura(page, 'buscar');
    await page.locator('[data-resultado="hospital-de-caldas"]').click();
    await expect(page.locator('[data-categoria="media"]')).toBeVisible();
    await expect(page.locator('[data-categoria="alta"]')).toBeVisible();
    await expect(page.locator('[data-categoria="media"]').getByText(/Llega en/)).toBeVisible();
    await captura(page, 'cotizar');
  });

  await test.step('pide el viaje y espera a su conductor', async () => {
    await page.getByLabel('Nota para el conductor').fill('Estoy en la portería 2');
    await page.locator('#pedir-viaje').click();
    await expect(page.locator('#estado-busqueda')).toBeVisible();
    await captura(page, 'buscando');
    await expect(page.locator('#tarjeta-conductor')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#pin-viaje')).toBeVisible();
    await expect(page.locator('#titulo-seguimiento')).toContainText(/Llega en|llegó/);
    await captura(page, 'conductor-en-camino');
  });

  await test.step('escribe al conductor y comparte el viaje', async () => {
    await page.locator('#abrir-chat').click();
    await page.locator('#mensaje').fill('Ya salgo, dos minutos');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Ya salgo, dos minutos')).toBeVisible();
    await captura(page, 'chat');
    await page.keyboard.press('Escape');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /cerrar/i })
      .first()
      .click({ trial: true })
      .catch(() => undefined);
    await page.mouse.click(195, 60); // fuera de la hoja
    await page.locator('#compartir-viaje').click();
    const enlace = await page.locator('#enlace-compartido').textContent();
    expect(enlace).toMatch(/\/c\/[A-Za-z0-9_-]{30,}$/);

    // otra persona abre el enlace, sin cuenta
    const invitado = await context.newPage();
    await invitado.goto(enlace!);
    await expect(invitado.locator('#estado-compartido')).toBeVisible();
    await expect(invitado.getByText(/SIM/)).toBeVisible();
    await expect(invitado.getByText('Valentina')).toHaveCount(0); // no muestra el nombre del pasajero
    await invitado.screenshot({ path: 'capturas/pasajero-compartido.png' });
    await invitado.close();
    await page.mouse.click(195, 60);
  });

  await test.step('el conductor llega, el viaje empieza y termina', async () => {
    // "Tu conductor llegó" dura unos segundos hasta que sube el pasajero: puede pasar mientras se hacía lo anterior.
    await expect(page.locator('#titulo-seguimiento')).toContainText(/llegó|Llegas en/, {
      timeout: 90_000,
    });
    await captura(page, 'conductor-llego');
    await expect(page.locator('#titulo-seguimiento')).toContainText('Llegas en', {
      timeout: 30_000,
    });
    await captura(page, 'en-viaje');
    await expect(page.locator('#titulo-resumen')).toBeVisible({ timeout: 90_000 });
    await captura(page, 'resumen');
  });

  await test.step('califica a su conductor', async () => {
    await page.getByRole('button', { name: '5 estrellas' }).click();
    await page.getByRole('button', { name: 'Buen manejo' }).click();
    await captura(page, 'calificar');
    await page.locator('#enviar-resumen').click();
    await expect(page.locator('#a-donde-vas')).toBeVisible();
  });

  await test.step('lo ve en su historial, con el recibo', async () => {
    await page.getByRole('link', { name: 'Mis viajes' }).click();
    await expect(page.locator('[data-viaje]').first()).toBeVisible();
    await captura(page, 'historial');
    await page.locator('[data-viaje]').first().click();
    await page.locator('#abrir-recibo').click();
    await expect(page.locator('#recibo-total')).toBeVisible();
    await captura(page, 'recibo');
  });

  await test.step('quita los conductores de prueba para no estorbar a otras pruebas', async () => {
    await page.goto('/cuenta');
    await page.getByRole('button', { name: 'Quitar conductores de prueba' }).click();
    await expect(page.getByText('Quitamos los conductores de prueba')).toBeVisible();
  });
});

test('pasajero: cancela sin costo, paga con una tarjeta que el banco rechaza y queda con deuda hasta pagarla', async ({
  page,
}) => {
  page.on('pageerror', (e) => console.log('ERROR EN LA PÁGINA:', e.message));
  await entrar(page);
  await onboarding(page, 'Camila Duque Arias');
  await expect(page.locator('#origen-actual')).toBeVisible();

  await test.step('pide un viaje sin conductores y lo cancela: no cuesta nada', async () => {
    await page.locator('#a-donde-vas').click();
    await page.locator('#campo-busqueda').fill('estadio');
    await page.locator('[data-resultado="estadio-palogrande"]').click();
    await expect(
      page.locator('[data-categoria="media"]').getByText('Sin conductores cerca'),
    ).toBeVisible();
    await expect(page.getByText(/no hay conductores cerca/i)).toBeVisible();
    await page.locator('#pedir-viaje').click();
    await expect(page.locator('#estado-busqueda')).toBeVisible();
    await page.locator('#cancelar-busqueda').click();
    await expect(page.locator('#a-donde-vas')).toBeVisible();
    await page.getByRole('link', { name: 'Mis viajes' }).click();
    await page.getByRole('tab', { name: 'Cancelados' }).click();
    await expect(page.locator('[data-viaje]')).toHaveCount(1);
    await captura(page, 'cancelado');
  });

  await test.step('agrega una tarjeta que el banco va a rechazar', async () => {
    await page.getByRole('link', { name: 'Cuenta' }).click();
    await page.getByRole('link', { name: /Pagos/ }).click();
    await page.locator('#agregar-tarjeta').click();
    await page.getByRole('button', { name: 'Tarjeta que el banco rechaza' }).click();
    await captura(page, 'agregar-tarjeta');
    await page.locator('#guardar-tarjeta').click();
    await expect(page.locator('[data-tarjeta="0002"]')).toBeVisible();
    await captura(page, 'pagos');
  });

  await test.step('hay conductores y viaja pagando con esa tarjeta', async () => {
    await page.goBack();
    await page.locator('#demo-conductores').click();
    await expect(page.getByText('Hay 3 conductores de prueba cerca de ti')).toBeVisible();
    await page.getByRole('link', { name: 'Inicio' }).click();
    await page.locator('#a-donde-vas').click();
    await page.locator('#campo-busqueda').fill('hospital');
    await page.locator('[data-resultado="hospital-de-caldas"]').click();
    await page.locator('#elegir-pago').click();
    await page.getByRole('button', { name: /Visa •••• 0002|Tarjeta •••• 0002/ }).click();
    await expect(page.locator('#elegir-pago')).toContainText('0002');
    await page.locator('#pedir-viaje').click();
    await expect(page.locator('#titulo-resumen')).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText(/Tu banco rechazó el cobro/)).toBeVisible();
    await captura(page, 'cobro-rechazado');
    await page.locator('#enviar-resumen').click();
    await expect(page.locator('#a-donde-vas')).toBeVisible();
  });

  await test.step('con deuda no puede pedir otro viaje y la paga con otra tarjeta', async () => {
    await page.locator('#a-donde-vas').click();
    await page.locator('#campo-busqueda').fill('estadio');
    await page.locator('[data-resultado="estadio-palogrande"]').click();
    await page.locator('#pedir-viaje').click();
    await expect(page.locator('#deuda')).toBeVisible(); // lo lleva a Pagos
    await captura(page, 'deuda');
    await page.locator('#pagar-deuda').click(); // con la tarjeta rechazada, el banco la vuelve a rechazar
    await expect(page.getByText(/Tu banco rechazó el cobro/)).toBeVisible();
    await page.locator('#agregar-tarjeta').click();
    await page.getByRole('button', { name: 'Tarjeta que funciona' }).click();
    await page.locator('#guardar-tarjeta').click();
    await page.getByRole('button', { name: /Usar Visa terminada en 4242/ }).click();
    await page.locator('#pagar-deuda').click();
    await expect(page.locator('#deuda')).toHaveCount(0);
    await captura(page, 'deuda-pagada');
  });
});

test('pasajero: reserva un viaje para más tarde, ve que un conductor lo confirma y lo cancela sin costo', async ({
  page,
}) => {
  page.on('pageerror', (e) => console.log('ERROR EN LA PÁGINA:', e.message));
  await entrar(page);
  await onboarding(page, 'Laura Gómez Ríos');
  await expect(page.locator('#origen-actual')).toBeVisible();

  await test.step('elige el destino y programa la hora', async () => {
    await page.locator('#a-donde-vas').click();
    await page.locator('#campo-busqueda').fill('hospital');
    await page.locator('[data-resultado="hospital-de-caldas"]').click();
    await expect(page.locator('[data-categoria="media"]')).toBeVisible();
    await page.locator('#elegir-cuando').click();
    // el campo trabaja en hora de Bogotá: dentro de 3 horas
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(Date.now() + 3 * 3_600_000));
    const v = (t: string) => f.find((p) => p.type === t)!.value;
    await page
      .locator('#reserva-fecha')
      .fill(`${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`);
    await captura(page, 'programar');
    await page.locator('#reserva-confirmar-hora').click();
    await expect(page.locator('#elegir-cuando')).toContainText('Reservar');
    await expect(
      page.locator('[data-categoria="media"]').getByText('Precio cerrado'),
    ).toBeVisible();
    await expect(page.getByText(/no hay conductores cerca/i)).toHaveCount(0);
    await expect(page.locator('#pedir-viaje')).toHaveText('Reservar viaje');
    await captura(page, 'cotizar-reserva');
  });

  await test.step('confirma y queda en Mis reservas', async () => {
    await page.locator('#pedir-viaje').click();
    await expect(page).toHaveURL(/\/reservas/);
    await expect(page.locator('[data-reserva]')).toHaveCount(1);
    await expect(page.getByText('Buscaremos conductor')).toBeVisible();
    await captura(page, 'reservas');
  });

  await test.step('un conductor toma la reserva y la confirma', async () => {
    const conductor = await crearConductor(celularNuevo(), {
      nombre: 'Jorge Restrepo',
      aprobar: true,
    });
    const tablero = await llamar<{ disponibles: { id: string }[] }>(
      'GET',
      '/v1/conductor/reservas',
      undefined,
      conductor.token,
    );
    expect(tablero.disponibles.length).toBeGreaterThan(0);
    const id = tablero.disponibles[0]!.id;
    await llamar('POST', `/v1/conductor/reservas/${id}/tomar`, undefined, conductor.token);
    await llamar('POST', `/v1/conductor/reservas/${id}/confirmar`, undefined, conductor.token);
    await page.reload();
    await expect(page.getByText('Conductor confirmado')).toBeVisible();
  });

  await test.step('abre el detalle y cancela: más de una hora antes, sin costo', async () => {
    await page.locator('[data-reserva]').click();
    await expect(page.locator('#estado-reserva')).toContainText('ya confirmó');
    await captura(page, 'reserva-detalle');
    await page.locator('#cancelar-reserva').click();
    await expect(page.locator('#costo-cancelar')).toContainText('sin costo');
    await page.locator('#confirmar-cancelar-reserva').click();
    await expect(page.getByText('Cancelaste la reserva sin costo')).toBeVisible();
    await page.goto('/reservas');
    await expect(page.getByText('No tienes reservas')).toBeVisible();
  });
});
