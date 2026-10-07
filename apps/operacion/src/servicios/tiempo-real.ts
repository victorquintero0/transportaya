import { api, avisar, useSesion } from '@transportaya/ui';
import type { QueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { useAjustes } from '../estado/ajustes.ts';
import { TIPO_ALERTA } from '../lib/etiquetas.ts';

interface Conexion {
  conectado: boolean;
  poner: (c: boolean) => void;
}
export const useConexion = create<Conexion>((set) => ({
  conectado: false,
  poner: (conectado) => set({ conectado }),
}));

let socket: Socket | null = null;

/** Un pitido corto para las alertas nuevas, hecho con Web Audio: no hay archivos de sonido que cargar. */
function pitido(urgente: boolean): void {
  if (!useAjustes.getState().sonido) return;
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = urgente ? 880 : 660;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (urgente ? 0.7 : 0.35));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.8);
    o.onended = () => void ctx.close();
  } catch {
    // sin audio disponible: la alerta igual aparece en pantalla
  }
}

/** Mantiene la torre al día: el servidor avisa cuando algo cambia y la pantalla vuelve a pedir los datos. */
export function conectarOperacion(qc: QueryClient): () => void {
  desconectar();
  const s = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: useSesion.getState().accessToken ?? '' }),
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
  });
  socket = s;
  s.on('connect', () => useConexion.getState().poner(true));
  s.on('disconnect', () => useConexion.getState().poner(false));
  s.on('error:autenticacion', () => {
    void api
      .get('/v1/op/yo')
      .catch(() => undefined)
      .finally(() => {
        if (socket === s && useSesion.getState().accessToken) s.connect();
      });
  });
  s.on('torre:cambio', () => {
    void qc.invalidateQueries({ queryKey: ['torre'] });
    void qc.invalidateQueries({ queryKey: ['viaje'] });
  });
  s.on('alerta:nueva', (a: { tipo: string; severidad: string }) => {
    const urgente = a.severidad === 'critica';
    pitido(urgente);
    avisar(
      `Alerta ${urgente ? 'crítica' : 'nueva'}: ${TIPO_ALERTA[a.tipo] ?? a.tipo}`,
      urgente ? 'error' : 'info',
    );
    void qc.invalidateQueries({ queryKey: ['torre'] });
  });
  s.on('alerta:actualizada', () => void qc.invalidateQueries({ queryKey: ['torre'] }));
  return desconectar;
}

export function desconectar(): void {
  socket?.close();
  socket = null;
  useConexion.getState().poner(false);
}
