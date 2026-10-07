import { create } from 'zustand';
import type { Mensaje } from '../lib/tipos.ts';

/** Mensajes del pasajero durante el viaje (PAS-32). */
interface Chat {
  viajeId: string | null;
  mensajes: Mensaje[];
  noLeidos: number;
  abierto: boolean;
  ponerMensajes: (viajeId: string, m: Mensaje[]) => void;
  llego: (m: Mensaje) => void;
  abrir: (abierto: boolean) => void;
}

export const useChat = create<Chat>((set) => ({
  viajeId: null,
  mensajes: [],
  noLeidos: 0,
  abierto: false,
  ponerMensajes: (viajeId, mensajes) => set({ viajeId, mensajes }),
  llego: (m) =>
    set((s) => {
      if (s.mensajes.some((x) => x.id === m.id)) return s;
      const propio = m.deQuien === 'conductor';
      return {
        viajeId: m.viajeId,
        mensajes: s.viajeId === m.viajeId ? [...s.mensajes, m] : [m],
        noLeidos: propio || s.abierto ? s.noLeidos : s.noLeidos + 1,
      };
    }),
  abrir: (abierto) => set((s) => ({ abierto, noLeidos: abierto ? 0 : s.noLeidos })),
}));
