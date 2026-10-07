import { Taximetro, type ResumenTaximetro } from '@transportaya/dominio';
import { create } from 'zustand';
import { alRecibirPosicion, type Posicion } from './gps.ts';

/**
 * El taxímetro de la app (D-24): mide la distancia y el tiempo detenido del viaje con el GPS del teléfono.
 * Guarda cada lectura en el dispositivo para no perder el viaje si la app se cierra o se recarga a mitad de camino.
 */

type PuntoGuardado = [
  t: number,
  lat: number,
  lng: number,
  precisionM: number | null,
  velocidadKmh: number | null,
];
interface Guardado {
  viajeId: string;
  desdeMs: number;
  puntos: PuntoGuardado[];
}

const clave = (viajeId: string) => `ty.taximetro.${viajeId}`;
const MAX_PUNTOS = 6000;

function leer(viajeId: string): Guardado | null {
  try {
    const crudo = localStorage.getItem(clave(viajeId));
    return crudo ? (JSON.parse(crudo) as Guardado) : null;
  } catch {
    return null;
  }
}

function escribir(g: Guardado): void {
  try {
    localStorage.setItem(clave(g.viajeId), JSON.stringify(g));
  } catch {
    // sin espacio: el taxímetro sigue en memoria
  }
}

export const VACIO: ResumenTaximetro = {
  distanciaM: 0,
  duracionS: 0,
  tiempoDetenidoS: 0,
  distanciaEnHuecosM: 0,
  segundosSinSenal: 0,
  puntosUsados: 0,
  puntosDescartados: 0,
};

interface EstadoTaximetro {
  viajeId: string | null;
  resumen: ResumenTaximetro;
}

export const useTaximetro = create<EstadoTaximetro>(() => ({ viajeId: null, resumen: VACIO }));

let actual: {
  guardado: Guardado;
  taximetro: Taximetro;
  quitar: () => void;
  sinGuardar: number;
} | null = null;

function alimentar(taximetro: Taximetro, p: PuntoGuardado): void {
  taximetro.agregar({
    instanteMs: p[0],
    lat: p[1],
    lng: p[2],
    precisionM: p[3],
    velocidadKmh: p[4],
  });
}

/** Empieza (o retoma) la medición de un viaje. Es seguro llamarla más de una vez con el mismo viaje. */
export function iniciarTaximetro(viajeId: string, desdeMs: number): void {
  if (actual?.guardado.viajeId === viajeId) return;
  detenerSinBorrar();

  const previo = leer(viajeId);
  const guardado: Guardado = previo ?? { viajeId, desdeMs, puntos: [] };
  const taximetro = new Taximetro();
  for (const p of guardado.puntos) alimentar(taximetro, p);

  const quitar = alRecibirPosicion((p: Posicion) => {
    if (!actual || p.t < actual.guardado.desdeMs) return;
    const punto: PuntoGuardado = [p.t, p.lat, p.lng, p.precisionM, p.velocidadKmh];
    alimentar(actual.taximetro, punto);
    if (actual.guardado.puntos.length < MAX_PUNTOS) actual.guardado.puntos.push(punto);
    actual.sinGuardar += 1;
    if (actual.sinGuardar >= 5) {
      escribir(actual.guardado);
      actual.sinGuardar = 0;
    }
    useTaximetro.setState({ resumen: actual.taximetro.resumen() });
  });

  actual = { guardado, taximetro, quitar, sinGuardar: 0 };
  useTaximetro.setState({ viajeId, resumen: taximetro.resumen() });
}

function detenerSinBorrar(): void {
  if (!actual) return;
  escribir(actual.guardado);
  actual.quitar();
  actual = null;
  useTaximetro.setState({ viajeId: null, resumen: VACIO });
}

/** Termina la medición y devuelve lo que midió, listo para enviar al servidor. Borra lo guardado. */
export function finalizarTaximetro(): ResumenTaximetro {
  const resumen = actual ? actual.taximetro.resumen() : useTaximetro.getState().resumen;
  if (actual) {
    actual.quitar();
    try {
      localStorage.removeItem(clave(actual.guardado.viajeId));
    } catch {
      // nada que borrar
    }
    actual = null;
  }
  useTaximetro.setState({ viajeId: null, resumen: VACIO });
  return resumen;
}

/** Descarta lo guardado de un viaje (cancelado, o que terminó en otro dispositivo). */
export function descartarTaximetro(viajeId: string): void {
  if (actual?.guardado.viajeId === viajeId) {
    actual.quitar();
    actual = null;
    useTaximetro.setState({ viajeId: null, resumen: VACIO });
  }
  try {
    localStorage.removeItem(clave(viajeId));
  } catch {
    // nada que borrar
  }
}
