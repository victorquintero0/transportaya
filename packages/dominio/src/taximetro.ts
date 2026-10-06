import { distanciaMetros, type Coordenada } from './geo.js';

/** Un punto del GPS del conductor. */
export interface PuntoGps extends Coordenada {
  /** Instante de la lectura, en milisegundos desde 1970. */
  instanteMs: number;
  /** Precisión horizontal reportada por el dispositivo, en metros. */
  precisionM?: number | null;
  /** Velocidad que reporta el dispositivo (efecto Doppler: más fiable que la calculada). */
  velocidadKmh?: number | null;
}

/**
 * Umbrales del taxímetro (RN-015, D-24). Los valores por defecto son propuestas que se calibran
 * con los datos del piloto.
 */
export interface ParametrosTaximetro {
  /** Se descartan lecturas menos precisas que esto. */
  precisionMaximaM: number;
  /** Un salto más rápido que esto entre dos lecturas es un error del GPS y se descarta. */
  velocidadMaximaKmh: number;
  /** Por debajo de esta velocidad el vehículo se considera detenido. */
  umbralDetenidoKmh: number;
  /** El vehículo debe estar detenido al menos este tiempo para que cuente como tiempo detenido. */
  segundosParaDetenido: number;
  /** Una pausa sin lecturas mayor a esto es un tramo sin señal. */
  huecoMaximoS: number;
  /** Menor movimiento que esto es ruido del GPS, no desplazamiento. */
  movimientoMinimoM: number;
  /** Factor con que se corrige la distancia en línea recta de un tramo sin señal (1 = sin corrección). */
  factorHuecos: number;
}

export const TAXIMETRO_POR_DEFECTO: ParametrosTaximetro = {
  precisionMaximaM: 100,
  velocidadMaximaKmh: 200,
  umbralDetenidoKmh: 3,
  segundosParaDetenido: 10,
  huecoMaximoS: 60,
  movimientoMinimoM: 3,
  factorHuecos: 1,
};

export interface ResumenTaximetro {
  /** Metros recorridos, incluidos los tramos sin señal estimados en línea recta. */
  distanciaM: number;
  /** Segundos entre la primera y la última lectura aceptada. */
  duracionS: number;
  /** Segundos detenido, ya sea en semáforos, trancones o esperando. Es lo que se cobra por minuto. */
  tiempoDetenidoS: number;
  /** Parte de `distanciaM` que se estimó en tramos sin señal. */
  distanciaEnHuecosM: number;
  /** Segundos sin lecturas del GPS. */
  segundosSinSenal: number;
  puntosUsados: number;
  puntosDescartados: number;
}

/**
 * Taxímetro por GPS. Va recibiendo lecturas en orden y puede consultarse en cualquier momento,
 * así la app muestra el valor en vivo y el servidor repite el cálculo con la trayectoria guardada.
 */
export class Taximetro {
  private readonly p: ParametrosTaximetro;
  private ultimo: PuntoGps | null = null;
  private primero: PuntoGps | null = null;
  private distanciaM = 0;
  private distanciaEnHuecosM = 0;
  private segundosSinSenal = 0;
  private tiempoDetenidoS = 0;
  /** Segundos seguidos a baja velocidad: solo cuentan si llegan a `segundosParaDetenido`. */
  private corridaDetenidoS = 0;
  private usados = 0;
  private descartados = 0;

  constructor(parametros: Partial<ParametrosTaximetro> = {}) {
    this.p = { ...TAXIMETRO_POR_DEFECTO, ...parametros };
  }

  agregar(punto: PuntoGps): void {
    const { p } = this;
    if ((punto.precisionM ?? 0) > p.precisionMaximaM) {
      this.descartados += 1;
      return;
    }
    const previo = this.ultimo;
    if (!previo) {
      this.primero = punto;
      this.ultimo = punto;
      this.usados += 1;
      return;
    }

    const dt = (punto.instanteMs - previo.instanteMs) / 1000;
    if (dt <= 0) {
      this.descartados += 1; // repetida o fuera de orden
      return;
    }
    const d = distanciaMetros(previo, punto);
    const velocidadCalculada = (d / dt) * 3.6;

    if (velocidadCalculada > p.velocidadMaximaKmh) {
      this.descartados += 1; // salto imposible: error del GPS
      return;
    }

    if (dt > p.huecoMaximoS) {
      this.cerrarCorrida();
      const estimada = d * p.factorHuecos;
      this.segundosSinSenal += dt;
      this.distanciaM += estimada;
      this.distanciaEnHuecosM += estimada;
    } else {
      // Con el dispositivo diciendo la velocidad se confía en ella; si no, se usa la calculada.
      const velocidad = punto.velocidadKmh ?? velocidadCalculada;
      const ruido = d < p.movimientoMinimoM;
      if (velocidad < p.umbralDetenidoKmh || ruido) {
        this.corridaDetenidoS += dt;
      } else {
        this.cerrarCorrida();
        this.distanciaM += d;
      }
    }

    this.ultimo = punto;
    this.usados += 1;
  }

  private cerrarCorrida(): void {
    if (this.corridaDetenidoS >= this.p.segundosParaDetenido) {
      this.tiempoDetenidoS += this.corridaDetenidoS;
    }
    this.corridaDetenidoS = 0;
  }

  resumen(): ResumenTaximetro {
    const corrida =
      this.corridaDetenidoS >= this.p.segundosParaDetenido ? this.corridaDetenidoS : 0;
    const duracion =
      this.primero && this.ultimo ? (this.ultimo.instanteMs - this.primero.instanteMs) / 1000 : 0;
    return {
      distanciaM: Math.round(this.distanciaM),
      duracionS: Math.round(duracion),
      tiempoDetenidoS: Math.round(this.tiempoDetenidoS + corrida),
      distanciaEnHuecosM: Math.round(this.distanciaEnHuecosM),
      segundosSinSenal: Math.round(this.segundosSinSenal),
      puntosUsados: this.usados,
      puntosDescartados: this.descartados,
    };
  }
}

/** Calcula el resumen de una trayectoria completa, por ejemplo la guardada en el servidor. */
export function resumirTrayectoria(
  puntos: readonly PuntoGps[],
  parametros: Partial<ParametrosTaximetro> = {},
): ResumenTaximetro {
  const t = new Taximetro(parametros);
  for (const punto of [...puntos].sort((a, b) => a.instanteMs - b.instanteMs)) t.agregar(punto);
  return t.resumen();
}

export interface Medicion {
  distanciaM: number;
  tiempoDetenidoS: number;
}

export interface ToleranciaTaximetro {
  /** Diferencia relativa que se acepta (RN-015: 10 %). */
  relativa: number;
  /** Diferencia absoluta mínima que siempre se acepta, para que un viaje corto no dispare alertas. */
  distanciaM: number;
  tiempoS: number;
}

export const TOLERANCIA_POR_DEFECTO: ToleranciaTaximetro = {
  relativa: 0.1,
  distanciaM: 200,
  tiempoS: 30,
};

export interface ComparacionMediciones {
  excede: boolean;
  diferenciaDistanciaM: number;
  diferenciaTiempoS: number;
}

/** Compara lo que midió el taxímetro de la app con lo que calcula el servidor (RN-015.3). */
export function compararMediciones(
  taximetro: Medicion,
  servidor: Medicion,
  tolerancia: ToleranciaTaximetro = TOLERANCIA_POR_DEFECTO,
): ComparacionMediciones {
  const dd = Math.abs(taximetro.distanciaM - servidor.distanciaM);
  const dt = Math.abs(taximetro.tiempoDetenidoS - servidor.tiempoDetenidoS);
  const excedeDistancia =
    dd > tolerancia.distanciaM &&
    dd > tolerancia.relativa * Math.max(taximetro.distanciaM, servidor.distanciaM);
  const excedeTiempo =
    dt > tolerancia.tiempoS &&
    dt > tolerancia.relativa * Math.max(taximetro.tiempoDetenidoS, servidor.tiempoDetenidoS);
  return {
    excede: excedeDistancia || excedeTiempo,
    diferenciaDistanciaM: dd,
    diferenciaTiempoS: dt,
  };
}
