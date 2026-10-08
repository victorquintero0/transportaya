import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  alerta,
  conductor,
  cotizacion,
  pasajero,
  usuario,
  vehiculo,
  viaje,
} from '@transportaya/db';
import {
  apareceEnTablero,
  estadoDeReserva,
  limiteConfirmacion,
  momentoAlerta,
  momentoDespacho,
  puedeAtender,
  puedeSoltar,
  sePisan,
  seConfirmaAlTomar,
  type CategoriaVehiculo,
  type EstadoReserva,
} from '@transportaya/dominio';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { type Operador, auditar } from '../operacion/auditoria.js';
import { ParametrosService } from '../operacion/parametros.service.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { DespachoService } from './despacho.service.js';
import { primerNombre, registrarEvento, zonaDeDireccion } from './eventos-viaje.js';

type Viaje = typeof viaje.$inferSelect;
const FACTOR_RUTA = 1.35;
const COMISION_PB: Record<string, number> = { urbano: 300, nacional: 500 };

/** Lo que ve el conductor de una reserva: lo suficiente para decidir, sin el destino exacto (D-11). */
export interface ReservaParaConductor {
  id: string;
  codigo: string;
  programadoPara: string;
  categoria: string;
  tipoServicio: string;
  recogida: { lat: number; lng: number; direccion: string | null };
  destino: { zona: string; distanciaViajeM: number };
  precioEstimado: { min: number; max: number };
  gananciaEstimada: number;
  metodoPago: string;
  pasajero: { nombre: string; calificacion: number | null };
}

export interface MiReserva extends ReservaParaConductor {
  estado: 'tomada' | 'confirmada' | 'buscando';
  /** Hora límite para confirmar (solo si falta). */
  confirmarAntesDe: string | null;
  puedeSoltar: boolean;
}

/**
 * Reservas (RN-080 a RN-085): el tablero de los conductores, tomar, confirmar y soltar, y el trabajo que las activa a su
 * hora (despacho automático), las libera si nadie las confirma y avisa a la operación cuando siguen sin conductor.
 */
@Injectable()
export class ReservasService {
  private readonly log = new Logger('Reservas');

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(Eventos) private readonly eventos: Eventos,
    @Inject(DespachoService) private readonly despacho: DespachoService,
  ) {}

  // ───────────────────────────────────────────────────────── conductor
  private async paraConductor(v: Viaje): Promise<ReservaParaConductor> {
    const [p] = await this.bd.db
      .select({ nombre: usuario.nombre, calificacion: pasajero.calificacionPromedio })
      .from(pasajero)
      .innerJoin(usuario, eq(usuario.id, pasajero.usuarioId))
      .where(eq(pasajero.usuarioId, v.pasajeroId));
    const medio = Math.round((v.precioEstimadoMin + v.precioEstimadoMax) / 2);
    const pb =
      v.tipoServicio === 'intermunicipal' ? COMISION_PB['nacional']! : COMISION_PB['urbano']!;
    return {
      id: v.id,
      codigo: v.codigo,
      programadoPara: v.programadoPara!.toISOString(),
      categoria: v.categoria,
      tipoServicio: v.tipoServicio,
      recogida: { lat: v.origen.lat, lng: v.origen.lng, direccion: v.origenDireccion },
      destino: {
        zona: zonaDeDireccion(v.destinoDireccion),
        distanciaViajeM: Math.round(this.distancia(v) * FACTOR_RUTA),
      },
      precioEstimado: { min: v.precioEstimadoMin, max: v.precioEstimadoMax },
      gananciaEstimada: medio - Math.round((medio * pb) / 10_000),
      metodoPago: v.metodoPago,
      pasajero: {
        nombre: primerNombre(p?.nombre ?? 'Pasajero'),
        calificacion: p?.calificacion ?? null,
      },
    };
  }

  private distancia(v: Viaje): number {
    const rad = Math.PI / 180;
    const dLat = (v.destino.lat - v.origen.lat) * rad;
    const dLng = (v.destino.lng - v.origen.lng) * rad;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(v.origen.lat * rad) * Math.cos(v.destino.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async datosDelConductor(db: DbOTx, conductorId: string) {
    const [yo] = await db
      .select({
        ciudadId: conductor.ciudadId,
        habilitacion: conductor.estadoHabilitacion,
        deuda: conductor.bloqueadoPorDeuda,
        inferior: conductor.aceptaCategoriaInferior,
        intermunicipal: conductor.aceptaIntermunicipal,
        categoria: vehiculo.categoria,
      })
      .from(conductor)
      .leftJoin(vehiculo, eq(vehiculo.id, conductor.vehiculoActivoId))
      .where(eq(conductor.usuarioId, conductorId));
    if (!yo) throw noEncontrado('CONDUCTOR_NO_ENCONTRADO', 'No encontramos tu perfil de conductor');
    return yo;
  }

  /** ¿Puede este conductor tomar esta reserva? `null` si sí; si no, el motivo para decírselo. */
  private motivoNoPuede(
    yo: Awaited<ReturnType<ReservasService['datosDelConductor']>>,
    v: Pick<Viaje, 'categoria' | 'tipoServicio'>,
    ciudadId: string,
  ): { codigo: string; detalle: string } | null {
    if (yo.habilitacion !== 'habilitado' || yo.deuda || !yo.categoria)
      return {
        codigo: 'CONDUCTOR_NO_HABILITADO',
        detalle: 'Tu cuenta no está habilitada para tomar reservas.',
      };
    if (yo.ciudadId !== ciudadId)
      return { codigo: 'OTRA_CIUDAD', detalle: 'Esa reserva es de otra ciudad.' };
    if (
      !puedeAtender(
        yo.categoria as CategoriaVehiculo,
        v.categoria as CategoriaVehiculo,
        yo.inferior,
      )
    )
      return {
        codigo: 'CATEGORIA_NO_COMPATIBLE',
        detalle: 'Tu vehículo no atiende esa categoría.',
      };
    if (v.tipoServicio === 'intermunicipal' && !yo.intermunicipal)
      return {
        codigo: 'SIN_INTERMUNICIPAL',
        detalle: 'Activa los viajes entre ciudades en tu perfil para tomarla.',
      };
    return null;
  }

  private async horasQueTiene(db: DbOTx, conductorId: string, excepto?: string): Promise<Date[]> {
    const filas = await db
      .select({ hora: viaje.programadoPara })
      .from(viaje)
      .where(
        and(
          eq(viaje.reservaConductorId, conductorId),
          inArray(viaje.estado, ['programado', 'buscando_conductor']),
          excepto ? sql`${viaje.id} <> ${excepto}` : undefined,
        ),
      );
    return filas.map((f) => f.hora!).filter(Boolean);
  }

  /** El tablero: las reservas sin conductor que este conductor puede tomar, de la más próxima a la más lejana. */
  async tablero(conductorId: string): Promise<ReservaParaConductor[]> {
    const { db } = this.bd;
    const rp = await this.parametros.reservas();
    const ahora = new Date();
    const yo = await this.datosDelConductor(db, conductorId);
    if (yo.habilitacion !== 'habilitado' || yo.deuda || !yo.categoria) return [];
    const mias = await this.horasQueTiene(db, conductorId);
    const filas = await db
      .select({ v: viaje, ciudadId: cotizacion.ciudadId })
      .from(viaje)
      .innerJoin(cotizacion, eq(cotizacion.id, viaje.cotizacionId))
      .where(
        and(
          eq(viaje.estado, 'programado'),
          isNull(viaje.reservaConductorId),
          gte(viaje.programadoPara, ahora),
          lte(viaje.programadoPara, new Date(ahora.getTime() + rp.tableroH * 3_600_000)),
        ),
      )
      .orderBy(asc(viaje.programadoPara))
      .limit(100);
    const visibles = filas.filter(
      ({ v, ciudadId }) =>
        !this.motivoNoPuede(yo, v, ciudadId) && !mias.some((h) => sePisan(h, v.programadoPara!)),
    );
    return Promise.all(visibles.map(({ v }) => this.paraConductor(v)));
  }

  /** Las reservas que este conductor tomó y todavía no se han cumplido. */
  async mias(conductorId: string): Promise<MiReserva[]> {
    const rp = await this.parametros.reservas();
    const ahora = new Date();
    const filas = await this.bd.db
      .select()
      .from(viaje)
      .where(
        and(
          eq(viaje.reservaConductorId, conductorId),
          inArray(viaje.estado, ['programado', 'buscando_conductor']),
        ),
      )
      .orderBy(asc(viaje.programadoPara));
    return Promise.all(
      filas.map(async (v) => ({
        ...(await this.paraConductor(v)),
        estado: (v.estado === 'buscando_conductor'
          ? 'buscando'
          : v.reservaConfirmadaEn
            ? 'confirmada'
            : 'tomada') as MiReserva['estado'],
        confirmarAntesDe: v.reservaConfirmadaEn
          ? null
          : limiteConfirmacion(v.programadoPara!, rp).toISOString(),
        puedeSoltar: v.estado === 'programado' && puedeSoltar(v.programadoPara!, ahora, rp),
      })),
    );
  }

  async tomar(conductorId: string, viajeId: string): Promise<void> {
    const rp = await this.parametros.reservas();
    const ahora = new Date();
    const pasajeroId = await this.bd.db.transaction(async (tx) => {
      const [fila] = await tx
        .select({ v: viaje, ciudadId: cotizacion.ciudadId })
        .from(viaje)
        .innerJoin(cotizacion, eq(cotizacion.id, viaje.cotizacionId))
        .where(eq(viaje.id, viajeId))
        .for('update', { of: viaje });
      if (!fila || fila.v.estado !== 'programado' || !fila.v.programadoPara)
        throw noEncontrado('RESERVA_NO_DISPONIBLE', 'Esa reserva ya no está disponible.');
      const { v } = fila;
      const hora = fila.v.programadoPara;
      if (v.reservaConductorId)
        throw conflicto('RESERVA_TOMADA', 'Otro conductor tomó esa reserva primero.');
      if (hora.getTime() <= ahora.getTime() || apareceEnTablero(hora, rp) > ahora)
        throw conflicto('RESERVA_NO_DISPONIBLE', 'Esa reserva ya no está disponible.');

      const yo = await this.datosDelConductor(tx, conductorId);
      const motivo = this.motivoNoPuede(yo, v, fila.ciudadId);
      if (motivo) throw conflicto(motivo.codigo, motivo.detalle);
      const horas = await this.horasQueTiene(tx, conductorId);
      if (horas.some((h) => sePisan(h, hora)))
        throw conflicto('RESERVA_SE_PISA', 'Ya tienes una reserva a una hora muy cercana a esa.');

      const confirmaYa = seConfirmaAlTomar(hora, ahora, rp);
      await tx
        .update(viaje)
        .set({
          reservaConductorId: conductorId,
          reservaTomadaEn: ahora,
          reservaConfirmadaEn: confirmaYa ? ahora : null,
        })
        .where(eq(viaje.id, v.id));
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'reserva_tomada',
        actorTipo: 'conductor',
        actorId: conductorId,
        datos: { confirmada: confirmaYa },
      });
      return v.pasajeroId;
    });
    this.eventos.aPasajero(pasajeroId, 'viaje:estado', { viajeId, estado: 'programado' });
  }

  async confirmar(conductorId: string, viajeId: string): Promise<void> {
    const rp = await this.parametros.reservas();
    const ahora = new Date();
    const resultado = await this.bd.db.transaction(async (tx) => {
      const [v] = await tx.select().from(viaje).where(eq(viaje.id, viajeId)).for('update');
      if (!v || v.estado !== 'programado' || v.reservaConductorId !== conductorId)
        throw noEncontrado('RESERVA_NO_ENCONTRADA', 'No encontramos esa reserva entre las tuyas.');
      if (v.reservaConfirmadaEn) return { pasajeroId: v.pasajeroId, hecho: false };
      if (ahora.getTime() > limiteConfirmacion(v.programadoPara!, rp).getTime())
        throw conflicto(
          'CONFIRMACION_VENCIDA',
          'Se pasó la hora límite para confirmar. La reserva volvió al tablero.',
        );
      await tx.update(viaje).set({ reservaConfirmadaEn: ahora }).where(eq(viaje.id, v.id));
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'reserva_confirmada',
        actorTipo: 'conductor',
        actorId: conductorId,
      });
      return { pasajeroId: v.pasajeroId, hecho: true };
    });
    if (resultado.hecho)
      this.eventos.aPasajero(resultado.pasajeroId, 'viaje:estado', {
        viajeId,
        estado: 'programado',
      });
  }

  async soltar(conductorId: string, viajeId: string): Promise<void> {
    const rp = await this.parametros.reservas();
    const ahora = new Date();
    const pasajeroId = await this.bd.db.transaction(async (tx) => {
      const [v] = await tx.select().from(viaje).where(eq(viaje.id, viajeId)).for('update');
      if (!v || v.estado !== 'programado' || v.reservaConductorId !== conductorId)
        throw noEncontrado('RESERVA_NO_ENCONTRADA', 'No encontramos esa reserva entre las tuyas.');
      if (!puedeSoltar(v.programadoPara!, ahora, rp))
        throw conflicto(
          'SOLTAR_CON_SOPORTE',
          'Ya falta muy poco para el servicio. Para soltarla, comunícate con soporte.',
        );
      await this.limpiarReserva(tx, v.id);
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'reserva_liberada',
        actorTipo: 'conductor',
        actorId: conductorId,
        datos: { motivo: 'soltada_por_el_conductor' },
      });
      return v.pasajeroId;
    });
    this.eventos.aPasajero(pasajeroId, 'viaje:estado', { viajeId, estado: 'programado' });
  }

  private async limpiarReserva(db: DbOTx, viajeId: string): Promise<void> {
    await db
      .update(viaje)
      .set({ reservaConductorId: null, reservaTomadaEn: null, reservaConfirmadaEn: null })
      .where(eq(viaje.id, viajeId));
  }

  // ───────────────────────────────────────────────────────── trabajo periódico
  /**
   * Cada medio minuto: libera las reservas que nadie confirmó a tiempo, activa las que llegaron a su hora de despacho y
   * avisa a la operación de las que siguen sin conductor (RN-082, RN-083).
   */
  async mantener(): Promise<{ liberadas: number; activadas: number; alertas: number }> {
    const { db } = this.bd;
    const rp = await this.parametros.reservas();
    const ahora = new Date();
    const en = (min: number) => new Date(ahora.getTime() + min * 60_000);

    // 1. Sin confirmar a tiempo: vuelven al tablero.
    const liberadas = await db
      .update(viaje)
      .set({ reservaConductorId: null, reservaTomadaEn: null, reservaConfirmadaEn: null })
      .where(
        and(
          eq(viaje.estado, 'programado'),
          isNotNull(viaje.reservaConductorId),
          isNull(viaje.reservaConfirmadaEn),
          lte(viaje.programadoPara, en(rp.confirmarMin)),
        ),
      )
      .returning({ id: viaje.id, pasajeroId: viaje.pasajeroId });
    for (const l of liberadas) {
      await registrarEvento(db, {
        viajeId: l.id,
        tipo: 'reserva_liberada',
        actorTipo: 'sistema',
        datos: { motivo: 'sin_confirmar' },
      });
      this.eventos.aPasajero(l.pasajeroId, 'viaje:estado', { viajeId: l.id, estado: 'programado' });
    }

    // 2. Llegó la hora del despacho: pasa a buscar conductor (el conductor de la reserva, si lo hay, va primero).
    const activadas = await db
      .update(viaje)
      .set({ estado: 'buscando_conductor', busquedaDesde: ahora })
      .where(and(eq(viaje.estado, 'programado'), lte(viaje.programadoPara, en(rp.despachoMin))))
      .returning({ id: viaje.id, pasajeroId: viaje.pasajeroId });
    for (const a of activadas) {
      await registrarEvento(db, {
        viajeId: a.id,
        tipo: 'reserva_activada',
        actorTipo: 'sistema',
      });
      this.eventos.aPasajero(a.pasajeroId, 'viaje:estado', {
        viajeId: a.id,
        estado: 'buscando_conductor',
      });
      void this.despacho.intentar(a.id).catch((e) => this.log.error(`Activar ${a.id}: ${e}`));
    }

    // 3. Sigue sin conductor cuando falta poco: alerta alta a la operación.
    const sinConductor = await db
      .select({ id: viaje.id, programadoPara: viaje.programadoPara, estado: viaje.estado })
      .from(viaje)
      .where(
        and(
          inArray(viaje.estado, ['programado', 'buscando_conductor']),
          isNull(viaje.conductorId),
          lte(viaje.programadoPara, en(rp.alertaMin)),
          sql`not exists (select 1 from alerta a where a.viaje_id = ${viaje.id} and a.tipo = 'reserva_sin_conductor')`,
        ),
      );
    for (const s of sinConductor) {
      await db.insert(alerta).values({
        tipo: 'reserva_sin_conductor',
        severidad: 'alta',
        viajeId: s.id,
        datos: { programadoPara: s.programadoPara?.toISOString(), estado: s.estado },
      });
    }
    if (sinConductor.length) this.eventos.avisarTorre();
    return {
      liberadas: liberadas.length,
      activadas: activadas.length,
      alertas: sinConductor.length,
    };
  }

  /** Al arrancar: las reservas que ya debieron activarse (por ejemplo, tras una caída) se activan de una vez. */
  async alArrancar(): Promise<void> {
    await this.mantener();
  }

  // ───────────────────────────────────────────────────────── pasajero
  async proximasDelPasajero(pasajeroId: string) {
    const filas = await this.bd.db
      .select({ v: viaje, nombre: usuario.nombre })
      .from(viaje)
      .leftJoin(usuario, eq(usuario.id, viaje.reservaConductorId))
      .where(
        and(
          eq(viaje.pasajeroId, pasajeroId),
          isNotNull(viaje.programadoPara),
          inArray(viaje.estado, ['programado', 'buscando_conductor', 'asignado', 'en_sitio']),
        ),
      )
      .orderBy(asc(viaje.programadoPara));
    return filas.map(({ v, nombre }) => ({
      id: v.id,
      codigo: v.codigo,
      estado: v.estado,
      estadoReserva: estadoDeReserva(v),
      programadoPara: v.programadoPara!.toISOString(),
      categoria: v.categoria,
      origen: { direccion: v.origenDireccion },
      destino: { direccion: v.destinoDireccion },
      precioEstimado: { min: v.precioEstimadoMin, max: v.precioEstimadoMax },
      conductorConfirmado: !!v.reservaConfirmadaEn && !!nombre,
    }));
  }

  // ───────────────────────────────────────────────────────── operación
  async listarParaOperacion(f: { desde: Date; hasta: Date; estado?: EstadoReserva | undefined }) {
    const rp = await this.parametros.reservas();
    const ahora = new Date();
    const filas = await this.bd.db
      .select({
        v: viaje,
        pasajero: sql<string>`(select u.nombre from usuario u where u.id = ${viaje.pasajeroId})`,
        conductor: sql<
          string | null
        >`(select u.nombre from usuario u where u.id = coalesce(${viaje.conductorId}, ${viaje.reservaConductorId}))`,
        alerta: sql<boolean>`exists (select 1 from alerta a where a.viaje_id = ${viaje.id} and a.tipo = 'reserva_sin_conductor' and a.estado <> 'cerrada')`,
      })
      .from(viaje)
      .where(
        and(
          isNotNull(viaje.programadoPara),
          gte(viaje.programadoPara, f.desde),
          lte(viaje.programadoPara, f.hasta),
        ),
      )
      .orderBy(asc(viaje.programadoPara))
      .limit(500);
    const items = filas
      .map(({ v, pasajero: nombrePasajero, conductor: nombreConductor, alerta: conAlerta }) => {
        const estado = estadoDeReserva(v);
        const enRiesgo =
          (estado === 'sin_conductor' || estado === 'tomada' || estado === 'buscando') &&
          v.programadoPara! <= new Date(ahora.getTime() + rp.despachoMin * 60_000);
        return {
          id: v.id,
          codigo: v.codigo,
          estado: v.estado,
          estadoReserva: estado,
          programadoPara: v.programadoPara!.toISOString(),
          categoria: v.categoria,
          tipoServicio: v.tipoServicio,
          origen: v.origenDireccion,
          destino: v.destinoDireccion,
          pasajero: nombrePasajero,
          conductor: nombreConductor,
          precioEstimado: { min: v.precioEstimadoMin, max: v.precioEstimadoMax },
          metodoPago: v.metodoPago,
          confirmarAntesDe:
            estado === 'tomada' ? limiteConfirmacion(v.programadoPara!, rp).toISOString() : null,
          despachoEn: momentoDespacho(v.programadoPara!, rp).toISOString(),
          alertaEn: momentoAlerta(v.programadoPara!, rp).toISOString(),
          enRiesgo,
          conAlerta,
        };
      })
      .filter((r) => !f.estado || r.estadoReserva === f.estado);
    const cuenta = (e: EstadoReserva) => items.filter((r) => r.estadoReserva === e).length;
    return {
      items,
      resumen: {
        sinConductor: cuenta('sin_conductor'),
        tomadas: cuenta('tomada'),
        confirmadas: cuenta('confirmada'),
        buscando: cuenta('buscando'),
        enRiesgo: items.filter((r) => r.enRiesgo).length,
      },
    };
  }

  /** Conductores que podrían tomar esta reserva (aunque estén desconectados), para que la operación elija. */
  async conductoresParaReserva(viajeId: string, q?: string) {
    const { db } = this.bd;
    const [fila] = await db
      .select({ v: viaje, ciudadId: cotizacion.ciudadId })
      .from(viaje)
      .innerJoin(cotizacion, eq(cotizacion.id, viaje.cotizacionId))
      .where(eq(viaje.id, viajeId));
    if (!fila?.v.programadoPara)
      throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos esa reserva');
    const hora = fila.v.programadoPara;
    const candidatos = await db
      .select({
        id: conductor.usuarioId,
        nombre: usuario.nombre,
        telefono: usuario.telefono,
        estadoOperativo: conductor.estadoOperativo,
        placa: vehiculo.placa,
        categoria: vehiculo.categoria,
        inferior: conductor.aceptaCategoriaInferior,
        intermunicipal: conductor.aceptaIntermunicipal,
        habilitacion: conductor.estadoHabilitacion,
        deuda: conductor.bloqueadoPorDeuda,
        ciudadId: conductor.ciudadId,
      })
      .from(conductor)
      .innerJoin(usuario, eq(usuario.id, conductor.usuarioId))
      .innerJoin(vehiculo, eq(vehiculo.id, conductor.vehiculoActivoId))
      .where(
        and(
          eq(conductor.estadoHabilitacion, 'habilitado'),
          eq(conductor.bloqueadoPorDeuda, false),
          q
            ? sql`${usuario.nombre} ilike ${`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`
            : undefined,
        ),
      )
      .orderBy(asc(usuario.nombre))
      .limit(200);
    const resultado = [];
    for (const c of candidatos) {
      const yo = {
        ciudadId: c.ciudadId,
        habilitacion: c.habilitacion,
        deuda: c.deuda,
        inferior: c.inferior,
        intermunicipal: c.intermunicipal,
        categoria: c.categoria,
      };
      if (this.motivoNoPuede(yo, fila.v, fila.ciudadId)) continue;
      const horas = await this.horasQueTiene(db, c.id, viajeId);
      if (horas.some((h) => sePisan(h, hora))) continue;
      resultado.push({
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        placa: c.placa,
        categoria: c.categoria,
        estadoOperativo: c.estadoOperativo,
      });
      if (resultado.length >= 50) break;
    }
    return resultado;
  }

  /** La operación pone conductor a una reserva que todavía no se activó. Queda confirmada de una vez. */
  async asignarDesdeOperacion(
    viajeId: string,
    conductorId: string,
    motivo: string,
    operador: Operador,
  ): Promise<void> {
    const ahora = new Date();
    const pasajeroId = await this.bd.db.transaction(async (tx) => {
      const [fila] = await tx
        .select({ v: viaje, ciudadId: cotizacion.ciudadId })
        .from(viaje)
        .innerJoin(cotizacion, eq(cotizacion.id, viaje.cotizacionId))
        .where(eq(viaje.id, viajeId))
        .for('update', { of: viaje });
      if (!fila) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos esa reserva');
      const { v } = fila;
      if (v.estado !== 'programado')
        throw conflicto(
          'ESTADO_INVALIDO',
          v.estado === 'buscando_conductor'
            ? 'Esa reserva ya está buscando conductor: despáchala a mano desde Viajes.'
            : 'Esa reserva ya no está programada.',
        );
      const yo = await this.datosDelConductor(tx, conductorId);
      const razon = this.motivoNoPuede(yo, v, fila.ciudadId);
      if (razon) throw conflicto(razon.codigo, razon.detalle);
      const horas = await this.horasQueTiene(tx, conductorId, viajeId);
      if (horas.some((h) => sePisan(h, v.programadoPara!)))
        throw conflicto(
          'RESERVA_SE_PISA',
          'Ese conductor ya tiene una reserva a una hora muy cercana.',
        );
      await tx
        .update(viaje)
        .set({
          reservaConductorId: conductorId,
          reservaTomadaEn: ahora,
          reservaConfirmadaEn: ahora,
        })
        .where(eq(viaje.id, viajeId));
      await registrarEvento(tx, {
        viajeId,
        tipo: 'reserva_asignada',
        actorTipo: 'operacion',
        actorId: operador.id,
        datos: { conductorId, anterior: v.reservaConductorId },
      });
      await auditar(tx, operador, {
        accion: 'reserva.asignar',
        entidad: 'viaje',
        entidadId: viajeId,
        antes: { conductorId: v.reservaConductorId },
        despues: { conductorId },
        motivo,
      });
      return v.pasajeroId;
    });
    this.eventos.aConductor(conductorId, 'reserva:cambio', { viajeId, motivo: 'asignada' });
    this.eventos.aPasajero(pasajeroId, 'viaje:estado', { viajeId, estado: 'programado' });
  }

  async liberarDesdeOperacion(viajeId: string, motivo: string, operador: Operador): Promise<void> {
    const r = await this.bd.db.transaction(async (tx) => {
      const [v] = await tx.select().from(viaje).where(eq(viaje.id, viajeId)).for('update');
      if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos esa reserva');
      if (v.estado !== 'programado' || !v.reservaConductorId)
        throw conflicto('ESTADO_INVALIDO', 'Esa reserva no tiene un conductor que liberar.');
      await this.limpiarReserva(tx, viajeId);
      await registrarEvento(tx, {
        viajeId,
        tipo: 'reserva_liberada',
        actorTipo: 'operacion',
        actorId: operador.id,
        datos: { conductorId: v.reservaConductorId },
      });
      await auditar(tx, operador, {
        accion: 'reserva.liberar',
        entidad: 'viaje',
        entidadId: viajeId,
        antes: { conductorId: v.reservaConductorId },
        motivo,
      });
      return { conductorId: v.reservaConductorId, pasajeroId: v.pasajeroId };
    });
    this.eventos.aConductor(r.conductorId, 'reserva:cambio', { viajeId, motivo: 'liberada' });
    this.eventos.aPasajero(r.pasajeroId, 'viaje:estado', { viajeId, estado: 'programado' });
  }
}
