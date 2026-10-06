import { festivo, tarifaRecargo, zona } from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import { fechaBogota, recargoHorario, type Coordenada, type Recargo } from '@transportaya/dominio';
import { and, eq, sql } from 'drizzle-orm';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';

/** Recargos que aplican a un viaje: los de horario, la aplicación, la categoría y el aeropuerto (RN-011, D-22). */
@Injectable()
export class PrecioService {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  async recargos(
    p: {
      ciudadId: string;
      tarifaId: string;
      categoria: string;
      origen: Coordenada;
      destino: Coordenada;
      instante: Date;
    },
    db: DbOTx = this.bd.db,
  ): Promise<Recargo[]> {
    const filas = await db
      .select()
      .from(tarifaRecargo)
      .where(and(eq(tarifaRecargo.tarifaId, p.tarifaId), eq(tarifaRecargo.activo, true)));
    const aRecargo = (f: (typeof filas)[number]): Recargo =>
      f.tipo === 'fijo'
        ? { nombre: f.codigo, tipo: 'fijo', valor: f.valor }
        : { nombre: f.codigo, tipo: 'porcentaje', puntosBasicos: f.valor };
    const por = (codigo: string) => filas.find((f) => f.codigo === codigo && f.categoria === null);

    const aplicables: Recargo[] = [];
    const agregar = (f: (typeof filas)[number] | undefined) => {
      if (f) aplicables.push(aRecargo(f));
    };

    // Nocturno, dominical o festivo: se excluyen entre sí (Decreto 0641, parágrafo primero).
    const fecha = fechaBogota(p.instante);
    const [esFestivo] = await db
      .select({ f: festivo.fecha })
      .from(festivo)
      .where(eq(festivo.fecha, fecha));
    const horario = recargoHorario(p.instante, !!esFestivo);
    if (horario) agregar(por(horario));

    agregar(por('puerta_a_puerta')); // todo viaje pedido por la aplicación
    agregar(filas.find((f) => f.codigo === 'categoria' && f.categoria === p.categoria));

    if (await this.tocaAeropuerto(db, p.ciudadId, p.origen, p.destino)) agregar(por('aeropuerto'));
    return aplicables;
  }

  /** ¿El origen o el destino está dentro de una zona de aeropuerto de la ciudad? */
  private async tocaAeropuerto(
    db: DbOTx,
    ciudadId: string,
    origen: Coordenada,
    destino: Coordenada,
  ): Promise<boolean> {
    const punto = (c: Coordenada) =>
      sql`ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography`;
    const r = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from ${zona}
      where ${zona.ciudadId} = ${ciudadId} and ${zona.tipo} = 'aeropuerto' and ${zona.activa}
        and (ST_Covers(${zona.poligono}, ${punto(origen)}) or ST_Covers(${zona.poligono}, ${punto(destino)}))`);
    return (r.rows[0]?.n ?? 0) > 0;
  }
}
