import { api, useSesion } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import type { Perfil, Viaje } from './tipos.ts';

export function usePerfil() {
  const hayToken = useSesion((s) => s.accessToken !== null);
  return useQuery({
    enabled: hayToken,
    queryKey: ['perfil'],
    queryFn: () => api.get<Perfil>('/v1/pasajero/yo'),
    staleTime: 15_000,
  });
}

/** El viaje activo, o el que acaba de terminar y falta calificar. `null` si no hay ninguno. */
export function useViajeActual() {
  const hayToken = useSesion((s) => s.accessToken !== null);
  return useQuery({
    enabled: hayToken,
    queryKey: ['viaje-actual'],
    queryFn: async () =>
      (await api.get<{ viaje: Viaje | null }>('/v1/pasajero/viaje-actual')).viaje,
    staleTime: 5_000,
  });
}

/** ¿El servidor está en modo demostración (conductores y bancos simulados)? */
export function useSimulador(): boolean {
  const { data } = useQuery({
    queryKey: ['salud'],
    queryFn: () => fetch('/v1/salud').then((r) => r.json() as Promise<{ simulador?: boolean }>),
    staleTime: Infinity,
    retry: 1,
  });
  return data?.simulador === true;
}
