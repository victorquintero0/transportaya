import { create } from 'zustand';
import type { Mensaje } from '../lib/tipos.ts';

/** Lo que llega en vivo mientras hay un viaje: dónde va el conductor y los mensajes del chat. */
interface Seguimiento {
  viajeId: string | null;
  posicion: { lat: number; lng: number; rumbo: number | null; t: number } | null;
  etaS: number | null;
  distanciaM: number | null;
  mensajes: Mensaje[];
  noLeidos: number;
  conectadoEnVivo: boolean;
  /** Se acabó el tiempo de búsqueda sin que nadie aceptara: la app lo explica y deja reintentar. */
  sinConductor: boolean;
  ponerSinConductor: (v: boolean) => void;
  ponerPosicion: (p: {
    viajeId: string;
    lat: number;
    lng: number;
    rumbo: number | null;
    t: number;
    etaS: number;
    distanciaM: number;
  }) => void;
  ponerMensajes: (viajeId: string, m: Mensaje[]) => void;
  llegoMensaje: (m: Mensaje, leido: boolean) => void;
  marcarLeidos: () => void;
  ponerEnVivo: (c: boolean) => void;
  reiniciar: () => void;
}

export const useSeguimiento = create<Seguimiento>((set) => ({
  viajeId: null,
  posicion: null,
  etaS: null,
  distanciaM: null,
  mensajes: [],
  noLeidos: 0,
  conectadoEnVivo: false,
  sinConductor: false,
  ponerSinConductor: (sinConductor) => set({ sinConductor }),
  ponerPosicion: (p) =>
    set((s) => ({
      viajeId: p.viajeId,
      mensajes: s.viajeId === p.viajeId ? s.mensajes : [],
      posicion: { lat: p.lat, lng: p.lng, rumbo: p.rumbo, t: p.t },
      etaS: p.etaS,
      distanciaM: p.distanciaM,
    })),
  ponerMensajes: (viajeId, mensajes) => set({ viajeId, mensajes }),
  llegoMensaje: (m, leido) =>
    set((s) =>
      s.mensajes.some((x) => x.id === m.id)
        ? s
        : { mensajes: [...s.mensajes, m], noLeidos: leido ? s.noLeidos : s.noLeidos + 1 },
    ),
  marcarLeidos: () => set({ noLeidos: 0 }),
  ponerEnVivo: (conectadoEnVivo) => set({ conectadoEnVivo }),
  reiniciar: () =>
    set({ viajeId: null, posicion: null, etaS: null, distanciaM: null, mensajes: [], noLeidos: 0 }),
}));
