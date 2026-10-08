import { Inject, Injectable } from '@nestjs/common';
import { parametro } from '@transportaya/db';
import { eq, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { solicitudInvalida } from '../comun/errores.js';
import { type Operador, auditar } from './auditoria.js';
import { CATALOGO_PARAMETROS, type ClaveParametro } from './parametros.js';
import { ParametrosService } from './parametros.service.js';
import { DespachoService } from '../viajes/despacho.service.js';

export interface Rango {
  desde: Date;
  hasta: Date;
}

/** Recortes opcionales de los reportes: la categoría del vehículo y la zona donde se pidió el viaje. */
export interface FiltroReporte {
  categoria?: 'media' | 'media_alta' | 'alta' | undefined;
  zonaId?: string | undefined;
}

/** Condición SQL de los filtros sobre una tabla de viajes con ese alias. Vacía si no hay filtros. */
function condicion(f: FiltroReporte, alias: string) {
  const a = sql.raw(alias);
  return sql`${f.categoria ? sql`and ${a}.categoria = ${f.categoria}` : sql``}
    ${
      f.zonaId
        ? sql`and exists (select 1 from zona zf where zf.id = ${f.zonaId} and ST_Covers(zf.poligono, ${a}.origen))`
        : sql``
    }`;
}

const DIA_MS = 86_400_000;

/** Tiempos y movimientos (OPE-03): indicadores calculados desde los eventos, ofertas y sesiones. */
@Injectable()
export class ReportesOperacionService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(DespachoService) private readonly despacho: DespachoService,
  ) {}

  rango(desde?: Date, hasta?: Date): Rango {
    const h = hasta ?? new Date();
    const d = desde ?? new Date(h.getTime() - 7 * DIA_MS);
    if (d >= h) throw solicitudInvalida('El rango de fechas no es válido.');
    if (h.getTime() - d.getTime() > 93 * DIA_MS)
      throw solicitudInvalida('El rango máximo es de 93 días.');
    return { desde: d, hasta: h };
  }

  async tiempos(r: Rango, f: FiltroReporte = {}) {
    const { db } = this.bd;
    const filtrado = !!(f.categoria || f.zonaId);
    const [g] = (
      await db.execute<Record<string, number | string | null>>(sql`
        with v as (select * from viaje v where solicitado_en >= ${r.desde} and solicitado_en < ${r.hasta} ${condicion(f, 'v')})
        select
          count(*)::int as solicitudes,
          count(*) filter (where estado = 'finalizado')::int as finalizados,
          count(*) filter (where estado = 'cancelado')::int as cancelados,
          count(*) filter (where estado = 'cancelado' and cancelado_por = 'pasajero')::int as cancelados_pasajero,
          count(*) filter (where estado = 'cancelado' and cancelado_por = 'conductor')::int as cancelados_conductor,
          count(*) filter (where estado = 'cancelado' and cancelado_por = 'operacion')::int as cancelados_operacion,
          count(*) filter (where estado = 'sin_conductor')::int as sin_conductor,
          round(avg(extract(epoch from aceptado_en - solicitado_en)))::int as asignacion_media_s,
          round((percentile_cont(0.5) within group (order by extract(epoch from aceptado_en - solicitado_en)))::numeric)::int as asignacion_p50_s,
          round((percentile_cont(0.9) within group (order by extract(epoch from aceptado_en - solicitado_en)))::numeric)::int as asignacion_p90_s,
          round(avg(extract(epoch from en_sitio_en - aceptado_en)))::int as llegada_media_s,
          round(avg(extract(epoch from iniciado_en - en_sitio_en)))::int as espera_media_s,
          round(avg(duracion_s))::int as duracion_media_s,
          round(avg(distancia_real_m) / 1000.0, 1)::float as distancia_media_km,
          coalesce(sum(precio_final) filter (where estado = 'finalizado'), 0)::text as ingresos_brutos,
          coalesce(sum(comision) filter (where estado = 'finalizado'), 0)::text as comisiones,
          count(*) filter (where estado = 'finalizado' and metodo_pago = 'efectivo')::int as viajes_efectivo,
          count(*) filter (where estado = 'finalizado' and metodo_pago <> 'efectivo')::int as viajes_electronico,
          round(coalesce(sum(distancia_real_m) filter (where estado = 'finalizado'), 0) / 1000.0)::int as km_productivos
        from v`)
    ).rows;

    const [o] = (
      await db.execute<{
        ofertas: number;
        aceptadas: number;
        rechazadas: number;
        expiradas: number;
        respuesta_media_s: number | null;
      }>(sql`
        select count(*)::int as ofertas,
               count(*) filter (where resultado = 'aceptada')::int as aceptadas,
               count(*) filter (where resultado = 'rechazada')::int as rechazadas,
               count(*) filter (where resultado = 'expirada')::int as expiradas,
               round(avg(extract(epoch from respondida_en - ofrecida_en)) filter (where resultado in ('aceptada','rechazada')))::int as respuesta_media_s
        from oferta where ofrecida_en >= ${r.desde} and ofrecida_en < ${r.hasta}
        ${filtrado ? sql`and viaje_id in (select v.id from viaje v where true ${condicion(f, 'v')})` : sql``}`)
    ).rows;

    const [s] = (
      await db.execute<{ horas_en_linea: number; horas_productivas: number }>(sql`
        select
          coalesce(round((sum(extract(epoch from least(coalesce(fin, now()), ${r.hasta}) - greatest(inicio, ${r.desde}))) / 3600)::numeric, 1), 0)::float as horas_en_linea,
          (select coalesce(round((sum(extract(epoch from finalizado_en - aceptado_en)) / 3600)::numeric, 1), 0)::float
             from viaje v where estado = 'finalizado' and finalizado_en >= ${r.desde} and finalizado_en < ${r.hasta} ${condicion(f, 'v')}) as horas_productivas
        from sesion_conductor where inicio < ${r.hasta} and coalesce(fin, now()) > ${r.desde}`)
    ).rows;

    const porDia = await db.execute<{
      dia: string;
      solicitudes: number;
      finalizados: number;
      cancelados: number;
      sin_conductor: number;
    }>(sql`
      select to_char((solicitado_en at time zone 'America/Bogota')::date, 'YYYY-MM-DD') as dia,
             count(*)::int as solicitudes,
             count(*) filter (where estado = 'finalizado')::int as finalizados,
             count(*) filter (where estado = 'cancelado')::int as cancelados,
             count(*) filter (where estado = 'sin_conductor')::int as sin_conductor
      from viaje v where solicitado_en >= ${r.desde} and solicitado_en < ${r.hasta} ${condicion(f, 'v')}
      group by 1 order by 1`);
    const porHora = await db.execute<{
      hora: number;
      solicitudes: number;
      sin_conductor: number;
    }>(sql`
      select extract(hour from solicitado_en at time zone 'America/Bogota')::int as hora,
             count(*)::int as solicitudes,
             count(*) filter (where estado = 'sin_conductor')::int as sin_conductor
      from viaje v where solicitado_en >= ${r.desde} and solicitado_en < ${r.hasta} ${condicion(f, 'v')}
      group by 1 order by 1`);
    const conductores = await db.execute<{
      id: string;
      nombre: string;
      viajes: number;
      horas_en_linea: number;
      ofertas: number;
      aceptadas: number;
      cancelados: number;
    }>(sql`
      select c.usuario_id as id, u.nombre,
        (select count(*)::int from viaje v where v.conductor_id = c.usuario_id and v.estado = 'finalizado' and v.finalizado_en >= ${r.desde} and v.finalizado_en < ${r.hasta} ${condicion(f, 'v')}) as viajes,
        (select coalesce(round((sum(extract(epoch from least(coalesce(fin, now()), ${r.hasta}) - greatest(inicio, ${r.desde}))) / 3600)::numeric, 1), 0)::float
           from sesion_conductor s where s.conductor_id = c.usuario_id and s.inicio < ${r.hasta} and coalesce(s.fin, now()) > ${r.desde}) as horas_en_linea,
        (select count(*)::int from oferta o where o.conductor_id = c.usuario_id and o.ofrecida_en >= ${r.desde} and o.ofrecida_en < ${r.hasta} ${filtrado ? sql`and o.viaje_id in (select vf.id from viaje vf where true ${condicion(f, 'vf')})` : sql``}) as ofertas,
        (select count(*)::int from oferta o where o.conductor_id = c.usuario_id and o.resultado = 'aceptada' and o.ofrecida_en >= ${r.desde} and o.ofrecida_en < ${r.hasta} ${filtrado ? sql`and o.viaje_id in (select vf.id from viaje vf where true ${condicion(f, 'vf')})` : sql``}) as aceptadas,
        (select count(*)::int from viaje v where v.conductor_id = c.usuario_id and v.estado = 'cancelado' and v.cancelado_por = 'conductor' and v.solicitado_en >= ${r.desde} and v.solicitado_en < ${r.hasta} ${condicion(f, 'v')}) as cancelados
      from conductor c join usuario u on u.id = c.usuario_id
      order by 3 desc, 2 limit 100`);

    const n = (k: string) => (g?.[k] === null || g?.[k] === undefined ? null : Number(g[k]));
    const solicitudes = n('solicitudes') ?? 0;
    const finalizados = n('finalizados') ?? 0;
    // Las horas en línea son de los conductores, no de los viajes: con un filtro no se pueden recortar.
    const horasLinea = filtrado ? 0 : (s?.horas_en_linea ?? 0);
    return {
      desde: r.desde.toISOString(),
      hasta: r.hasta.toISOString(),
      filtros: { categoria: f.categoria ?? null, zonaId: f.zonaId ?? null },
      viajes: {
        solicitudes,
        finalizados,
        cancelados: n('cancelados') ?? 0,
        canceladosPorPasajero: n('cancelados_pasajero') ?? 0,
        canceladosPorConductor: n('cancelados_conductor') ?? 0,
        canceladosPorOperacion: n('cancelados_operacion') ?? 0,
        sinConductor: n('sin_conductor') ?? 0,
        tasaFinalizacion: solicitudes ? Math.round((finalizados / solicitudes) * 1000) / 1000 : 0,
      },
      tiempos: {
        asignacionMediaS: n('asignacion_media_s'),
        asignacionP50S: n('asignacion_p50_s'),
        asignacionP90S: n('asignacion_p90_s'),
        llegadaMediaS: n('llegada_media_s'),
        esperaMediaS: n('espera_media_s'),
        duracionMediaS: n('duracion_media_s'),
        respuestaOfertaMediaS: o?.respuesta_media_s ?? null,
      },
      ofertas: {
        total: o?.ofertas ?? 0,
        aceptadas: o?.aceptadas ?? 0,
        rechazadas: o?.rechazadas ?? 0,
        expiradas: o?.expiradas ?? 0,
        tasaAceptacion: o?.ofertas
          ? Math.round(((o.aceptadas ?? 0) / o.ofertas) * 1000) / 1000
          : null,
      },
      flota: {
        horasEnLinea: filtrado ? null : horasLinea,
        horasProductivas: s?.horas_productivas ?? 0,
        utilizacion:
          horasLinea > 0
            ? Math.round(((s?.horas_productivas ?? 0) / horasLinea) * 1000) / 1000
            : null,
        kmProductivos: n('km_productivos') ?? 0,
        distanciaMediaKm: n('distancia_media_km'),
      },
      dinero: {
        ingresosBrutos: Number(g?.['ingresos_brutos'] ?? 0),
        comisiones: Number(g?.['comisiones'] ?? 0),
        viajesEfectivo: n('viajes_efectivo') ?? 0,
        viajesElectronico: n('viajes_electronico') ?? 0,
      },
      porDia: porDia.rows.map((d) => ({
        dia: d.dia,
        solicitudes: d.solicitudes,
        finalizados: d.finalizados,
        cancelados: d.cancelados,
        sinConductor: d.sin_conductor,
      })),
      porHora: porHora.rows.map((h) => ({
        hora: h.hora,
        solicitudes: h.solicitudes,
        sinConductor: h.sin_conductor,
      })),
      conductores: conductores.rows.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        viajes: c.viajes,
        horasEnLinea: c.horas_en_linea,
        tasaAceptacion: c.ofertas ? Math.round((c.aceptadas / c.ofertas) * 1000) / 1000 : null,
        cancelaciones: c.cancelados,
      })),
    };
  }

  /**
   * Mapa de calor (OPE-03): dónde se piden los viajes, o dónde se quedan sin conductor. Se agrupan en celdas de unos
   * 330 m; el origen exacto de una persona no sale de aquí.
   */
  async calor(r: Rango, f: FiltroReporte, tipo: 'solicitudes' | 'sin_conductor') {
    const filas = await this.bd.db.execute<{ lat: number; lng: number; n: number }>(sql`
      select ST_Y(c)::float as lat, ST_X(c)::float as lng, count(*)::int as n
      from (
        select ST_SnapToGrid(v.origen::geometry, 0.003) as c
        from viaje v
        where v.solicitado_en >= ${r.desde} and v.solicitado_en < ${r.hasta}
          ${tipo === 'sin_conductor' ? sql`and v.estado = 'sin_conductor'` : sql``}
          ${condicion(f, 'v')}
      ) t
      group by c order by n desc limit 2000`);
    const celdas = filas.rows.map((c) => ({ lat: c.lat, lng: c.lng, n: c.n }));
    return {
      desde: r.desde.toISOString(),
      hasta: r.hasta.toISOString(),
      tipo,
      tamanoM: 330,
      total: celdas.reduce((a, c) => a + c.n, 0),
      maximo: celdas[0]?.n ?? 0,
      celdas,
    };
  }

  /** CSV de los viajes del rango, con BOM para que Excel respete las tildes. */
  async csvViajes(r: Rango, operador: Operador, f: FiltroReporte = {}): Promise<string> {
    const filas = await this.bd.db.execute<Record<string, unknown>>(sql`
      select v.codigo, to_char(v.solicitado_en at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI:SS') as solicitado,
             v.estado::text as estado, v.tipo_servicio::text as servicio, v.categoria::text as categoria,
             p.nombre as pasajero, c.nombre as conductor, ve.placa,
             v.metodo_pago::text as pago, v.precio_final, v.comision, v.distancia_real_m, v.duracion_s,
             extract(epoch from v.aceptado_en - v.solicitado_en)::int as asignacion_s,
             v.cancelado_por::text as cancelado_por, v.motivo_cancelacion
      from viaje v join usuario p on p.id = v.pasajero_id
      left join usuario c on c.id = v.conductor_id left join vehiculo ve on ve.id = v.vehiculo_id
      where v.solicitado_en >= ${r.desde} and v.solicitado_en < ${r.hasta} ${condicion(f, 'v')}
      order by v.solicitado_en limit 50000`);
    await auditar(this.bd.db, operador, {
      accion: 'reporte.exportar',
      entidad: 'reporte',
      despues: {
        tipo: 'viajes',
        filas: filas.rows.length,
        filtros: f,
        desde: r.desde.toISOString(),
        hasta: r.hasta.toISOString(),
      },
    });
    return aCsv(filas.rows);
  }

  async csvTiempos(r: Rango, operador: Operador, f: FiltroReporte = {}): Promise<string> {
    const t = await this.tiempos(r, f);
    await auditar(this.bd.db, operador, {
      accion: 'reporte.exportar',
      entidad: 'reporte',
      despues: {
        tipo: 'tiempos',
        filtros: f,
        desde: r.desde.toISOString(),
        hasta: r.hasta.toISOString(),
      },
    });
    return aCsv(t.porDia.map((d) => ({ ...d })));
  }

  // ── Parámetros (OPE-12) ────────────────────────────────────────────────────
  async listarParametros() {
    const filas = await this.bd.db.select().from(parametro);
    const por = new Map(filas.map((f) => [f.clave, f]));
    return (Object.keys(CATALOGO_PARAMETROS) as ClaveParametro[]).map((clave) => {
      const def = CATALOGO_PARAMETROS[clave];
      const fila = por.get(clave);
      return {
        clave,
        ...def,
        valor: typeof fila?.valor === 'number' ? fila.valor : def.defecto,
        personalizado: typeof fila?.valor === 'number',
        actualizadoEn: fila?.actualizadoEn.toISOString() ?? null,
      };
    });
  }

  async cambiarParametro(clave: string, valor: number, motivo: string, operador: Operador) {
    const def = CATALOGO_PARAMETROS[clave as ClaveParametro] as
      (typeof CATALOGO_PARAMETROS)[ClaveParametro] | undefined;
    if (!def) throw solicitudInvalida('Ese parámetro no existe.');
    if (!Number.isFinite(valor) || valor < def.min || valor > def.max)
      throw solicitudInvalida(`El valor debe estar entre ${def.min} y ${def.max} ${def.unidad}.`);
    // El ámbar de cada semáforo debe llegar antes que el rojo.
    if (clave.startsWith('semaforo.')) {
      const par = clave.endsWith('_ambar_s')
        ? clave.replace('_ambar_s', '_rojo_s')
        : clave.replace('_rojo_s', '_ambar_s');
      const otro = await this.parametros.numero(par as ClaveParametro);
      const [ambar, rojo] = clave.endsWith('_ambar_s') ? [valor, otro] : [otro, valor];
      if (ambar >= rojo)
        throw solicitudInvalida('El tiempo de ámbar debe ser menor que el de rojo.');
    }
    // Los plazos de una reserva deben ir en orden: confirmar, despachar, avisar (RN-082, RN-083).
    if (
      clave === 'reservas.confirmar_min' ||
      clave === 'reservas.despacho_min' ||
      clave === 'reservas.alerta_min'
    ) {
      const actual = await this.parametros.reservas();
      const p = {
        confirmar: actual.confirmarMin,
        despacho: actual.despachoMin,
        alerta: actual.alertaMin,
        [clave.slice(9, -4)]: valor,
      } as { confirmar: number; despacho: number; alerta: number };
      if (!(p.alerta < p.despacho && p.despacho < p.confirmar))
        throw solicitudInvalida(
          'Los plazos deben ir en orden: la alerta a la operación, luego el despacho automático y antes de todo, la confirmación del conductor.',
        );
    }
    const antes = await this.parametros.numero(clave as ClaveParametro);
    await this.bd.db.transaction(async (tx) => {
      await tx
        .insert(parametro)
        .values({ clave, valor, descripcion: def.descripcion, actualizadoPor: operador.id })
        .onConflictDoUpdate({
          target: parametro.clave,
          set: { valor, actualizadoPor: operador.id },
        });
      await auditar(tx, operador, {
        accion: 'parametro.cambiar',
        entidad: 'parametro',
        antes: { clave, valor: antes },
        despues: { clave, valor },
        motivo,
      });
    });
    this.parametros.invalidar();
    if (clave.startsWith('despacho.')) await this.despacho.aplicarParametros();
    return { clave, valor };
  }

  async restablecerParametro(clave: string, motivo: string, operador: Operador) {
    if (!(clave in CATALOGO_PARAMETROS)) throw solicitudInvalida('Ese parámetro no existe.');
    const antes = await this.parametros.numero(clave as ClaveParametro);
    await this.bd.db.transaction(async (tx) => {
      await tx.delete(parametro).where(eq(parametro.clave, clave));
      await auditar(tx, operador, {
        accion: 'parametro.restablecer',
        entidad: 'parametro',
        antes: { clave, valor: antes },
        despues: { clave, valor: CATALOGO_PARAMETROS[clave as ClaveParametro].defecto },
        motivo,
      });
    });
    this.parametros.invalidar();
    if (clave.startsWith('despacho.')) {
      // los valores de despacho vuelven a su defecto en caliente
      const def = CATALOGO_PARAMETROS[clave as ClaveParametro].defecto;
      await this.despacho.aplicarParametros();
      this.despacho.restablecerParametro(clave, def);
    }
  }
}

function aCsv(filas: Record<string, unknown>[]): string {
  if (filas.length === 0) return '﻿sin datos\n';
  const columnas = Object.keys(filas[0]!);
  const celda = (v: unknown) => {
    if (v === null || v === undefined) return '';
    let t = v instanceof Date ? v.toISOString() : String(v);
    // evita que una hoja de cálculo interprete texto del usuario como fórmula
    if (/^[=+\-@\t\r]/.test(t) && Number.isNaN(Number(t))) t = `'${t}`;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return (
    '﻿' +
    [columnas.join(','), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(','))].join(
      '\n',
    ) +
    '\n'
  );
}
