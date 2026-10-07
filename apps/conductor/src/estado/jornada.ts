import { create } from 'zustand';
import type { Oferta, ResultadoFinalizar, ViajeActual } from '../lib/tipos.ts';

/**
 * Lo que está pasando ahora mismo en la jornada del conductor: la oferta que suena, el viaje en curso y el
 * resumen del último viaje. El estado operativo y el perfil viven en la consulta `['perfil']`.
 */
interface Jornada {
  oferta: Oferta | null;
  viaje: ViajeActual | null;
  /** Viaje que acaba de terminar y espera el cobro y la calificación. */
  resumen: ResultadoFinalizar | null;
  conectadoEnVivo: boolean;
  ponerOferta: (o: Oferta | null) => void;
  ponerViaje: (v: ViajeActual | null) => void;
  ponerResumen: (r: ResultadoFinalizar | null) => void;
  ponerEnVivo: (c: boolean) => void;
  reiniciar: () => void;
}

export const useJornada = create<Jornada>((set) => ({
  oferta: null,
  viaje: null,
  resumen: null,
  conectadoEnVivo: false,
  ponerOferta: (oferta) => set({ oferta }),
  ponerViaje: (viaje) => set({ viaje }),
  ponerResumen: (resumen) => set({ resumen }),
  ponerEnVivo: (conectadoEnVivo) => set({ conectadoEnVivo }),
  reiniciar: () => set({ oferta: null, viaje: null, resumen: null, conectadoEnVivo: false }),
}));
