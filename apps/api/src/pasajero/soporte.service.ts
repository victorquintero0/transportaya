import { ticket, ticketMensaje, viaje } from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { noEncontrado } from '../comun/errores.js';

/** Tiempos de respuesta iniciales por prioridad: valores de trabajo a ajustar con el equipo de soporte (docs/06). */
const SLA_HORAS = { alta: 2, normal: 24 } as const;

export type TipoSoportePasajero =
  | 'cobro_incorrecto'
  | 'objeto_perdido'
  | 'queja'
  | 'peticion'
  | 'incidente_seguridad'
  | 'sugerencia';

@Injectable()
export class SoportePasajeroService {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  /** PAS-50 y PAS-51: reportar un problema o un objeto perdido, ligado al viaje (RN-142). */
  async reportar(
    pasajeroId: string,
    d: {
      tipo: TipoSoportePasajero;
      viajeId?: string | undefined;
      asunto: string;
      detalle?: string | undefined;
    },
  ) {
    const { db } = this.bd;
    if (d.viajeId) {
      const [v] = await db
        .select({ id: viaje.id })
        .from(viaje)
        .where(and(eq(viaje.id, d.viajeId), eq(viaje.pasajeroId, pasajeroId)));
      if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
    }
    const urgente = d.tipo === 'incidente_seguridad';
    const horas = urgente ? SLA_HORAS.alta : SLA_HORAS.normal;
    return db.transaction(async (tx) => {
      const [t] = await tx
        .insert(ticket)
        .values({
          tipo: d.tipo,
          prioridad: urgente ? 'alta' : 'normal',
          usuarioId: pasajeroId,
          viajeId: d.viajeId ?? null,
          asunto: d.asunto,
          venceSlaEn: new Date(Date.now() + horas * 3_600_000),
        })
        .returning({ id: ticket.id });
      if (d.detalle?.trim())
        await tx
          .insert(ticketMensaje)
          .values({ ticketId: t!.id, autorId: pasajeroId, cuerpo: d.detalle.trim() });
      return { id: t!.id, respuestaEnHoras: horas };
    });
  }

  async listar(pasajeroId: string) {
    const filas = await this.bd.db
      .select({
        id: ticket.id,
        tipo: ticket.tipo,
        estado: ticket.estado,
        asunto: ticket.asunto,
        creadoEn: ticket.creadoEn,
        codigo: viaje.codigo,
      })
      .from(ticket)
      .leftJoin(viaje, eq(viaje.id, ticket.viajeId))
      .where(eq(ticket.usuarioId, pasajeroId))
      .orderBy(desc(ticket.creadoEn))
      .limit(30);
    return filas.map((f) => ({ ...f, creadoEn: f.creadoEn.toISOString() }));
  }
}
