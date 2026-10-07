import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Sesion {
  accessToken: string | null;
  refreshToken: string | null;
  usuario: { id: string; nombre: string; telefono: string } | null;
  guardar: (s: { accessToken: string; refreshToken: string; usuario?: Sesion['usuario'] }) => void;
  limpiar: () => void;
}

/** La sesión vive en este dispositivo: el conductor no debería tener que entrar cada vez que abre la app. */
export const useSesion = create<Sesion>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      usuario: null,
      guardar: (s) =>
        set((actual) => ({
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          usuario: s.usuario ?? actual.usuario,
        })),
      limpiar: () => set({ accessToken: null, refreshToken: null, usuario: null }),
    }),
    { name: 'ty.sesion' },
  ),
);
