export interface Coordenada {
  lat: number;
  lng: number;
}

const RADIO_TIERRA_M = 6_371_008.8;
const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/** Distancia en metros entre dos coordenadas (fórmula de haversine). */
export function distanciaMetros(a: Coordenada, b: Coordenada): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de `a` hacia `b` en grados, de 0 (norte) a 359, en el sentido de las agujas del reloj. */
export function rumboGrados(a: Coordenada, b: Coordenada): number {
  const lat1 = aRadianes(a.lat);
  const lat2 = aRadianes(b.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360;
}

export function estaEnRadio(a: Coordenada, b: Coordenada, radioM: number): boolean {
  return distanciaMetros(a, b) <= radioM;
}

/** Punto a `distanciaM` metros de `origen` en dirección `rumbo` (grados). Útil para simular recorridos. */
export function desplazar(origen: Coordenada, distanciaM: number, rumbo: number): Coordenada {
  const delta = distanciaM / RADIO_TIERRA_M;
  const theta = aRadianes(rumbo);
  const lat1 = aRadianes(origen.lat);
  const lng1 = aRadianes(origen.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}
