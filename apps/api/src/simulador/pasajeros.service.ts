import { randomInt } from 'node:crypto';
import {
  conductor,
  cotizacion,
  movimientoSaldo,
  oferta,
  pasajero,
  rutaFija,
  tarifa,
  usuario,
  vehiculo,
  viaje,
} from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import {
  aproximarPorDefecto,
  ambitoComision,
  calcularComision,
  calcularTarifaUrbana,
  COMISION_PUNTOS_BASICOS,
  desplazar,
  distanciaMetros,
  estimarTiempoDetenido,
  type Coordenada,
} from '@transportaya/dominio';
import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { UbicacionStore } from '../conductor/ubicacion.store.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { DespachoService } from '../viajes/despacho.service.js';
import { registrarEvento } from '../viajes/eventos-viaje.js';
import { PrecioService } from '../viajes/precio.service.js';

/** Datos de mentira para que las demostraciones se vean vivas. */
const NOMBRES = [
  'Valentina Ríos',
  'Santiago Marín',
  'Camila Duque',
  'Mateo Ospina',
  'Laura Giraldo',
  'Andrés Cardona',
  'Daniela Arias',
  'Juan Pablo Gómez',
  'Mariana Londoño',
  'Sebastián Zapata',
];
const BARRIOS = [
  'Palogrande',
  'Chipre',
  'La Enea',
  'Milán',
  'Cable',
  'Versalles',
  'Sancancio',
  'La Francia',
  'Los Rosales',
  'San José',
  'Bosques del Norte',
  'Villapilar',
];
const CIUDADES: Record<string, Coordenada> = {
  Pereira: { lat: 4.8133, lng: -75.6961 },
  Armenia: { lat: 4.5339, lng: -75.6811 },
  Medellín: { lat: 6.2442, lng: -75.5812 },
  Bogotá: { lat: 4.711, lng: -74.0721 },
  Cali: { lat: 3.4516, lng: -76.532 },
};
const elegir = <T>(lista: readonly T[]): T => lista[randomInt(0, lista.length)] as T;

/** Fracción del tiempo que se espera detenido en la ciudad. Valor de trabajo de D-24, a calibrar con el piloto. */
const FRACCION_DETENIDO = 0.15;
const VELOCIDAD_URBANA_KMH = 22;

export interface OpcionesViajeDemo {
  distanciaKm?: number | undefined;
  metodoPago?: 'efectivo' | 'tarjeta' | undefined;
  nacional?: boolean | undefined;
  destinoNacional?: string | undefined;
}

/**
 * Hace de pasajero para poder probar la app del conductor sin la app del pasajero. Crea personas y viajes de
 * mentira cerca de donde está el conductor. Solo existe con SIMULADOR=true.
 */
@Injectable()
export class PasajerosSimuladosService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(UbicacionStore) private readonly ubicaciones: UbicacionStore,
    @Inject(DespachoService) private readonly despacho: DespachoService,
    @Inject(PrecioService) private readonly precios: PrecioService,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  async crearViaje(conductorId: string, o: OpcionesViajeDemo = {}) {
    const { db } = this.bd;
    const [yo] = await db
      .select({ ciudadId: conductor.ciudadId, categoria: vehiculo.categoria })
      .from(conductor)
      .innerJoin(vehiculo, eq(vehiculo.id, conductor.vehiculoActivoId))
      .where(eq(conductor.usuarioId, conductorId));
    if (!yo) throw conflicto('SIN_VEHICULO', 'Registra tu vehículo para recibir viajes de prueba.');
    const u = this.ubicaciones.obtener(conductorId);
    if (!u || !Number.isFinite(u.lat))
      throw conflicto('SIN_UBICACION', 'Necesitamos tu ubicación para crear un viaje cerca de ti.');

    const ahora = new Date();
    const [laTarifa] = await db
      .select()
      .from(tarifa)
      .where(
        and(
          eq(tarifa.ciudadId, yo.ciudadId),
          eq(tarifa.tipoServicio, 'inmediato'),
          lte(tarifa.vigenteDesde, ahora),
          or(isNull(tarifa.vigenteHasta), sql`${tarifa.vigenteHasta} > now()`),
        ),
      )
      .orderBy(desc(tarifa.version))
      .limit(1);
    if (!laTarifa) throw conflicto('SIN_TARIFA', 'La ciudad no tiene una tarifa vigente.');

    // Pasajero de mentira.
    const nombre = elegir(NOMBRES);
    const telefono = `+57399${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
    const [persona] = await db
      .insert(usuario)
      .values({ telefono, nombre })
      .returning({ id: usuario.id });
    await db.insert(pasajero).values({
      usuarioId: persona!.id,
      calificacionPromedio: Number((4.3 + randomInt(0, 8) / 10).toFixed(2)),
      calificacionesTotal: randomInt(5, 120),
    });

    const origen = desplazar(u, randomInt(300, 1200), randomInt(0, 360));
    const origenDireccion = `Cra ${randomInt(18, 30)} # ${randomInt(20, 70)}-${randomInt(1, 60)}, ${elegir(BARRIOS)}`;
    const metodoPago = o.metodoPago ?? (randomInt(0, 2) === 0 ? 'efectivo' : 'tarjeta');
    const pin = String(randomInt(0, 10_000)).padStart(4, '0');

    let destino: Coordenada;
    let destinoDireccion: string;
    let tipoServicio: 'inmediato' | 'intermunicipal' = 'inmediato';
    let rutaId: string | null = null;
    let precioMin: number;
    let precioMax: number;
    let distanciaEstimadaM: number;
    let duracionEstimadaS: number;
    let detenidoEstimadoS: number | null = null;
    let desglose: Record<string, unknown> = {};

    if (o.nacional) {
      const nombreDestino =
        o.destinoNacional && CIUDADES[o.destinoNacional]
          ? o.destinoNacional
          : elegir(Object.keys(CIUDADES));
      const [ruta] = await db
        .select()
        .from(rutaFija)
        .where(
          and(
            eq(rutaFija.ciudadOrigenId, yo.ciudadId),
            eq(rutaFija.destino, nombreDestino),
            eq(rutaFija.modalidad, 'solo_ida'),
          ),
        );
      if (!ruta) throw noEncontrado('RUTA_NO_ENCONTRADA', `No hay tarifa fija a ${nombreDestino}.`);
      destino = CIUDADES[nombreDestino]!;
      destinoDireccion = `Centro, ${nombreDestino}`;
      tipoServicio = 'intermunicipal';
      rutaId = ruta.id;
      precioMin = precioMax = ruta.tarifa;
      distanciaEstimadaM = Math.round(distanciaMetros(origen, destino) * 1.35);
      duracionEstimadaS = Math.round(distanciaEstimadaM / (60 / 3.6));
      desglose = { tipo: 'ruta_fija', destino: nombreDestino, tarifa: ruta.tarifa };
    } else {
      const km = o.distanciaKm ?? randomInt(20, 71) / 10;
      destino = desplazar(origen, km * 1000, randomInt(0, 360));
      destinoDireccion = `Cl ${randomInt(30, 80)} # ${randomInt(10, 40)}-${randomInt(1, 60)}, ${elegir(BARRIOS)}`;
      distanciaEstimadaM = Math.round(distanciaMetros(origen, destino) * 1.35);
      duracionEstimadaS = Math.round(distanciaEstimadaM / (VELOCIDAD_URBANA_KMH / 3.6));
      detenidoEstimadoS = estimarTiempoDetenido(duracionEstimadaS, FRACCION_DETENIDO);
      const recargos = await this.precios.recargos({
        ciudadId: yo.ciudadId,
        tarifaId: laTarifa.id,
        categoria: yo.categoria,
        origen,
        destino,
        instante: ahora,
      });
      const calculo = calcularTarifaUrbana({
        parametros: {
          base: laTarifa.base,
          valorKm: laTarifa.valorKm,
          valorMinuto: laTarifa.valorMinuto,
          minima: laTarifa.minima,
        },
        distanciaM: distanciaEstimadaM,
        tiempoCobrableS: detenidoEstimadoS,
        recargos,
      });
      // La cotización urbana es un rango, no un precio cerrado (D-10).
      precioMin = aproximarPorDefecto(calculo.totalRedondeado * 0.9);
      precioMax = aproximarPorDefecto(calculo.totalRedondeado * 1.15);
      desglose = { ...calculo, recargosAplicados: recargos, fraccionDetenido: FRACCION_DETENIDO };
    }

    const creado = await db.transaction(async (tx) => {
      const [cot] = await tx
        .insert(cotizacion)
        .values({
          pasajeroId: persona!.id,
          ciudadId: yo.ciudadId,
          categoria: yo.categoria,
          tipoServicio,
          origen,
          origenDireccion,
          destino,
          destinoDireccion,
          tarifaId: rutaId ? null : laTarifa.id,
          rutaFijaId: rutaId,
          distanciaEstimadaM,
          duracionEstimadaS,
          tiempoDetenidoEstimadoS: detenidoEstimadoS,
          precioMin,
          precioMax,
          desglose,
          expiraEn: new Date(Date.now() + 5 * 60_000),
        })
        .returning({ id: cotizacion.id });
      const [v] = await tx
        .insert(viaje)
        .values({
          pasajeroId: persona!.id,
          tipoServicio,
          categoria: yo.categoria,
          origen,
          origenDireccion,
          destino,
          destinoDireccion,
          cotizacionId: cot!.id,
          tarifaId: rutaId ? null : laTarifa.id,
          rutaFijaId: rutaId,
          metodoPago,
          pinInicio: pin,
          precioEstimadoMin: precioMin,
          precioEstimadoMax: precioMax,
        })
        .returning({ id: viaje.id, codigo: viaje.codigo });
      await registrarEvento(tx, {
        viajeId: v!.id,
        tipo: 'solicitado',
        actorTipo: 'pasajero',
        actorId: persona!.id,
        ubicacion: origen,
      });
      return v!;
    });

    void this.despacho.iniciar(creado.id);
    return {
      viajeId: creado.id,
      codigo: creado.codigo,
      /** En la vida real el pasajero lo ve en su app y se lo dice al conductor; aquí se muestra para poder probar. */
      pin,
      pasajero: { nombre },
      metodoPago,
      tipoServicio,
      origen: { ...origen, direccion: origenDireccion },
      destino: { ...destino, direccion: destinoDireccion },
      precioEstimado: { min: precioMin, max: precioMax },
    };
  }

  /**
   * El pasajero cancela (RN-042): gratis mientras se busca conductor o durante los primeros 2 minutos tras la asignación;
   * después, tarifa de cancelación que va al conductor menos la comisión.
   */
  async cancelar(conductorId: string, viajeId: string) {
    const { db } = this.bd;
    const [v] = await db.select().from(viaje).where(eq(viaje.id, viajeId));
    const [ofertado] = await db
      .select({ id: oferta.id })
      .from(oferta)
      .where(and(eq(oferta.viajeId, viajeId), eq(oferta.conductorId, conductorId)));
    if (!v || (v.conductorId !== conductorId && !ofertado))
      throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');

    if (v.estado === 'buscando_conductor') {
      await db
        .update(viaje)
        .set({
          estado: 'cancelado',
          canceladoEn: new Date(),
          canceladoPor: 'pasajero',
          motivoCancelacion: 'cancelado_buscando',
        })
        .where(eq(viaje.id, v.id));
      await registrarEvento(db, {
        viajeId: v.id,
        tipo: 'cancelado',
        actorTipo: 'pasajero',
        actorId: v.pasajeroId,
      });
      await this.despacho.retirarOfertas(v.id);
      return { costo: 0 };
    }
    if (v.conductorId !== conductorId || !['asignado', 'en_sitio'].includes(v.estado)) {
      throw conflicto('ESTADO_INVALIDO', 'Este viaje ya no se puede cancelar.');
    }

    const gratis =
      v.estado === 'asignado' && Date.now() - (v.aceptadoEn?.getTime() ?? 0) <= 120_000;
    const [t] = v.tarifaId ? await db.select().from(tarifa).where(eq(tarifa.id, v.tarifaId)) : [];
    const costo = gratis ? 0 : (t?.cancelacion ?? 4000);
    const ambito = ambitoComision(v.tipoServicio);
    const comision = calcularComision({ totalRedondeado: 0, tarifaCancelacion: costo }, ambito);

    await db.transaction(async (tx) => {
      await tx
        .update(viaje)
        .set({
          estado: 'cancelado',
          canceladoEn: new Date(),
          canceladoPor: 'pasajero',
          motivoCancelacion: 'cancelado_por_pasajero',
          ...(costo > 0
            ? {
                precioFinal: costo,
                totalCarrera: costo,
                comision,
                comisionPb: COMISION_PUNTOS_BASICOS[ambito],
                estadoPago: v.metodoPago === 'efectivo' ? 'pendiente' : 'pagado',
              }
            : { estadoPago: 'no_aplica' }),
        })
        .where(eq(viaje.id, v.id));
      if (costo > 0) {
        await tx
          .insert(movimientoSaldo)
          .values({ conductorId, tipo: 'cancelacion', monto: costo - comision, viajeId: v.id });
        if (v.metodoPago === 'efectivo') {
          await tx
            .update(pasajero)
            .set({ deudaPendiente: sql`${pasajero.deudaPendiente} + ${costo}` })
            .where(eq(pasajero.usuarioId, v.pasajeroId));
        }
      }
      await tx
        .update(conductor)
        .set({ estadoOperativo: 'disponible' })
        .where(eq(conductor.usuarioId, conductorId));
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'cancelado',
        actorTipo: 'pasajero',
        actorId: v.pasajeroId,
        datos: { costo },
      });
    });
    this.eventos.aConductor(conductorId, 'viaje:estado', {
      viajeId: v.id,
      estado: 'cancelado',
      canceladoPor: 'pasajero',
      costo,
    });
    this.eventos.aConductor(conductorId, 'conductor:estado', { estadoOperativo: 'disponible' });
    return { costo, gananciaNeta: costo - comision };
  }
}
