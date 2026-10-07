/** Abre el destino en las apps de navegación que el conductor ya usa. */
export function enlaceWaze(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function enlaceGoogleMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}
