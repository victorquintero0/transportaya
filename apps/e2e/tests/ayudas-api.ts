// Ayudas para preparar datos por la API real (sin pasar por las pantallas): conductores, viajes de prueba y tickets.
const API = `http://localhost:${process.env['E2E_API_PUERTO'] ?? '3100'}`;

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export async function llamar<T = any>(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  token?: string,
): Promise<T> {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: {
      ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : undefined;
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status} ${texto}`);
  return datos as T;
}

export async function entrarConOtp(telefono: string, app: 'conductor' | 'pasajero') {
  const otp = await llamar('POST', '/v1/auth/otp', { telefono });
  const r = await llamar('POST', '/v1/auth/otp/verificar', {
    telefono,
    codigo: otp.simulado.codigo,
    app,
  });
  return { token: r.accessToken as string, id: r.usuario.id as string };
}

let placas = 0;

/** Un conductor con registro completo. Con `aprobar` queda habilitado; si no, queda "en revisión" para que lo apruebe cumplimiento. */
export async function crearConductor(
  telefono: string,
  o: { nombre: string; aprobar: boolean },
): Promise<{ token: string; id: string }> {
  const { token, id } = await entrarConOtp(telefono, 'conductor');
  await llamar('PATCH', '/v1/conductor/yo', { nombre: o.nombre }, token);
  const catalogo = await llamar('GET', '/v1/catalogo-vehiculos', undefined, token);
  const onix = catalogo
    .flatMap((m: any) => m.lineas.map((l: any) => ({ ...l, marca: m.marca })))
    .find((l: any) => l.linea === 'Onix');
  placas += 1;
  const vehiculo = await llamar(
    'POST',
    '/v1/conductor/vehiculos',
    {
      placa: `TYE${String(100 + placas)}`,
      color: 'Blanco',
      modeloAnio: 2022,
      catalogoVehiculoId: onix.id,
    },
    token,
  );
  const subir = async (tipo: string, extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set('tipo', tipo);
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    f.set('archivo', new Blob([PNG], { type: 'image/png' }), `${tipo}.png`);
    const r = await fetch(`${API}/v1/conductor/documentos`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: f,
    });
    if (!r.ok) throw new Error(`documento ${tipo}: ${r.status} ${await r.text()}`);
  };
  const lejos = `${new Date().getFullYear() + 1}-12-31`;
  for (const t of ['documento_identidad', 'antecedentes', 'selfie']) await subir(t);
  await subir('licencia_conduccion', { venceEn: lejos });
  for (const t of ['licencia_transito', 'fotos_vehiculo'])
    await subir(t, { vehiculoId: vehiculo.id });
  for (const t of ['soat', 'revision_tecnicomecanica', 'seguro_todo_riesgo'])
    await subir(t, { vehiculoId: vehiculo.id, venceEn: lejos });
  await llamar('PUT', '/v1/conductor/cuenta-pago', { tipo: 'llave_bre_b', valor: telefono }, token);
  await llamar('POST', '/v1/conductor/enviar-revision', undefined, token);
  if (o.aprobar) await llamar('POST', '/v1/dev/conductor/aprobar', undefined, token);
  return { token, id };
}

/** Conecta al conductor en un punto y mantiene vivas sus posiciones (si no, el sistema lo marca "sin señal"). */
export async function ponerEnLinea(
  token: string,
  punto: { lat: number; lng: number },
): Promise<() => void> {
  await llamar('POST', '/v1/conductor/conectar', punto, token);
  const latido = setInterval(() => {
    llamar(
      'POST',
      '/v1/conductor/ubicaciones',
      { puntos: [{ ...punto, t: Date.now(), precisionM: 5 }] },
      token,
    ).catch(() => undefined);
  }, 8_000);
  return () => clearInterval(latido);
}

export async function pedirViajeDeMentira(
  token: string,
  o: { metodoPago?: 'efectivo' | 'tarjeta' } = {},
) {
  return llamar<{ viajeId: string; pin: string }>('POST', '/v1/dev/pasajeros/viaje', o, token);
}

/** El conductor acepta la oferta que le llegó y hace el viaje de principio a fin. */
// Si hay otros conductores cerca (los de prueba de otros tests), la oferta les llega primero y pasa a este tras su tiempo de espera.
export async function completarViaje(
  token: string,
  viaje: { viajeId: string; pin: string },
  distanciaM = 4500,
) {
  let oferta: any = null;
  for (let i = 0; i < 120 && !oferta; i++) {
    oferta = (await llamar('GET', '/v1/conductor/oferta-actual', undefined, token)).oferta;
    if (!oferta) await new Promise((r) => setTimeout(r, 500));
  }
  if (!oferta) throw new Error('El conductor no recibió la oferta');
  const aceptada = await llamar(
    'POST',
    `/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`,
    undefined,
    token,
  );
  const cerca = { lat: aceptada.recogida.lat + 0.0003, lng: aceptada.recogida.lng };
  await llamar(
    'POST',
    '/v1/conductor/ubicaciones',
    { puntos: [{ ...cerca, t: Date.now(), precisionM: 5 }] },
    token,
  );
  await llamar('POST', `/v1/conductor/viajes/${viaje.viajeId}/llegue`, {}, token);
  await llamar('POST', `/v1/conductor/viajes/${viaje.viajeId}/iniciar`, { pin: viaje.pin }, token);
  return llamar(
    'POST',
    `/v1/conductor/viajes/${viaje.viajeId}/finalizar`,
    { distanciaM, tiempoDetenidoS: 0, duracionS: 20 },
    token,
  );
}
