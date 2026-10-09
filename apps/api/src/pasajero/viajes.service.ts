import { randomInt } from 'node:crypto';
import {
  alerta,
  calificacion,
  centroCosto,
  conductor,
  cotizacion,
  empresa,
  metodoPago,
  movimientoSaldo,
  pago,
  pasajero,
  ticket,
  usuario,
  vehiculo,
  viaje,
  viajeCompartido,
} from '@transportaya/db';
import {
  distanciaMetros,
  estadoDeReserva,
  finDeLaBusqueda,
  sePisan,
  validarAnticipacion,
} from '@transportaya/dominio';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, ErrorNegocio, noEncontrado } from '../comun/errores.js';
import { EmpresaPasajeroService } from '../corporativo/empresa-pasajero.service.js';
import { ParametrosService } from '../operacion/parametros.service.js';
import { UbicacionStore } from '../conductor/ubicacion.store.js';
import { CancelacionPasajeroService } from '../viajes/cancelacion-pasajero.service.js';
import { DespachoService } from '../viajes/despacho.service.js';
import { registrarEvento } from '../viajes/eventos-viaje.js';
import { cobroSimulado } from '../comun/tarjetas.js';
import { VERSION_TERMINOS } from './perfil.service.js';

const MAX_RESERVAS_ABIERTAS = 5;
const ESTADOS_ACTIVOS = ['buscando_conductor', 'asignado', 'en_sitio', 'en_curso'] as const;
const VENTANA_CALIFICAR_MS = 24 * 3_600_000;
/** Cuánto tiempo, tras terminar el viaje, la app sigue mostrando el resumen si no lo calificó. */
const VENTANA_RESUMEN_MS = 30 * 60_000;
const ETIQUETAS_SEGURIDAD = ['acoso', 'agresion', 'conduccion_peligrosa'];
const FACTOR_RUTA = 1.35;
const VELOCIDAD_MEDIA_MS = 25 / 3.6;

/** Lo que guarda el viaje al finalizar (`viaje.desglose`), tal como lo arma el cobro. */
interface DesgloseGuardado {
  tipo?: 'ruta_fija' | 'urbano';
  destino?: string;
  tarifa?: number;
  base?: number;
  distancia?: number;
  tiempo?: number;
  subtotal?: number;
  multiplicadorDinamico?: number;
  tarifaViaje?: number;
  recargos?: number;
  totalRedondeado?: number;
}

function nombreCorto(nombre: string): string {
  const [primero, ...resto] = nombre.trim().split(/\s+/);
  const inicial = resto.length > 1 ? resto[resto.length - 2]?.[0] : resto[0]?.[0];
  return `${primero ?? nombre}${inicial ? ` ${inicial.toUpperCase()}.` : ''}`;
}

@Injectable()
export class ViajesPasajeroService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(UbicacionStore) private readonly ubicaciones: UbicacionStore,
    @Inject(DespachoService) private readonly despacho: DespachoService,
    @Inject(CancelacionPasajeroService) private readonly cancelacion: CancelacionPasajeroService,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
    @Inject(EmpresaPasajeroService) private readonly empresa: EmpresaPasajeroService,
  ) {}

  /** PAS-24: confirma un viaje a partir de una cotización y empieza a buscar conductor. */
  async crear(
    pasajeroId: string,
    d: {
      cotizacionId: string;
      metodoPago: 'efectivo' | 'tarjeta' | 'corporativo';
      metodoPagoId?: string | undefined;
      nota?: string | undefined;
      /** Solo con pago corporativo (PAS-61): a qué centro de costo se carga y para qué es el viaje. */
      centroCostoId?: string | undefined;
      motivo?: string | undefined;
    },
  ) {
    const { db } = this.bd;
    const creado = await db.transaction(async (tx) => {
      // Un solo viaje a la vez por pasajero, aunque lleguen dos solicitudes juntas.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pasajeroId}))`);

      const [p] = await tx
        .select({
          deuda: pasajero.deudaPendiente,
          version: pasajero.versionTerminos,
          nombre: usuario.nombre,
        })
        .from(pasajero)
        .innerJoin(usuario, eq(usuario.id, pasajero.usuarioId))
        .where(eq(pasajero.usuarioId, pasajeroId));
      if (!p) throw noEncontrado('PASAJERO_NO_ENCONTRADO', 'No encontramos tu cuenta');
      if (p.version !== VERSION_TERMINOS)
        throw conflicto(
          'TERMINOS_PENDIENTES',
          'Acepta los términos y la política de datos para pedir un viaje.',
        );
      if (p.nombre === 'Sin nombre')
        throw conflicto('PERFIL_INCOMPLETO', 'Cuéntanos tu nombre para pedir un viaje.');
      if (p.deuda > 0)
        throw conflicto(
          'DEUDA_PENDIENTE',
          'Tienes un pago pendiente. Págalo para pedir otro viaje.',
          {
            deuda: p.deuda,
          },
        );
      const [cot] = await tx
        .select()
        .from(cotizacion)
        .where(and(eq(cotizacion.id, d.cotizacionId), eq(cotizacion.pasajeroId, pasajeroId)));
      if (!cot) throw noEncontrado('COTIZACION_NO_ENCONTRADA', 'No encontramos esa cotización');

      // Un viaje inmediato a la vez. Una reserva puede hacerse aunque haya un viaje en curso, pero no se pisa con otra.
      if (cot.programadoPara) {
        const error = validarAnticipacion(
          cot.programadoPara,
          new Date(),
          await this.parametros.reservas(),
        );
        if (error) throw new ErrorNegocio(400, error.codigo, error.detalle);
        const otras = await tx
          .select({ hora: viaje.programadoPara })
          .from(viaje)
          .where(and(eq(viaje.pasajeroId, pasajeroId), eq(viaje.estado, 'programado')));
        if (otras.length >= MAX_RESERVAS_ABIERTAS)
          throw conflicto(
            'DEMASIADAS_RESERVAS',
            `Puedes tener hasta ${MAX_RESERVAS_ABIERTAS} reservas a la vez.`,
          );
        if (otras.some((o) => o.hora && sePisan(o.hora, cot.programadoPara!, 60)))
          throw conflicto(
            'RESERVA_SE_PISA',
            'Ya tienes otra reserva a una hora muy cercana a esa.',
          );
      } else {
        const [enCurso] = await tx
          .select({ id: viaje.id })
          .from(viaje)
          .where(
            and(eq(viaje.pasajeroId, pasajeroId), inArray(viaje.estado, [...ESTADOS_ACTIVOS])),
          );
        if (enCurso) throw conflicto('VIAJE_EN_CURSO', 'Ya tienes un viaje en curso.');
      }
      if (cot.expiraEn.getTime() < Date.now())
        throw conflicto('COTIZACION_VENCIDA', 'El precio venció. Vuelve a cotizar.');
      const [usada] = await tx
        .select({ id: viaje.id })
        .from(viaje)
        .where(eq(viaje.cotizacionId, cot.id));
      if (usada) throw conflicto('COTIZACION_USADA', 'Esa cotización ya se usó.');

      let metodoPagoId: string | null = null;
      if (d.metodoPago === 'tarjeta') {
        const [m] = await tx
          .select({ id: metodoPago.id })
          .from(metodoPago)
          .where(
            and(
              eq(metodoPago.pasajeroId, pasajeroId),
              eq(metodoPago.activo, true),
              d.metodoPagoId
                ? eq(metodoPago.id, d.metodoPagoId)
                : eq(metodoPago.predeterminado, true),
            ),
          );
        if (!m) throw conflicto('SIN_TARJETA', 'Agrega una tarjeta para pagar con tarjeta.');
        metodoPagoId = m.id;
      }

      // Viaje a cargo de la empresa: política y contrato se comprueban otra vez aquí, no solo al cotizar (RN-103, RN-104).
      const corporativo =
        d.metodoPago === 'corporativo'
          ? await this.empresa.autorizar(tx, pasajeroId, {
              instante: cot.programadoPara ?? new Date(),
              categoria: cot.categoria,
              tipoServicio: cot.tipoServicio,
              precioMaximo: cot.precioMax,
              centroCostoId: d.centroCostoId,
              motivo: d.motivo,
            })
          : null;

      const pin = String(randomInt(0, 10_000)).padStart(4, '0');
      const [v] = await tx
        .insert(viaje)
        .values({
          pasajeroId,
          tipoServicio: cot.tipoServicio,
          categoria: cot.categoria,
          origen: cot.origen,
          origenDireccion: cot.origenDireccion,
          destino: cot.destino,
          destinoDireccion: cot.destinoDireccion,
          notaConductor: d.nota?.trim() || null,
          cotizacionId: cot.id,
          tarifaId: cot.tarifaId,
          rutaFijaId: cot.rutaFijaId,
          multiplicadorDinamico: cot.multiplicadorDinamico,
          metodoPago: d.metodoPago,
          metodoPagoId,
          ...(corporativo
            ? {
                empresaId: corporativo.empresaId,
                vinculoEmpresaId: corporativo.vinculoEmpresaId,
                centroCostoId: corporativo.centroCostoId,
                motivoCorporativo: corporativo.motivo,
              }
            : {}),
          pinInicio: pin,
          precioEstimadoMin: cot.precioMin,
          precioEstimadoMax: cot.precioMax,
          ...(cot.programadoPara
            ? { estado: 'programado' as const, programadoPara: cot.programadoPara }
            : {}),
        })
        .returning({ id: viaje.id });
      await registrarEvento(tx, {
        viajeId: v!.id,
        tipo: 'solicitado',
        actorTipo: 'pasajero',
        actorId: pasajeroId,
        ubicacion: cot.origen,
        datos: {
          categoria: cot.categoria,
          metodoPago: d.metodoPago,
          ...(cot.programadoPara ? { programadoPara: cot.programadoPara.toISOString() } : {}),
        },
      });
      return { ...v!, reserva: !!cot.programadoPara };
    });

    // Una reserva no busca conductor ahora: se activa a su hora (ReservasService.mantener).
    if (!creado.reserva) void this.despacho.iniciar(creado.id);
    return this.armar(pasajeroId, creado.id);
  }

  /** El viaje activo del pasajero o, si acaba de terminar uno sin calificar, ese resumen. */
  async actual(pasajeroId: string) {
    const { db } = this.bd;
    const [activo] = await db
      .select({ id: viaje.id })
      .from(viaje)
      .where(and(eq(viaje.pasajeroId, pasajeroId), inArray(viaje.estado, [...ESTADOS_ACTIVOS])));
    if (activo) return this.armar(pasajeroId, activo.id);

    const [reciente] = await db
      .select({ id: viaje.id })
      .from(viaje)
      .where(
        and(
          eq(viaje.pasajeroId, pasajeroId),
          eq(viaje.estado, 'finalizado'),
          gt(viaje.finalizadoEn, new Date(Date.now() - VENTANA_RESUMEN_MS)),
          sql`not exists (select 1 from calificacion c where c.viaje_id = ${viaje.id} and c.de_usuario_id = ${pasajeroId})`,
        ),
      )
      .orderBy(desc(viaje.finalizadoEn))
      .limit(1);
    return reciente ? this.armar(pasajeroId, reciente.id) : null;
  }

  async detalle(pasajeroId: string, viajeId: string) {
    return this.armar(pasajeroId, viajeId);
  }

  /** Todo lo que la app necesita para mostrar un viaje del pasajero en cualquier estado. */
  private async armar(pasajeroId: string, viajeId: string) {
    const { db } = this.bd;
    const [v] = await db
      .select()
      .from(viaje)
      .where(and(eq(viaje.id, viajeId), eq(viaje.pasajeroId, pasajeroId)));
    if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');

    let conductorInfo = null;
    // En una reserva ya confirmada se muestra el conductor que la tomó, antes de que empiece el servicio.
    const idConductor =
      v.conductorId ??
      (v.estado === 'programado' && v.reservaConfirmadaEn ? v.reservaConductorId : null);
    if (idConductor) {
      const [c] = await db
        .select({
          nombre: usuario.nombre,
          calificacion: conductor.calificacionPromedio,
          total: conductor.calificacionesTotal,
          marca: vehiculo.marca,
          linea: vehiculo.linea,
          color: vehiculo.color,
          placa: vehiculo.placa,
          categoria: vehiculo.categoria,
          anio: vehiculo.modeloAnio,
        })
        .from(conductor)
        .innerJoin(usuario, eq(usuario.id, conductor.usuarioId))
        .innerJoin(vehiculo, eq(vehiculo.id, v.vehiculoId ?? conductor.vehiculoActivoId))
        .where(eq(conductor.usuarioId, idConductor));
      const u = this.ubicaciones.obtener(idConductor);
      const enRuta = ['asignado', 'en_sitio', 'en_curso'].includes(v.estado);
      const meta = v.estado === 'en_curso' ? v.destino : v.origen;
      const distanciaM =
        enRuta && u && Number.isFinite(u.lat)
          ? Math.round(distanciaMetros(u, meta) * FACTOR_RUTA)
          : null;
      if (c) {
        conductorInfo = {
          nombre: nombreCorto(c.nombre),
          calificacion: c.calificacion,
          viajes: c.total,
          vehiculo: {
            marca: c.marca,
            linea: c.linea,
            color: c.color,
            placa: c.placa,
            categoria: c.categoria,
            anio: c.anio,
          },
          posicion:
            enRuta && u && Number.isFinite(u.lat)
              ? { lat: u.lat, lng: u.lng, t: u.instanteMs }
              : null,
          distanciaM,
          etaS: distanciaM === null ? null : Math.round(distanciaM / VELOCIDAD_MEDIA_MS),
          hacia: v.estado === 'en_curso' ? ('destino' as const) : ('recogida' as const),
        };
      }
    }

    const [califico] = await db
      .select({ estrellas: calificacion.estrellas })
      .from(calificacion)
      .where(and(eq(calificacion.viajeId, v.id), eq(calificacion.deUsuarioId, pasajeroId)));
    const costoCancelar =
      v.estado === 'programado' ||
      v.estado === 'buscando_conductor' ||
      v.estado === 'asignado' ||
      v.estado === 'en_sitio'
        ? await this.cancelacion.costoDeCancelar(v)
        : null;
    const [enlace] = await db
      .select({ id: viajeCompartido.id })
      .from(viajeCompartido)
      .where(
        and(
          eq(viajeCompartido.viajeId, v.id),
          sql`${viajeCompartido.expiraEn} is null or ${viajeCompartido.expiraEn} > now()`,
        ),
      );
    const [corp] = v.empresaId
      ? await db
          .select({ empresa: empresa.nombre, centroCosto: centroCosto.nombre })
          .from(empresa)
          .leftJoin(centroCosto, eq(centroCosto.id, v.centroCostoId ?? sql`null`))
          .where(eq(empresa.id, v.empresaId))
      : [];
    const finalizado = v.estado === 'finalizado';
    const dentroDeVentana =
      finalizado && Date.now() - (v.finalizadoEn?.getTime() ?? 0) < VENTANA_CALIFICAR_MS;

    return {
      id: v.id,
      codigo: v.codigo,
      estado: v.estado,
      tipoServicio: v.tipoServicio,
      categoria: v.categoria,
      origen: { lat: v.origen.lat, lng: v.origen.lng, direccion: v.origenDireccion },
      destino: { lat: v.destino.lat, lng: v.destino.lng, direccion: v.destinoDireccion },
      nota: v.notaConductor,
      programadoPara: v.programadoPara?.toISOString() ?? null,
      reserva: v.programadoPara
        ? {
            estado: estadoDeReserva(v),
            conductorConfirmado: !!v.reservaConfirmadaEn,
          }
        : null,
      metodoPago: v.metodoPago,
      estadoPago: v.estadoPago,
      corporativo: corp
        ? {
            empresa: corp.empresa,
            centroCosto: corp.centroCosto,
            motivo: v.motivoCorporativo,
            descuento: v.descuentoCorporativo,
          }
        : null,
      pin: ['asignado', 'en_sitio'].includes(v.estado) ? v.pinInicio : null,
      precioEstimado: { min: v.precioEstimadoMin, max: v.precioEstimadoMax },
      precioFinal: v.precioFinal,
      cobroEspera: v.cobroEspera,
      peajes: v.peajes,
      propina: v.propina,
      conductor: conductorInfo,
      tiempos: {
        solicitadoEn: v.solicitadoEn.toISOString(),
        aceptadoEn: v.aceptadoEn?.toISOString() ?? null,
        enSitioEn: v.enSitioEn?.toISOString() ?? null,
        iniciadoEn: v.iniciadoEn?.toISOString() ?? null,
        finalizadoEn: v.finalizadoEn?.toISOString() ?? null,
        canceladoEn: v.canceladoEn?.toISOString() ?? null,
      },
      busqueda:
        v.estado === 'buscando_conductor'
          ? {
              // Una reserva se busca desde que se activó y hasta un rato después de la hora del servicio.
              desde: (v.busquedaDesde ?? v.solicitadoEn).toISOString(),
              expiraEn: (v.programadoPara
                ? finDeLaBusqueda(v.programadoPara, await this.parametros.reservas())
                : new Date(v.solicitadoEn.getTime() + this.despacho.presupuestoBusquedaMs)
              ).toISOString(),
            }
          : null,
      cancelacion: costoCancelar,
      compartido: !!enlace,
      calificacion: califico?.estrellas ?? null,
      puedeCalificar: dentroDeVentana && !califico,
      puedeDarPropina:
        dentroDeVentana &&
        v.metodoPago === 'tarjeta' &&
        v.propina === 0 &&
        v.estadoPago === 'pagado',
    };
  }

  /** PAS-36: cancelar con el costo claro (HU-PAS-02). */
  async cancelar(pasajeroId: string, viajeId: string) {
    const [v] = await this.bd.db
      .select({ id: viaje.id })
      .from(viaje)
      .where(and(eq(viaje.id, viajeId), eq(viaje.pasajeroId, pasajeroId)));
    if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
    const r = await this.cancelacion.cancelar(viajeId);
    return { costo: r.costo };
  }

  /** PAS-44: historial con filtros por estado. */
  async historial(
    pasajeroId: string,
    o: {
      limite: number;
      antes?: Date | undefined;
      estado?: 'finalizado' | 'cancelado' | undefined;
    },
  ) {
    const filas = await this.bd.db
      .select({
        id: viaje.id,
        codigo: viaje.codigo,
        estado: viaje.estado,
        tipoServicio: viaje.tipoServicio,
        categoria: viaje.categoria,
        origen: viaje.origenDireccion,
        destino: viaje.destinoDireccion,
        metodoPago: viaje.metodoPago,
        precioFinal: viaje.precioFinal,
        propina: viaje.propina,
        solicitadoEn: viaje.solicitadoEn,
        finalizadoEn: viaje.finalizadoEn,
        canceladoEn: viaje.canceladoEn,
        canceladoPor: viaje.canceladoPor,
        conductor: usuario.nombre,
        placa: vehiculo.placa,
        estrellas: sql<
          number | null
        >`(select c.estrellas from calificacion c where c.viaje_id = ${viaje.id} and c.de_usuario_id = ${pasajeroId})`,
      })
      .from(viaje)
      .leftJoin(usuario, eq(usuario.id, viaje.conductorId))
      .leftJoin(vehiculo, eq(vehiculo.id, viaje.vehiculoId))
      .where(
        and(
          eq(viaje.pasajeroId, pasajeroId),
          o.estado
            ? eq(viaje.estado, o.estado)
            : inArray(viaje.estado, ['finalizado', 'cancelado', 'sin_conductor']),
          o.antes ? sql`${viaje.solicitadoEn} < ${o.antes}` : undefined,
        ),
      )
      .orderBy(desc(viaje.solicitadoEn))
      .limit(o.limite);
    return filas.map((f) => ({
      id: f.id,
      codigo: f.codigo,
      estado: f.estado,
      tipoServicio: f.tipoServicio,
      categoria: f.categoria,
      origen: f.origen,
      destino: f.destino,
      metodoPago: f.metodoPago,
      precioFinal: f.precioFinal,
      propina: f.propina,
      fecha: (f.finalizadoEn ?? f.canceladoEn ?? f.solicitadoEn).toISOString(),
      canceladoPor: f.canceladoPor,
      conductor: f.conductor ? nombreCorto(f.conductor) : null,
      placa: f.placa,
      calificacion: f.estrellas,
    }));
  }

  /** PAS-40 y PAS-43: el recibo con cada concepto del precio. */
  async recibo(pasajeroId: string, viajeId: string) {
    const v = await this.armar(pasajeroId, viajeId);
    const [fila] = await this.bd.db
      .select({
        desglose: viaje.desglose,
        distanciaM: viaje.distanciaRealM,
        duracionS: viaje.duracionS,
        detenidoS: viaje.tiempoDetenidoS,
        totalCarrera: viaje.totalCarrera,
        correo: usuario.email,
        nombre: usuario.nombre,
      })
      .from(viaje)
      .innerJoin(usuario, eq(usuario.id, viaje.pasajeroId))
      .where(eq(viaje.id, viajeId));
    if (!['finalizado', 'cancelado'].includes(v.estado) || v.precioFinal === null)
      throw conflicto('SIN_RECIBO', 'Este viaje no tiene recibo.');

    const d = (fila?.desglose ?? {}) as DesgloseGuardado;
    const lineas: { concepto: string; valor: number }[] = [];
    if (d.tipo === 'ruta_fija') {
      lineas.push({ concepto: `Tarifa fija a ${d.destino ?? ''}`, valor: d.tarifa ?? 0 });
    } else if (d.tipo === 'urbano') {
      const subtotal = d.subtotal ?? 0;
      const multiplicador = d.multiplicadorDinamico ?? 1;
      const tarifaViaje = d.tarifaViaje ?? 0;
      const recargos = d.recargos ?? 0;
      const conDinamica = Math.round(subtotal * multiplicador);
      lineas.push({ concepto: 'Banderazo', valor: d.base ?? 0 });
      lineas.push({ concepto: 'Distancia', valor: d.distancia ?? 0 });
      if (d.tiempo) lineas.push({ concepto: 'Tiempo detenido', valor: d.tiempo });
      if (multiplicador > 1)
        lineas.push({
          concepto: `Tarifa dinámica (x${multiplicador})`,
          valor: conDinamica - subtotal,
        });
      if (tarifaViaje > conDinamica)
        lineas.push({ concepto: 'Ajuste a la tarifa mínima', valor: tarifaViaje - conDinamica });
      if (recargos) lineas.push({ concepto: 'Recargos', valor: recargos });
      const ajuste = (d.totalRedondeado ?? 0) - tarifaViaje - recargos;
      if (ajuste !== 0) lineas.push({ concepto: 'Aproximación a la centena', valor: ajuste });
      if (v.cobroEspera > 0) lineas.push({ concepto: 'Tiempo de espera', valor: v.cobroEspera });
      if (v.peajes > 0) lineas.push({ concepto: 'Peajes', valor: v.peajes });
    } else if (v.estado === 'cancelado') {
      lineas.push({ concepto: 'Cancelación', valor: v.precioFinal });
    }
    if (v.propina > 0) lineas.push({ concepto: 'Propina', valor: v.propina });
    return {
      codigo: v.codigo,
      estado: v.estado,
      fecha: v.tiempos.finalizadoEn ?? v.tiempos.canceladoEn ?? v.tiempos.solicitadoEn,
      pasajero: fila?.nombre ?? '',
      origen: v.origen.direccion,
      destino: v.destino.direccion,
      conductor: v.conductor
        ? { nombre: v.conductor.nombre, vehiculo: v.conductor.vehiculo }
        : null,
      metodoPago: v.metodoPago,
      estadoPago: v.estadoPago,
      corporativo: v.corporativo,
      mediciones: {
        distanciaM: fila?.distanciaM ?? null,
        duracionS: fila?.duracionS ?? null,
        tiempoDetenidoS: fila?.detenidoS ?? null,
      },
      lineas,
      total: v.precioFinal + v.propina,
    };
  }

  /** PAS-41: califica al conductor (RN-120): una vez por viaje y dentro de las 24 horas. */
  async calificar(
    pasajeroId: string,
    viajeId: string,
    d: { estrellas: number; etiquetas: string[]; comentario?: string | undefined },
  ) {
    return this.bd.db.transaction(async (tx) => {
      const [v] = await tx
        .select()
        .from(viaje)
        .where(and(eq(viaje.id, viajeId), eq(viaje.pasajeroId, pasajeroId)));
      if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
      if (v.estado !== 'finalizado' || !v.conductorId)
        throw conflicto('ESTADO_INVALIDO', 'Solo puedes calificar viajes finalizados.');
      if (Date.now() - (v.finalizadoEn?.getTime() ?? 0) > VENTANA_CALIFICAR_MS)
        throw conflicto('CALIFICACION_VENCIDA', 'Ya pasaron más de 24 horas desde el viaje.');
      const [ya] = await tx
        .select({ id: calificacion.id })
        .from(calificacion)
        .where(and(eq(calificacion.viajeId, v.id), eq(calificacion.deUsuarioId, pasajeroId)));
      if (ya) throw conflicto('YA_CALIFICASTE', 'Ya calificaste este viaje.');

      await tx.insert(calificacion).values({
        viajeId: v.id,
        deUsuarioId: pasajeroId,
        aUsuarioId: v.conductorId,
        estrellas: d.estrellas,
        etiquetas: d.etiquetas,
        comentario: d.comentario ?? null,
      });
      // Promedio de las últimas 100 calificaciones (RN-121).
      await tx.execute(sql`
        update conductor set
          calificacion_promedio = (select round(avg(estrellas)::numeric, 2) from (
            select estrellas from calificacion where a_usuario_id = ${v.conductorId} order by creado_en desc limit 100) ultimas),
          calificaciones_total = (select count(*)::int from calificacion where a_usuario_id = ${v.conductorId})
        where usuario_id = ${v.conductorId}`);
      if (d.etiquetas.some((e) => ETIQUETAS_SEGURIDAD.includes(e))) {
        await tx.insert(ticket).values({
          tipo: 'incidente_seguridad',
          prioridad: 'alta',
          usuarioId: pasajeroId,
          viajeId: v.id,
          asunto: 'Calificación con etiqueta de seguridad',
        });
        await tx.insert(alerta).values({
          tipo: 'calificacion_seguridad',
          severidad: 'alta',
          viajeId: v.id,
          conductorId: v.conductorId,
          datos: { etiquetas: d.etiquetas, estrellas: d.estrellas },
        });
      }
      return { ok: true };
    });
  }

  /**
   * PAS-42: propina electrónica. Va completa al conductor (sin comisión, RN-061). Solo en viajes pagados con tarjeta;
   * en efectivo la propina se entrega en mano.
   */
  async darPropina(pasajeroId: string, viajeId: string, monto: number) {
    return this.bd.db.transaction(async (tx) => {
      const [v] = await tx
        .select()
        .from(viaje)
        .where(and(eq(viaje.id, viajeId), eq(viaje.pasajeroId, pasajeroId)))
        .for('update');
      if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
      if (v.estado !== 'finalizado' || !v.conductorId)
        throw conflicto('ESTADO_INVALIDO', 'Solo puedes dar propina en viajes finalizados.');
      if (v.metodoPago !== 'tarjeta')
        throw conflicto(
          'PROPINA_NO_DISPONIBLE',
          'La propina en la app es solo para viajes pagados con tarjeta.',
        );
      if (v.estadoPago !== 'pagado')
        throw conflicto(
          'PROPINA_NO_DISPONIBLE',
          'Primero se debe pagar el viaje para poder dejar propina.',
        );
      if (v.propina > 0) throw conflicto('YA_DIO_PROPINA', 'Ya dejaste propina en este viaje.');
      if (Date.now() - (v.finalizadoEn?.getTime() ?? 0) > VENTANA_CALIFICAR_MS)
        throw conflicto('PROPINA_VENCIDA', 'Ya pasaron más de 24 horas desde el viaje.');
      const [m] = v.metodoPagoId
        ? await tx.select().from(metodoPago).where(eq(metodoPago.id, v.metodoPagoId))
        : [];
      if (cobroSimulado(m?.tokenProveedor) === 'rechazado')
        throw conflicto('COBRO_RECHAZADO', 'Tu banco rechazó el cobro de la propina.');

      await tx.update(viaje).set({ propina: monto }).where(eq(viaje.id, v.id));
      await tx.insert(pago).values({
        viajeId: v.id,
        metodoPagoId: v.metodoPagoId,
        tipo: 'electronico',
        monto,
        estado: 'pagado',
        claveIdempotencia: `viaje:${v.id}:propina`,
      });
      await tx
        .insert(movimientoSaldo)
        .values({ conductorId: v.conductorId, tipo: 'propina', monto, viajeId: v.id });
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'propina',
        actorTipo: 'pasajero',
        actorId: pasajeroId,
        datos: { monto },
      });
      return { propina: monto };
    });
  }

  /** PAS-35: SOS (RN-130). Alerta crítica con el viaje y la ubicación; se avisa a los contactos de confianza. */
  async sos(pasajeroId: string, ubicacion?: { lat: number; lng: number }) {
    const { db } = this.bd;
    const reciente = new Date(Date.now() - 5 * 60_000);
    const [activo] = await db
      .select({ id: viaje.id, conductorId: viaje.conductorId })
      .from(viaje)
      .where(and(eq(viaje.pasajeroId, pasajeroId), inArray(viaje.estado, [...ESTADOS_ACTIVOS])));
    const [abierta] = await db
      .select({ id: alerta.id })
      .from(alerta)
      .where(
        and(
          eq(alerta.tipo, 'sos'),
          eq(alerta.estado, 'abierta'),
          gt(alerta.creadaEn, reciente),
          activo ? eq(alerta.viajeId, activo.id) : isNull(alerta.viajeId),
          sql`${alerta.datos}->>'pasajeroId' = ${pasajeroId}`,
        ),
      );
    const contactos = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from contacto_confianza where pasajero_id = ${pasajeroId}`,
    );
    const avisados = contactos.rows[0]?.n ?? 0;
    if (abierta) return { alertaId: abierta.id, linea: '123', contactosAvisados: avisados };

    const [fila] = await db
      .insert(alerta)
      .values({
        tipo: 'sos',
        severidad: 'critica',
        viajeId: activo?.id ?? null,
        conductorId: activo?.conductorId ?? null,
        datos: { origen: 'pasajero', pasajeroId, ubicacion: ubicacion ?? null },
      })
      .returning({ id: alerta.id });
    if (activo)
      await registrarEvento(db, {
        viajeId: activo.id,
        tipo: 'sos',
        actorTipo: 'pasajero',
        actorId: pasajeroId,
        ubicacion: ubicacion ?? null,
      });
    // El mensaje a los contactos (SMS o WhatsApp con el enlace del viaje) sale cuando haya proveedor (D-25).
    return { alertaId: fila!.id, linea: '123', contactosAvisados: avisados };
  }
}
