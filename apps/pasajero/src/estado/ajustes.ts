import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tema } from '@transportaya/ui';

interface Ajustes {
  sonido: boolean;
  vibracion: boolean;
  tema: Tema;
  cambiar: (parcial: Partial<Omit<Ajustes, 'cambiar'>>) => void;
}

export const useAjustes = create<Ajustes>()(
  persist(
    (set) => ({
      sonido: true,
      vibracion: true,
      tema: 'auto',
      cambiar: (parcial) => set(parcial),
    }),
    { name: 'ty.pasajero.ajustes' },
  ),
);
