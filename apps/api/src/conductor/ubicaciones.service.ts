import { conductor, posicionConductor, viaje } from '@transportaya/db';
import { distanciaMetros } from '@transportaya/dominio';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto } from '../comun/errores.js';
import { ConexionService } from './conexion.service.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { UbicacionStore } from './ubicacion.store.js';

export interface PuntoEntrada {
  lat: number;
  lng: number;
  /** Instante de la lectura, en ms desde 1970. */
  t: number;
  precisionM?: number | null | undefined;
  velocidadKmh?: number | null | undefined;
  rumbo?: number | null | undefined;
}

/** Mismos supuestos del despacho mientras no hay motor de rutas (ADR-0002). */
const FACTOR_RUTA = 1.35;
const VELOCIDAD_MEDIA_MS = 25 / 3.6;
const ENTRE_AVISOS_MS = 1500;

const MAX_ANTIGUEDAD_MS = 24 * 60 * 60_000;
const MAX_FUTURO_MS = 60_000;

@Injectable()
export class UbicacionesService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(UbicacionStore) private readonly store: UbicacionStore,
    @Inject(ConexionService) private readonly conexion: ConexionService,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  /** Última vez que se le mandó al pasajero la posición de su conductor, para no saturarlo. */
  private readonly ultimoAviso = new Map<string, number>();

  /**
   * Guarda un lote de posiciones (en vivo o acumuladas mientras no hubo conexión). Descarta las que
   * tienen una hora imposible. Las duplicadas se ignoran: reenviar un lote es seguro.
   */
  async guardar(conductorId: string, puntos: readonly PuntoEntrada[], ahoraMs = Date.now()) {
    const { db } = this.bd;
    const [yo] = await db
      .select({ op: conductor.estadoOperativo })
      .from(conductor)
      .where(eq(conductor.usuarioId, conductorId));
    if (!yo || yo.op === 'desconectado') {
      throw conflicto('DESCONECTADO', 'Conéctate para compartir tu ubicación.');
    }

    const validos = puntos.filter(
      (p) => p.t <= ahoraMs + MAX_FUTURO_MS && p.t >= ahoraMs - MAX_ANTIGUEDAD_MS,
    );
    if (validos.length === 0)
      return { recibidos: puntos.length, guardados: 0, descartados: puntos.length };

    const [activo] = await db
      .select({
        id: viaje.id,
        pasajeroId: viaje.pasajeroId,
        estado: viaje.estado,
        origen: viaje.origen,
        destino: viaje.destino,
      })
      .from(viaje)
      .where(
        and(
          eq(viaje.conductorId, conductorId),
          inArray(viaje.estado, ['asignado', 'en_sitio', 'en_curso']),
        ),
      );

    const filas = validos.map((p) => ({
      conductorId,
      registradaEn: new Date(p.t),
      ubicacion: { lat: p.lat, lng: p.lng },
      precisionM: p.precisionM == null ? null : Math.round(p.precisionM),
      velocidadKmh: p.velocidadKmh ?? null,
      rumbo: p.rumbo == null ? null : Math.round(p.rumbo) % 360,
      estadoOperativo: yo.op,
      viajeId: activo?.id ?? null,
    }));
    const guardadas = await db
      .insert(posicionConductor)
      .values(filas)
      .onConflictDoNothing()
      .returning({ t: posicionConductor.registradaEn });

    const ultimo = validos.reduce((a, b) => (b.t >= a.t ? b : a));
    this.store.actualizar(conductorId, {
      lat: ultimo.lat,
      lng: ultimo.lng,
      instanteMs: ultimo.t,
      recibidaMs: ahoraMs,
      precisionM: ultimo.precisionM ?? null,
    });
    if (yo.op === 'sin_senal') await this.conexion.recuperarSenal(conductorId);
    if (activo) this.avisarAlPasajero(conductorId, activo, ultimo, ahoraMs);

    return {
      recibidos: puntos.length,
      guardados: guardadas.length,
      descartados: puntos.length - validos.length,
    };
  }

  /** El pasajero ve a su conductor moverse (PAS-31) con lo que falta para llegar. */
  private avisarAlPasajero(
    conductorId: string,
    v: {
      id: string;
      pasajeroId: string;
      estado: string;
      origen: { lat: number; lng: number };
      destino: { lat: number; lng: number };
    },
    punto: PuntoEntrada,
    ahoraMs: number,
  ): void {
    if (ahoraMs - (this.ultimoAviso.get(conductorId) ?? 0) < ENTRE_AVISOS_MS) return;
    this.ultimoAviso.set(conductorId, ahoraMs);
    const haciaDestino = v.estado === 'en_curso';
    const meta = haciaDestino ? v.destino : v.origen;
    const distanciaM = Math.round(distanciaMetros(punto, meta) * FACTOR_RUTA);
    this.eventos.aPasajero(v.pasajeroId, 'viaje:ubicacion_conductor', {
      viajeId: v.id,
      lat: punto.lat,
      lng: punto.lng,
      rumbo: punto.rumbo ?? null,
      etaS: Math.round(distanciaM / VELOCIDAD_MEDIA_MS),
      distanciaM,
      hacia: haciaDestino ? 'destino' : 'recogida',
      t: punto.t,
    });
  }
}
