import { create } from 'zustand';

/** Plaza de Bolívar de Manizales: punto de partida cuando no tenemos la ubicación del pasajero. */
export const CENTRO_MANIZALES = { lat: 5.0689, lng: -75.5174 };

export type EstadoUbicacion = 'sin_pedir' | 'buscando' | 'ok' | 'sin_permiso' | 'no_disponible';

interface Ubicacion {
  posicion: { lat: number; lng: number; precisionM: number | null } | null;
  estado: EstadoUbicacion;
  /** Pide la ubicación una vez (PAS-20). Solo se llama cuando el pasajero va a fijar su origen, no al abrir la app. */
  pedir: () => Promise<void>;
}

export const useUbicacion = create<Ubicacion>((set, get) => ({
  posicion: null,
  estado: 'sin_pedir',
  pedir: async () => {
    if (get().estado === 'buscando') return;
    if (!('geolocation' in navigator)) {
      set({ estado: 'no_disponible' });
      return;
    }
    set({ estado: 'buscando' });
    await new Promise<void>((resolver) => {
      navigator.geolocation.getCurrentPosition(
        (g) => {
          set({
            posicion: {
              lat: g.coords.latitude,
              lng: g.coords.longitude,
              precisionM: g.coords.accuracy,
            },
            estado: 'ok',
          });
          resolver();
        },
        (e) => {
          set({ estado: e.code === e.PERMISSION_DENIED ? 'sin_permiso' : 'no_disponible' });
          resolver();
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    });
  },
}));
