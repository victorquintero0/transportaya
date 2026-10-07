import { useQuery } from '@tanstack/react-query';
import { useSesion } from '../estado/sesion.ts';
import { api } from './api.ts';
import type { Perfil } from './tipos.ts';

export function usePerfil() {
  const hayToken = useSesion((s) => s.accessToken !== null);
  return useQuery({
    enabled: hayToken,
    queryKey: ['perfil'],
    queryFn: () => api.get<Perfil>('/v1/conductor/yo'),
    staleTime: 15_000,
  });
}

/** ¿El servidor está en modo demostración (simulador de pasajeros y de bancos)? */
export function useSimulador(): boolean {
  const { data } = useQuery({
    queryKey: ['salud'],
    queryFn: () => fetch('/v1/salud').then((r) => r.json() as Promise<{ simulador?: boolean }>),
    staleTime: Infinity,
    retry: 1,
  });
  return data?.simulador === true;
}
