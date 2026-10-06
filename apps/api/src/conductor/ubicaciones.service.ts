import { conductor, posicionConductor, viaje } from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto } from '../comun/errores.js';
import { ConexionService } from './conexion.service.js';
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

const MAX_ANTIGUEDAD_MS = 24 * 60 * 60_000;
const MAX_FUTURO_MS = 60_000;

@Injectable()
export class UbicacionesService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(UbicacionStore) private readonly store: UbicacionStore,
    @Inject(ConexionService) private readonly conexion: ConexionService,
  ) {}

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
      .select({ id: viaje.id })
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

    return {
      recibidos: puntos.length,
      guardados: guardadas.length,
      descartados: puntos.length - validos.length,
    };
  }
}
