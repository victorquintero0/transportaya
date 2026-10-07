import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { alerta, conductor, usuario, vehiculo, viaje } from '@transportaya/db';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { UbicacionStore } from '../conductor/ubicacion.store.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { type Operador, auditar } from './auditoria.js';
import { ParametrosService } from './parametros.service.js';

export type Semaforo = 'verde' | 'ambar' | 'rojo';

const ORDEN_SEVERIDAD = sql`case ${alerta.severidad} when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end`;

/** Torre de control (OPE-01): la foto de la operación en este momento. */
@Injectable()
export class TorreService {
  private readonly log = new Logger('Torre');
  private ultimaRevision = new Date();

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(UbicacionStore) private readonly ubicaciones: UbicacionStore,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  /** Lo que se espera en cada estado y cuándo se pone en ámbar o rojo (parámetros de OPE-12). */
  private async umbrales() {
    const n = (k: Parameters<ParametrosService['numero']>[0]) => this.parametros.numero(k);
    return {
      buscando_conductor: [
        await n('semaforo.asignacion_ambar_s'),
        await n('semaforo.asignacion_rojo_s'),
      ],
      asignado: [await n('semaforo.llegada_ambar_s'), await n('semaforo.llegada_rojo_s')],
      en_sitio: [await n('semaforo.espera_ambar_s'), await n('semaforo.espera_rojo_s')],
    } as Record<string, [number, number]>;
  }

  async resumen() {
    const { db } = this.bd;
    const umbrales = await this.umbrales();
    const ahora = Date.now();

    const kpiConductores = await db.execute<{ estado: string; n: number }>(
      sql`select estado_operativo::text as estado, count(*)::int as n from conductor group by 1`,
    );
    const porEstado = Object.fromEntries(kpiConductores.rows.map((r) => [r.estado, r.n]));
    const enLinea = Object.entries(porEstado)
      .filter(([e]) => e !== 'desconectado')
      .reduce((a, [, n]) => a + n, 0);

    const [k] = (
      await db.execute<{
        solicitudes: number;
        asignacion_media_s: number | null;
        cancelados: number;
        total24: number;
        sin_conductor: number;
      }>(sql`
        select
          (select count(*)::int from viaje where solicitado_en > now() - interval '1 hour') as solicitudes,
          (select round(avg(extract(epoch from aceptado_en - solicitado_en)))::int from viaje
             where solicitado_en > now() - interval '1 hour' and aceptado_en is not null) as asignacion_media_s,
          (select count(*)::int from viaje where solicitado_en > now() - interval '24 hours' and estado = 'cancelado') as cancelados,
          (select count(*)::int from viaje where solicitado_en > now() - interval '24 hours') as total24,
          (select count(*)::int from viaje where solicitado_en > now() - interval '1 hour' and estado = 'sin_conductor') as sin_conductor`)
    ).rows;

    const pas = alias(usuario, 'pas');
    const con = alias(usuario, 'con');
    const activos = await db
      .select({
        id: viaje.id,
        codigo: viaje.codigo,
        estado: viaje.estado,
        solicitadoEn: viaje.solicitadoEn,
        aceptadoEn: viaje.aceptadoEn,
        enSitioEn: viaje.enSitioEn,
        iniciadoEn: viaje.iniciadoEn,
        origen: viaje.origen,
        destino: viaje.destino,
        origenDireccion: viaje.origenDireccion,
        destinoDireccion: viaje.destinoDireccion,
        categoria: viaje.categoria,
        tipoServicio: viaje.tipoServicio,
        metodoPago: viaje.metodoPago,
        conductorId: viaje.conductorId,
        pasajeroNombre: pas.nombre,
        conductorNombre: con.nombre,
        placa: vehiculo.placa,
        alertasAbiertas: sql<number>`(select count(*)::int from alerta a where a.viaje_id = ${viaje.id} and a.estado <> 'cerrada')`,
      })
      .from(viaje)
      .innerJoin(pas, eq(pas.id, viaje.pasajeroId))
      .leftJoin(con, eq(con.id, viaje.conductorId))
      .leftJoin(vehiculo, eq(vehiculo.id, viaje.vehiculoId))
      .where(inArray(viaje.estado, ['buscando_conductor', 'asignado', 'en_sitio', 'en_curso']))
      .orderBy(viaje.solicitadoEn)
      .limit(200);

    const viajesActivos = activos.map((v) => {
      const desde =
        v.estado === 'buscando_conductor'
          ? v.solicitadoEn
          : v.estado === 'asignado'
            ? (v.aceptadoEn ?? v.solicitadoEn)
            : v.estado === 'en_sitio'
              ? (v.enSitioEn ?? v.solicitadoEn)
              : (v.iniciadoEn ?? v.solicitadoEn);
      const segundos = Math.max(0, Math.round((ahora - desde.getTime()) / 1000));
      const u = umbrales[v.estado];
      let semaforo: Semaforo = 'verde';
      if (u) semaforo = segundos >= u[1] ? 'rojo' : segundos >= u[0] ? 'ambar' : 'verde';
      if (v.alertasAbiertas > 0) semaforo = 'rojo';
      return {
        id: v.id,
        codigo: v.codigo,
        estado: v.estado,
        enEstadoDesde: desde.toISOString(),
        segundosEnEstado: segundos,
        semaforo,
        pasajero: v.pasajeroNombre,
        conductor: v.conductorNombre,
        conductorId: v.conductorId,
        placa: v.placa,
        origen: v.origen,
        destino: v.destino,
        origenDireccion: v.origenDireccion,
        destinoDireccion: v.destinoDireccion,
        categoria: v.categoria,
        tipoServicio: v.tipoServicio,
        metodoPago: v.metodoPago,
        alertas: v.alertasAbiertas,
      };
    });

    const orden = { rojo: 0, ambar: 1, verde: 2 } as const;
    viajesActivos.sort(
      (a, b) => orden[a.semaforo] - orden[b.semaforo] || b.segundosEnEstado - a.segundosEnEstado,
    );

    const flotaFilas = await db
      .select({
        id: conductor.usuarioId,
        nombre: usuario.nombre,
        estado: conductor.estadoOperativo,
        placa: vehiculo.placa,
        categoria: vehiculo.categoria,
        bloqueadoPorDeuda: conductor.bloqueadoPorDeuda,
      })
      .from(conductor)
      .innerJoin(usuario, eq(usuario.id, conductor.usuarioId))
      .leftJoin(vehiculo, eq(vehiculo.id, conductor.vehiculoActivoId))
      .where(sql`${conductor.estadoOperativo} <> 'desconectado'`);
    const viajeDe = new Map(
      viajesActivos.filter((v) => v.conductorId).map((v) => [v.conductorId as string, v.codigo]),
    );
    const flota = flotaFilas.map((c) => {
      const u = this.ubicaciones.obtener(c.id);
      return {
        id: c.id,
        nombre: c.nombre,
        estado: c.estado,
        placa: c.placa,
        categoria: c.categoria,
        viaje: viajeDe.get(c.id) ?? null,
        posicion: u
          ? { lat: u.lat, lng: u.lng, edadS: Math.round((ahora - u.recibidaMs) / 1000) }
          : null,
      };
    });

    const alertas = await this.alertas(['abierta', 'tomada']);
    return {
      generadoEn: new Date(ahora).toISOString(),
      kpis: {
        conductoresEnLinea: enLinea,
        conductoresDisponibles: porEstado['disponible'] ?? 0,
        conductoresOcupados:
          (porEstado['en_camino'] ?? 0) +
          (porEstado['en_sitio'] ?? 0) +
          (porEstado['en_viaje'] ?? 0),
        conductoresSinSenal: porEstado['sin_senal'] ?? 0,
        viajesActivos: viajesActivos.length,
        solicitudesUltimaHora: k?.solicitudes ?? 0,
        asignacionMediaS: k?.asignacion_media_s ?? null,
        tasaCancelacion:
          k && k.total24 > 0 ? Math.round((k.cancelados / k.total24) * 1000) / 1000 : 0,
        demandaInsatisfechaUltimaHora: k?.sin_conductor ?? 0,
        alertasAbiertas: alertas.length,
      },
      flota,
      viajesActivos,
      sinAsignar: viajesActivos.filter((v) => v.estado === 'buscando_conductor'),
      alertas,
    };
  }

  async alertas(estados: ('abierta' | 'tomada' | 'cerrada')[], limite = 100) {
    const tom = alias(usuario, 'tom');
    const filas = await this.bd.db
      .select({
        id: alerta.id,
        tipo: alerta.tipo,
        severidad: alerta.severidad,
        estado: alerta.estado,
        viajeId: alerta.viajeId,
        codigoViaje: viaje.codigo,
        conductorId: alerta.conductorId,
        conductor: usuario.nombre,
        datos: alerta.datos,
        tomadaPor: alerta.tomadaPor,
        tomadaPorNombre: tom.nombre,
        tomadaEn: alerta.tomadaEn,
        notaCierre: alerta.notaCierre,
        creadaEn: alerta.creadaEn,
        cerradaEn: alerta.cerradaEn,
      })
      .from(alerta)
      .leftJoin(viaje, eq(viaje.id, alerta.viajeId))
      .leftJoin(usuario, eq(usuario.id, alerta.conductorId))
      .leftJoin(tom, eq(tom.id, alerta.tomadaPor))
      .where(inArray(alerta.estado, estados))
      .orderBy(ORDEN_SEVERIDAD, desc(alerta.creadaEn))
      .limit(limite);
    return filas.map((f) => ({
      ...f,
      tomadaEn: f.tomadaEn?.toISOString() ?? null,
      creadaEn: f.creadaEn.toISOString(),
      cerradaEn: f.cerradaEn?.toISOString() ?? null,
    }));
  }

  async tomar(id: string, operador: Operador) {
    const r = await this.bd.db.transaction(async (tx) => {
      const [a] = await tx.select().from(alerta).where(eq(alerta.id, id)).for('update');
      if (!a) throw noEncontrado('ALERTA_NO_ENCONTRADA', 'No encontramos esa alerta');
      if (a.estado !== 'abierta')
        throw conflicto(
          'ALERTA_YA_TOMADA',
          a.estado === 'tomada'
            ? 'Otra persona ya tomó esta alerta.'
            : 'Esta alerta ya está cerrada.',
        );
      await tx
        .update(alerta)
        .set({ estado: 'tomada', tomadaPor: operador.id, tomadaEn: new Date() })
        .where(eq(alerta.id, id));
      await auditar(tx, operador, { accion: 'alerta.tomar', entidad: 'alerta', entidadId: id });
      return a;
    });
    this.eventos.aOperacion('alerta:actualizada', { id, estado: 'tomada' });
    this.eventos.avisarTorre();
    return r.id;
  }

  async cerrar(id: string, nota: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [a] = await tx.select().from(alerta).where(eq(alerta.id, id)).for('update');
      if (!a) throw noEncontrado('ALERTA_NO_ENCONTRADA', 'No encontramos esa alerta');
      if (a.estado === 'cerrada') throw conflicto('ALERTA_CERRADA', 'Esta alerta ya está cerrada.');
      if (a.estado === 'tomada' && a.tomadaPor !== operador.id)
        throw conflicto('ALERTA_DE_OTRA_PERSONA', 'La está atendiendo otra persona.');
      await tx
        .update(alerta)
        .set({
          estado: 'cerrada',
          notaCierre: nota,
          cerradaEn: new Date(),
          tomadaPor: a.tomadaPor ?? operador.id,
          tomadaEn: a.tomadaEn ?? new Date(),
        })
        .where(eq(alerta.id, id));
      await auditar(tx, operador, {
        accion: 'alerta.cerrar',
        entidad: 'alerta',
        entidadId: id,
        antes: { estado: a.estado, tipo: a.tipo },
        motivo: nota,
      });
    });
    this.eventos.aOperacion('alerta:actualizada', { id, estado: 'cerrada' });
    this.eventos.avisarTorre();
  }

  /** Las alertas las crean varios servicios; aquí se detectan las nuevas y se avisa a las pantallas conectadas. */
  @Interval(2_000)
  async avisarNuevas(): Promise<void> {
    try {
      const desde = this.ultimaRevision;
      this.ultimaRevision = new Date();
      const nuevas = await this.bd.db
        .select({
          id: alerta.id,
          tipo: alerta.tipo,
          severidad: alerta.severidad,
          viajeId: alerta.viajeId,
          conductorId: alerta.conductorId,
        })
        .from(alerta)
        .where(and(gt(alerta.creadaEn, desde), eq(alerta.estado, 'abierta')));
      for (const a of nuevas) this.eventos.aOperacion('alerta:nueva', a);
      if (nuevas.length) this.eventos.avisarTorre();
    } catch (e) {
      this.log.error(`Aviso de alertas: ${e instanceof Error ? e.message : e}`);
    }
  }
}
