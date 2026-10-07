import { desplazar, distanciaMetros, rumboGrados, type Coordenada } from '@transportaya/dominio';
import type { Posicion } from './gps.ts';

/** Centro de Manizales (Plaza de Bolívar): punto de partida del conductor de mentira. */
export const CENTRO_MANIZALES: Coordenada = { lat: 5.0703, lng: -75.5138 };

const VELOCIDAD_BASE_KMH = 30;
/** Cada tantos metros recorridos hay un "semáforo" donde se detiene un rato. */
const METROS_ENTRE_PARADAS = 450;
const SEGUNDOS_DE_PARADA = 14;

/**
 * Un GPS inventado para probar la app sin salir a manejar. Se mueve en línea recta hacia el objetivo que se le
 * indique (la recogida y luego el destino), con paradas como las de un semáforo, de modo que el taxímetro
 * mida distancia y tiempo detenido como en un viaje real.
 */
export class GpsSimulado {
  private posicion: Coordenada;
  private objetivo: Coordenada | null = null;
  private conParadas = false;
  private metrosDesdeParada = 0;
  private paradaRestanteS = 0;
  private rumbo = 0;
  private velocidadKmh = 0;
  private timer: number | null = null;
  private ultimo = 0;

  constructor(
    inicio: Coordenada,
    private readonly emitir: (p: Posicion) => void,
    private multiplicador = 1,
  ) {
    this.posicion = inicio;
  }

  arrancar(): void {
    if (this.timer !== null) return;
    this.ultimo = Date.now();
    this.paso(); // la primera lectura sale de inmediato
    this.timer = window.setInterval(() => this.paso(), 1000);
  }

  detener(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  ponerMultiplicador(m: number): void {
    this.multiplicador = m;
  }

  /** Hacia dónde ir; `null` para quedarse quieto. Las paradas solo se hacen con pasajero a bordo. */
  irA(objetivo: Coordenada | null, conParadas = false): void {
    this.objetivo = objetivo;
    this.conParadas = conParadas;
    this.metrosDesdeParada = 0;
    this.paradaRestanteS = 0;
  }

  teletransportar(c: Coordenada): void {
    this.posicion = c;
  }

  actual(): Coordenada {
    return this.posicion;
  }

  private paso(): void {
    const ahora = Date.now();
    const dt = Math.min((ahora - this.ultimo) / 1000, 5);
    this.ultimo = ahora;

    let vKmh = 0;
    if (this.objetivo) {
      const falta = distanciaMetros(this.posicion, this.objetivo);
      if (falta > 8) {
        if (this.paradaRestanteS > 0) {
          this.paradaRestanteS -= dt;
        } else {
          vKmh = VELOCIDAD_BASE_KMH * this.multiplicador;
          const avance = Math.min((vKmh / 3.6) * dt, falta);
          this.rumbo = rumboGrados(this.posicion, this.objetivo);
          this.posicion = desplazar(this.posicion, avance, this.rumbo);
          this.metrosDesdeParada += avance;
          if (
            this.conParadas &&
            this.metrosDesdeParada >= METROS_ENTRE_PARADAS &&
            falta - avance > 150
          ) {
            this.paradaRestanteS = SEGUNDOS_DE_PARADA;
            this.metrosDesdeParada = 0;
          }
        }
      }
    }
    this.velocidadKmh = vKmh;

    // Un poco de ruido, como el de un GPS de verdad (≈ 1–2 m).
    const ruido = desplazar(this.posicion, Math.random() * 1.5, Math.random() * 360);
    this.emitir({
      lat: ruido.lat,
      lng: ruido.lng,
      t: ahora,
      precisionM: 6 + Math.random() * 4,
      velocidadKmh: Math.round(this.velocidadKmh * 10) / 10,
      rumbo: this.rumbo,
    });
  }
}
