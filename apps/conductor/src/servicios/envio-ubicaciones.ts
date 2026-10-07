import { api, ErrorApi } from '../lib/api.ts';
import { alRecibirPosicion, type Posicion } from './gps.ts';
import { socketEnVivo } from './tiempo-real.ts';

/**
 * Manda al servidor las posiciones del GPS en lotes (RNF-31). Si no hay conexión, las guarda y las manda todas
 * al volver; reenviar un lote es seguro porque el servidor ignora las repetidas.
 */
const CLAVE = 'ty.cola-gps';
const MAX_COLA = 1500;
const LOTE = 200;
const CADA_EN_VIAJE_MS = 3000;
const CADA_LIBRE_MS = 8000;
/** Sin viaje no hace falta una lectura por segundo. */
const ENTRE_LECTURAS_LIBRE_MS = 5000;

let cola: Posicion[] = cargar();
let enViaje = false;
let ultimaEncolada = 0;
let enviando = false;
let temporizador: number | null = null;
let quitar: (() => void) | null = null;

function cargar(): Posicion[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as Posicion[];
  } catch {
    return [];
  }
}

function guardar(): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(cola.slice(-MAX_COLA)));
  } catch {
    // sin espacio: seguimos en memoria
  }
}

export function ponerEnViaje(valor: boolean): void {
  if (valor === enViaje) return;
  enViaje = valor;
  reprogramar();
}

async function mandar(puntos: Posicion[]): Promise<void> {
  const cuerpo = puntos.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    t: Math.round(p.t),
    precisionM: p.precisionM,
    velocidadKmh: p.velocidadKmh === null ? null : Math.max(0, p.velocidadKmh),
    rumbo: p.rumbo === null ? null : ((p.rumbo % 360) + 360) % 360,
  }));
  const s = socketEnVivo();
  if (s?.connected) {
    try {
      const r = (await s.timeout(5000).emitWithAck('conductor:ubicacion', { puntos: cuerpo })) as {
        ok?: boolean;
        error?: string;
      };
      if (r.ok) return;
      if (r.error === 'DESCONECTADO') return; // ya no estamos en línea: no tiene sentido guardar
    } catch {
      // se intenta por HTTP
    }
  }
  await api.post('/v1/conductor/ubicaciones', { puntos: cuerpo });
}

export async function enviarAhora(): Promise<void> {
  if (enviando || cola.length === 0) return;
  enviando = true;
  const lote = cola.slice(0, LOTE);
  try {
    await mandar(lote);
    cola = cola.slice(lote.length);
    guardar();
  } catch (e) {
    // 409 = ya no estás en línea: se descarta. Cualquier otra falla (red, servidor) se reintenta luego.
    if (e instanceof ErrorApi && (e.estado === 409 || e.estado === 400)) {
      cola = cola.slice(lote.length);
      guardar();
    }
  } finally {
    enviando = false;
  }
}

function reprogramar(): void {
  if (temporizador !== null) window.clearInterval(temporizador);
  if (!quitar) return;
  temporizador = window.setInterval(
    () => void enviarAhora(),
    enViaje ? CADA_EN_VIAJE_MS : CADA_LIBRE_MS,
  );
}

export function iniciarEnvio(): void {
  if (quitar) return;
  quitar = alRecibirPosicion((p) => {
    if (!enViaje && p.t - ultimaEncolada < ENTRE_LECTURAS_LIBRE_MS) return;
    ultimaEncolada = p.t;
    cola.push(p);
    if (cola.length > MAX_COLA) cola = cola.slice(-MAX_COLA);
    if (cola.length % 10 === 0) guardar();
  });
  reprogramar();
  window.addEventListener('online', alVolverLaRed);
}

function alVolverLaRed(): void {
  void enviarAhora();
}

export async function detenerEnvio(): Promise<void> {
  quitar?.();
  quitar = null;
  if (temporizador !== null) window.clearInterval(temporizador);
  temporizador = null;
  window.removeEventListener('online', alVolverLaRed);
  await enviarAhora();
  cola = [];
  guardar();
}

export function pendientesPorEnviar(): number {
  return cola.length;
}
