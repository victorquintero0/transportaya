import { viaje } from '@transportaya/db';
import type { Coordenada } from '@transportaya/dominio';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import {
  buscarLugares,
  direccionAproximada,
  lugarMasCercano,
  barrioMasCercano,
  type ResultadoLugar,
} from './geocodificador.js';

@Injectable()
export class LugaresService {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  /** PAS-21: lugares y direcciones que coinciden con lo escrito. */
  buscar(texto: string, cerca?: Coordenada): ResultadoLugar[] {
    return buscarLugares(texto, cerca);
  }

  /** Destinos de los últimos viajes, sin repetir (PAS-21: recientes). */
  async recientes(pasajeroId: string, limite = 5) {
    const filas = await this.bd.db
      .select({
        direccion: viaje.destinoDireccion,
        destino: viaje.destino,
        ultimo: sql<Date>`max(${viaje.solicitadoEn})`,
      })
      .from(viaje)
      .where(
        and(
          eq(viaje.pasajeroId, pasajeroId),
          eq(viaje.tipoServicio, 'inmediato'),
          inArray(viaje.estado, ['finalizado', 'cancelado', 'sin_conductor']),
          sql`${viaje.destinoDireccion} is not null`,
        ),
      )
      .groupBy(viaje.destinoDireccion, viaje.destino)
      .orderBy(desc(sql`max(${viaje.solicitadoEn})`))
      .limit(limite);
    return filas.map((f) => ({
      direccion: f.direccion as string,
      lat: f.destino.lat,
      lng: f.destino.lng,
    }));
  }

  /** PAS-20: le pone nombre al punto donde el pasajero dejó el pin. */
  inversa(c: Coordenada): { direccion: string; titulo: string; subtitulo: string } {
    const barrio = barrioMasCercano(c);
    const conocido = lugarMasCercano(c);
    if (conocido)
      return {
        titulo: conocido.titulo,
        subtitulo: conocido.subtitulo,
        direccion: `${conocido.titulo}, ${barrio}`,
      };
    const aprox = direccionAproximada(c);
    return { titulo: aprox, subtitulo: `${barrio}, Manizales`, direccion: `${aprox}, ${barrio}` };
  }
}
