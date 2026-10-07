import { create } from 'zustand';
import { useAjustes } from '../estado/ajustes.ts';
import { CENTRO_MANIZALES, GpsSimulado } from './gps-simulado.ts';

export interface Posicion {
  lat: number;
  lng: number;
  /** ms desde 1970 */
  t: number;
  precisionM: number | null;
  velocidadKmh: number | null;
  rumbo: number | null;
}

export type EstadoGps = 'apagado' | 'buscando' | 'ok' | 'sin_permiso' | 'no_disponible';

interface Ubicacion {
  posicion: Posicion | null;
  estado: EstadoGps;
  simulado: boolean;
}

export const useUbicacion = create<Ubicacion>(() => ({
  posicion: null,
  estado: 'apagado',
  simulado: false,
}));

const oyentes = new Set<(p: Posicion) => void>();
/** Quien llama recibe cada lectura del GPS (real o simulado). Devuelve cómo dejar de recibirlas. */
export function alRecibirPosicion(fn: (p: Posicion) => void): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function publicar(p: Posicion): void {
  useUbicacion.setState({ posicion: p, estado: 'ok' });
  for (const fn of oyentes) fn(p);
}

let vigilancia: number | null = null;
let simulador: GpsSimulado | null = null;

export function simuladorActivo(): GpsSimulado | null {
  return simulador;
}

/** Enciende el GPS: el del teléfono, o el simulado si está activado en los ajustes. */
export function encenderGps(): void {
  apagarGps();
  const { gpsSimulado, velocidadSimulada } = useAjustes.getState();

  if (gpsSimulado) {
    const previo = useUbicacion.getState().posicion;
    simulador = new GpsSimulado(
      previo && useUbicacion.getState().simulado ? previo : CENTRO_MANIZALES,
      publicar,
      velocidadSimulada,
    );
    useUbicacion.setState({ simulado: true, estado: 'buscando' });
    simulador.arrancar();
    return;
  }

  useUbicacion.setState({ simulado: false, estado: 'buscando' });
  if (!('geolocation' in navigator)) {
    useUbicacion.setState({ estado: 'no_disponible' });
    return;
  }
  vigilancia = navigator.geolocation.watchPosition(
    (g) =>
      publicar({
        lat: g.coords.latitude,
        lng: g.coords.longitude,
        t: g.timestamp,
        precisionM: g.coords.accuracy,
        // la velocidad del dispositivo viene en m/s
        velocidadKmh:
          g.coords.speed !== null && Number.isFinite(g.coords.speed) ? g.coords.speed * 3.6 : null,
        rumbo:
          g.coords.heading !== null && Number.isFinite(g.coords.heading) ? g.coords.heading : null,
      }),
    (e) =>
      useUbicacion.setState({
        estado: e.code === e.PERMISSION_DENIED ? 'sin_permiso' : 'buscando',
      }),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
  );
}

export function apagarGps(): void {
  if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
  vigilancia = null;
  simulador?.detener();
  simulador = null;
  useUbicacion.setState({ estado: 'apagado' });
}
