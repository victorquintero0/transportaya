import { Inject, Injectable, Logger } from '@nestjs/common';
import { MetricasService } from './metricas.service.js';

export interface EstadoTarea {
  nombre: string;
  descripcion: string;
  /** Cada cuánto debería correr. Si pasa el doble de este tiempo sin terminar bien, se considera atrasada. */
  cadaMs: number;
  ejecuciones: number;
  fallos: number;
  ultimaEjecucionEn: string | null;
  ultimoExitoEn: string | null;
  ultimoError: string | null;
  ultimaDuracionMs: number | null;
  atrasada: boolean;
}

interface Interno extends Omit<EstadoTarea, 'atrasada'> {
  registradaEn: number;
  ultimoExito: number | null;
}

/**
 * Registro de las tareas programadas: cuándo corrieron, si fallaron y cuánto tardaron. Una tarea que falla no tumba la
 * API, pero antes pasaba en silencio; ahora queda en el registro, en las métricas y en la pantalla «Sistema».
 */
@Injectable()
export class EstadoTareasService {
  private readonly log = new Logger('Tareas');
  private readonly tareas = new Map<string, Interno>();

  constructor(@Inject(MetricasService) private readonly metricas: MetricasService) {}

  registrar(nombre: string, descripcion: string, cadaMs: number): void {
    if (this.tareas.has(nombre)) return;
    this.tareas.set(nombre, {
      nombre,
      descripcion,
      cadaMs,
      ejecuciones: 0,
      fallos: 0,
      ultimaEjecucionEn: null,
      ultimoExitoEn: null,
      ultimoError: null,
      ultimaDuracionMs: null,
      registradaEn: Date.now(),
      ultimoExito: null,
    });
  }

  /** Corre la tarea y anota cómo le fue. Nunca lanza: el error se registra y se cuenta. */
  async correr<T>(nombre: string, fn: () => Promise<T>): Promise<T | undefined> {
    const t = this.tareas.get(nombre);
    const inicio = Date.now();
    try {
      const r = await fn();
      if (t) {
        t.ejecuciones += 1;
        t.ultimaEjecucionEn = new Date(inicio).toISOString();
        t.ultimoExito = Date.now();
        t.ultimoExitoEn = new Date(t.ultimoExito).toISOString();
        t.ultimaDuracionMs = t.ultimoExito - inicio;
      }
      this.metricas.tarea(nombre, 'ok');
      return r;
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      if (t) {
        t.ejecuciones += 1;
        t.fallos += 1;
        t.ultimaEjecucionEn = new Date(inicio).toISOString();
        t.ultimoError = mensaje.slice(0, 300);
        t.ultimaDuracionMs = Date.now() - inicio;
      }
      this.metricas.tarea(nombre, 'error');
      this.log.error({ evento: 'tarea_fallida', tarea: nombre, msg: `${nombre}: ${mensaje}` });
      return undefined;
    }
  }

  estado(): EstadoTarea[] {
    const ahora = Date.now();
    return [...this.tareas.values()].map(({ registradaEn, ultimoExito, ...t }) => ({
      ...t,
      atrasada: ahora - (ultimoExito ?? registradaEn) > t.cadaMs * 2 + 30_000,
    }));
  }
}
