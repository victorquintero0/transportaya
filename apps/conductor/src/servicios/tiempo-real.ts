import { io, type Socket } from 'socket.io-client';
import { api } from '@transportaya/ui';
import { useSesion } from '@transportaya/ui';
import type { Mensaje, Oferta } from '../lib/tipos.ts';

/** Eventos que manda el servidor (docs/10). */
export interface EventosServidor {
  'oferta:nueva': (o: Oferta) => void;
  'oferta:retirada': (d: {
    ofertaId: string;
    viajeId: string;
    motivo: 'expirada' | 'cancelada' | 'tomada';
  }) => void;
  'viaje:estado': (d: { viajeId: string; estado: string }) => void;
  'conductor:estado': (d: { estadoOperativo: string; motivo?: string }) => void;
  'viaje:mensaje': (m: Mensaje) => void;
}

let socket: Socket | null = null;

export function socketEnVivo(): Socket | null {
  return socket;
}

export function conectarEnVivo(
  oyentes: Partial<EventosServidor> & { alCambiarConexion: (conectado: boolean) => void },
): void {
  desconectarEnVivo();
  const s = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    // el token se lee en cada intento, así tras un refresco se reconecta con el nuevo
    auth: (cb) => cb({ token: useSesion.getState().accessToken ?? '' }),
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
  });
  socket = s;

  s.on('connect', () => oyentes.alCambiarConexion(true));
  s.on('disconnect', () => oyentes.alCambiarConexion(false));
  s.on('error:autenticacion', () => {
    // el token venció: una petición cualquiera lo refresca y luego se reconecta
    void api
      .get('/v1/conductor/yo')
      .catch(() => undefined)
      .finally(() => {
        if (socket === s && useSesion.getState().accessToken) s.connect();
      });
  });

  for (const [nombre, fn] of Object.entries(oyentes)) {
    if (nombre !== 'alCambiarConexion' && fn) s.on(nombre, fn as (...args: unknown[]) => void);
  }
}

export function desconectarEnVivo(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
