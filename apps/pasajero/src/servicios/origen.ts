import { api } from '@transportaya/ui';
import { usePedido } from '../estado/pedido.ts';
import { useUbicacion } from './ubicacion.ts';

/** Le pone nombre a un punto del mapa (PAS-20). */
export async function nombrarPunto(lat: number, lng: number) {
  const r = await api.get<{ titulo: string; subtitulo: string; direccion: string }>(
    `/v1/pasajero/lugares/inversa?lat=${lat}&lng=${lng}`,
  );
  return { lat, lng, titulo: r.titulo, direccion: r.direccion };
}

/**
 * Pide la ubicación del teléfono y la deja como punto de recogida. Devuelve `false` si el pasajero no la dio: en ese
 * caso la app le pide que escriba dónde está.
 */
export async function fijarOrigenDesdeGps(): Promise<boolean> {
  await useUbicacion.getState().pedir();
  const u = useUbicacion.getState().posicion;
  if (!u) return false;
  usePedido.getState().ponerOrigen(await nombrarPunto(u.lat, u.lng));
  return true;
}
