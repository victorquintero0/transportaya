import { create } from 'zustand';
import type { Cotizacion, MetodoPago, PuntoDeViaje, RutaNacional } from '../lib/tipos.ts';

/** Lo que el pasajero va armando antes de confirmar el viaje. Se pierde al cerrar la app: un viaje no se pide a medias. */
interface Pedido {
  origen: PuntoDeViaje | null;
  destino: PuntoDeViaje | null;
  /** Viaje a otra ciudad con tarifa fija (PAS-26). */
  ruta: { ruta: RutaNacional; modalidad: 'solo_ida' | 'ida_y_vuelta' } | null;
  cotizacion: Cotizacion | null;
  opcionId: string | null;
  metodoPago: MetodoPago;
  nota: string;
  ponerOrigen: (p: PuntoDeViaje | null) => void;
  ponerDestino: (p: PuntoDeViaje | null) => void;
  ponerRuta: (r: Pedido['ruta']) => void;
  ponerCotizacion: (c: Cotizacion | null) => void;
  elegirOpcion: (id: string | null) => void;
  ponerMetodo: (m: MetodoPago) => void;
  ponerNota: (n: string) => void;
  /** Deja el destino y todo lo que dependía de él; conserva el origen. */
  limpiar: () => void;
}

export const usePedido = create<Pedido>((set) => ({
  origen: null,
  destino: null,
  ruta: null,
  cotizacion: null,
  opcionId: null,
  metodoPago: 'efectivo',
  nota: '',
  ponerOrigen: (origen) => set({ origen, cotizacion: null, opcionId: null }),
  ponerDestino: (destino) => set({ destino, ruta: null, cotizacion: null, opcionId: null }),
  ponerRuta: (ruta) =>
    set({
      ruta,
      destino: ruta
        ? {
            lat: ruta.ruta.lat,
            lng: ruta.ruta.lng,
            direccion: `Centro, ${ruta.ruta.destino}`,
            titulo: ruta.ruta.destino,
          }
        : null,
      cotizacion: null,
      opcionId: null,
    }),
  ponerCotizacion: (cotizacion) => set({ cotizacion }),
  elegirOpcion: (opcionId) => set({ opcionId }),
  ponerMetodo: (metodoPago) => set({ metodoPago }),
  ponerNota: (nota) => set({ nota }),
  limpiar: () => set({ destino: null, ruta: null, cotizacion: null, opcionId: null, nota: '' }),
}));
