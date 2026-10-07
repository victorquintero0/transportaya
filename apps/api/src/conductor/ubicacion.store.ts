import { Injectable } from '@nestjs/common';

export interface UltimaUbicacion {
  lat: number;
  lng: number;
  /** Instante de la lectura del GPS. */
  instanteMs: number;
  /** Cuándo llegó al servidor. */
  recibidaMs: number;
  precisionM: number | null;
}

/**
 * Última posición conocida de cada conductor, para el despacho y la detección de pérdida de señal.
 * Vive en memoria de un solo proceso; en producción será Redis (docs/08, ADR-0004).
 */
@Injectable()
export class UbicacionStore {
  private readonly porConductor = new Map<string, UltimaUbicacion>();
  private readonly conexiones = new Map<string, number>();

  actualizar(conductorId: string, u: UltimaUbicacion): void {
    const actual = this.porConductor.get(conductorId);
    if (!actual || u.instanteMs >= actual.instanteMs) this.porConductor.set(conductorId, u);
  }

  obtener(conductorId: string): UltimaUbicacion | undefined {
    return this.porConductor.get(conductorId);
  }

  /** Al conectarse sin posición todavía cuenta desde ahora como "última señal", para no marcarlo sin señal de inmediato. */
  marcarConexion(conductorId: string, ahoraMs = Date.now()): void {
    this.conexiones.set(conductorId, ahoraMs);
  }

  /** Última vez que supimos algo del conductor: su última posición o el momento en que se conectó. */
  ultimaSenalMs(conductorId: string): number | undefined {
    const u = this.porConductor.get(conductorId)?.recibidaMs;
    const c = this.conexiones.get(conductorId);
    return u === undefined ? c : c === undefined ? u : Math.max(u, c);
  }

  olvidar(conductorId: string): void {
    this.porConductor.delete(conductorId);
    this.conexiones.delete(conductorId);
  }

  /** Conductores cuya última lectura llegó hace menos de `maxEdadMs`. */
  recientes(maxEdadMs: number, ahoraMs = Date.now()): [string, UltimaUbicacion][] {
    return [...this.porConductor].filter(([, u]) => ahoraMs - u.recibidaMs <= maxEdadMs);
  }
}
