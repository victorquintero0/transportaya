import { ciudad, cotizacion, rutaFija, tarifa } from '@transportaya/db';
import {
  aproximarPorDefecto,
  CATEGORIAS_VEHICULO,
  calcularTarifaUrbana,
  distanciaMetros,
  estimarTiempoDetenido,
  type CategoriaVehiculo,
  type Coordenada,
  type Recargo,
} from '@transportaya/dominio';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { DespachoService } from '../viajes/despacho.service.js';
import { PrecioService } from '../viajes/precio.service.js';
import { UBICACION_DESTINOS } from './destinos-nacionales.js';

/** Hasta dónde llega el servicio urbano desde el centro de la ciudad (RN-001). */
const RADIO_SERVICIO_URBANO_M = 30_000;
/** Mismos supuestos que el despacho mientras no hay motor de rutas (ADR-0002): rodeo y velocidad media en ciudad. */
const FACTOR_RUTA = 1.35;
const VELOCIDAD_URBANA_KMH = 22;
const VELOCIDAD_CARRETERA_KMH = 60;
/** Fracción del tiempo que se espera detenido en la ciudad. Valor de trabajo de D-24, a calibrar con el piloto. */
const FRACCION_DETENIDO = 0.15;
const VIGENCIA_COTIZACION_MS = 5 * 60_000;

const NOMBRE_CATEGORIA: Record<CategoriaVehiculo, string> = {
  media: 'Media',
  media_alta: 'Media Alta',
  alta: 'Alta',
};

function valorRecargoCategoria(recargos: readonly Recargo[]): number {
  const r = recargos.find((x) => x.nombre === 'categoria');
  return r?.tipo === 'fijo' ? r.valor : 0;
}

export interface PuntoConDireccion extends Coordenada {
  direccion?: string | undefined;
}

export interface EntradaCotizacion {
  origen: PuntoConDireccion;
  /** Para un viaje urbano. */
  destino?: PuntoConDireccion | undefined;
  /** Para un viaje con tarifa fija a otra ciudad (PAS-26). */
  ruta?: { destino: string; modalidad: 'solo_ida' | 'ida_y_vuelta' } | undefined;
}

@Injectable()
export class CotizacionesService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(PrecioService) private readonly precios: PrecioService,
    @Inject(DespachoService) private readonly despacho: DespachoService,
  ) {}

  /** Destinos con tarifa fija que se ofrecen en la app: los que tienen ubicación conocida (D-29). */
  async rutasDisponibles() {
    const { db } = this.bd;
    const ciudadId = await this.ciudadActiva();
    const filas = await db
      .select()
      .from(rutaFija)
      .where(and(eq(rutaFija.ciudadOrigenId, ciudadId), eq(rutaFija.activa, true)))
      .orderBy(rutaFija.destino);
    const porDestino = new Map<
      string,
      {
        destino: string;
        lat: number;
        lng: number;
        soloIda: number | null;
        idaYVuelta: number | null;
      }
    >();
    for (const r of filas) {
      const u = r.destinoUbicacion ?? UBICACION_DESTINOS[r.destino];
      if (!u) continue;
      const actual = porDestino.get(r.destino) ?? {
        destino: r.destino,
        lat: u.lat,
        lng: u.lng,
        soloIda: null,
        idaYVuelta: null,
      };
      if (r.modalidad === 'solo_ida') actual.soloIda = r.tarifa;
      else actual.idaYVuelta = r.tarifa;
      porDestino.set(r.destino, actual);
    }
    return [...porDestino.values()];
  }

  async ciudadActiva(): Promise<string> {
    const [c] = await this.bd.db
      .select({ id: ciudad.id })
      .from(ciudad)
      .where(eq(ciudad.activa, true))
      .limit(1);
    if (!c) throw conflicto('SIN_CIUDAD', 'Todavía no hay una ciudad activa.');
    return c.id;
  }

  /** Centro del servicio: el punto medio del polígono de la ciudad, o la Plaza de Bolívar de Manizales por defecto. */
  private async centro(ciudadId: string): Promise<Coordenada> {
    const r = await this.bd.db.execute<{ lat: number | null; lng: number | null }>(sql`
      select ST_Y(ST_Centroid(area_servicio::geometry)) as lat, ST_X(ST_Centroid(area_servicio::geometry)) as lng
      from ciudad where id = ${ciudadId}`);
    const fila = r.rows[0];
    return fila?.lat != null && fila.lng != null
      ? { lat: fila.lat, lng: fila.lng }
      : { lat: 5.0689, lng: -75.5174 };
  }

  private async tarifaVigente(ciudadId: string, ahora: Date) {
    const [t] = await this.bd.db
      .select()
      .from(tarifa)
      .where(
        and(
          eq(tarifa.ciudadId, ciudadId),
          eq(tarifa.tipoServicio, 'inmediato'),
          lte(tarifa.vigenteDesde, ahora),
          or(isNull(tarifa.vigenteHasta), sql`${tarifa.vigenteHasta} > now()`),
        ),
      )
      .orderBy(desc(tarifa.version))
      .limit(1);
    if (!t) throw conflicto('SIN_TARIFA', 'La ciudad no tiene una tarifa vigente.');
    return t;
  }

  /** Dinámica manual vigente en el origen (RN-024). 1 si no hay ninguna. */
  private async dinamicaEn(origen: Coordenada, ahora: Date): Promise<number> {
    const r = await this.bd.db.execute<{ m: number | null }>(sql`
      select max(d.multiplicador)::float as m
      from dinamica_zona d join zona z on z.id = d.zona_id
      where z.activa and ${ahora.toISOString()}::timestamptz between d.desde and d.hasta
        and ST_Covers(z.poligono, ST_SetSRID(ST_MakePoint(${origen.lng}, ${origen.lat}), 4326)::geography)`);
    return Math.max(1, r.rows[0]?.m ?? 1);
  }

  async cotizar(pasajeroId: string, e: EntradaCotizacion) {
    const ciudadId = await this.ciudadActiva();
    const ahora = new Date();
    const centro = await this.centro(ciudadId);
    if (distanciaMetros(centro, e.origen) > RADIO_SERVICIO_URBANO_M)
      throw conflicto(
        'FUERA_DE_COBERTURA',
        'Todavía no llegamos a tu ubicación. Por ahora atendemos Manizales y sus alrededores.',
      );
    if (e.ruta) return this.cotizarRuta(pasajeroId, ciudadId, ahora, e.origen, e.ruta);
    if (!e.destino) throw solicitudInvalida('Indica a dónde vas.');
    if (distanciaMetros(centro, e.destino) > RADIO_SERVICIO_URBANO_M)
      throw conflicto(
        'DESTINO_FUERA_DE_CIUDAD',
        'Ese destino queda fuera de Manizales. Para viajar a otra ciudad elige una ruta con tarifa fija.',
      );
    if (distanciaMetros(e.origen, e.destino) < 150)
      throw solicitudInvalida('El origen y el destino están muy cerca. Elige otro destino.');
    return this.cotizarUrbano(pasajeroId, ciudadId, ahora, e.origen, e.destino);
  }

  private async cotizarUrbano(
    pasajeroId: string,
    ciudadId: string,
    ahora: Date,
    origen: PuntoConDireccion,
    destino: PuntoConDireccion,
  ) {
    const t = await this.tarifaVigente(ciudadId, ahora);
    const dinamica = await this.dinamicaEn(origen, ahora);
    const distanciaM = Math.round(distanciaMetros(origen, destino) * FACTOR_RUTA);
    const duracionS = Math.round(distanciaM / (VELOCIDAD_URBANA_KMH / 3.6));
    const detenidoS = estimarTiempoDetenido(duracionS, FRACCION_DETENIDO);
    const expiraEn = new Date(ahora.getTime() + VIGENCIA_COTIZACION_MS);

    const opciones = [];
    for (const categoria of CATEGORIAS_VEHICULO) {
      const recargos = await this.precios.recargos({
        ciudadId,
        tarifaId: t.id,
        categoria,
        origen,
        destino,
        instante: ahora,
      });
      const calculo = calcularTarifaUrbana({
        parametros: {
          base: t.base,
          valorKm: t.valorKm,
          valorMinuto: t.valorMinuto,
          minima: t.minima,
        },
        distanciaM,
        tiempoCobrableS: detenidoS,
        multiplicadorDinamico: dinamica,
        recargos,
      });
      // La cotización urbana es un rango, no un precio cerrado: el valor final lo da el taxímetro (D-10).
      const precioMin = aproximarPorDefecto(calculo.totalRedondeado * 0.9);
      const precioMax = aproximarPorDefecto(calculo.totalRedondeado * 1.15);
      const [fila] = await this.bd.db
        .insert(cotizacion)
        .values({
          pasajeroId,
          ciudadId,
          categoria,
          tipoServicio: 'inmediato',
          origen,
          origenDireccion: origen.direccion ?? null,
          destino,
          destinoDireccion: destino.direccion ?? null,
          tarifaId: t.id,
          multiplicadorDinamico: dinamica,
          distanciaEstimadaM: distanciaM,
          duracionEstimadaS: duracionS,
          tiempoDetenidoEstimadoS: detenidoS,
          precioMin,
          precioMax,
          desglose: {
            ...calculo,
            recargosAplicados: recargos,
            fraccionDetenido: FRACCION_DETENIDO,
          },
          expiraEn,
        })
        .returning({ id: cotizacion.id });
      const disp = await this.despacho.disponibilidad(ciudadId, origen, categoria, 'inmediato');
      opciones.push({
        id: fila!.id,
        categoria,
        nombre: NOMBRE_CATEGORIA[categoria],
        tipoServicio: 'inmediato' as const,
        precio: { min: precioMin, max: precioMax },
        fijo: false,
        recargoCategoria: valorRecargoCategoria(recargos),
        dinamica: dinamica > 1 ? dinamica : null,
        conductoresCerca: disp.conductores,
        etaRecogidaS: disp.etaS,
      });
    }
    return {
      origen,
      destino,
      distanciaM,
      duracionS,
      expiraEn: expiraEn.toISOString(),
      opciones,
    };
  }

  private async cotizarRuta(
    pasajeroId: string,
    ciudadId: string,
    ahora: Date,
    origen: PuntoConDireccion,
    pedida: { destino: string; modalidad: 'solo_ida' | 'ida_y_vuelta' },
  ) {
    const [ruta] = await this.bd.db
      .select()
      .from(rutaFija)
      .where(
        and(
          eq(rutaFija.ciudadOrigenId, ciudadId),
          eq(rutaFija.destino, pedida.destino),
          eq(rutaFija.modalidad, pedida.modalidad),
          eq(rutaFija.activa, true),
        ),
      );
    if (!ruta)
      throw noEncontrado('RUTA_NO_ENCONTRADA', `No tenemos tarifa fija a ${pedida.destino}.`);
    const ubicacion = ruta.destinoUbicacion ?? UBICACION_DESTINOS[ruta.destino];
    if (!ubicacion)
      throw conflicto('RUTA_SIN_UBICACION', 'Ese destino todavía no está disponible en la app.');
    const destino: PuntoConDireccion = { ...ubicacion, direccion: `Centro, ${ruta.destino}` };
    const distanciaM = Math.round(distanciaMetros(origen, destino) * FACTOR_RUTA);
    const duracionS = Math.round(distanciaM / (VELOCIDAD_CARRETERA_KMH / 3.6));
    const expiraEn = new Date(ahora.getTime() + VIGENCIA_COTIZACION_MS);

    const [fila] = await this.bd.db
      .insert(cotizacion)
      .values({
        pasajeroId,
        ciudadId,
        categoria: 'media',
        tipoServicio: 'intermunicipal',
        origen,
        origenDireccion: origen.direccion ?? null,
        destino,
        destinoDireccion: destino.direccion ?? null,
        rutaFijaId: ruta.id,
        distanciaEstimadaM: distanciaM,
        duracionEstimadaS: duracionS,
        precioMin: ruta.tarifa,
        precioMax: ruta.tarifa,
        desglose: {
          tipo: 'ruta_fija',
          destino: ruta.destino,
          modalidad: ruta.modalidad,
          tarifa: ruta.tarifa,
        },
        expiraEn,
      })
      .returning({ id: cotizacion.id });
    const disp = await this.despacho.disponibilidad(ciudadId, origen, 'media', 'intermunicipal');
    return {
      origen,
      destino,
      distanciaM,
      duracionS,
      expiraEn: expiraEn.toISOString(),
      opciones: [
        {
          id: fila!.id,
          categoria: 'media' as const,
          nombre: `Tarifa fija a ${ruta.destino}`,
          tipoServicio: 'intermunicipal' as const,
          precio: { min: ruta.tarifa, max: ruta.tarifa },
          fijo: true,
          recargoCategoria: 0,
          dinamica: null,
          conductoresCerca: disp.conductores,
          etaRecogidaS: disp.etaS,
        },
      ],
    };
  }
}
