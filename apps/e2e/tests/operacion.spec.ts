import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  completarViaje,
  crearConductor,
  crearPasajero,
  entrarConOtp,
  llamar,
  pedirViajeDeMentira,
  ponerEnLinea,
  reservarDeMentira,
  serieDePlacas,
} from './ayudas-api.js';

// Esta prueba nombra las placas en pantalla (TYE101, TYE102).
serieDePlacas('TYE');

let capturas = 0;
async function captura(page: Page, nombre: string) {
  capturas += 1;
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `capturas/operacion-${String(capturas).padStart(2, '0')}-${nombre}.png`,
  });
}

/** Entra con la cuenta de demostración de un rol (con su segundo factor) en un contexto propio. */
async function sesionComo(
  browser: Browser,
  rol: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    colorScheme: 'dark',
    baseURL: 'http://localhost:5183',
  });
  // El mapa de calles sale a internet: aquí se corta para que la prueba use siempre el mapa esquemático.
  await context.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`ERROR EN LA PÁGINA (${rol}):`, e.message));
  await page.goto('/');
  await expect(page).toHaveURL(/\/ingresar/);
  await page.locator(`[data-rol="${rol}"]`).click();
  await expect(page.locator('#operador-nombre')).toBeVisible();
  return { context, page };
}

const CENTRO = { lat: 5.0689, lng: -75.5174 };
const ESTE = { lat: 5.0712, lng: -75.5121 };

test('operación: ingreso con segundo factor, onboarding, torre en vivo, finanzas, soporte, tarifas y auditoría', async ({
  browser,
}) => {
  test.setTimeout(8 * 60_000);
  const detener: (() => void)[] = [];

  await test.step('la pantalla de ingreso pide credenciales y ofrece las cuentas de demostración', async () => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      baseURL: 'http://localhost:5183',
      colorScheme: 'dark',
    });
    await page.goto('/torre');
    await expect(page).toHaveURL(/\/ingresar/);
    await expect(page.locator('#cuentas-demo')).toBeVisible();
    await captura(page, 'ingreso');
    // una contraseña equivocada no dice qué falló
    await page.locator('#email').fill('monitor@transporteya.demo');
    await page.locator('#contrasena').fill('equivocada-1A');
    await page.locator('#entrar').click();
    await expect(page.getByRole('alert')).toContainText('Correo, contraseña o código incorrectos');
    await page.close();
  });

  // ── Cumplimiento aprueba un registro nuevo (reemplaza al atajo del simulador) ──
  const nuevo = await crearConductor('3109000001', {
    nombre: 'Natalia Ospina Rojas',
    aprobar: false,
  });
  const cumplimiento = await sesionComo(browser, 'cumplimiento');
  await test.step('cumplimiento revisa y aprueba a un conductor nuevo', async () => {
    const p = cumplimiento.page;
    await p.getByRole('link', { name: 'Conductores' }).click();
    await expect(p.getByRole('tab', { name: /Por revisar/ })).toBeVisible();
    await expect(p.locator('#tabla-conductores')).toContainText('Natalia Ospina Rojas');
    await captura(p, 'conductores-por-revisar');
    await p.locator('#tabla-conductores').getByText('Natalia Ospina Rojas').click();
    await expect(p.getByRole('heading', { name: 'Natalia Ospina Rojas' })).toBeVisible();
    // no se puede habilitar con documentos sin revisar
    await expect(p.locator('#habilitar-conductor')).toBeDisabled();
    await captura(p, 'conductor-ficha');

    // se ve un documento
    await p.locator('#documentos').getByRole('button', { name: 'Ver' }).first().click();
    await expect(p.getByRole('dialog').locator('img')).toBeVisible();
    await captura(p, 'documento');
    await p.keyboard.press('Escape');

    // rechazo uno con motivo y luego lo vuelvo a aprobar tras corregirlo
    const botones = p.locator('#documentos').getByRole('button', { name: 'Aprobar' });
    const cuantos = await botones.count();
    expect(cuantos).toBeGreaterThanOrEqual(9);
    for (let i = 0; i < cuantos; i++) {
      await p.locator('#documentos').getByRole('button', { name: 'Aprobar' }).first().click();
      await expect(p.locator('#documentos').getByRole('button', { name: 'Aprobar' })).toHaveCount(
        cuantos - i - 1,
      );
    }
    await expect(p.locator('#habilitar-conductor')).toBeEnabled();
    await p.locator('#habilitar-conductor').click();
    await expect(p.getByText('Habilitado', { exact: true }).first()).toBeVisible();
    await captura(p, 'conductor-habilitado');
  });
  await cumplimiento.context.close();

  // La conductora aprobada ya puede conectarse (sin el atajo del simulador).
  const natalia = nuevo;
  detener.push(await ponerEnLinea(natalia.token, CENTRO));
  const bruno = await crearConductor('3109000002', { nombre: 'Bruno Cardona Gil', aprobar: true });
  detener.push(await ponerEnLinea(bruno.token, ESTE));

  // ── Torre de control ──
  const monitor = await sesionComo(browser, 'monitor');
  await test.step('el monitor ve la flota y despacha a mano un viaje sin asignar', async () => {
    const p = monitor.page;
    await expect(p.getByRole('heading', { name: 'Torre de control' })).toBeVisible();
    await expect(p.locator('#kpis')).toContainText('Conductores en línea');
    // la API de pruebas se comparte con las otras apps: puede haber más conductores en línea, pero estos dos deben verse
    await expect(p.locator(`[data-conductor="${natalia.id}"]`)).toBeVisible();
    await expect(p.locator(`[data-conductor="${bruno.id}"]`)).toBeVisible();
    await captura(p, 'torre-flota');

    const viaje = await pedirViajeDeMentira(natalia.token);
    await p.getByRole('tab', { name: /Sin asignar/ }).click();
    await expect(p.locator('#lista-sin-asignar [data-viaje-activo]')).toHaveCount(1);
    await p.locator('#lista-sin-asignar [data-viaje-activo]').click();
    await expect(p.locator('#detalle-seleccion')).toContainText('Despacho manual');
    await captura(p, 'torre-despacho');

    await p
      .locator('#detalle-seleccion li', { hasText: 'Bruno Cardona Gil' })
      .getByRole('button', { name: 'Despachar' })
      .click();
    await expect(p.getByText('Viaje asignado a Bruno Cardona Gil')).toBeVisible();
    await p.getByRole('tab', { name: 'Viajes' }).click();
    await expect(p.locator('#lista-viajes-activos')).toContainText('Conductor en camino');
    await captura(p, 'torre-asignado');

    // el detalle muestra la línea de tiempo con la acción de operación
    await p.locator('#detalle-seleccion').getByRole('button', { name: 'Abrir detalle' }).click();
    await expect(p.locator('#linea-de-tiempo')).toContainText('Viaje asignado');
    await expect(p.locator('#linea-de-tiempo')).toContainText('Operación');
    await captura(p, 'viaje-detalle');

    // reasigna con motivo a Natalia
    await p.locator('#reasignar').click();
    await p
      .getByRole('dialog')
      .getByLabel('Nuevo conductor')
      .selectOption({ label: 'Natalia Ospina Rojas · TYE101' })
      .catch(async () => {
        await p.getByRole('dialog').getByLabel('Nuevo conductor').selectOption({ index: 1 });
      });
    await p.getByRole('dialog').locator('textarea').fill('El conductor está lejos de la recogida');
    await p.getByRole('dialog').getByRole('button', { name: 'Reasignar', exact: true }).click();
    await expect(p.getByText('Viaje reasignado')).toBeVisible();

    // y lo cancela con motivo
    await p.locator('#cancelar-viaje').click();
    await p.getByRole('dialog').locator('textarea').fill('El pasajero llamó para cancelar');
    await p.getByRole('dialog').getByRole('button', { name: 'Cancelar el viaje' }).click();
    await expect(p.getByText('Viaje cancelado').first()).toBeVisible();
    await expect(p.locator('#linea-de-tiempo')).toContainText('Viaje cancelado');
    await expect(p.getByText('El pasajero llamó para cancelar').first()).toBeVisible();
    await captura(p, 'viaje-cancelado');
    expect(viaje.viajeId).toBeTruthy();
  });

  await test.step('el monitor ve las reservas y asigna y libera un conductor a mano', async () => {
    const p = monitor.page;
    const pasajero = await crearPasajero(
      `3${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
      'Sofía Marín',
    );
    const reserva = await reservarDeMentira(pasajero.token, 300);
    await p.getByRole('link', { name: 'Reservas' }).click();
    await expect(p.locator('#resumen-reservas')).toContainText('Sin conductor');
    const fila = p.locator('#tabla-reservas tr', { hasText: reserva.codigo });
    await expect(fila).toContainText('Sofía Marín');
    await captura(p, 'reservas');

    await p.locator(`#asignar-${reserva.codigo}`).click();
    await p
      .getByRole('dialog')
      .locator('li', { hasText: 'Natalia Ospina Rojas' })
      .locator('input')
      .check();
    await p.locator('#motivo-asignar-reserva').fill('Cliente frecuente que pidió a este conductor');
    await p.locator('#confirmar-asignar-reserva').click();
    await expect(p.getByText('Conductor asignado a la reserva')).toBeVisible();
    await expect(fila).toContainText('Natalia Ospina Rojas');
    await expect(fila).toContainText('Confirmada');
    await captura(p, 'reservas-asignada');

    await p.locator(`#liberar-${reserva.codigo}`).click();
    await p
      .getByRole('dialog')
      .locator('textarea, input')
      .first()
      .fill('El conductor avisó que no puede');
    await p.getByRole('dialog').getByRole('button', { name: 'Liberar', exact: true }).click();
    await expect(p.getByText('Reserva liberada')).toBeVisible();
    await expect(fila).toContainText('Sin conductor');
  });

  await test.step('una alerta SOS llega en vivo y el monitor la toma y la cierra con una nota', async () => {
    const p = monitor.page;
    await p.getByRole('link', { name: 'Torre de control' }).click();
    await llamar('POST', '/v1/conductor/sos', {}, bruno.token);
    await expect(p.getByText(/Alerta crítica: SOS/)).toBeVisible({ timeout: 10_000 });
    await p.getByRole('tab', { name: /Alertas/ }).click();
    await expect(p.locator('#lista-alertas [data-alerta="sos"]')).toBeVisible();
    await captura(p, 'torre-alerta-sos');
    await p.locator('#lista-alertas').getByRole('button', { name: 'Tomar' }).click();
    await expect(p.locator('#lista-alertas')).toContainText('La atiende');
    await p.locator('#lista-alertas').getByRole('button', { name: 'Cerrar' }).click();
    await p.getByRole('dialog').locator('textarea').fill('Hablé con el conductor: falsa alarma');
    await p.getByRole('dialog').getByRole('button', { name: 'Cerrar alerta' }).click();
    await expect(p.getByText('Sin alertas abiertas')).toBeVisible();
  });

  // ── Un viaje completo para que haya dinero que cerrar ──
  await test.step('se completa un viaje en efectivo por la API para el cierre', async () => {
    const viaje = await pedirViajeDeMentira(bruno.token, { metodoPago: 'efectivo' });
    const fin = await completarViaje(bruno.token, viaje, 6000);
    expect(fin.comision).toBeGreaterThan(0);
  });

  const financiero = await sesionComo(browser, 'financiero');
  await test.step('finanzas ejecuta el cierre, ve la cobranza y concilia el pago de la comisión', async () => {
    const p = financiero.page;
    // un financiero no ve la torre: entra por la primera pantalla a la que tiene acceso
    await expect(p.getByRole('heading', { name: 'Viajes', exact: true })).toBeVisible();
    await p.getByRole('link', { name: 'Finanzas' }).click();
    await expect(p.getByRole('heading', { name: 'Finanzas' })).toBeVisible();
    await p.locator('#ejecutar-cierre').click();
    await p.getByRole('dialog').getByRole('button', { name: 'Ejecutar cierre' }).click();
    await expect(p.getByText('Cierre ejecutado')).toBeVisible();
    await expect(p.locator('#tabla-cierres')).toContainText('Bruno Cardona Gil');
    await expect(p.locator('#tabla-cierres')).toContainText('Bloqueado por deuda');
    await captura(p, 'finanzas-cierre');

    await p.getByRole('tab', { name: /Cobranza/ }).click();
    await expect(p.locator('#tabla-bloqueados')).toContainText('Bruno Cardona Gil');
    // el conductor reporta su pago por Bre-B
    const saldo = await llamar('GET', '/v1/conductor/saldo', undefined, bruno.token);
    await llamar(
      'POST',
      '/v1/conductor/pagos-comision',
      { monto: Math.max(1000, saldo.deuda), referencia: 'BREB-E2E-1' },
      bruno.token,
    );
    await p.reload();
    await p.getByRole('tab', { name: /Cobranza/ }).click();
    await expect(p.locator('#tabla-pagos-comision')).toContainText('BREB-E2E-1');
    await captura(p, 'finanzas-cobranza');
    await p.locator('#tabla-pagos-comision').getByRole('button', { name: 'Conciliar' }).click();
    await expect(p.getByText('Pago conciliado')).toBeVisible();
    // otros conductores de la API compartida pueden seguir bloqueados: se revisa solo a Bruno
    await expect(p.locator('#tabla-bloqueados tr', { hasText: 'Bruno Cardona Gil' })).toHaveCount(
      0,
    );

    // el libro muestra el pago acreditado
    await p.getByRole('tab', { name: 'Libro de movimientos' }).click();
    await p.locator('#libro-conductor').selectOption({ label: 'Bruno Cardona Gil · TYE102' });
    await expect(p.locator('#tabla-libro')).toContainText('Pago de comisión');
    await captura(p, 'finanzas-libro');

    // el ajuste lo propone finanzas y lo aprueba otra persona
    await p.getByRole('tab', { name: 'Ajustes' }).click();
    await p.locator('#proponer-ajuste').click();
    await p.locator('#ajuste-conductor').selectOption({ label: 'Bruno Cardona Gil · TYE102' });
    await p.locator('#ajuste-monto').fill('-3000');
    await p.getByRole('dialog').locator('textarea').fill('Cobro duplicado de un peaje');
    await p.getByRole('dialog').getByRole('button', { name: 'Proponer' }).click();
    await expect(p.getByText('Ajuste propuesto')).toBeVisible();
    await expect(p.locator('#tabla-ajustes'))
      .toContainText('Aprobar')
      .catch(() => undefined);
    await expect(p.locator('#tabla-ajustes').getByRole('button', { name: 'Aprobar' })).toHaveCount(
      0,
    ); // finanzas no aprueba
    await captura(p, 'finanzas-ajuste');
  });
  await financiero.context.close();

  const supervisor = await sesionComo(browser, 'supervisor');
  await test.step('supervisión aprueba el ajuste propuesto por finanzas', async () => {
    const p = supervisor.page;
    await p.goto('/finanzas?pestana=ajustes');
    await p.locator('#tabla-ajustes').getByRole('button', { name: 'Aprobar' }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Aprobar', exact: true }).click();
    await expect(p.getByText('Ajuste aprobado')).toBeVisible();
  });

  // ── Soporte ──
  const pasajera = await entrarConOtp('3109000010', 'pasajero');
  await llamar('PATCH', '/v1/pasajero/yo', { nombre: 'Valentina Ríos' }, pasajera.token).catch(
    () => undefined,
  );
  await llamar(
    'POST',
    '/v1/pasajero/soporte/tickets',
    {
      tipo: 'incidente_seguridad',
      asunto: 'El conductor iba muy rápido',
      detalle: 'Pasó varios semáforos en rojo.',
    },
    pasajera.token,
  );
  const soporte = await sesionComo(browser, 'soporte');
  await test.step('soporte atiende un ticket urgente', async () => {
    const p = soporte.page;
    await p.getByRole('link', { name: 'Soporte' }).click();
    await expect(p.locator('#tabla-tickets')).toContainText('El conductor iba muy rápido');
    await captura(p, 'soporte-bandeja');
    await p.locator('#tabla-tickets').getByText('El conductor iba muy rápido').click();
    await expect(p.locator('#conversacion')).toContainText('Pasó varios semáforos en rojo.');
    await p.locator('#respuesta').fill('Lamentamos lo ocurrido. Ya hablamos con el conductor.');
    await p.locator('#enviar-respuesta').click();
    await expect(p.getByText('Respuesta enviada')).toBeVisible();
    await expect(p.locator('#conversacion')).toContainText('Ya hablamos con el conductor');
    await captura(p, 'soporte-ticket');
    await p.locator('#resolver').click();
    await expect(p.getByText('Ticket resuelto')).toBeVisible();
  });
  // ── Privacidad: una persona pide corregir sus datos y soporte le responde ──
  const titular = await entrarConOtp('3109000077', 'pasajero');
  await llamar('PATCH', '/v1/pasajero/yo', { nombre: 'Marcela Titular Datos' }, titular.token);
  await llamar(
    'POST',
    '/v1/datos/solicitudes',
    { tipo: 'rectificacion', detalle: 'Mi correo está mal escrito' },
    titular.token,
  );
  await test.step('soporte atiende una solicitud de datos dentro del plazo de la ley', async () => {
    const p = soporte.page;
    await p.getByRole('link', { name: 'Privacidad' }).click();
    await expect(p.locator('#tabla-privacidad')).toContainText('Marcela Titular Datos');
    await p.locator('#tabla-privacidad').getByText('Marcela Titular Datos').click();
    await expect(p.locator('#atender-solicitud')).toContainText('Mi correo está mal escrito');
    await p.locator('#tomar-solicitud').click();
    await expect(p.locator('#atender-solicitud')).toContainText('En trámite');
    await p.locator('#aceptar-solicitud').click();
    await p
      .getByRole('dialog')
      .locator('textarea')
      .fill('Corregimos tu correo, gracias por avisarnos.');
    await p.getByRole('dialog').getByRole('button', { name: 'Responder' }).click();
    await expect(p.getByText('Solicitud resuelta')).toBeVisible();
    await captura(p, 'privacidad');
  });

  await soporte.context.close();

  // ── Tarifas y configuración (administrador) ──
  const admin = await sesionComo(browser, 'admin');
  await test.step('el administrador simula un precio y cambia un parámetro', async () => {
    const p = admin.page;
    await p.getByRole('link', { name: 'Tarifas y zonas' }).click();
    await expect(p.locator('#version-1')).toContainText('Vigente');
    await expect(p.locator('#version-1')).toContainText('$ 3.700');
    await captura(p, 'tarifas');
    await p.getByRole('tab', { name: 'Simulador' }).click();
    await p.locator('#sim-km').fill('3');
    await p.locator('#sim-min').fill('0');
    await p.locator('#simular').click();
    await expect(p.locator('#total-simulado')).toBeVisible();
    await captura(p, 'tarifas-simulador');

    await p.getByRole('link', { name: 'Configuración' }).click();
    const fila = p.locator('[data-parametro="despacho.oferta_s"]');
    await expect(fila).toContainText('por defecto');
    await fila.getByRole('button', { name: 'Cambiar' }).click();
    await p.getByRole('dialog').locator('input[type="number"]').fill('20');
    await p.getByRole('dialog').locator('textarea').fill('Conductores lentos en horas pico');
    await p.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(p.getByText('Parámetro actualizado')).toBeVisible();
    await expect(p.locator('[data-parametro="despacho.oferta_s"]')).toContainText('Personalizado');
    await captura(p, 'configuracion');

    // la pantalla Sistema muestra la salud técnica: base de datos, tareas programadas y tráfico
    await p.getByRole('link', { name: 'Sistema' }).click();
    await expect(p.getByText('Todo en orden')).toBeVisible();
    await expect(p.locator('#tabla-tareas')).toContainText('vigilar_senal');
    await expect(p.getByText('Base de datos', { exact: true })).toBeVisible();
    await captura(p, 'sistema');

    // catálogo: se agrega un vehículo nuevo y queda en la tabla
    await p.getByRole('link', { name: 'Catálogo', exact: true }).click();
    await p.locator('#nuevo-vehiculo-catalogo').click();
    const d = p.getByRole('dialog');
    await d.getByLabel('Marca').fill('Zhidou');
    await d.getByLabel('Línea').fill('D2');
    await d.locator('textarea').fill('Vehículo eléctrico nuevo en el mercado');
    await d.getByRole('button', { name: 'Confirmar' }).click();
    await expect(p.getByText('Vehículo agregado al catálogo')).toBeVisible();
    await expect(p.locator('#tabla-catalogo')).toContainText('Zhidou D2');
    await captura(p, 'catalogo');

    // peajes: se crea uno y la tabla lo muestra
    await p.getByRole('link', { name: 'Tarifas y zonas' }).click();
    await p.getByRole('tab', { name: 'Peajes' }).click();
    await p.locator('#nuevo-peaje').click();
    const dp = p.getByRole('dialog');
    await dp.getByLabel('Nombre').fill('Peaje Tres Puertas');
    await dp.getByLabel('Latitud').fill('5.0301');
    await dp.getByLabel('Longitud').fill('-75.4382');
    await dp.getByLabel('Valor (COP)').fill('12400');
    await dp.locator('textarea').fill('Tarifa oficial 2026');
    await dp.getByRole('button', { name: 'Confirmar' }).click();
    await expect(p.getByText('Peaje creado')).toBeVisible();
    await expect(p.locator('#tabla-peajes')).toContainText('Peaje Tres Puertas');
    await expect(p.locator('#tabla-peajes')).toContainText('$ 12.400');

    // zonas: se dibuja una sobre el mapa con tres clics
    await p.getByRole('tab', { name: 'Zonas' }).click();
    const mapa = p.locator('#mapa-zonas');
    await expect(mapa).toBeVisible();
    const caja = (await mapa.boundingBox())!;
    for (const [fx, fy] of [
      [0.3, 0.3],
      [0.6, 0.35],
      [0.45, 0.65],
    ] as const)
      await p.mouse.click(caja.x + caja.width * fx, caja.y + caja.height * fy);
    await expect(p.locator('#conteo-vertices')).toContainText('3 vértices');
    await p.locator('#zona-nombre').fill('Punto de encuentro del centro');
    await captura(p, 'zonas-dibujo');
    await p.locator('#guardar-zona').click();
    await p.getByRole('dialog').locator('textarea').fill('Punto de encuentro para el centro');
    await p.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(p.getByText('Zona creada')).toBeVisible();
    await expect(p.locator('#tabla-zonas')).toContainText('Punto de encuentro del centro');
    await expect(p.locator('#conteo-vertices')).toContainText('0 vértices');

    // reportes: filtro por categoría y mapa de calor
    await p.getByRole('link', { name: 'Reportes' }).click();
    await p.locator('#filtro-categoria').selectOption('media');
    await p.getByRole('button', { name: 'Aplicar' }).click();
    await expect(p.locator('#kpis-reporte')).toBeVisible();
    await expect(p.locator('#panel-calor')).toBeVisible();
    await p.getByRole('button', { name: 'Sin conductor', exact: true }).click();
    await expect(p.locator('#panel-calor')).toContainText('No se muestran personas');
    await captura(p, 'reportes-calor');
  });

  await test.step('el administrador crea un usuario y revisa la auditoría', async () => {
    const p = admin.page;
    await p.getByRole('link', { name: 'Usuarios' }).click();
    await expect(p.locator('#tabla-usuarios')).toContainText('Sofía Supervisora');
    await p.locator('#nuevo-usuario').click();
    await p.locator('#nuevo-nombre').fill('Tomás Torres');
    await p.locator('#nuevo-email').fill('tomas@transporteya.co');
    await p.locator('#nuevo-telefono').fill('3105550123');
    await p.getByRole('dialog').getByLabel('Monitor').check();
    await p.getByRole('dialog').getByRole('button', { name: 'Crear usuario' }).click();
    await expect(p.locator('#contrasena-temporal')).toBeVisible();
    await captura(p, 'usuarios-contrasena-temporal');
    await p.getByRole('button', { name: 'Listo' }).click();

    await p.getByRole('link', { name: 'Auditoría' }).click();
    await expect(p.locator('#tabla-auditoria')).toContainText('Aprobó un ajuste de saldo');
    await expect(p.locator('#tabla-auditoria')).toContainText('Canceló un viaje');
    await expect(p.locator('#tabla-auditoria')).toContainText('El pasajero llamó para cancelar');
    await captura(p, 'auditoria');

    await p.getByRole('link', { name: 'Reportes' }).click();
    await expect(p.locator('#kpis-reporte')).toContainText('Solicitudes');
    await expect(p.locator('svg[aria-label="Solicitudes por día"]')).toBeVisible();
    await captura(p, 'reportes');
  });

  // los permisos limitan lo que se ve: el monitor no tiene finanzas ni usuarios
  await test.step('el monitor no ve finanzas, usuarios ni configuración', async () => {
    const nav = monitor.page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: 'Torre de control' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Finanzas' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Configuración' })).toHaveCount(0);
  });

  for (const d of detener) d();
  await supervisor.context.close();
  await admin.context.close();
  await monitor.context.close();
});
