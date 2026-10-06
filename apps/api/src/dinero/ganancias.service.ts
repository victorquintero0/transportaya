import { Inject, Injectable } from '@nestjs/common';
import { diasEntre, fechaBogota } from '@transportaya/dominio';
import { sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { solicitudInvalida } from '../comun/errores.js';

export type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes';

/** Rango de fechas (en Bogotá) de un periodo. La semana va de lunes a hoy. */
export function rangoDe(periodo: Periodo, ahora = new Date()): { desde: string; hasta: string } {
  const hoy = fechaBogota(ahora);
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const restar = (d: string, dias: number) =>
    new Date(ms(d) - dias * 86_400_000).toISOString().slice(0, 10);
  switch (periodo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case 'ayer':
      return { desde: restar(hoy, 1), hasta: restar(hoy, 1) };
    case 'semana': {
      const diaSemana = new Date(ms(hoy)).getUTCDay(); // 0 domingo
      return { desde: restar(hoy, (diaSemana + 6) % 7), hasta: hoy };
    }
    case 'mes':
      return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  }
}

export interface Ganancias {
  desde: string;
  hasta: string;
  viajes: number;
  cancelacionesCobradas: number;
  /** Lo que pagaron los pasajeros por los viajes (antes de la comisión). */
  bruto: number;
  comision: number;
  /** Lo que le queda al conductor: bruto − comisión (más la tarifa neta de cancelaciones). */
  neto: number;
  efectivo: number;
  electronico: number;
  distanciaM: number;
  horasConectado: number;
  /** Horas con viaje (en camino, en sitio o llevando pasajero) sobre las horas conectado. */
  utilizacion: number | null;
  promedioPorViaje: number;
  porDia: { dia: string; viajes: number; bruto: number; neto: number }[];
}

@Injectable()
export class GananciasService {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  async resumen(conductorId: string, desde: string, hasta: string): Promise<Ganancias> {
    if (diasEntre(desde, hasta) < 0 || diasEntre(desde, hasta) > 92) {
      throw solicitudInvalida('El rango de fechas no es válido (máximo 3 meses).');
    }
    const { db } = this.bd;
    const dia = sql`(coalesce(finalizado_en, cancelado_en) at time zone 'America/Bogota')::date`;
    const filas = await db.execute<{
      dia: string;
      viajes: number;
      cancelaciones: number;
      bruto: string;
      comision: string;
      efectivo: string;
      electronico: string;
      distancia: string;
    }>(sql`
      select ${dia}::text as dia,
        count(*) filter (where estado = 'finalizado')::int as viajes,
        count(*) filter (where estado = 'cancelado')::int as cancelaciones,
        coalesce(sum(precio_final), 0)::text as bruto,
        coalesce(sum(comision), 0)::text as comision,
        coalesce(sum(precio_final) filter (where estado = 'finalizado' and metodo_pago = 'efectivo'), 0)::text as efectivo,
        coalesce(sum(precio_final) filter (where estado = 'finalizado' and metodo_pago <> 'efectivo'), 0)::text as electronico,
        coalesce(sum(distancia_real_m) filter (where estado = 'finalizado'), 0)::text as distancia
      from viaje
      where conductor_id = ${conductorId}
        and (estado = 'finalizado' or (estado = 'cancelado' and precio_final is not null))
        and ${dia} between ${desde}::date and ${hasta}::date
      group by 1 order by 1`);

    const conexion = await db.execute<{ conectado: string; ocupado: string }>(sql`
      with ventana as (
        select (${desde}::date::timestamp at time zone 'America/Bogota') as ini,
               ((${hasta}::date + 1)::timestamp at time zone 'America/Bogota') as fin)
      select
        coalesce(sum(extract(epoch from (least(coalesce(s.fin, now()), v.fin) - greatest(s.inicio, v.ini)))), 0)::text as conectado,
        (select coalesce(sum(extract(epoch from (least(coalesce(finalizado_en, cancelado_en), v.fin) - greatest(aceptado_en, v.ini)))), 0)
           from viaje, ventana v where conductor_id = ${conductorId} and aceptado_en is not null and coalesce(finalizado_en, cancelado_en) is not null
             and aceptado_en < v.fin and coalesce(finalizado_en, cancelado_en) > v.ini)::text as ocupado
      from sesion_conductor s, ventana v
      where s.conductor_id = ${conductorId} and s.inicio < v.fin and coalesce(s.fin, now()) > v.ini`);

    const porDia = filas.rows.map((f) => ({
      dia: f.dia,
      viajes: f.viajes,
      bruto: Number(f.bruto),
      neto: Number(f.bruto) - Number(f.comision),
    }));
    const sumar = (k: 'viajes' | 'bruto' | 'neto') => porDia.reduce((a, d) => a + d[k], 0);
    const viajes = sumar('viajes');
    const conectadoS = Number(conexion.rows[0]?.conectado ?? 0);
    const ocupadoS = Number(conexion.rows[0]?.ocupado ?? 0);
    const suma = (k: 'comision' | 'efectivo' | 'electronico' | 'distancia') =>
      filas.rows.reduce((a, f) => a + Number(f[k]), 0);

    return {
      desde,
      hasta,
      viajes,
      cancelacionesCobradas: filas.rows.reduce((a, f) => a + f.cancelaciones, 0),
      bruto: sumar('bruto'),
      comision: suma('comision'),
      neto: sumar('neto'),
      efectivo: suma('efectivo'),
      electronico: suma('electronico'),
      distanciaM: suma('distancia'),
      horasConectado: Math.round((conectadoS / 3600) * 100) / 100,
      utilizacion:
        conectadoS > 0 ? Math.min(1, Math.round((ocupadoS / conectadoS) * 100) / 100) : null,
      promedioPorViaje: viajes ? Math.round(sumar('neto') / viajes) : 0,
      porDia,
    };
  }
}
