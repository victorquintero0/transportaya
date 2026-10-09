import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { DbOTx } from '../bd/bd.module.js';
import { ParametrosService } from '../operacion/parametros.service.js';

export interface PeajeCruzado {
  id: string;
  nombre: string;
  valor: number;
}

/**
 * Peajes del recorrido (RN-091, RN-041). Se arma una línea con las posiciones que recibió el servidor entre «Iniciar» y
 * «Finalizar»; cada peaje activo a menos de `peajes.radio_m` de esa línea se cobra una vez. La tabla la mantiene
 * Operación (pantalla Tarifas y zonas); mientras esté vacía, ningún viaje cambia de precio.
 */
@Injectable()
export class PeajesService {
  constructor(@Inject(ParametrosService) private readonly parametros: ParametrosService) {}

  async cruzados(
    tx: DbOTx,
    d: { conductorId: string; viajeId: string; desde: Date; hasta: Date },
  ): Promise<PeajeCruzado[]> {
    const radio = await this.parametros.numero('peajes.radio_m');
    const r = await tx.execute<{ id: string; nombre: string; valor: string }>(sql`
      with recorrido as (
        select ST_MakeLine(ubicacion::geometry order by registrada_en) as linea,
               ST_Collect(ubicacion::geometry) as puntos
        from posicion_conductor
        where conductor_id = ${d.conductorId} and viaje_id = ${d.viajeId}
          and registrada_en >= ${d.desde} and registrada_en <= ${d.hasta}
      )
      select p.id, p.nombre, p.valor::text
      from peaje p, recorrido
      where p.activo and recorrido.puntos is not null
        and (
          ST_DWithin(recorrido.puntos::geography, p.ubicacion, ${radio})
          or (recorrido.linea is not null and ST_DWithin(recorrido.linea::geography, p.ubicacion, ${radio}))
        )
      order by p.nombre`);
    return r.rows.map((x) => ({ id: x.id, nombre: x.nombre, valor: Number(x.valor) }));
  }
}
