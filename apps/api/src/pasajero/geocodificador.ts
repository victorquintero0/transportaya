import { desplazar, distanciaMetros, rumboGrados, type Coordenada } from '@transportaya/dominio';
import { LUGARES_MANIZALES, type LugarConocido, type TipoLugar } from './lugares-manizales.js';

export interface ResultadoLugar {
  id: string;
  titulo: string;
  subtitulo: string;
  /** Barrio o zona: lo único del destino que ve el conductor antes de aceptar (D-11). */
  barrio: string;
  /** Texto que se guarda en el viaje: termina en el barrio. */
  direccion: string;
  tipo: TipoLugar | 'direccion';
  lat: number;
  lng: number;
  /** Las direcciones se ubican con una cuadrícula aproximada hasta tener el servicio de OpenStreetMap. */
  aproximada: boolean;
}

/** Minúsculas, sin tildes y con espacios limpios, para comparar "Éxito" con "exito". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aResultado(l: LugarConocido): ResultadoLugar {
  return {
    id: l.id,
    titulo: l.nombre,
    subtitulo: l.barrio === l.nombre ? 'Manizales' : `${l.barrio}, Manizales`,
    barrio: l.barrio,
    direccion: l.barrio === l.nombre ? l.nombre : `${l.nombre}, ${l.barrio}`,
    tipo: l.tipo,
    lat: l.lat,
    lng: l.lng,
    aproximada: false,
  };
}

/**
 * Cuadrícula de Manizales: Catedral es la carrera 23 con calle 22. Las calles suben hacia el sur-oriente (Palogrande,
 * Cable) y las carreras hacia el sur-occidente. Cada número son unos 80 m. Es una aproximación para pruebas.
 */
const CATEDRAL: Coordenada = { lat: 5.0689, lng: -75.5174 };
const M_POR_CALLE = 80;
const M_POR_CARRERA = 75;
const RUMBO_CALLES = 125;
const RUMBO_CARRERAS = 215;

export function ubicarEnCuadricula(calle: number, carrera: number, placa = 0): Coordenada {
  const sobreCarrera = desplazar(CATEDRAL, (carrera - 23) * M_POR_CARRERA, RUMBO_CARRERAS);
  return desplazar(
    sobreCarrera,
    (calle - 22) * M_POR_CALLE + (placa / 100) * M_POR_CALLE,
    RUMBO_CALLES,
  );
}

/** Dirección aproximada de un punto, con el mismo estilo de la cuadrícula: "Cra 23 # 62". */
export function direccionAproximada(c: Coordenada): string {
  const d = distanciaMetros(CATEDRAL, c);
  const rumbo = (rumboGrados(CATEDRAL, c) * Math.PI) / 180;
  const calleDir = (RUMBO_CALLES * Math.PI) / 180;
  const carreraDir = (RUMBO_CARRERAS * Math.PI) / 180;
  const sobreCalle = d * Math.cos(rumbo - calleDir);
  const sobreCarrera = d * Math.cos(rumbo - carreraDir);
  const calle = Math.max(1, Math.round(22 + sobreCalle / M_POR_CALLE));
  const carrera = Math.max(1, Math.round(23 + sobreCarrera / M_POR_CARRERA));
  return `Cra ${carrera} # ${calle}`;
}

const VIAS: Record<string, 'calle' | 'carrera'> = {
  cl: 'calle',
  cll: 'calle',
  calle: 'calle',
  av: 'calle',
  avenida: 'calle',
  cra: 'carrera',
  cr: 'carrera',
  kr: 'carrera',
  carrera: 'carrera',
  dg: 'calle',
  diagonal: 'calle',
  tv: 'carrera',
  transversal: 'carrera',
};

/** "Cra 23 # 62-14", "calle 65 no 23 - 10", "cl 22 23-45": direcciones al estilo colombiano. */
export function interpretarDireccion(texto: string): ResultadoLugar | null {
  const t = normalizar(texto);
  const m = t.match(
    /^([a-z]+)\s*(\d{1,3})\s*[a-z]?\s*(?:#|no|n)?\s*(\d{1,3})\s*[a-z]?\s*-?\s*(\d{1,3})?$/,
  );
  if (!m) return null;
  const tipo = VIAS[m[1]!];
  if (!tipo) return null;
  const principal = Number(m[2]);
  const secundaria = Number(m[3]);
  const placa = m[4] ? Number(m[4]) : 0;
  const calle = tipo === 'calle' ? principal : secundaria;
  const carrera = tipo === 'carrera' ? principal : secundaria;
  if (calle < 1 || calle > 120 || carrera < 1 || carrera > 80) return null;
  const punto = ubicarEnCuadricula(calle, carrera, placa);
  const etiqueta = `${tipo === 'calle' ? 'Cl' : 'Cra'} ${principal} # ${secundaria}${m[4] ? `-${m[4]}` : ''}`;
  const barrio = barrioMasCercano(punto);
  return {
    id: `dir:${calle}:${carrera}:${placa}`,
    titulo: etiqueta,
    subtitulo: `${barrio}, Manizales`,
    barrio,
    direccion: `${etiqueta}, ${barrio}`,
    tipo: 'direccion',
    lat: punto.lat,
    lng: punto.lng,
    aproximada: true,
  };
}

/** Busca por nombre, alias o barrio. Lo más cercano a `cerca` sale primero entre los que coinciden igual. */
export function buscarLugares(texto: string, cerca?: Coordenada, limite = 8): ResultadoLugar[] {
  const q = normalizar(texto);
  const resultados: ResultadoLugar[] = [];
  const direccion = interpretarDireccion(texto);
  if (direccion) resultados.push(direccion);
  if (q.length < 2) return resultados;

  const palabras = q.split(' ');
  const puntuar = (l: LugarConocido): number => {
    const nombre = normalizar(l.nombre);
    const alias = (l.alias ?? []).map(normalizar);
    const barrio = normalizar(l.barrio);
    let puntos = 0;
    if (nombre === q || alias.includes(q)) puntos += 100;
    if (nombre.startsWith(q) || alias.some((a) => a.startsWith(q))) puntos += 60;
    if (palabras.every((p) => nombre.includes(p) || alias.some((a) => a.includes(p)))) puntos += 40;
    else if (
      palabras.every(
        (p) => nombre.includes(p) || barrio.includes(p) || alias.some((a) => a.includes(p)),
      )
    )
      puntos += 15;
    return puntos;
  };

  const coincidencias = LUGARES_MANIZALES.map((l) => ({ l, p: puntuar(l) }))
    .filter((x) => x.p > 0)
    .sort(
      (a, b) =>
        b.p - a.p ||
        (cerca ? distanciaMetros(cerca, a.l) - distanciaMetros(cerca, b.l) : 0) ||
        a.l.nombre.localeCompare(b.l.nombre, 'es'),
    );
  for (const { l } of coincidencias) resultados.push(aResultado(l));
  return resultados.slice(0, limite);
}

/** Qué hay cerca de un punto (para ponerle nombre al pin del mapa). */
export function lugarMasCercano(c: Coordenada, maxM = 350): ResultadoLugar | null {
  let mejor: { l: LugarConocido; d: number } | null = null;
  for (const l of LUGARES_MANIZALES) {
    if (l.tipo === 'barrio') continue;
    const d = distanciaMetros(c, l);
    if (d <= maxM && (!mejor || d < mejor.d)) mejor = { l, d };
  }
  return mejor ? aResultado(mejor.l) : null;
}

/** Barrio conocido más cercano: da la "zona" de cualquier punto de la ciudad (D-11). */
export function barrioMasCercano(c: Coordenada): string {
  let mejor: { l: LugarConocido; d: number } | null = null;
  for (const l of LUGARES_MANIZALES) {
    if (l.tipo !== 'barrio') continue;
    const d = distanciaMetros(c, l);
    if (!mejor || d < mejor.d) mejor = { l, d };
  }
  return mejor?.l.barrio ?? 'Manizales';
}
