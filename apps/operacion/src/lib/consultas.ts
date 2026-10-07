import { avisar, api, mensajeDe, useSesion } from '@transportaya/ui';
import { tienePermiso, type Permiso } from '@transportaya/dominio';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PerfilOperador } from './tipos.ts';

export function usePerfilOperador() {
  const hayToken = useSesion((s) => s.accessToken !== null);
  return useQuery({
    enabled: hayToken,
    queryKey: ['yo'],
    queryFn: () => api.get<PerfilOperador>('/v1/op/yo'),
    staleTime: 60_000,
  });
}

/** ¿Tiene la persona este permiso? Lo que no puede hacer no se le muestra. */
export function usePermiso(permiso: Permiso): boolean {
  const { data } = usePerfilOperador();
  return !!data && tienePermiso(data.roles, permiso);
}

/** ¿El servidor está en modo demostración? */
export function useSimulador(): boolean {
  const { data } = useQuery({
    queryKey: ['salud'],
    queryFn: () => fetch('/v1/salud').then((r) => r.json() as Promise<{ simulador?: boolean }>),
    staleTime: Infinity,
    retry: 1,
  });
  return data?.simulador === true;
}

/** Lista de la forma `?a=1&b=2` sin los valores vacíos. */
export function consulta(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

interface OpcionesEjecutar {
  /** Consultas que se vuelven a pedir después de la acción. */
  invalidar?: string[];
  exito?: string;
}

/**
 * Ejecuta una acción de la API, refresca lo que cambió y avisa. Los errores se propagan para que quien llama (por
 * ejemplo el cuadro de motivo) los muestre donde corresponde.
 */
export function useEjecutar() {
  const qc = useQueryClient();
  return async <T>(fn: () => Promise<T>, o: OpcionesEjecutar = {}): Promise<T> => {
    const r = await fn();
    await Promise.all((o.invalidar ?? []).map((k) => qc.invalidateQueries({ queryKey: [k] })));
    if (o.exito) avisar(o.exito, 'exito');
    return r;
  };
}

/** Igual que `useEjecutar`, pero el error se muestra como aviso (para botones sin cuadro propio). */
export function useEjecutarConAviso() {
  const ejecutar = useEjecutar();
  return async <T>(fn: () => Promise<T>, o: OpcionesEjecutar = {}): Promise<T | undefined> => {
    try {
      return await ejecutar(fn, o);
    } catch (e) {
      avisar(mensajeDe(e), 'error');
      return undefined;
    }
  };
}
