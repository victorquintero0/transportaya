import { create } from 'zustand';

export interface Aviso {
  id: number;
  tipo: 'info' | 'exito' | 'error';
  texto: string;
}

interface Avisos {
  lista: Aviso[];
  mostrar: (texto: string, tipo?: Aviso['tipo']) => void;
  quitar: (id: number) => void;
}

let siguiente = 1;

/** Avisos breves que flotan arriba de la pantalla. */
export const useAvisos = create<Avisos>((set, get) => ({
  lista: [],
  mostrar: (texto, tipo = 'info') => {
    const id = siguiente++;
    set((s) => ({ lista: [...s.lista.slice(-2), { id, tipo, texto }] }));
    window.setTimeout(() => get().quitar(id), 4200);
  },
  quitar: (id) => set((s) => ({ lista: s.lista.filter((a) => a.id !== id) })),
}));

export const avisar = (texto: string, tipo: Aviso['tipo'] = 'info') =>
  useAvisos.getState().mostrar(texto, tipo);
