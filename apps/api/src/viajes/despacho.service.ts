import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  conductor,
  cotizacion,
  oferta,
  pasajero,
  rutaFija,
  sesionConductor,
  usuario,
  vehiculo,
  viaje,
} from '@transportaya/db';
import {
  ambitoComision,
  COMISION_PUNTOS_BASICOS,
  distanciaMetros,
  puedeAtender,
  type CategoriaVehiculo,
} from '@transportaya/dominio';
import { and, eq, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { UbicacionStore } from '../conductor/ubicacion.store.js';
import { ParametrosService } from '../operacion/parametros.service.js';
import { Eventos, type OfertaParaConductor } from '../tiempo-real/eventos.service.js';
import { primerNombre, registrarEvento, zonaDeDireccion } from './eventos-viaje.js';

export const PARAMETROS_DESPACHO = Symbol('PARAMETROS_DESPACHO');

/** Parámetros del despacho (RN-030 a RN-033). Son valores iniciales configurables desde la App Operación. */
export interface ParametrosDespacho {
  /** Tiempo que tiene el conductor para aceptar. */
  ofertaMs: number;
  /** Cada cuánto se reintenta si no hay conductores disponibles. */
  reintentoMs: number;
  /** Tiempo total para encontrar conductor antes de dar el viaje por "sin conductor". */
  presupuestoMs: number;
  /** Radio máximo de búsqueda en metros (la búsqueda va del más cercano al más lejano). */
  radioMaximoM: number;
  /** Solo se ofrece a quien reportó su posición hace menos de esto. */
  edadMaximaPosicionMs: number;
  /** Para estimar el tiempo de llegada mientras no hay motor de rutas: velocidad media y factor de rodeo. */
  velocidadMediaKmh: number;
  factorRuta: number;
}

export const DESPACHO_POR_DEFECTO: ParametrosDespacho = {
  ofertaMs: 15_000,
  reintentoMs: 5_000,
  presupuestoMs: 120_000,
  radioMaximoM: 8_000,
  edadMaximaPosicionMs: 30_000,
  velocidadMediaKmh: 25,
  factorRuta: 1.35,
};

interface Candidato {
  conductorId: string;
  distanciaM: number;
  conectadoDesde: number;
}

@Injectable()
export class DespachoService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Despacho');
  private readonly expiraciones = new Map<string, NodeJS.Timeout>();
  private readonly reintentos = new Map<string, NodeJS.Timeout>();
  private cerrando = false;

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(UbicacionStore) private readonly ubicaciones: UbicacionStore,
    @Inject(Eventos) private readonly eventos: Eventos,
    @Inject(PARAMETROS_DESPACHO) private readonly p: ParametrosDespacho,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
  ) {}

  /**
   * Pone en uso los valores que la operación cambió desde la App Operación (OPE-12). Solo toca lo que alguien
   * personalizó: lo demás conserva su valor.
   */
  async aplicarParametros(): Promise<void> {
    const v = await this.parametros.personalizados('despacho.');
    const ms = (k: string) => (v[k] === undefined ? undefined : v[k] * 1000);
    const nuevos: Partial<ParametrosDespacho> = {};
    const poner = <K extends keyof ParametrosDespacho>(k: K, valor: number | undefined) => {
      if (valor !== undefined) nuevos[k] = valor;
    };
    poner('ofertaMs', ms('despacho.oferta_s'));
    poner('reintentoMs', ms('despacho.reintento_s'));
    poner('presupuestoMs', ms('despacho.presupuesto_s'));
    poner('radioMaximoM', v['despacho.radio_m']);
    poner('edadMaximaPosicionMs', ms('despacho.edad_posicion_s'));
    Object.assign(this.p, nuevos);
  }

  /** Tras un reinicio: vence las ofertas que quedaron colgadas y retoma los viajes que buscaban conductor. */
  async onApplicationBootstrap(): Promise<void> {
    await this.aplicarParametros();
    const colgadas = await this.bd.db
      .update(oferta)
      .set({ resultado: 'expirada', respondidaEn: new Date() })
      .where(eq(oferta.resultado, 'pendiente'))
      .returning({ conductorId: oferta.conductorId });
    for (const { conductorId } of colgadas) {
      await this.bd.db
        .update(conductor)
        .set({ estadoOperativo: 'disponible' })
        .where(
          and(eq(conductor.usuarioId, conductorId), eq(conductor.estadoOperativo, 'con_oferta')),
        );
    }
    const buscando = await this.bd.db
      .select({ id: viaje.id })
      .from(viaje)
      .where(eq(viaje.estado, 'buscando_conductor'));
    for (const { id } of buscando) void this.intentar(id);
  }

  onModuleDestroy(): void {
    this.cerrando = true;
    for (const t of [...this.expiraciones.values(), ...this.reintentos.values()]) clearTimeout(t);
    this.expiraciones.clear();
    this.reintentos.clear();
  }

  /** Empieza a buscar conductor para un viaje recién solicitado. */
  iniciar(viajeId: string): Promise<void> {
    return this.intentar(viajeId);
  }

  /**
   * Cuántos conductores podrían atender un viaje desde ese punto y en cuánto llegaría el más cercano. Es lo que
   * ve el pasajero al cotizar (PAS-22); no reserva a nadie.
   */
  async disponibilidad(
    ciudadId: string,
    origen: { lat: number; lng: number },
    categoria: CategoriaVehiculo,
    tipoServicio: 'inmediato' | 'intermunicipal',
  ): Promise<{ conductores: number; etaS: number | null }> {
    const cercanos = await this.candidatos(
      { origen, categoria, tipoServicio },
      ciudadId,
      new Set(),
    );
    if (cercanos.length === 0) return { conductores: 0, etaS: null };
    const masCercano = cercanos[0]!;
    return {
      conductores: cercanos.length,
      etaS: Math.round(
        (masCercano.distanciaM * this.p.factorRuta) / ((this.p.velocidadMediaKmh * 1000) / 3600),
      ),
    };
  }

  /** Ofrece el viaje al siguiente mejor candidato. Si no hay, reintenta hasta agotar el tiempo. */
  async intentar(viajeId: string): Promise<void> {
    if (this.cerrando) return;
    const { db } = this.bd;
    const [v] = await db
      .select({ v: viaje, ciudadId: cotizacion.ciudadId })
      .from(viaje)
      .innerJoin(cotizacion, eq(cotizacion.id, viaje.cotizacionId))
      .where(eq(viaje.id, viajeId));
    if (!v || v.v.estado !== 'buscando_conductor') return;

    if (Date.now() - v.v.solicitadoEn.getTime() > this.p.presupuestoMs) {
      await this.marcarSinConductor(viajeId);
      return;
    }

    const yaOfrecidos = await db
      .select({ id: oferta.conductorId })
      .from(oferta)
      .where(eq(oferta.viajeId, viajeId));
    const candidatos = await this.candidatos(
      v.v,
      v.ciudadId,
      new Set(yaOfrecidos.map((o) => o.id)),
    );
    for (const c of candidatos) {
      if (await this.ofrecer(v.v, c)) return;
    }
    this.programarReintento(viajeId);
  }

  /** Los temporizadores pueden terminar de ejecutarse mientras la aplicación se apaga: eso no es un error. */
  private errorEnTemporizador(contexto: string, error: unknown): void {
    if (!this.cerrando)
      this.log.error(`${contexto}: ${error instanceof Error ? error.message : error}`);
  }

  private programarReintento(viajeId: string): void {
    if (this.cerrando) return;
    clearTimeout(this.reintentos.get(viajeId));
    this.reintentos.set(
      viajeId,
      setTimeout(() => {
        this.reintentos.delete(viajeId);
        void this.intentar(viajeId).catch((e) =>
          this.errorEnTemporizador(`Reintento del viaje ${viajeId}`, e),
        );
      }, this.p.reintentoMs),
    );
  }

  /**
   * Candidatos (RN-030): en línea y disponibles, habilitados, sin deuda, de la ciudad, con posición reciente,
   * que pueden atender la categoría y el tipo de servicio. Ordenados por cercanía a la recogida y, en
   * empate, por quien lleva más tiempo conectado (RN-031).
   */
  private async candidatos(
    v: Pick<typeof viaje.$inferSelect, 'origen' | 'categoria' | 'tipoServicio'>,
    ciudadId: string,
    excluidos: Set<string>,
  ): Promise<Candidato[]> {
    const filas = await this.bd.db
      .select({
        id: conductor.usuarioId,
        categoria: vehiculo.categoria,
        aceptaInferior: conductor.aceptaCategoriaInferior,
        aceptaIntermunicipal: conductor.aceptaIntermunicipal,
        desde: sql<Date | null>`(select min(s.inicio) from ${sesionConductor} s where s.conductor_id = ${conductor.usuarioId} and s.fin is null)`,
      })
      .from(conductor)
      .innerJoin(vehiculo, eq(vehiculo.id, conductor.vehiculoActivoId))
      .where(
        and(
          eq(conductor.estadoOperativo, 'disponible'),
          eq(conductor.estadoHabilitacion, 'habilitado'),
          eq(conductor.bloqueadoPorDeuda, false),
          eq(conductor.ciudadId, ciudadId),
        ),
      );

    const ahora = Date.now();
    const candidatos: Candidato[] = [];
    for (const f of filas) {
      if (excluidos.has(f.id)) continue;
      if (!puedeAtender(f.categoria, v.categoria as CategoriaVehiculo, f.aceptaInferior)) continue;
      if (v.tipoServicio === 'intermunicipal' && !f.aceptaIntermunicipal) continue;
      const u = this.ubicaciones.obtener(f.id);
      if (!u || !Number.isFinite(u.lat) || ahora - u.recibidaMs > this.p.edadMaximaPosicionMs)
        continue;
      const distanciaM = distanciaMetros(u, v.origen);
      if (distanciaM > this.p.radioMaximoM) continue;
      candidatos.push({
        conductorId: f.id,
        distanciaM,
        conectadoDesde: f.desde ? new Date(f.desde).getTime() : ahora,
      });
    }
    return candidatos.sort(
      (a, b) => a.distanciaM - b.distanciaM || a.conectadoDesde - b.conectadoDesde,
    );
  }

  private async ofrecer(v: typeof viaje.$inferSelect, c: Candidato): Promise<boolean> {
    const { db } = this.bd;
    const etaS = Math.round(
      (c.distanciaM * this.p.factorRuta) / ((this.p.velocidadMediaKmh * 1000) / 3600),
    );
    const expiraEn = new Date(Date.now() + this.p.ofertaMs);

    const creada = await db.transaction(async (tx) => {
      // Si mientras tanto la operación asignó el viaje a mano (o se canceló), ya no hay nada que ofrecer.
      const [actual] = await tx
        .select({ estado: viaje.estado })
        .from(viaje)
        .where(eq(viaje.id, v.id))
        .for('update');
      if (actual?.estado !== 'buscando_conductor') return null;
      // Solo se ofrece a quien sigue disponible: si otro despacho se le adelantó, se pasa al siguiente.
      const bloqueado = await tx
        .update(conductor)
        .set({ estadoOperativo: 'con_oferta' })
        .where(
          and(eq(conductor.usuarioId, c.conductorId), eq(conductor.estadoOperativo, 'disponible')),
        )
        .returning({ id: conductor.usuarioId });
      if (bloqueado.length === 0) return null;

      const [{ ronda }] = (
        await tx.execute<{ ronda: number }>(
          sql`select coalesce(max(ronda), 0)::int + 1 as ronda from oferta where viaje_id = ${v.id}`,
        )
      ).rows as [{ ronda: number }];
      const [fila] = await tx
        .insert(oferta)
        .values({
          viajeId: v.id,
          conductorId: c.conductorId,
          ronda,
          etaRecogidaS: etaS,
          distanciaRecogidaM: Math.round(c.distanciaM),
          expiraEn,
        })
        .returning();
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'oferta_enviada',
        actorTipo: 'sistema',
        datos: {
          conductorId: c.conductorId,
          ofertaId: fila!.id,
          etaS,
          distanciaM: Math.round(c.distanciaM),
        },
      });
      return fila!;
    });
    if (!creada) return false;

    this.expiraciones.set(
      creada.id,
      setTimeout(() => {
        this.expiraciones.delete(creada.id);
        void this.expirar(creada.id).catch((e) =>
          this.errorEnTemporizador(`Expirar oferta ${creada.id}`, e),
        );
      }, this.p.ofertaMs),
    );

    this.eventos.aConductor(
      c.conductorId,
      'oferta:nueva',
      await this.paraConductor(v, creada.id, c.distanciaM, etaS, expiraEn),
    );
    this.eventos.aConductor(c.conductorId, 'conductor:estado', { estadoOperativo: 'con_oferta' });
    return true;
  }

  private async paraConductor(
    v: typeof viaje.$inferSelect,
    ofertaId: string,
    distanciaM: number,
    etaS: number,
    expiraEn: Date,
  ): Promise<OfertaParaConductor> {
    const [p] = await this.bd.db
      .select({ nombre: usuario.nombre, calificacion: pasajero.calificacionPromedio })
      .from(pasajero)
      .innerJoin(usuario, eq(usuario.id, pasajero.usuarioId))
      .where(eq(pasajero.usuarioId, v.pasajeroId));
    const medio = Math.round((v.precioEstimadoMin + v.precioEstimadoMax) / 2);
    const comision = Math.round(
      (medio * COMISION_PUNTOS_BASICOS[ambitoComision(v.tipoServicio)]) / 10_000,
    );
    return {
      ofertaId,
      viajeId: v.id,
      expiraEn: expiraEn.toISOString(),
      segundosParaResponder: Math.round(this.p.ofertaMs / 1000),
      recogida: {
        lat: v.origen.lat,
        lng: v.origen.lng,
        direccion: v.origenDireccion,
        distanciaM: Math.round(distanciaM),
        etaS,
      },
      destino: {
        zona: zonaDeDireccion(v.destinoDireccion),
        distanciaViajeM: Math.round(distanciaMetros(v.origen, v.destino) * this.p.factorRuta),
      },
      gananciaEstimada: medio - comision,
      precioEstimado: { min: v.precioEstimadoMin, max: v.precioEstimadoMax },
      metodoPago: v.metodoPago,
      categoria: v.categoria,
      tipoServicio: v.tipoServicio,
      pasajero: {
        nombre: primerNombre(p?.nombre ?? 'Pasajero'),
        calificacion: p?.calificacion ?? null,
      },
    };
  }

  private async cerrarOferta(
    ofertaId: string,
    resultado: 'expirada' | 'rechazada' | 'retirada',
  ): Promise<{ viajeId: string; conductorId: string } | null> {
    clearTimeout(this.expiraciones.get(ofertaId));
    this.expiraciones.delete(ofertaId);
    const { db } = this.bd;
    const cerrada = await db
      .update(oferta)
      .set({ resultado, respondidaEn: new Date() })
      .where(and(eq(oferta.id, ofertaId), eq(oferta.resultado, 'pendiente')))
      .returning({ viajeId: oferta.viajeId, conductorId: oferta.conductorId });
    const o = cerrada[0];
    if (!o) return null;
    const liberado = await db
      .update(conductor)
      .set({ estadoOperativo: 'disponible' })
      .where(
        and(eq(conductor.usuarioId, o.conductorId), eq(conductor.estadoOperativo, 'con_oferta')),
      )
      .returning({ id: conductor.usuarioId });
    if (liberado.length)
      this.eventos.aConductor(o.conductorId, 'conductor:estado', { estadoOperativo: 'disponible' });
    return o;
  }

  /** Venció el tiempo de la oferta sin respuesta: pasa al siguiente. */
  async expirar(ofertaId: string): Promise<void> {
    const o = await this.cerrarOferta(ofertaId, 'expirada');
    if (!o) return;
    await registrarEvento(this.bd.db, {
      viajeId: o.viajeId,
      tipo: 'oferta_expirada',
      actorTipo: 'sistema',
      datos: { ofertaId, conductorId: o.conductorId },
    });
    this.eventos.aConductor(o.conductorId, 'oferta:retirada', {
      ofertaId,
      viajeId: o.viajeId,
      motivo: 'expirada',
    });
    await this.intentar(o.viajeId);
  }

  async rechazar(conductorId: string, ofertaId: string): Promise<void> {
    const [o] = await this.bd.db.select().from(oferta).where(eq(oferta.id, ofertaId));
    if (!o || o.conductorId !== conductorId)
      throw noEncontrado('OFERTA_NO_ENCONTRADA', 'No encontramos esa oferta');
    if (o.resultado !== 'pendiente')
      throw conflicto('OFERTA_NO_VIGENTE', 'Esa oferta ya no está disponible.');
    const cerrada = await this.cerrarOferta(ofertaId, 'rechazada');
    if (!cerrada) throw conflicto('OFERTA_NO_VIGENTE', 'Esa oferta ya no está disponible.');
    await registrarEvento(this.bd.db, {
      viajeId: o.viajeId,
      tipo: 'oferta_rechazada',
      actorTipo: 'conductor',
      actorId: conductorId,
      datos: { ofertaId },
    });
    await this.intentar(o.viajeId);
  }

  /**
   * Acepta la oferta de forma atómica (docs/09): si el tiempo venció o el pasajero ya canceló, no hay
   * asignación. Un viaje nunca queda con dos conductores.
   */
  async aceptar(conductorId: string, ofertaId: string): Promise<{ viajeId: string }> {
    const { db } = this.bd;
    const resultado = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(oferta).where(eq(oferta.id, ofertaId)).for('update');
      if (!o || o.conductorId !== conductorId)
        throw noEncontrado('OFERTA_NO_ENCONTRADA', 'No encontramos esa oferta');
      if (o.resultado !== 'pendiente')
        return { error: conflicto('OFERTA_NO_VIGENTE', 'Esa oferta ya no está disponible.') };
      if (o.expiraEn.getTime() <= Date.now())
        return {
          error: conflicto('OFERTA_VENCIDA', 'Se acabó el tiempo para aceptar.'),
          expirada: true,
        };

      const [v] = await tx.select().from(viaje).where(eq(viaje.id, o.viajeId)).for('update');
      if (!v || v.estado !== 'buscando_conductor') {
        await tx
          .update(oferta)
          .set({ resultado: 'retirada', respondidaEn: new Date() })
          .where(eq(oferta.id, ofertaId));
        return {
          error: conflicto('OFERTA_NO_VIGENTE', 'El pasajero ya canceló este viaje.'),
          retirada: true,
        };
      }
      const [yo] = await tx
        .select({ vehiculoId: conductor.vehiculoActivoId })
        .from(conductor)
        .where(eq(conductor.usuarioId, conductorId));

      await tx
        .update(oferta)
        .set({ resultado: 'aceptada', respondidaEn: new Date() })
        .where(eq(oferta.id, ofertaId));
      await tx
        .update(viaje)
        .set({
          estado: 'asignado',
          conductorId,
          vehiculoId: yo!.vehiculoId,
          aceptadoEn: new Date(),
        })
        .where(eq(viaje.id, v.id));
      await tx
        .update(conductor)
        .set({ estadoOperativo: 'en_camino' })
        .where(
          and(eq(conductor.usuarioId, conductorId), eq(conductor.estadoOperativo, 'con_oferta')),
        );
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'asignado',
        actorTipo: 'conductor',
        actorId: conductorId,
        datos: { ofertaId },
      });
      return { viajeId: v.id, pasajeroId: v.pasajeroId };
    });

    clearTimeout(this.expiraciones.get(ofertaId));
    this.expiraciones.delete(ofertaId);
    if ('error' in resultado) {
      if (resultado.expirada) await this.expirar(ofertaId);
      if (resultado.retirada) {
        await this.bd.db
          .update(conductor)
          .set({ estadoOperativo: 'disponible' })
          .where(
            and(eq(conductor.usuarioId, conductorId), eq(conductor.estadoOperativo, 'con_oferta')),
          );
        this.eventos.aConductor(conductorId, 'conductor:estado', { estadoOperativo: 'disponible' });
      }
      throw resultado.error;
    }
    this.eventos.aConductor(conductorId, 'viaje:estado', {
      viajeId: resultado.viajeId,
      estado: 'asignado',
    });
    this.eventos.aConductor(conductorId, 'conductor:estado', { estadoOperativo: 'en_camino' });
    this.eventos.aPasajero(resultado.pasajeroId, 'viaje:estado', {
      viajeId: resultado.viajeId,
      estado: 'asignado',
    });
    return { viajeId: resultado.viajeId };
  }

  /** Un parámetro de despacho vuelve a su valor por defecto sin reiniciar. */
  restablecerParametro(clave: string, valor: number): void {
    const campos: Record<string, [keyof ParametrosDespacho, number]> = {
      'despacho.oferta_s': ['ofertaMs', 1000],
      'despacho.reintento_s': ['reintentoMs', 1000],
      'despacho.presupuesto_s': ['presupuestoMs', 1000],
      'despacho.radio_m': ['radioMaximoM', 1],
      'despacho.edad_posicion_s': ['edadMaximaPosicionMs', 1000],
    };
    const c = campos[clave];
    if (c) this.p[c[0]] = valor * c[1];
  }

  /**
   * Despacho manual desde la App Operación (OPE-01): la operación elige el conductor sin esperar la oferta. Solo
   * funciona mientras el viaje sigue buscando conductor. Retira las ofertas abiertas y asigna de forma atómica.
   */
  async asignarManual(viajeId: string, conductorId: string, operadorId: string): Promise<void> {
    const { db } = this.bd;
    const pendientes = await db
      .select({ id: oferta.id, conductorId: oferta.conductorId })
      .from(oferta)
      .where(and(eq(oferta.viajeId, viajeId), eq(oferta.resultado, 'pendiente')));
    for (const p of pendientes) {
      await this.cerrarOferta(p.id, 'retirada');
      this.eventos.aConductor(p.conductorId, 'oferta:retirada', {
        ofertaId: p.id,
        viajeId,
        motivo: 'tomada',
      });
    }
    clearTimeout(this.reintentos.get(viajeId));
    this.reintentos.delete(viajeId);

    try {
      const pasajeroId = await db.transaction(async (tx) => {
        const [v] = await tx.select().from(viaje).where(eq(viaje.id, viajeId)).for('update');
        if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
        if (v.estado !== 'buscando_conductor')
          throw conflicto(
            'ESTADO_INVALIDO',
            'Este viaje ya no está buscando conductor, no se puede despachar a mano.',
          );
        const [c] = await tx
          .select({
            vehiculoId: conductor.vehiculoActivoId,
            habilitacion: conductor.estadoHabilitacion,
            deuda: conductor.bloqueadoPorDeuda,
          })
          .from(conductor)
          .where(eq(conductor.usuarioId, conductorId))
          .for('update');
        if (!c) throw noEncontrado('CONDUCTOR_NO_ENCONTRADO', 'No encontramos a ese conductor');
        if (c.habilitacion !== 'habilitado' || c.deuda || !c.vehiculoId)
          throw conflicto(
            'CONDUCTOR_NO_HABILITADO',
            'Ese conductor no está habilitado para trabajar.',
          );
        const tomado = await tx
          .update(conductor)
          .set({ estadoOperativo: 'en_camino' })
          .where(
            and(eq(conductor.usuarioId, conductorId), eq(conductor.estadoOperativo, 'disponible')),
          )
          .returning({ id: conductor.usuarioId });
        if (tomado.length === 0)
          throw conflicto(
            'CONDUCTOR_NO_DISPONIBLE',
            'Ese conductor ya no está disponible. Elige otro.',
          );
        const [{ ronda }] = (
          await tx.execute<{ ronda: number }>(
            sql`select coalesce(max(ronda), 0)::int + 1 as ronda from oferta where viaje_id = ${viajeId}`,
          )
        ).rows as [{ ronda: number }];
        const ahora = new Date();
        await tx.insert(oferta).values({
          viajeId,
          conductorId,
          ronda,
          ofrecidaEn: ahora,
          expiraEn: new Date(ahora.getTime() + 1000),
          respondidaEn: ahora,
          resultado: 'aceptada',
        });
        await tx
          .update(viaje)
          .set({
            estado: 'asignado',
            conductorId,
            vehiculoId: c.vehiculoId,
            aceptadoEn: ahora,
          })
          .where(eq(viaje.id, viajeId));
        await registrarEvento(tx, {
          viajeId,
          tipo: 'asignado',
          actorTipo: 'operacion',
          actorId: operadorId,
          datos: { manual: true, conductorId },
        });
        return v.pasajeroId;
      });
      this.eventos.aConductor(conductorId, 'viaje:estado', { viajeId, estado: 'asignado' });
      this.eventos.aConductor(conductorId, 'conductor:estado', { estadoOperativo: 'en_camino' });
      this.eventos.aPasajero(pasajeroId, 'viaje:estado', { viajeId, estado: 'asignado' });
      // Una oferta que se haya colado entre el primer barrido y la asignación se retira ahora.
      const sobrantes = await db
        .select({ id: oferta.id, conductorId: oferta.conductorId })
        .from(oferta)
        .where(and(eq(oferta.viajeId, viajeId), eq(oferta.resultado, 'pendiente')));
      for (const p of sobrantes) {
        await this.cerrarOferta(p.id, 'retirada');
        this.eventos.aConductor(p.conductorId, 'oferta:retirada', {
          ofertaId: p.id,
          viajeId,
          motivo: 'tomada',
        });
      }
    } catch (e) {
      void this.intentar(viajeId); // si no se pudo asignar, el despacho automático sigue buscando
      throw e;
    }
  }

  /** El pasajero canceló mientras se buscaba conductor: se retira la oferta abierta. */
  async retirarOfertas(viajeId: string): Promise<void> {
    clearTimeout(this.reintentos.get(viajeId));
    this.reintentos.delete(viajeId);
    const pendientes = await this.bd.db
      .select({ id: oferta.id, conductorId: oferta.conductorId })
      .from(oferta)
      .where(and(eq(oferta.viajeId, viajeId), eq(oferta.resultado, 'pendiente')));
    for (const p of pendientes) {
      await this.cerrarOferta(p.id, 'retirada');
      this.eventos.aConductor(p.conductorId, 'oferta:retirada', {
        ofertaId: p.id,
        viajeId,
        motivo: 'cancelada',
      });
    }
  }

  private async marcarSinConductor(viajeId: string): Promise<void> {
    clearTimeout(this.reintentos.get(viajeId));
    this.reintentos.delete(viajeId);
    const r = await this.bd.db
      .update(viaje)
      .set({ estado: 'sin_conductor' })
      .where(and(eq(viaje.id, viajeId), eq(viaje.estado, 'buscando_conductor')))
      .returning({ id: viaje.id, pasajeroId: viaje.pasajeroId });
    if (r.length) {
      await registrarEvento(this.bd.db, { viajeId, tipo: 'sin_conductor', actorTipo: 'sistema' });
      this.eventos.aPasajero(r[0]!.pasajeroId, 'viaje:estado', {
        viajeId,
        estado: 'sin_conductor',
      });
      this.log.warn(
        `Viaje ${viajeId}: sin conductor tras ${Math.round(this.p.presupuestoMs / 1000)} s`,
      );
    }
  }

  /** La oferta que el conductor tiene abierta, por si recarga la app o recupera la conexión. */
  async ofertaPendiente(conductorId: string): Promise<OfertaParaConductor | null> {
    const [fila] = await this.bd.db
      .select({ o: oferta, v: viaje })
      .from(oferta)
      .innerJoin(viaje, eq(viaje.id, oferta.viajeId))
      .where(
        and(
          eq(oferta.conductorId, conductorId),
          eq(oferta.resultado, 'pendiente'),
          sql`${oferta.expiraEn} > now()`,
        ),
      );
    if (!fila) return null;
    return this.paraConductor(
      fila.v,
      fila.o.id,
      fila.o.distanciaRecogidaM ?? 0,
      fila.o.etaRecogidaS ?? 0,
      fila.o.expiraEn,
    );
  }

  /** Cuánto tiempo se busca conductor antes de dar el viaje por "sin conductor". */
  get presupuestoBusquedaMs(): number {
    return this.p.presupuestoMs;
  }

  /** Cantidad de ofertas con temporizador activo (para pruebas). */
  get ofertasAbiertas(): number {
    return this.expiraciones.size;
  }

  /** Datos de ruta fija de un viaje, si es de ese tipo. */
  async rutaDe(viajeId: string) {
    const [fila] = await this.bd.db
      .select({ r: rutaFija })
      .from(viaje)
      .innerJoin(rutaFija, eq(rutaFija.id, viaje.rutaFijaId))
      .where(eq(viaje.id, viajeId));
    return fila?.r ?? null;
  }
}
