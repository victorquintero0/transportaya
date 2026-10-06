import {
  alerta,
  calificacion,
  conductor,
  cotizacion,
  movimientoSaldo,
  oferta,
  pago,
  pasajero,
  posicionConductor,
  rutaFija,
  tarifa,
  ticket,
  usuario,
  viaje,
} from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import {
  ambitoComision,
  calcularComision,
  calcularCobroEspera,
  calcularTarifaUrbana,
  COMISION_PUNTOS_BASICOS,
  compararMediciones,
  distanciaMetros,
  movimientosDeViaje,
  resumirTrayectoria,
  type Recargo,
} from '@transportaya/dominio';
import { and, desc, eq, gt, gte, inArray, lte, sql } from 'drizzle-orm';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';
import { conflicto, ErrorNegocio, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { CONFIG, type Configuracion } from '../config.js';
import { UbicacionStore } from '../conductor/ubicacion.store.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { DespachoService } from './despacho.service.js';
import { primerNombre, registrarEvento } from './eventos-viaje.js';
import { PrecioService } from './precio.service.js';

const ESTADOS_ACTIVOS = ['asignado', 'en_sitio', 'en_curso'] as const;
/** RN-040: "llegué" solo a menos de 150 m de la recogida. */
export const RADIO_LLEGADA_M = 150;
/** RN-043: tiempo de espera en sitio antes de poder cancelar por pasajero ausente. */
export const ESPERA_PASAJERO_AUSENTE_S = 300;
const MAX_INTENTOS_PIN = 5;
/** Etiquetas de la calificación que abren un ticket de seguridad (RN-124). */
const ETIQUETAS_SEGURIDAD = ['acoso', 'agresion'];

export interface MedicionTaximetro {
  distanciaM: number;
  tiempoDetenidoS: number;
  duracionS: number;
}

@Injectable()
export class ViajesService {
  private readonly intentosPin = new Map<string, number>();

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CONFIG) private readonly config: Pick<Configuracion, 'SIMULADOR'>,
    @Inject(UbicacionStore) private readonly ubicaciones: UbicacionStore,
    @Inject(Eventos) private readonly eventos: Eventos,
    @Inject(DespachoService) private readonly despacho: DespachoService,
    @Inject(PrecioService) private readonly precios: PrecioService,
  ) {}

  private async cargar(conductorId: string, viajeId: string, db: DbOTx = this.bd.db) {
    const [fila] = await db
      .select({ v: viaje, ciudadId: cotizacion.ciudadId })
      .from(viaje)
      .innerJoin(cotizacion, eq(cotizacion.id, viaje.cotizacionId))
      .where(and(eq(viaje.id, viajeId), eq(viaje.conductorId, conductorId)));
    if (!fila) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
    return fila;
  }

  /** El viaje que el conductor tiene entre manos, con todo lo que necesita la app, incluido lo del taxímetro. */
  async actual(conductorId: string) {
    const { db } = this.bd;
    const [fila] = await db
      .select({ v: viaje, ciudadId: cotizacion.ciudadId })
      .from(viaje)
      .innerJoin(cotizacion, eq(cotizacion.id, viaje.cotizacionId))
      .where(and(eq(viaje.conductorId, conductorId), inArray(viaje.estado, [...ESTADOS_ACTIVOS])));
    if (!fila) return null;
    const v = fila.v;

    const [p] = await db
      .select({ nombre: usuario.nombre, calificacion: pasajero.calificacionPromedio })
      .from(pasajero)
      .innerJoin(usuario, eq(usuario.id, pasajero.usuarioId))
      .where(eq(pasajero.usuarioId, v.pasajeroId));
    const ruta = v.rutaFijaId
      ? (await db.select().from(rutaFija).where(eq(rutaFija.id, v.rutaFijaId)))[0]
      : undefined;
    const t = v.tarifaId
      ? (await db.select().from(tarifa).where(eq(tarifa.id, v.tarifaId)))[0]
      : undefined;
    const recargos = t
      ? await this.precios.recargos({
          ciudadId: fila.ciudadId,
          tarifaId: t.id,
          categoria: v.categoria,
          origen: v.origen,
          destino: v.destino,
          instante: v.iniciadoEn ?? new Date(),
        })
      : [];
    const u = this.ubicaciones.obtener(conductorId);

    return {
      id: v.id,
      codigo: v.codigo,
      estado: v.estado,
      tipoServicio: v.tipoServicio,
      categoria: v.categoria,
      pasajero: {
        nombre: primerNombre(p?.nombre ?? 'Pasajero'),
        calificacion: p?.calificacion ?? null,
      },
      recogida: { lat: v.origen.lat, lng: v.origen.lng, direccion: v.origenDireccion },
      destino: { lat: v.destino.lat, lng: v.destino.lng, direccion: v.destinoDireccion },
      nota: v.notaConductor,
      metodoPago: v.metodoPago,
      pinRequerido: v.pinInicio !== null,
      precioEstimado: { min: v.precioEstimadoMin, max: v.precioEstimadoMax },
      /** Con esto la app calcula el valor en vivo del taxímetro con la misma lógica del servidor (RN-015). */
      tarifa: t
        ? {
            base: t.base,
            valorKm: t.valorKm,
            valorMinuto: t.valorMinuto,
            minima: t.minima,
            esperaMinutosGratis: t.esperaMinutosGratis,
            esperaMinuto: t.esperaMinuto,
            multiplicadorDinamico: v.multiplicadorDinamico,
            recargos,
          }
        : null,
      rutaFija: ruta
        ? { destino: ruta.destino, modalidad: ruta.modalidad, tarifa: ruta.tarifa }
        : null,
      tiempos: {
        solicitadoEn: v.solicitadoEn.toISOString(),
        aceptadoEn: v.aceptadoEn?.toISOString() ?? null,
        enSitioEn: v.enSitioEn?.toISOString() ?? null,
        iniciadoEn: v.iniciadoEn?.toISOString() ?? null,
      },
      distanciaARecogidaM:
        u && Number.isFinite(u.lat) ? Math.round(distanciaMetros(u, v.origen)) : null,
    };
  }

  /** RN-040: marca la llegada solo si el GPS está a menos de 150 m de la recogida. */
  async llegue(conductorId: string, viajeId: string, posicion?: { lat: number; lng: number }) {
    const { v } = await this.cargar(conductorId, viajeId);
    if (v.estado === 'en_sitio') return this.actual(conductorId);
    if (v.estado !== 'asignado')
      throw conflicto('ESTADO_INVALIDO', 'Este viaje no está esperando que llegues.');

    const u = posicion ?? this.ubicaciones.obtener(conductorId);
    if (!u || !Number.isFinite(u.lat))
      throw conflicto('SIN_UBICACION', 'Necesitamos tu ubicación para confirmar que llegaste.');
    const distanciaM = Math.round(distanciaMetros(u, v.origen));
    if (distanciaM > RADIO_LLEGADA_M) {
      throw new ErrorNegocio(
        409,
        'LEJOS_DE_LA_RECOGIDA',
        `Estás a ${distanciaM} m del punto de recogida. Acércate a menos de ${RADIO_LLEGADA_M} m.`,
        { distanciaM, radioM: RADIO_LLEGADA_M },
      );
    }

    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(viaje)
        .set({ estado: 'en_sitio', enSitioEn: new Date() })
        .where(eq(viaje.id, v.id));
      await tx
        .update(conductor)
        .set({ estadoOperativo: 'en_sitio' })
        .where(eq(conductor.usuarioId, conductorId));
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'llegue',
        actorTipo: 'conductor',
        actorId: conductorId,
        ubicacion: { lat: u.lat, lng: u.lng },
        datos: { distanciaM },
      });
    });
    this.eventos.aConductor(conductorId, 'viaje:estado', { viajeId: v.id, estado: 'en_sitio' });
    return this.actual(conductorId);
  }

  /** Inicia el viaje. Si el pasajero eligió PIN, el conductor debe darlo (RN-133). */
  async iniciar(conductorId: string, viajeId: string, pin?: string) {
    const { v } = await this.cargar(conductorId, viajeId);
    if (v.estado === 'en_curso') return this.actual(conductorId);
    if (v.estado !== 'en_sitio')
      throw conflicto('ESTADO_INVALIDO', 'Primero marca que llegaste a la recogida.');

    if (v.pinInicio) {
      const intentos = this.intentosPin.get(v.id) ?? 0;
      if (intentos >= MAX_INTENTOS_PIN)
        throw new ErrorNegocio(
          429,
          'PIN_BLOQUEADO',
          'Demasiados intentos con el PIN. Comunícate con soporte.',
        );
      if (pin !== v.pinInicio) {
        this.intentosPin.set(v.id, intentos + 1);
        throw new ErrorNegocio(
          409,
          'PIN_INCORRECTO',
          'El PIN no coincide. Pídeselo de nuevo al pasajero.',
          { intentosRestantes: MAX_INTENTOS_PIN - intentos - 1 },
        );
      }
    }
    this.intentosPin.delete(v.id);

    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(viaje)
        .set({ estado: 'en_curso', iniciadoEn: new Date() })
        .where(eq(viaje.id, v.id));
      await tx
        .update(conductor)
        .set({ estadoOperativo: 'en_viaje' })
        .where(eq(conductor.usuarioId, conductorId));
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'iniciado',
        actorTipo: 'conductor',
        actorId: conductorId,
      });
    });
    this.eventos.aConductor(conductorId, 'viaje:estado', { viajeId: v.id, estado: 'en_curso' });
    return this.actual(conductorId);
  }

  /**
   * Finaliza el viaje y calcula lo que se cobra (RN-010, RN-012, RN-015): toma la medición del taxímetro, la verifica
   * con la trayectoria que recibió el servidor, aplica la tarifa y registra el dinero en el libro del conductor.
   */
  async finalizar(conductorId: string, viajeId: string, taximetro: MedicionTaximetro) {
    const ahora = new Date();
    const resultado = await this.bd.db.transaction(async (tx) => {
      const { v, ciudadId } = await this.cargar(conductorId, viajeId, tx);
      if (v.estado !== 'en_curso')
        throw conflicto('ESTADO_INVALIDO', 'Este viaje no está en curso.');
      const iniciadoEn = v.iniciadoEn!;
      const transcurridoS = (ahora.getTime() - iniciadoEn.getTime()) / 1000;
      if (taximetro.tiempoDetenidoS > taximetro.duracionS)
        throw solicitudInvalida('El tiempo detenido no puede superar la duración del viaje.');
      if (taximetro.duracionS > transcurridoS + 120)
        throw solicitudInvalida(
          'La duración que reporta el taxímetro no cuadra con la hora del viaje.',
        );

      // Verificación con la trayectoria que recibió el servidor (RN-015.2): solo lo recorrido entre "Iniciar" y
      // "Finalizar"; lo anterior es el trayecto hacia la recogida, que no se cobra.
      const puntos = await tx
        .select()
        .from(posicionConductor)
        .where(
          and(
            eq(posicionConductor.conductorId, conductorId),
            eq(posicionConductor.viajeId, v.id),
            gte(posicionConductor.registradaEn, iniciadoEn),
            lte(posicionConductor.registradaEn, new Date(ahora.getTime() + 60_000)),
          ),
        );
      const servidor = resumirTrayectoria(
        puntos.map((p) => ({
          lat: p.ubicacion.lat,
          lng: p.ubicacion.lng,
          instanteMs: p.registradaEn.getTime(),
          precisionM: p.precisionM,
          velocidadKmh: p.velocidadKmh,
        })),
      );
      const verificable = servidor.puntosUsados >= 3;
      const comparacion = verificable ? compararMediciones(taximetro, servidor) : null;
      const usarServidor = !!comparacion?.excede;
      const cobrado = usarServidor
        ? {
            distanciaM: servidor.distanciaM,
            tiempoDetenidoS: servidor.tiempoDetenidoS,
            duracionS: Math.max(servidor.duracionS, taximetro.duracionS),
          }
        : taximetro;

      // Precio.
      const [ruta] = v.rutaFijaId
        ? await tx.select().from(rutaFija).where(eq(rutaFija.id, v.rutaFijaId))
        : [];
      let totalCarrera: number;
      let cobroEspera = 0;
      let desglose: Record<string, unknown>;
      if (ruta) {
        totalCarrera = ruta.tarifa; // las rutas con tarifa fija no se recalculan (RN-012.4)
        desglose = {
          tipo: 'ruta_fija',
          destino: ruta.destino,
          modalidad: ruta.modalidad,
          tarifa: ruta.tarifa,
        };
      } else {
        const [t] = await tx.select().from(tarifa).where(eq(tarifa.id, v.tarifaId!));
        if (!t) throw conflicto('SIN_TARIFA', 'El viaje no tiene tarifa asociada.');
        if (v.enSitioEn) {
          cobroEspera = calcularCobroEspera((iniciadoEn.getTime() - v.enSitioEn.getTime()) / 1000, {
            minutosGratis: t.esperaMinutosGratis,
            valorMinuto: t.esperaMinuto,
          });
        }
        const recargos: Recargo[] = await this.precios.recargos(
          {
            ciudadId,
            tarifaId: t.id,
            categoria: v.categoria,
            origen: v.origen,
            destino: v.destino,
            instante: iniciadoEn,
          },
          tx,
        );
        const calculo = calcularTarifaUrbana({
          parametros: {
            base: t.base,
            valorKm: t.valorKm,
            valorMinuto: t.valorMinuto,
            minima: t.minima,
          },
          distanciaM: cobrado.distanciaM,
          tiempoCobrableS: cobrado.tiempoDetenidoS,
          multiplicadorDinamico: v.multiplicadorDinamico,
          recargos,
          cobroEspera,
        });
        totalCarrera = calculo.totalRedondeado;
        desglose = { tipo: 'urbano', ...calculo, recargosAplicados: recargos };
      }

      const ambito = ambitoComision(v.tipoServicio);
      const comision = calcularComision({ totalRedondeado: totalCarrera, cobroEspera }, ambito);
      const precioFinal = totalCarrera + cobroEspera;
      const efectivo = v.metodoPago === 'efectivo';
      const estadoPago = efectivo ? 'pendiente' : this.config.SIMULADOR ? 'pagado' : 'pendiente';

      await tx
        .update(viaje)
        .set({
          estado: 'finalizado',
          finalizadoEn: ahora,
          estadoPago,
          distanciaTaximetroM: taximetro.distanciaM,
          tiempoDetenidoTaximetroS: taximetro.tiempoDetenidoS,
          duracionTaximetroS: taximetro.duracionS,
          distanciaRealM: cobrado.distanciaM,
          tiempoDetenidoS: cobrado.tiempoDetenidoS,
          duracionS: cobrado.duracionS,
          desglose: {
            ...desglose,
            mediciones: {
              taximetro,
              servidor: verificable ? servidor : null,
              usada: usarServidor
                ? 'servidor'
                : verificable
                  ? 'taximetro'
                  : 'taximetro_sin_verificar',
              diferencia: comparacion,
            },
          },
          totalCarrera,
          cobroEspera,
          precioFinal,
          comision,
          comisionPb: COMISION_PUNTOS_BASICOS[ambito],
        })
        .where(eq(viaje.id, v.id));

      await tx.insert(pago).values({
        viajeId: v.id,
        tipo: efectivo ? 'efectivo' : 'electronico',
        monto: precioFinal,
        estado: estadoPago,
        claveIdempotencia: `viaje:${v.id}:cobro`,
      });
      const movimientos = movimientosDeViaje({
        metodo: efectivo ? 'efectivo' : 'electronico',
        base: { totalRedondeado: totalCarrera, cobroEspera },
        ambito,
        viajeId: v.id,
      });
      await tx
        .insert(movimientoSaldo)
        .values(
          movimientos.map((m) => ({ conductorId, tipo: m.tipo, monto: m.monto, viajeId: v.id })),
        );
      await tx
        .update(conductor)
        .set({ estadoOperativo: 'disponible' })
        .where(eq(conductor.usuarioId, conductorId));
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'finalizado',
        actorTipo: 'conductor',
        actorId: conductorId,
        datos: {
          precioFinal,
          comision,
          distanciaM: cobrado.distanciaM,
          tiempoDetenidoS: cobrado.tiempoDetenidoS,
        },
      });

      if (usarServidor) {
        await tx.insert(alerta).values({
          tipo: 'diferencia_taximetro',
          severidad: 'media',
          viajeId: v.id,
          conductorId,
          datos: { taximetro, servidor, diferencia: comparacion },
        });
      }
      return {
        viajeId: v.id,
        codigo: v.codigo,
        metodoPago: v.metodoPago,
        precioFinal,
        totalCarrera,
        cobroEspera,
        comision,
        gananciaNeta: precioFinal - comision,
        desglose,
        mediciones: {
          taximetro,
          cobradas: cobrado,
          verificadas: verificable,
          usadaServidor: usarServidor,
        },
        cobrarEnEfectivo: efectivo ? precioFinal : 0,
      };
    });
    this.eventos.aConductor(conductorId, 'viaje:estado', { viajeId, estado: 'finalizado' });
    this.eventos.aConductor(conductorId, 'conductor:estado', { estadoOperativo: 'disponible' });
    return resultado;
  }

  /** El conductor confirma cuánto efectivo recibió (RN-055). Si recibió menos, queda una deuda del pasajero y un ticket. */
  async efectivoRecibido(conductorId: string, viajeId: string, monto: number) {
    return this.bd.db.transaction(async (tx) => {
      const { v } = await this.cargar(conductorId, viajeId, tx);
      if (v.estado !== 'finalizado' || v.metodoPago !== 'efectivo')
        throw conflicto('ESTADO_INVALIDO', 'Este viaje no tiene un cobro en efectivo pendiente.');
      if (v.estadoPago !== 'pendiente')
        throw conflicto('YA_CONFIRMADO', 'Ya confirmaste el efectivo de este viaje.');
      const total = v.precioFinal ?? 0;
      const completo = monto >= total;

      await tx
        .update(pago)
        .set({ estado: completo ? 'pagado' : 'fallido' })
        .where(eq(pago.viajeId, v.id));
      await tx
        .update(viaje)
        .set({ estadoPago: completo ? 'pagado' : 'fallido' })
        .where(eq(viaje.id, v.id));
      if (!completo) {
        await tx
          .update(pasajero)
          .set({ deudaPendiente: sql`${pasajero.deudaPendiente} + ${total - monto}` })
          .where(eq(pasajero.usuarioId, v.pasajeroId));
        await tx.insert(ticket).values({
          tipo: 'cobro_incorrecto',
          prioridad: 'alta',
          usuarioId: conductorId,
          viajeId: v.id,
          asunto: `El conductor recibió $${monto} de $${total} en efectivo`,
        });
      }
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'efectivo_confirmado',
        actorTipo: 'conductor',
        actorId: conductorId,
        datos: { monto, total, completo },
      });
      return { completo, faltante: completo ? 0 : total - monto };
    });
  }

  /**
   * Cancelación del conductor. "Pasajero ausente" (tras 5 min en sitio) cobra la tarifa de cancelación (RN-043); cualquier otro
   * motivo devuelve el viaje a despacho con prioridad y no le cuesta nada al pasajero (RN-045).
   */
  async cancelar(
    conductorId: string,
    viajeId: string,
    motivo: 'pasajero_ausente' | 'emergencia' | 'problema_vehiculo' | 'otro',
    detalle?: string,
  ) {
    const { v } = await this.cargar(conductorId, viajeId);
    if (!['asignado', 'en_sitio'].includes(v.estado))
      throw conflicto('ESTADO_INVALIDO', 'Este viaje ya no se puede cancelar desde la app.');

    if (motivo === 'pasajero_ausente') {
      if (v.estado !== 'en_sitio' || !v.enSitioEn)
        throw conflicto(
          'AUN_NO_PUEDE_CANCELAR',
          'Primero marca que llegaste y espera al pasajero.',
        );
      const esperadoS = (Date.now() - v.enSitioEn.getTime()) / 1000;
      if (esperadoS < ESPERA_PASAJERO_AUSENTE_S) {
        throw new ErrorNegocio(
          409,
          'AUN_NO_PUEDE_CANCELAR',
          'Espera unos minutos más antes de cancelar por pasajero ausente.',
          { segundosRestantes: Math.ceil(ESPERA_PASAJERO_AUSENTE_S - esperadoS) },
        );
      }
      const [t] = v.tarifaId
        ? await this.bd.db.select().from(tarifa).where(eq(tarifa.id, v.tarifaId))
        : [];
      const tarifaCancelacion = t?.cancelacion ?? 4000;
      const ambito = ambitoComision(v.tipoServicio);
      const comision = calcularComision({ totalRedondeado: 0, tarifaCancelacion }, ambito);

      await this.bd.db.transaction(async (tx) => {
        await tx
          .update(viaje)
          .set({
            estado: 'cancelado',
            canceladoEn: new Date(),
            canceladoPor: 'conductor',
            motivoCancelacion: 'pasajero_ausente',
            precioFinal: tarifaCancelacion,
            totalCarrera: tarifaCancelacion,
            comision,
            comisionPb: COMISION_PUNTOS_BASICOS[ambito],
            estadoPago:
              v.metodoPago === 'efectivo'
                ? 'pendiente'
                : this.config.SIMULADOR
                  ? 'pagado'
                  : 'pendiente',
          })
          .where(eq(viaje.id, v.id));
        // La tarifa de cancelación va al conductor menos la comisión (RN-044); si el pasajero pagaba en efectivo, queda como su deuda.
        await tx.insert(movimientoSaldo).values({
          conductorId,
          tipo: 'cancelacion',
          monto: tarifaCancelacion - comision,
          viajeId: v.id,
        });
        if (v.metodoPago === 'efectivo') {
          await tx
            .update(pasajero)
            .set({ deudaPendiente: sql`${pasajero.deudaPendiente} + ${tarifaCancelacion}` })
            .where(eq(pasajero.usuarioId, v.pasajeroId));
        }
        await tx
          .update(conductor)
          .set({ estadoOperativo: 'disponible' })
          .where(eq(conductor.usuarioId, conductorId));
        await registrarEvento(tx, {
          viajeId: v.id,
          tipo: 'cancelado',
          actorTipo: 'conductor',
          actorId: conductorId,
          datos: { motivo, tarifaCancelacion },
        });
      });
      this.eventos.aConductor(conductorId, 'viaje:estado', { viajeId: v.id, estado: 'cancelado' });
      this.eventos.aConductor(conductorId, 'conductor:estado', { estadoOperativo: 'disponible' });
      return { reasignado: false, tarifaCancelacion, gananciaNeta: tarifaCancelacion - comision };
    }

    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(oferta)
        .set({ resultado: 'retirada', respondidaEn: new Date() })
        .where(and(eq(oferta.viajeId, v.id), eq(oferta.resultado, 'aceptada')));
      await tx
        .update(viaje)
        .set({
          estado: 'buscando_conductor',
          conductorId: null,
          vehiculoId: null,
          aceptadoEn: null,
          enSitioEn: null,
        })
        .where(eq(viaje.id, v.id));
      await tx
        .update(conductor)
        .set({ estadoOperativo: 'disponible' })
        .where(eq(conductor.usuarioId, conductorId));
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'cancelado_por_conductor',
        actorTipo: 'conductor',
        actorId: conductorId,
        datos: { motivo, detalle },
      });
    });
    this.eventos.aConductor(conductorId, 'viaje:estado', { viajeId: v.id, estado: 'cancelado' });
    this.eventos.aConductor(conductorId, 'conductor:estado', { estadoOperativo: 'disponible' });
    await this.alertarCancelacionesRepetidas(conductorId);
    void this.despacho.intentar(v.id); // vuelve a buscar conductor, sin ofrecérselo otra vez a quien canceló
    return { reasignado: true };
  }

  /** RN-045: más de 3 cancelaciones en 24 h avisan a cumplimiento (sin suspender automáticamente). */
  private async alertarCancelacionesRepetidas(conductorId: string): Promise<void> {
    const { db } = this.bd;
    const desde = new Date(Date.now() - 24 * 3_600_000);
    const [{ n }] = (
      await db.execute<{ n: number }>(
        sql`select count(*)::int as n from viaje_evento where tipo = 'cancelado_por_conductor' and actor_id = ${conductorId} and ocurrido_en > ${desde}`,
      )
    ).rows as [{ n: number }];
    if (n <= 3) return;
    const [abierta] = await db
      .select({ id: alerta.id })
      .from(alerta)
      .where(
        and(
          eq(alerta.tipo, 'cancelaciones_repetidas'),
          eq(alerta.conductorId, conductorId),
          gt(alerta.creadaEn, desde),
        ),
      );
    if (!abierta)
      await db.insert(alerta).values({
        tipo: 'cancelaciones_repetidas',
        severidad: 'baja',
        conductorId,
        datos: { cancelaciones24h: n },
      });
  }

  /** El conductor califica al pasajero (RN-120): una vez por viaje y dentro de las 24 h. */
  async calificar(
    conductorId: string,
    viajeId: string,
    d: { estrellas: number; etiquetas: string[]; comentario?: string | undefined },
  ) {
    return this.bd.db.transaction(async (tx) => {
      const { v } = await this.cargar(conductorId, viajeId, tx);
      if (v.estado !== 'finalizado')
        throw conflicto('ESTADO_INVALIDO', 'Solo puedes calificar viajes finalizados.');
      if (Date.now() - (v.finalizadoEn?.getTime() ?? 0) > 24 * 3_600_000)
        throw conflicto('CALIFICACION_VENCIDA', 'Ya pasaron más de 24 horas desde el viaje.');
      const [ya] = await tx
        .select({ id: calificacion.id })
        .from(calificacion)
        .where(and(eq(calificacion.viajeId, v.id), eq(calificacion.deUsuarioId, conductorId)));
      if (ya) throw conflicto('YA_CALIFICASTE', 'Ya calificaste este viaje.');

      await tx.insert(calificacion).values({
        viajeId: v.id,
        deUsuarioId: conductorId,
        aUsuarioId: v.pasajeroId,
        estrellas: d.estrellas,
        etiquetas: d.etiquetas,
        comentario: d.comentario ?? null,
      });
      // Promedio de las últimas 100 calificaciones (RN-121).
      await tx.execute(sql`
        update pasajero set
          calificacion_promedio = (select round(avg(estrellas)::numeric, 2) from (
            select estrellas from calificacion where a_usuario_id = ${v.pasajeroId} order by creado_en desc limit 100) ultimas),
          calificaciones_total = (select count(*)::int from calificacion where a_usuario_id = ${v.pasajeroId})
        where usuario_id = ${v.pasajeroId}`);
      if (d.etiquetas.some((e) => ETIQUETAS_SEGURIDAD.includes(e))) {
        await tx.insert(ticket).values({
          tipo: 'incidente_seguridad',
          prioridad: 'alta',
          usuarioId: conductorId,
          viajeId: v.id,
          asunto: 'Calificación con etiqueta de seguridad',
        });
      }
      return { ok: true };
    });
  }

  /** Botón SOS (RN-130): alerta crítica para la torre de control con el viaje y la ubicación. */
  async sos(conductorId: string, ubicacion?: { lat: number; lng: number }) {
    const { db } = this.bd;
    const reciente = new Date(Date.now() - 5 * 60_000);
    const [abierta] = await db
      .select({ id: alerta.id })
      .from(alerta)
      .where(
        and(
          eq(alerta.tipo, 'sos'),
          eq(alerta.conductorId, conductorId),
          eq(alerta.estado, 'abierta'),
          gt(alerta.creadaEn, reciente),
        ),
      );
    if (abierta) return { alertaId: abierta.id, linea: '123' };

    const [activo] = await db
      .select({ id: viaje.id })
      .from(viaje)
      .where(and(eq(viaje.conductorId, conductorId), inArray(viaje.estado, [...ESTADOS_ACTIVOS])));
    const u = ubicacion ?? this.ubicaciones.obtener(conductorId);
    const [fila] = await db
      .insert(alerta)
      .values({
        tipo: 'sos',
        severidad: 'critica',
        conductorId,
        viajeId: activo?.id ?? null,
        datos: {
          ubicacion: u && Number.isFinite(u.lat) ? { lat: u.lat, lng: u.lng } : null,
          origen: 'conductor',
        },
      })
      .returning({ id: alerta.id });
    if (activo)
      await registrarEvento(db, {
        viajeId: activo.id,
        tipo: 'sos',
        actorTipo: 'conductor',
        actorId: conductorId,
        ubicacion: u && Number.isFinite(u.lat) ? { lat: u.lat, lng: u.lng } : null,
      });
    return { alertaId: fila!.id, linea: '123' };
  }

  /** Pérdida de señal con un viaje en curso (docs/06): alerta alta, una sola vez por viaje. */
  async vigilarSenal(ahoraMs = Date.now(), umbralMs = 60_000): Promise<string[]> {
    const { db } = this.bd;
    const activos = await db
      .select({ id: viaje.id, conductorId: viaje.conductorId })
      .from(viaje)
      .where(inArray(viaje.estado, [...ESTADOS_ACTIVOS]));
    const alertados: string[] = [];
    for (const a of activos) {
      if (!a.conductorId) continue;
      const ultima = this.ubicaciones.ultimaSenalMs(a.conductorId);
      if (ultima !== undefined && ahoraMs - ultima <= umbralMs) continue;
      const [existente] = await db
        .select({ id: alerta.id })
        .from(alerta)
        .where(
          and(
            eq(alerta.tipo, 'perdida_senal'),
            eq(alerta.viajeId, a.id),
            eq(alerta.estado, 'abierta'),
          ),
        );
      if (existente) continue;
      await db.insert(alerta).values({
        tipo: 'perdida_senal',
        severidad: 'alta',
        viajeId: a.id,
        conductorId: a.conductorId,
        datos: { segundosSinSenal: ultima ? Math.round((ahoraMs - ultima) / 1000) : null },
      });
      alertados.push(a.id);
    }
    return alertados;
  }

  /** Historial reciente del conductor. */
  async historial(conductorId: string, limite = 30) {
    const filas = await this.bd.db
      .select()
      .from(viaje)
      .where(
        and(eq(viaje.conductorId, conductorId), inArray(viaje.estado, ['finalizado', 'cancelado'])),
      )
      .orderBy(desc(viaje.solicitadoEn))
      .limit(limite);
    return filas.map((v) => ({
      id: v.id,
      codigo: v.codigo,
      estado: v.estado,
      tipoServicio: v.tipoServicio,
      metodoPago: v.metodoPago,
      precioFinal: v.precioFinal,
      comision: v.comision,
      gananciaNeta:
        v.precioFinal === null || v.comision === null ? null : v.precioFinal - v.comision,
      distanciaM: v.distanciaRealM,
      tiempoDetenidoS: v.tiempoDetenidoS,
      duracionS: v.duracionS,
      origen: v.origenDireccion,
      destino: v.destinoDireccion,
      finalizadoEn: (v.finalizadoEn ?? v.canceladoEn)?.toISOString() ?? null,
      estadoPago: v.estadoPago,
    }));
  }
}
