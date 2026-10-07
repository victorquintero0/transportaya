import { viaje, viajeMensaje } from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { Eventos, type MensajeDeViaje } from '../tiempo-real/eventos.service.js';
import { registrarEvento } from './eventos-viaje.js';

const MAX_MENSAJES_POR_VIAJE = 200;

/** Chat entre el pasajero y su conductor (PAS-32): solo mientras el viaje está asignado, en sitio o en curso. */
@Injectable()
export class MensajesViajeService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  private async cargar(usuarioId: string, viajeId: string) {
    const [v] = await this.bd.db.select().from(viaje).where(eq(viaje.id, viajeId));
    const esPasajero = v?.pasajeroId === usuarioId;
    const esConductor = v?.conductorId === usuarioId;
    if (!v || (!esPasajero && !esConductor))
      throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
    return { v, deQuien: esPasajero ? ('pasajero' as const) : ('conductor' as const) };
  }

  async listar(usuarioId: string, viajeId: string): Promise<MensajeDeViaje[]> {
    const { v } = await this.cargar(usuarioId, viajeId);
    const filas = await this.bd.db
      .select()
      .from(viajeMensaje)
      .where(eq(viajeMensaje.viajeId, v.id))
      .orderBy(asc(viajeMensaje.creadoEn));
    return filas.map((m) => ({
      id: m.id,
      viajeId: v.id,
      deQuien: m.autorId === v.pasajeroId ? 'pasajero' : 'conductor',
      cuerpo: m.cuerpo,
      creadoEn: m.creadoEn.toISOString(),
    }));
  }

  async enviar(usuarioId: string, viajeId: string, cuerpo: string): Promise<MensajeDeViaje> {
    const { v, deQuien } = await this.cargar(usuarioId, viajeId);
    if (!['asignado', 'en_sitio', 'en_curso'].includes(v.estado))
      throw conflicto('CHAT_CERRADO', 'El chat solo está disponible durante el viaje.');
    const { db } = this.bd;
    const previos = await db
      .select({ id: viajeMensaje.id })
      .from(viajeMensaje)
      .where(
        and(
          eq(viajeMensaje.viajeId, v.id),
          inArray(viajeMensaje.autorId, [v.pasajeroId, v.conductorId!]),
        ),
      );
    if (previos.length >= MAX_MENSAJES_POR_VIAJE)
      throw conflicto('DEMASIADOS_MENSAJES', 'Llegaste al máximo de mensajes de este viaje.');
    const [m] = await db
      .insert(viajeMensaje)
      .values({ viajeId: v.id, autorId: usuarioId, cuerpo: cuerpo.trim() })
      .returning();
    await registrarEvento(db, {
      viajeId: v.id,
      tipo: 'mensaje',
      actorTipo: deQuien,
      actorId: usuarioId,
    });
    const mensaje: MensajeDeViaje = {
      id: m!.id,
      viajeId: v.id,
      deQuien,
      cuerpo: m!.cuerpo,
      creadoEn: m!.creadoEn.toISOString(),
    };
    // Le llega a la otra persona; quien lo envió ya lo tiene en la respuesta.
    if (deQuien === 'pasajero' && v.conductorId)
      this.eventos.aConductor(v.conductorId, 'viaje:mensaje', mensaje);
    else this.eventos.aPasajero(v.pasajeroId, 'viaje:mensaje', mensaje);
    return mensaje;
  }
}
