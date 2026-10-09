export interface Punto {
  lat: number;
  lng: number;
}

export interface Proyeccion {
  x: (p: Punto) => number;
  y: (p: Punto) => number;
  /** Metros que representa un píxel del dibujo. */
  metrosPorPixel: number;
  /** La coordenada que corresponde a un píxel del dibujo (lo contrario de `x` e `y`). */
  invertir: (x: number, y: number) => Punto;
}

const M_POR_GRADO_LAT = 111_320;

/**
 * Lleva coordenadas a un dibujo plano: todos los puntos caben con un margen, y se mantiene la proporción real
 * (un grado de longitud mide menos que uno de latitud). `minSpanM` evita acercarse tanto que el mapa no diga nada.
 */
export function crearProyeccion(
  puntos: readonly Punto[],
  ancho: number,
  alto: number,
  margen = 48,
  minSpanM = 500,
): Proyeccion {
  const validos = puntos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const base = validos.length > 0 ? validos : [{ lat: 5.0689, lng: -75.5174 }];
  const lats = base.map((p) => p.lat);
  const lngs = base.map((p) => p.lng);
  const centroLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centroLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const kLng = Math.cos((centroLat * Math.PI) / 180) * M_POR_GRADO_LAT;
  const spanXm = Math.max((Math.max(...lngs) - Math.min(...lngs)) * kLng, minSpanM);
  const spanYm = Math.max((Math.max(...lats) - Math.min(...lats)) * M_POR_GRADO_LAT, minSpanM);
  const metrosPorPixel = Math.max(spanXm / (ancho - 2 * margen), spanYm / (alto - 2 * margen));
  return {
    x: (p) => ancho / 2 + ((p.lng - centroLng) * kLng) / metrosPorPixel,
    y: (p) => alto / 2 - ((p.lat - centroLat) * M_POR_GRADO_LAT) / metrosPorPixel,
    metrosPorPixel,
    invertir: (x, y) => ({
      lat: centroLat - ((y - alto / 2) * metrosPorPixel) / M_POR_GRADO_LAT,
      lng: centroLng + ((x - ancho / 2) * metrosPorPixel) / kLng,
    }),
  };
}

/** Una curva suave entre dos puntos del dibujo: sugiere un recorrido sin pretender ser la ruta real. */
export function trazoCurvo(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const largo = Math.hypot(dx, dy) || 1;
  // Se curva hacia un lado, proporcional a la distancia, como una calle que da una vuelta.
  const desvio = Math.min(largo * 0.18, 40);
  const cx = mx - (dy / largo) * desvio;
  const cy = my + (dx / largo) * desvio;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}
