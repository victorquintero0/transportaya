import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tema = 'auto' | 'oscuro' | 'claro';

interface Ajustes {
  sonido: boolean;
  vibracion: boolean;
  tema: Tema;
  /** Meta de ganancias del día en pesos: el anillo de la pantalla de inicio. Es solo una guía personal. */
  metaDia: number;
  /** Modo demostración: un GPS inventado que se mueve solo, para probar sin salir a manejar. */
  gpsSimulado: boolean;
  velocidadSimulada: 1 | 2 | 4;
  cambiar: (parcial: Partial<Omit<Ajustes, 'cambiar'>>) => void;
}

export const useAjustes = create<Ajustes>()(
  persist(
    (set) => ({
      sonido: true,
      vibracion: true,
      tema: 'auto',
      metaDia: 150_000,
      gpsSimulado: false,
      velocidadSimulada: 2,
      cambiar: (parcial) => set(parcial),
    }),
    { name: 'ty.ajustes' },
  ),
);
