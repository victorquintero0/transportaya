import { randomInt } from 'node:crypto';
import {
  catalogoVehiculo,
  ciudad,
  conductor,
  conductorVehiculo,
  sesionConductor,
  usuario,
  vehiculo,
} from '@transportaya/db';
import {
  desplazar,
  distanciaMetros,
  rumboGrados,
  Taximetro,
  type Coordenada,
} from '@transportaya/dominio';
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto } from '../comun/errores.js';
import { UbicacionesService } from '../conductor/ubicaciones.service.js';
import { UbicacionStore } from '../conductor/ubicacion.store.js';
import { DespachoService } from '../viajes/despacho.service.js';
import { ViajesService } from '../viajes/viajes.service.js';

const NOMBRES = [
  'Carlos Andrés Pérez',
  'Jhon Fredy Gómez',
  'Luis Alberto Ríos',
  'Mauricio Duque',
  'Óscar Giraldo',
  'Wilson Arias',
  'Diego Cardona',
  'Hernán Londoño',
];
const COLORES = ['Blanco', 'Negro', 'Gris', 'Plata', 'Rojo', 'Azul'];
const TICK_MS = 1000;
/** Parada de "semáforo" de los conductores simulados: lo suficiente para que el taxímetro la cuente como tiempo detenido. */
const PARADA_S = 12;
const METROS_ENTRE_PARADAS = 500;

type Fase = 'libre' | 'hacia_recogida' | 'esperando' | 'hacia_destino' | 'cerrando';

interface Bot {
  id: string;
  nombre: string;
  placa: string;
  pos: Coordenada;
  rumbo: number;
  fase: Fase;
  viajeId?: string;
  pin?: string;
  recogida?: Coordenada;
  destino?: Coordenada;
  metodoPago?: string;
  ofertaVistaEn?: number;
  esperaHasta?: number;
  paradaHasta?: number;
  metrosDesdeParada: number;
  taximetro?: Taximetro;
  ultimoEnvio: number;
  velocidadMs: number;
  ocupado: boolean;
}

/**
 * Conductores de mentira que atienden de verdad los viajes que piden los pasajeros: reciben la oferta, la aceptan, se
 * mueven hacia la recogida, esperan, inician con el PIN, manejan con paradas de semáforo y finalizan con su propio
 * taxímetro. Usan los mismos servicios que la app del conductor, así el pasajero ve el viaje completo sin otro teléfono.
 * Solo existen con SIMULADOR=true.
 */
@Injectable()
export class ConductoresSimuladosService implements OnModuleDestroy {
  private readonly log = new Logger('ConductoresSimulados');
  private readonly bots = new Map<string, Bot>();
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(UbicacionStore) private readonly store: UbicacionStore,
    @Inject(UbicacionesService) private readonly ubicaciones: UbicacionesService,
    @Inject(DespachoService) private readonly despacho: DespachoService,
    @Inject(ViajesService) private readonly viajes: ViajesService,
  ) {}

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  get activos(): number {
    return this.bots.size;
  }

  async crear(
    centro: Coordenada,
    o: { cantidad?: number; velocidadMs?: number; cercaM?: number } = {},
  ) {
    const cantidad = Math.min(Math.max(o.cantidad ?? 2, 1), 5);
    const { db } = this.bd;
    const [laCiudad] = await db
      .select({ id: ciudad.id })
      .from(ciudad)
      .where(eq(ciudad.activa, true))
      .limit(1);
    if (!laCiudad) throw conflicto('SIN_CIUDAD', 'No hay una ciudad activa.');
    const creados = [];
    for (let i = 0; i < cantidad; i++) {
      const [modelo] = await db
        .select()
        .from(catalogoVehiculo)
        .where(eq(catalogoVehiculo.activo, true))
        .orderBy(sql`random()`)
        .limit(1);
      const nombre = NOMBRES[randomInt(0, NOMBRES.length)]!;
      const placa = `SIM${String(randomInt(0, 1000)).padStart(3, '0')}`;
      const cerca = o.cercaM ?? 1400;
      const pos = desplazar(centro, randomInt(Math.min(250, cerca), cerca + 1), randomInt(0, 360));

      const id = await db.transaction(async (tx) => {
        const [persona] = await tx
          .insert(usuario)
          .values({
            telefono: `+57398${String(randomInt(0, 10_000_000)).padStart(7, '0')}`,
            nombre,
          })
          .returning({ id: usuario.id });
        const [v] = await tx
          .insert(vehiculo)
          .values({
            placa,
            catalogoVehiculoId: modelo?.id ?? null,
            marca: modelo?.marca ?? 'Chevrolet',
            linea: modelo?.linea ?? 'Spark GT',
            modeloAnio: Math.min(
              Math.max(modelo?.anioDesde ?? 2019, 2018),
              modelo?.anioHasta ?? 2025,
            ),
            color: COLORES[randomInt(0, COLORES.length)]!,
            categoria: modelo?.categoria ?? 'media',
            fueraDeCatalogo: !modelo,
          })
          .returning({ id: vehiculo.id });
        await tx.insert(conductor).values({
          usuarioId: persona!.id,
          ciudadId: laCiudad.id,
          estadoHabilitacion: 'habilitado',
          estadoOperativo: 'disponible',
          vehiculoActivoId: v!.id,
          aceptaCategoriaInferior: true,
          aceptaIntermunicipal: true,
          calificacionPromedio: Number((4.5 + randomInt(0, 5) / 10).toFixed(2)),
          calificacionesTotal: randomInt(20, 400),
        });
        await tx
          .insert(conductorVehiculo)
          .values({ conductorId: persona!.id, vehiculoId: v!.id, relacion: 'propietario' });
        await tx.insert(sesionConductor).values({ conductorId: persona!.id, vehiculoId: v!.id });
        return persona!.id;
      });

      const bot: Bot = {
        id,
        nombre,
        placa,
        pos,
        rumbo: randomInt(0, 360),
        fase: 'libre',
        metrosDesdeParada: 0,
        ultimoEnvio: 0,
        velocidadMs: o.velocidadMs ?? 14,
        ocupado: false,
      };
      this.bots.set(id, bot);
      this.store.marcarConexion(id);
      await this.emitirPosicion(bot, 0);
      creados.push({ id, nombre, placa, lat: pos.lat, lng: pos.lng });
    }
    this.arrancar();
    return { conductores: creados };
  }

  /** Los desconecta y los olvida. */
  async detener(): Promise<number> {
    const n = this.bots.size;
    for (const b of this.bots.values()) {
      if (b.fase !== 'libre') continue;
      await this.bd.db
        .update(conductor)
        .set({ estadoOperativo: 'desconectado' })
        .where(eq(conductor.usuarioId, b.id));
      await this.bd.db
        .update(sesionConductor)
        .set({ fin: new Date() })
        .where(sql`${sesionConductor.conductorId} = ${b.id} and ${sesionConductor.fin} is null`);
      this.store.olvidar(b.id);
      this.bots.delete(b.id);
    }
    if (this.bots.size === 0 && this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
    return n - this.bots.size;
  }

  private arrancar(): void {
    if (this.temporizador) return;
    this.temporizador = setInterval(() => {
      for (const bot of this.bots.values()) {
        if (bot.ocupado) continue;
        bot.ocupado = true;
        void this.paso(bot)
          .catch((e) => this.log.warn(`${bot.nombre}: ${(e as Error).message}`))
          .finally(() => {
            bot.ocupado = false;
          });
      }
    }, TICK_MS);
    this.temporizador.unref();
  }

  private async emitirPosicion(bot: Bot, velocidadKmh: number): Promise<void> {
    const t = Date.now();
    bot.ultimoEnvio = t;
    const punto = {
      lat: bot.pos.lat + (Math.random() - 0.5) * 0.000004,
      lng: bot.pos.lng + (Math.random() - 0.5) * 0.000004,
      t,
      precisionM: 6,
      velocidadKmh,
      rumbo: bot.rumbo,
    };
    bot.taximetro?.agregar({
      instanteMs: t,
      lat: punto.lat,
      lng: punto.lng,
      precisionM: punto.precisionM,
      velocidadKmh,
    });
    await this.ubicaciones.guardar(bot.id, [punto]);
  }

  /** Avanza hacia un punto. Devuelve cuántos metros faltan. */
  private mover(
    bot: Bot,
    meta: Coordenada,
    conParadas: boolean,
  ): { falta: number; velocidadKmh: number } {
    const falta = distanciaMetros(bot.pos, meta);
    if (falta < 25) return { falta, velocidadKmh: 0 };
    if (bot.paradaHasta && Date.now() < bot.paradaHasta) return { falta, velocidadKmh: 0 };
    bot.paradaHasta = undefined;
    const avance = Math.min(bot.velocidadMs * (TICK_MS / 1000), falta);
    bot.rumbo = rumboGrados(bot.pos, meta);
    bot.pos = desplazar(bot.pos, avance, bot.rumbo);
    bot.metrosDesdeParada += avance;
    if (conParadas && bot.metrosDesdeParada >= METROS_ENTRE_PARADAS && falta - avance > 200) {
      bot.paradaHasta = Date.now() + PARADA_S * 1000;
      bot.metrosDesdeParada = 0;
    }
    return { falta: falta - avance, velocidadKmh: bot.velocidadMs * 3.6 };
  }

  private volverALibre(bot: Bot): void {
    Object.assign(bot, {
      fase: 'libre' as Fase,
      viajeId: undefined,
      pin: undefined,
      recogida: undefined,
      destino: undefined,
      taximetro: undefined,
      esperaHasta: undefined,
      paradaHasta: undefined,
      ofertaVistaEn: undefined,
    });
  }

  private async paso(bot: Bot): Promise<void> {
    switch (bot.fase) {
      case 'libre': {
        const oferta = await this.despacho.ofertaPendiente(bot.id);
        if (oferta) {
          bot.ofertaVistaEn ??= Date.now();
          // Piensa un par de segundos, como una persona (la oferta dura 15).
          if (Date.now() - bot.ofertaVistaEn >= 2500) {
            await this.despacho.aceptar(bot.id, oferta.ofertaId);
            const v = await this.viajes.actual(bot.id);
            if (v) {
              Object.assign(bot, {
                fase: 'hacia_recogida' as Fase,
                viajeId: v.id,
                recogida: { lat: v.recogida.lat, lng: v.recogida.lng },
                destino: { lat: v.destino.lat, lng: v.destino.lng },
                metodoPago: v.metodoPago,
                ofertaVistaEn: undefined,
                metrosDesdeParada: 0,
              });
            }
          }
        } else {
          bot.ofertaVistaEn = undefined;
        }
        if (Date.now() - bot.ultimoEnvio >= 5000) await this.emitirPosicion(bot, 0);
        return;
      }

      case 'hacia_recogida': {
        const v = await this.viajes.actual(bot.id);
        if (!v) return this.volverALibre(bot); // el pasajero canceló
        const { falta, velocidadKmh } = this.mover(bot, bot.recogida!, false);
        await this.emitirPosicion(bot, velocidadKmh);
        if (falta < 60) {
          await this.viajes.llegue(bot.id, bot.viajeId!, bot.pos);
          bot.fase = 'esperando';
          bot.esperaHasta = Date.now() + 4000;
        }
        return;
      }

      case 'esperando': {
        const v = await this.viajes.actual(bot.id);
        if (!v) return this.volverALibre(bot);
        await this.emitirPosicion(bot, 0);
        if (Date.now() >= (bot.esperaHasta ?? 0)) {
          const [fila] = (
            await this.bd.db.execute<{ pin: string | null }>(
              sql`select pin_inicio as pin from viaje where id = ${bot.viajeId!}`,
            )
          ).rows;
          await this.viajes.iniciar(bot.id, bot.viajeId!, fila?.pin ?? undefined);
          bot.taximetro = new Taximetro();
          bot.fase = 'hacia_destino';
          bot.metrosDesdeParada = 0;
        }
        return;
      }

      case 'hacia_destino': {
        const { falta, velocidadKmh } = this.mover(bot, bot.destino!, true);
        await this.emitirPosicion(bot, velocidadKmh);
        if (falta < 60) {
          bot.fase = 'cerrando';
          const r = bot.taximetro!.resumen();
          const fin = await this.viajes.finalizar(bot.id, bot.viajeId!, {
            distanciaM: r.distanciaM,
            tiempoDetenidoS: r.tiempoDetenidoS,
            duracionS: Math.max(r.duracionS, 1),
          });
          if (bot.metodoPago === 'efectivo')
            await this.viajes.efectivoRecibido(bot.id, bot.viajeId!, fin.precioFinal);
          await this.viajes
            .calificar(bot.id, bot.viajeId!, { estrellas: 5, etiquetas: ['Amable'] })
            .catch(() => undefined);
          this.volverALibre(bot);
        }
        return;
      }

      case 'cerrando':
        return;
    }
  }
}
