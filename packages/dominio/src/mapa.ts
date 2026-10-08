/**
 * Proveedores de mapa que la App Operación puede elegir sin tocar código (ADR-0009). Todos entregan un «estilo» de
 * MapLibre (un archivo `style.json`); el servidor guarda cuál se usa y las apps lo leen al abrir.
 */
export const PROVEEDORES_MAPA = [
  'openfreemap',
  'maptiler',
  'personalizado',
  'esquematico',
] as const;
export type ProveedorMapa = (typeof PROVEEDORES_MAPA)[number];

export interface PresetMapa {
  nombre: string;
  descripcion: string;
  /** Estilo para el tema claro. Puede llevar `{clave}`, que el servidor reemplaza por la clave guardada. */
  estilo: string | null;
  /** Estilo para el tema oscuro. Si no hay, las apps oscurecen el claro. */
  estiloOscuro: string | null;
  requiereClave: boolean;
}

export const PRESETS_MAPA: Record<ProveedorMapa, PresetMapa> = {
  openfreemap: {
    nombre: 'OpenFreeMap',
    descripcion: 'Gratis, sin clave ni tarjeta, con datos de OpenStreetMap.',
    estilo: 'https://tiles.openfreemap.org/styles/positron',
    estiloOscuro: null,
    requiereClave: false,
  },
  maptiler: {
    nombre: 'MapTiler',
    descripcion: 'Requiere una clave de MapTiler (tiene plan gratis y planes de pago).',
    estilo: 'https://api.maptiler.com/maps/streets-v2/style.json?key={clave}',
    estiloOscuro: 'https://api.maptiler.com/maps/streets-v2-dark/style.json?key={clave}',
    requiereClave: true,
  },
  personalizado: {
    nombre: 'Otro proveedor (estilo MapLibre)',
    descripcion:
      'Cualquier servicio que entregue un style.json compatible con MapLibre. La clave, si la pide, va como {clave} en la dirección.',
    estilo: null,
    estiloOscuro: null,
    requiereClave: false,
  },
  esquematico: {
    nombre: 'Mapa esquemático (sin internet)',
    descripcion: 'Cuadrícula sin calles. Sirve de respaldo y para pruebas.',
    estilo: null,
    estiloOscuro: null,
    requiereClave: false,
  },
};

/** Estilos de OpenFreeMap que se pueden elegir con un clic. */
export const ESTILOS_OPENFREEMAP = [
  {
    id: 'positron',
    nombre: 'Claro y limpio (recomendado)',
    url: 'https://tiles.openfreemap.org/styles/positron',
  },
  { id: 'liberty', nombre: 'Colorido', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'bright', nombre: 'Brillante', url: 'https://tiles.openfreemap.org/styles/bright' },
] as const;

/** Lo que las apps reciben: las direcciones ya con la clave puesta, o `null` si usan el mapa esquemático. */
export interface ConfigMapaPublica {
  proveedor: ProveedorMapa;
  estilo: string | null;
  estiloOscuro: string | null;
}

/**
 * Acepta solo direcciones seguras: HTTPS, o HTTP en la propia máquina para desarrollo. Evita que alguien ponga
 * `javascript:` u otros esquemas en la configuración que las apps cargan.
 */
export function urlEstiloValida(url: string): boolean {
  if (url.length > 600 || /[\s<>"']/.test(url.replace('{clave}', 'x'))) return false;
  if (/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d+)?(\/|$)/i.test(url)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

export function ponerClave(url: string | null, clave: string | null): string | null {
  if (!url) return null;
  return url.replaceAll('{clave}', encodeURIComponent(clave ?? ''));
}
