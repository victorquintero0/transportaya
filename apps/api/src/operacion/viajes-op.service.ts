import { Inject, Injectable } from '@nestjs/common';
import {
  ajusteSaldo,
  alerta,
  centroCosto,
  conductor,
  empresa,
  oferta,
  pago,
  pasajero,
  reembolso,
  ticket,
  usuario,
  vehiculo,
  viaje,
  viajeEvento,
  viajeMensaje,
} from '@transportaya/db';
import { ambitoComision, calcularComision, movimientosDeViaje } from '@transportaya/dominio';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { DespachoService } from '../viajes/despacho.service.js';
import { registrarEvento } from '../viajes/eventos-viaje.js';
import { descuentoDeEmpresa } from '../viajes/descuento-corporativo.js';
import { type Operador, auditar } from './auditoria.js';
import { comodines } from './comun.js';

const ESTADOS_ACTIVOS = [
  'programado',
  'buscando_conductor',
  'asignado',
  'en_sitio',
  'en_curso',
] as const;

export interface FiltroViajes {
  q?: string | undefined;
  estado?: string | undefined;
  tipoServicio?: string | undefined;
  conductorId?: string | undefined;
  pasajeroId?: string | undefined;
  desde?: Date | undefined;
  hasta?: Date | undefined;
  limite: number;
  desplazar: number;
}

const suma = (m: { monto: number }[]) => m.reduce((a, x) => a + x.monto, 0);

@Injectable()
export class ViajesOperacionService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(DespachoService) private readonly despacho: DespachoService,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  async listar(f: FiltroViajes) {
    const pas = alias(usuario, 'pas');
    const con = alias(usuario, 'con');
    const donde = and(
      f.q
        ? or(
            ilike(viaje.codigo, comodines(f.q)),
            ilike(pas.nombre, comodines(f.q)),
            ilike(pas.telefono, comodines(f.q)),
            ilike(con.nombre, comodines(f.q)),
            ilike(vehiculo.placa, comodines(f.q)),
          )
        : undefined,
      f.estado ? sql`${viaje.estado}::text = ${f.estado}` : undefined,
      f.tipoServicio ? sql`${viaje.tipoServicio}::text = ${f.tipoServicio}` : undefined,
      f.conductorId ? eq(viaje.conductorId, f.conductorId) : undefined,
      f.pasajeroId ? eq(viaje.pasajeroId, f.pasajeroId) : undefined,
      f.desde ? gte(viaje.solicitadoEn, f.desde) : undefined,
      f.hasta ? lte(viaje.solicitadoEn, f.hasta) : undefined,
    );
    const base = this.bd.db
      .select({
        id: viaje.id,
        codigo: viaje.codigo,
        estado: viaje.estado,
        solicitadoEn: viaje.solicitadoEn,
        tipoServicio: viaje.tipoServicio,
        categoria: viaje.categoria,
        metodoPago: viaje.metodoPago,
        origenDireccion: viaje.origenDireccion,
        destinoDireccion: viaje.destinoDireccion,
        precio: sql<number>`coalesce(${viaje.precioFinal}, (${viaje.precioEstimadoMin} + ${viaje.precioEstimadoMax}) / 2)`,
        precioFinal: viaje.precioFinal,
        pasajeroId: viaje.pasajeroId,
        pasajero: pas.nombre,
        conductorId: viaje.conductorId,
        conductor: con.nombre,
        placa: vehiculo.placa,
        canceladoPor: viaje.canceladoPor,
      })
      .from(viaje)
      .innerJoin(pas, eq(pas.id, viaje.pasajeroId))
      .leftJoin(con, eq(con.id, viaje.conductorId))
      .leftJoin(vehiculo, eq(vehiculo.id, viaje.vehiculoId))
      .where(donde);
    const filas = await base.orderBy(desc(viaje.solicitadoEn)).limit(f.limite).offset(f.desplazar);
    const [t] = await this.bd.db
      .select({ total: sql<number>`count(*)::int` })
      .from(viaje)
      .innerJoin(pas, eq(pas.id, viaje.pasajeroId))
      .leftJoin(con, eq(con.id, viaje.conductorId))
      .leftJoin(vehiculo, eq(vehiculo.id, viaje.vehiculoId))
      .where(donde);
    return {
      total: t?.total ?? 0,
      items: filas.map((r) => ({
        ...r,
        precio: Number(r.precio),
        solicitadoEn: r.solicitadoEn.toISOString(),
      })),
    };
  }

  async detalle(id: string) {
    const { db } = this.bd;
    const pas = alias(usuario, 'pas');
    const con = alias(usuario, 'con');
    const [fila] = await db
      .select({
        v: viaje,
        pasajeroNombre: pas.nombre,
        pasajeroTelefono: pas.telefono,
        conductorNombre: con.nombre,
        conductorTelefono: con.telefono,
        placa: vehiculo.placa,
        vehiculo: sql<
          string | null
        >`${vehiculo.marca} || ' ' || ${vehiculo.linea} || ' ' || ${vehiculo.color}`,
      })
      .from(viaje)
      .innerJoin(pas, eq(pas.id, viaje.pasajeroId))
      .leftJoin(con, eq(con.id, viaje.conductorId))
      .leftJoin(vehiculo, eq(vehiculo.id, viaje.vehiculoId))
      .where(eq(viaje.id, id));
    if (!fila) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
    const v = fila.v;

    const actor = alias(usuario, 'actor');
    const eventos = await db
      .select({
        id: viajeEvento.id,
        tipo: viajeEvento.tipo,
        actorTipo: viajeEvento.actorTipo,
        actorNombre: actor.nombre,
        ubicacion: viajeEvento.ubicacion,
        datos: viajeEvento.datos,
        ocurridoEn: viajeEvento.ocurridoEn,
      })
      .from(viajeEvento)
      .leftJoin(actor, eq(actor.id, viajeEvento.actorId))
      .where(eq(viajeEvento.viajeId, id))
      .orderBy(viajeEvento.ocurridoEn, viajeEvento.id);

    const ofertaCon = alias(usuario, 'ofcon');
    const ofertas = await db
      .select({
        id: oferta.id,
        conductor: ofertaCon.nombre,
        conductorId: oferta.conductorId,
        ronda: oferta.ronda,
        etaRecogidaS: oferta.etaRecogidaS,
        distanciaRecogidaM: oferta.distanciaRecogidaM,
        ofrecidaEn: oferta.ofrecidaEn,
        respondidaEn: oferta.respondidaEn,
        resultado: oferta.resultado,
      })
      .from(oferta)
      .innerJoin(ofertaCon, eq(ofertaCon.id, oferta.conductorId))
      .where(eq(oferta.viajeId, id))
      .orderBy(oferta.ofrecidaEn);

    const pagos = await db.select().from(pago).where(eq(pago.viajeId, id));
    const reembolsos = pagos.length
      ? await db
          .select()
          .from(reembolso)
          .where(
            inArray(
              reembolso.pagoId,
              pagos.map((p) => p.id),
            ),
          )
      : [];
    const tickets = await db
      .select({
        id: ticket.id,
        tipo: ticket.tipo,
        estado: ticket.estado,
        asunto: ticket.asunto,
        creadoEn: ticket.creadoEn,
      })
      .from(ticket)
      .where(eq(ticket.viajeId, id))
      .orderBy(desc(ticket.creadoEn));
    const alertas = await db
      .select()
      .from(alerta)
      .where(eq(alerta.viajeId, id))
      .orderBy(desc(alerta.creadaEn));
    const autor = alias(usuario, 'autor');
    const mensajes = await db
      .select({
        id: viajeMensaje.id,
        autor: autor.nombre,
        autorId: viajeMensaje.autorId,
        cuerpo: viajeMensaje.cuerpo,
        creadoEn: viajeMensaje.creadoEn,
      })
      .from(viajeMensaje)
      .innerJoin(autor, eq(autor.id, viajeMensaje.autorId))
      .where(eq(viajeMensaje.viajeId, id))
      .orderBy(viajeMensaje.creadoEn);
    const ajustes = await db.select().from(ajusteSaldo).where(eq(ajusteSaldo.viajeId, id));

    const [pasajeroFicha] = await db
      .select({ calificacion: pasajero.calificacionPromedio, deuda: pasajero.deudaPendiente })
      .from(pasajero)
      .where(eq(pasajero.usuarioId, v.pasajeroId));

    const [corp] = v.empresaId
      ? await db
          .select({ id: empresa.id, empresa: empresa.nombre, centroCosto: centroCosto.nombre })
          .from(empresa)
          .leftJoin(centroCosto, eq(centroCosto.id, v.centroCostoId ?? sql`null`))
          .where(eq(empresa.id, v.empresaId))
      : [];

    const activo = (ESTADOS_ACTIVOS as readonly string[]).includes(v.estado);
    return {
      viaje: {
        corporativo: corp
          ? {
              empresaId: corp.id,
              empresa: corp.empresa,
              centroCosto: corp.centroCosto,
              motivo: v.motivoCorporativo,
              descuento: v.descuentoCorporativo,
              estadoCuentaId: v.estadoCuentaId,
            }
          : null,
        id: v.id,
        codigo: v.codigo,
        estado: v.estado,
        estadoPago: v.estadoPago,
        tipoServicio: v.tipoServicio,
        categoria: v.categoria,
        metodoPago: v.metodoPago,
        origen: v.origen,
        destino: v.destino,
        origenDireccion: v.origenDireccion,
        destinoDireccion: v.destinoDireccion,
        notaConductor: v.notaConductor,
        precioEstimado: { min: v.precioEstimadoMin, max: v.precioEstimadoMax },
        totalCarrera: v.totalCarrera,
        cobroEspera: v.cobroEspera,
        peajes: v.peajes,
        propina: v.propina,
        precioFinal: v.precioFinal,
        comision: v.comision,
        comisionPb: v.comisionPb,
        multiplicadorDinamico: v.multiplicadorDinamico,
        desglose: v.desglose,
        distanciaRealM: v.distanciaRealM,
        distanciaTaximetroM: v.distanciaTaximetroM,
        duracionS: v.duracionS,
        tiempoDetenidoS: v.tiempoDetenidoS,
        solicitadoEn: v.solicitadoEn.toISOString(),
        aceptadoEn: v.aceptadoEn?.toISOString() ?? null,
        enSitioEn: v.enSitioEn?.toISOString() ?? null,
        iniciadoEn: v.iniciadoEn?.toISOString() ?? null,
        finalizadoEn: v.finalizadoEn?.toISOString() ?? null,
        canceladoEn: v.canceladoEn?.toISOString() ?? null,
        canceladoPor: v.canceladoPor,
        motivoCancelacion: v.motivoCancelacion,
      },
      pasajero: {
        id: v.pasajeroId,
        nombre: fila.pasajeroNombre,
        telefono: fila.pasajeroTelefono,
        calificacion: pasajeroFicha?.calificacion ?? null,
        deuda: pasajeroFicha?.deuda ?? 0,
      },
      conductor: v.conductorId
        ? {
            id: v.conductorId,
            nombre: fila.conductorNombre,
            telefono: fila.conductorTelefono,
            placa: fila.placa,
            vehiculo: fila.vehiculo,
          }
        : null,
      eventos: eventos.map((e) => ({ ...e, ocurridoEn: e.ocurridoEn.toISOString() })),
      ofertas: ofertas.map((o) => ({
        ...o,
        ofrecidaEn: o.ofrecidaEn.toISOString(),
        respondidaEn: o.respondidaEn?.toISOString() ?? null,
      })),
      pagos: pagos.map((p) => ({
        id: p.id,
        tipo: p.tipo,
        monto: p.monto,
        estado: p.estado,
        creadoEn: p.creadoEn.toISOString(),
      })),
      reembolsos: reembolsos.map((r) => ({
        id: r.id,
        monto: r.monto,
        motivo: r.motivo,
        creadoEn: r.creadoEn.toISOString(),
      })),
      tickets: tickets.map((t) => ({ ...t, creadoEn: t.creadoEn.toISOString() })),
      alertas: alertas.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        severidad: a.severidad,
        estado: a.estado,
        creadaEn: a.creadaEn.toISOString(),
        notaCierre: a.notaCierre,
      })),
      mensajes: mensajes.map((m) => ({ ...m, creadoEn: m.creadoEn.toISOString() })),
      ajustesDeSaldo: ajustes.map((a) => ({
        id: a.id,
        monto: a.monto,
        estado: a.estado,
        motivo: a.motivo,
      })),
      acciones: {
        despachar: v.estado === 'buscando_conductor',
        reasignar: v.estado === 'asignado' || v.estado === 'en_sitio',
        cancelar: activo,
        ajustarPrecio: v.estado === 'finalizado',
      },
    };
  }

  /** Posiciones del conductor durante el viaje, para reproducir el recorrido (OPE-02). */
  async recorrido(
    id: string,
  ): Promise<
    { t: string; lat: number; lng: number; velocidadKmh: number | null; estado: string }[]
  > {
    const r = await this.bd.db.execute<{
      t: Date;
      lat: number;
      lng: number;
      v: number | null;
      e: string;
    }>(sql`
      select registrada_en as t, ST_Y(ubicacion::geometry) as lat, ST_X(ubicacion::geometry) as lng,
             velocidad_kmh::float as v, estado_operativo::text as e
      from posicion_conductor where viaje_id = ${id} order by registrada_en limit 3000`);
    return r.rows.map((p) => ({
      t: new Date(p.t).toISOString(),
      lat: p.lat,
      lng: p.lng,
      velocidadKmh: p.v,
      estado: p.e,
    }));
  }

  async despachar(viajeId: string, conductorId: string, operador: Operador) {
    await this.despacho.asignarManual(viajeId, conductorId, operador.id);
    await auditar(this.bd.db, operador, {
      accion: 'viaje.despachar',
      entidad: 'viaje',
      entidadId: viajeId,
      despues: { conductorId },
    });
  }

  /** Quita al conductor actual y busca otro (o asigna al que elija la operación). */
  async reasignar(
    viajeId: string,
    d: { conductorId?: string | undefined; motivo: string },
    operador: Operador,
  ) {
    const { db } = this.bd;
    const previo = await db.transaction(async (tx) => {
      const [v] = await tx.select().from(viaje).where(eq(viaje.id, viajeId)).for('update');
      if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
      if (v.estado !== 'asignado' && v.estado !== 'en_sitio')
        throw conflicto(
          'ESTADO_INVALIDO',
          'Solo se reasigna un viaje cuyo conductor aún no recoge al pasajero.',
        );
      if (d.conductorId && d.conductorId === v.conductorId)
        throw solicitudInvalida('Elige un conductor distinto al actual.');
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
      if (v.conductorId)
        await tx
          .update(conductor)
          .set({ estadoOperativo: 'disponible' })
          .where(
            and(
              eq(conductor.usuarioId, v.conductorId),
              inArray(conductor.estadoOperativo, ['en_camino', 'en_sitio']),
            ),
          );
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'reasignado_por_operacion',
        actorTipo: 'operacion',
        actorId: operador.id,
        datos: { motivo: d.motivo, conductorAnterior: v.conductorId },
      });
      await auditar(tx, operador, {
        accion: 'viaje.reasignar',
        entidad: 'viaje',
        entidadId: v.id,
        antes: { conductorId: v.conductorId, estado: v.estado },
        despues: { conductorId: d.conductorId ?? null },
        motivo: d.motivo,
      });
      return v;
    });
    if (previo.conductorId) {
      this.eventos.aConductor(previo.conductorId, 'viaje:estado', {
        viajeId,
        estado: 'cancelado',
        motivo: 'reasignado',
      });
      this.eventos.aConductor(previo.conductorId, 'conductor:estado', {
        estadoOperativo: 'disponible',
      });
    }
    this.eventos.aPasajero(previo.pasajeroId, 'viaje:estado', {
      viajeId,
      estado: 'buscando_conductor',
      reasignando: true,
    });
    if (d.conductorId) await this.despacho.asignarManual(viajeId, d.conductorId, operador.id);
    else void this.despacho.intentar(viajeId);
  }

  async cancelar(viajeId: string, motivo: string, operador: Operador) {
    const { db } = this.bd;
    const previo = await db.transaction(async (tx) => {
      const [v] = await tx.select().from(viaje).where(eq(viaje.id, viajeId)).for('update');
      if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
      if (!(ESTADOS_ACTIVOS as readonly string[]).includes(v.estado))
        throw conflicto('ESTADO_INVALIDO', 'Este viaje ya terminó, no se puede cancelar.');
      await tx
        .update(oferta)
        .set({ resultado: 'retirada', respondidaEn: new Date() })
        .where(and(eq(oferta.viajeId, v.id), inArray(oferta.resultado, ['aceptada'])));
      await tx
        .update(viaje)
        .set({
          estado: 'cancelado',
          canceladoEn: new Date(),
          canceladoPor: 'operacion',
          motivoCancelacion: motivo,
        })
        .where(eq(viaje.id, v.id));
      if (v.conductorId)
        await tx
          .update(conductor)
          .set({ estadoOperativo: 'disponible' })
          .where(
            and(
              eq(conductor.usuarioId, v.conductorId),
              inArray(conductor.estadoOperativo, ['en_camino', 'en_sitio', 'en_viaje']),
            ),
          );
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'cancelado',
        actorTipo: 'operacion',
        actorId: operador.id,
        datos: { motivo },
      });
      await auditar(tx, operador, {
        accion: 'viaje.cancelar',
        entidad: 'viaje',
        entidadId: v.id,
        antes: { estado: v.estado },
        despues: { estado: 'cancelado' },
        motivo,
      });
      return v;
    });
    await this.despacho.retirarOfertas(viajeId); // ofertas abiertas, si el viaje aún buscaba
    if (previo.conductorId) {
      this.eventos.aConductor(previo.conductorId, 'viaje:estado', {
        viajeId,
        estado: 'cancelado',
        canceladoPor: 'operacion',
      });
      this.eventos.aConductor(previo.conductorId, 'conductor:estado', {
        estadoOperativo: 'disponible',
      });
    }
    if (previo.reservaConductorId && previo.reservaConductorId !== previo.conductorId)
      this.eventos.aConductor(previo.reservaConductorId, 'reserva:cambio', {
        viajeId,
        motivo: 'cancelada',
      });
    this.eventos.aPasajero(previo.pasajeroId, 'viaje:estado', {
      viajeId,
      estado: 'cancelado',
      canceladoPor: 'operacion',
      costo: 0,
    });
  }

  /**
   * Corrige el precio de un viaje ya finalizado (OPE-02). El libro del conductor no se edita: la diferencia queda como un
   * ajuste de saldo pendiente que otra persona debe aprobar. Una tarjeta ya cobrada solo puede bajar, con reembolso.
   */
  async ajustarPrecio(viajeId: string, nuevoPrecio: number, motivo: string, operador: Operador) {
    const resultado = await this.bd.db.transaction(async (tx) => {
      const [v] = await tx.select().from(viaje).where(eq(viaje.id, viajeId)).for('update');
      if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
      if (
        v.estado !== 'finalizado' ||
        v.precioFinal === null ||
        v.totalCarrera === null ||
        !v.conductorId
      )
        throw conflicto('ESTADO_INVALIDO', 'Solo se ajusta el precio de un viaje finalizado.');
      if (nuevoPrecio === v.precioFinal)
        throw solicitudInvalida('El precio nuevo es igual al actual.');
      const nuevoTotal = nuevoPrecio - v.cobroEspera;
      if (nuevoTotal < 0)
        throw solicitudInvalida('El precio no puede ser menor al cobro por espera.');
      if (nuevoPrecio < 1) throw solicitudInvalida('El precio debe ser mayor a cero.');

      const [cobro] = await tx.select().from(pago).where(eq(pago.viajeId, v.id));
      const electronico = v.metodoPago !== 'efectivo';
      const corporativo = v.metodoPago === 'corporativo';
      // Lo corporativo se cobra a la empresa en su estado de cuenta: no hay tarjeta que reembolsar.
      if (corporativo && v.estadoCuentaId)
        throw conflicto(
          'EN_ESTADO_DE_CUENTA',
          'Ese viaje ya está en un estado de cuenta de la empresa: anúlalo primero para poder ajustarlo.',
        );
      const cobrado = !!cobro && cobro.estado === 'pagado' && electronico && !corporativo;
      if (cobrado && nuevoPrecio > v.precioFinal)
        throw conflicto(
          'NO_SE_PUEDE_COBRAR_MAS',
          'Ese viaje ya se cobró con tarjeta: el precio solo puede bajar.',
        );

      const ambito = ambitoComision(v.tipoServicio);
      const comisionNueva = calcularComision(
        { totalRedondeado: nuevoTotal, cobroEspera: v.cobroEspera },
        ambito,
      );
      const metodo = electronico ? 'electronico' : 'efectivo';
      const netoAntes = suma(
        movimientosDeViaje({
          metodo,
          base: { totalRedondeado: v.totalCarrera, cobroEspera: v.cobroEspera },
          ambito,
          viajeId: v.id,
        }),
      );
      const netoDespues = suma(
        movimientosDeViaje({
          metodo,
          base: { totalRedondeado: nuevoTotal, cobroEspera: v.cobroEspera },
          ambito,
          viajeId: v.id,
        }),
      );
      const diferencia = netoDespues - netoAntes;

      await tx
        .update(viaje)
        .set({
          totalCarrera: nuevoTotal,
          precioFinal: nuevoPrecio,
          comision: comisionNueva,
          ...(corporativo
            ? { descuentoCorporativo: await descuentoDeEmpresa(tx, v.empresaId, nuevoPrecio) }
            : {}),
          desglose: sql`coalesce(${viaje.desglose}, '{}'::jsonb) || ${JSON.stringify({
            ajusteManual: { anterior: v.precioFinal, nuevo: nuevoPrecio, motivo, por: operador.id },
          })}::jsonb`,
        })
        .where(eq(viaje.id, v.id));
      if (cobro && !cobrado)
        await tx.update(pago).set({ monto: nuevoPrecio }).where(eq(pago.id, cobro.id));

      let reembolsoId: string | null = null;
      if (cobrado && cobro) {
        const [r] = await tx
          .insert(reembolso)
          .values({
            pagoId: cobro.id,
            monto: v.precioFinal - nuevoPrecio,
            motivo,
            aprobadoPor: operador.id,
          })
          .returning({ id: reembolso.id });
        reembolsoId = r!.id;
        await tx.update(pago).set({ estado: 'reembolsado_parcial' }).where(eq(pago.id, cobro.id));
        await tx.update(viaje).set({ estadoPago: 'reembolsado_parcial' }).where(eq(viaje.id, v.id));
      }
      let ajusteId: string | null = null;
      if (diferencia !== 0) {
        const [a] = await tx
          .insert(ajusteSaldo)
          .values({
            conductorId: v.conductorId,
            monto: diferencia,
            motivo: `Ajuste de tarifa del viaje ${v.codigo}: ${motivo}`,
            viajeId: v.id,
            propuestoPor: operador.id,
          })
          .returning({ id: ajusteSaldo.id });
        ajusteId = a!.id;
      }
      await registrarEvento(tx, {
        viajeId: v.id,
        tipo: 'precio_ajustado',
        actorTipo: 'operacion',
        actorId: operador.id,
        datos: { anterior: v.precioFinal, nuevo: nuevoPrecio, motivo },
      });
      await auditar(tx, operador, {
        accion: 'viaje.ajustar_precio',
        entidad: 'viaje',
        entidadId: v.id,
        antes: { precioFinal: v.precioFinal, comision: v.comision },
        despues: { precioFinal: nuevoPrecio, comision: comisionNueva },
        motivo,
      });
      return {
        precioAnterior: v.precioFinal,
        precioFinal: nuevoPrecio,
        comision: comisionNueva,
        diferenciaConductor: diferencia,
        ajusteSaldoId: ajusteId,
        reembolsoId,
      };
    });
    return resultado;
  }
}
