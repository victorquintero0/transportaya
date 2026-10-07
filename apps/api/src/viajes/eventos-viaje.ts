import { viajeEvento } from '@transportaya/db';
import type { Coordenada } from '@transportaya/dominio';
import type { DbOTx } from '../bd/bd.module.js';

type ActorTipo = 'pasajero' | 'conductor' | 'operacion' | 'sistema';

/**
 * Anota un hecho del viaje en su línea de tiempo (inmutable). De aquí salen la reconstrucción del viaje y los
 * indicadores de tiempos y movimientos (OPE-03).
 */
export async function registrarEvento(
  db: DbOTx,
  e: {
    viajeId: string;
    tipo: string;
    actorTipo: ActorTipo;
    actorId?: string | null;
    ubicacion?: Coordenada | null;
    datos?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(viajeEvento).values({
    viajeId: e.viajeId,
    tipo: e.tipo,
    actorTipo: e.actorTipo,
    actorId: e.actorId ?? null,
    ubicacion: e.ubicacion ?? null,
    datos: e.datos ?? {},
  });
}

/** Barrio o zona de una dirección: lo que va después de la última coma. El destino exacto no se muestra antes de aceptar (D-11). */
export function zonaDeDireccion(direccion: string | null | undefined): string {
  if (!direccion) return 'Destino por confirmar';
  const partes = direccion
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return partes.length > 1 ? (partes[partes.length - 1] as string) : 'Destino por confirmar';
}

/** Primer nombre: lo único que el conductor ve del pasajero. */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}
