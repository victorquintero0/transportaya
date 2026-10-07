import type { Tema } from '@transportaya/ui';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Ajustes {
  sonido: boolean;
  tema: Tema;
  cambiar: (parcial: Partial<Omit<Ajustes, 'cambiar'>>) => void;
}

export const useAjustes = create<Ajustes>()(
  persist(
    (set) => ({
      sonido: true,
      tema: 'oscuro',
      cambiar: (parcial) => set(parcial),
    }),
    { name: 'ty.operacion.ajustes' },
  ),
);
