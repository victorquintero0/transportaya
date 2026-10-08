import type { ConfigMapaPublica } from '@transportaya/dominio';
import { create } from 'zustand';
import { api } from '../lib/api.ts';

/** Mientras no se sabe qué mapa usar se arranca con el esquemático: nunca hay que esperar a la red para ver algo. */
interface EstadoConfigMapa {
  config: ConfigMapaPublica | null;
  cargada: boolean;
  poner: (c: ConfigMapaPublica | null) => void;
}

export const useConfigMapa = create<EstadoConfigMapa>((set) => ({
  config: null,
  cargada: false,
  poner: (config) => set({ config, cargada: true }),
}));

/**
 * Pide al servidor qué proveedor de mapa usar (se cambia desde la App Operación, sin tocar código). Si falla, las apps
 * siguen con el mapa esquemático.
 */
export async function cargarConfigMapa(): Promise<void> {
  try {
    useConfigMapa.getState().poner(await api.get<ConfigMapaPublica>('/v1/mapa/config'));
  } catch {
    useConfigMapa.getState().poner(null);
  }
}
