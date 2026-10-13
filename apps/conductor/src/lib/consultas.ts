import { useQuery } from '@tanstack/react-query';
import { useSesion } from '@transportaya/ui';
import { api, type MovimientoPuntos, type ResumenReferidos } from '@transportaya/ui';
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

/** Los puntos y el código de referidos del conductor (RN-120 a RN-129). */
export function useReferidos() {
  const hayToken = useSesion((s) => s.accessToken !== null);
  return useQuery({
    enabled: hayToken,
    queryKey: ['referidos'],
    queryFn: async () => {
      const [resumen, movimientos] = await Promise.all([
        api.get<ResumenReferidos>('/v1/referidos'),
        api.get<MovimientoPuntos[]>('/v1/referidos/movimientos'),
      ]);
      return { resumen, movimientos };
    },
    staleTime: 15_000,
  });
}
