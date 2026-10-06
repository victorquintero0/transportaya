import { conductor, sesionConductor } from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, ErrorNegocio } from '../comun/errores.js';
import { PerfilService } from './perfil.service.js';
import { UbicacionStore } from './ubicacion.store.js';

/** Sin lecturas del GPS durante este tiempo, el conductor deja de recibir ofertas (RN, docs/05). */
export const SIN_SENAL_MS = 60_000;

@Injectable()
export class ConexionService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(PerfilService) private readonly perfil: PerfilService,
    @Inject(UbicacionStore) private readonly ubicaciones: UbicacionStore,
  ) {}

  /** Pone al conductor en línea si cumple todo: habilitado, documentos vigentes, sin deuda (RN-111, RN-063). */
  async conectar(
    conductorId: string,
    ubicacion?: { lat: number; lng: number; precisionM?: number | null | undefined },
  ): Promise<{ estadoOperativo: string }> {
    const motivos = await this.perfil.motivosNoConectar(conductorId);
    if (motivos.length) {
      throw new ErrorNegocio(409, 'NO_PUEDE_CONECTARSE', motivos[0]!.mensaje, { motivos });
    }

    const { db } = this.bd;
    const [yo] = await db.select().from(conductor).where(eq(conductor.usuarioId, conductorId));
    if (!yo) throw conflicto('CONDUCTOR_NO_ENCONTRADO', 'No encontramos tu perfil de conductor');
    if (yo.estadoOperativo !== 'desconectado') return { estadoOperativo: yo.estadoOperativo }; // ya estaba en línea

    await db.transaction(async (tx) => {
      const cambio = await tx
        .update(conductor)
        .set({ estadoOperativo: 'disponible' })
        .where(
          and(eq(conductor.usuarioId, conductorId), eq(conductor.estadoOperativo, 'desconectado')),
        )
        .returning({ id: conductor.usuarioId });
      if (cambio.length === 0) return; // otra petición ganó la carrera
      await tx.insert(sesionConductor).values({ conductorId, vehiculoId: yo.vehiculoActivoId! });
    });

    if (ubicacion) {
      const ahora = Date.now();
      this.ubicaciones.actualizar(conductorId, {
        lat: ubicacion.lat,
        lng: ubicacion.lng,
        instanteMs: ahora,
        recibidaMs: ahora,
        precisionM: ubicacion.precisionM ?? null,
      });
    } else {
      // Sin posición todavía: se le da un respiro antes de considerarlo sin señal.
      this.ubicaciones.marcarConexion(conductorId);
    }
    return { estadoOperativo: 'disponible' };
  }

  async desconectar(conductorId: string): Promise<void> {
    const { db } = this.bd;
    const [yo] = await db
      .select({ op: conductor.estadoOperativo })
      .from(conductor)
      .where(eq(conductor.usuarioId, conductorId));
    if (!yo || yo.op === 'desconectado') return;
    if (['en_camino', 'en_sitio', 'en_viaje'].includes(yo.op)) {
      throw conflicto('VIAJE_EN_CURSO', 'Termina tu viaje antes de desconectarte.');
    }
    if (yo.op === 'con_oferta') {
      throw conflicto('OFERTA_PENDIENTE', 'Responde la oferta antes de desconectarte.');
    }
    await db.transaction(async (tx) => {
      await tx
        .update(conductor)
        .set({ estadoOperativo: 'desconectado' })
        .where(eq(conductor.usuarioId, conductorId));
      await tx
        .update(sesionConductor)
        .set({ fin: sql`now()` })
        .where(and(eq(sesionConductor.conductorId, conductorId), isNull(sesionConductor.fin)));
    });
    this.ubicaciones.olvidar(conductorId);
  }

  /** Deja sin señal a quien está disponible pero no manda posiciones. Se corre cada pocos segundos. */
  async marcarSinSenal(ahoraMs = Date.now()): Promise<string[]> {
    const { db } = this.bd;
    const disponibles = await db
      .select({ id: conductor.usuarioId })
      .from(conductor)
      .where(eq(conductor.estadoOperativo, 'disponible'));
    const perdidos = disponibles
      .map((d) => d.id)
      .filter((id) => {
        const ultima = this.ubicaciones.ultimaSenalMs(id);
        return ultima === undefined || ahoraMs - ultima > SIN_SENAL_MS;
      });
    for (const id of perdidos) {
      await db
        .update(conductor)
        .set({ estadoOperativo: 'sin_senal' })
        .where(and(eq(conductor.usuarioId, id), eq(conductor.estadoOperativo, 'disponible')));
    }
    return perdidos;
  }

  /** Vuelve a disponible a quien recuperó la señal. */
  async recuperarSenal(conductorId: string): Promise<boolean> {
    const r = await this.bd.db
      .update(conductor)
      .set({ estadoOperativo: 'disponible' })
      .where(and(eq(conductor.usuarioId, conductorId), eq(conductor.estadoOperativo, 'sin_senal')))
      .returning({ id: conductor.usuarioId });
    return r.length > 0;
  }
}
