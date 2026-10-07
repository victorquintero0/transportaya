import { Inject, Injectable } from '@nestjs/common';
import {
  alerta,
  auditoria,
  conductor,
  conductorVehiculo,
  cuentaPagoConductor,
  documento,
  sesion,
  usuario,
  vehiculo,
  viaje,
} from '@transportaya/db';
import { fechaBogota } from '@transportaya/dominio';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { ALMACENAMIENTO, type Almacenamiento } from '../conductor/almacenamiento.service.js';
import { detectarArchivo } from '../conductor/archivos.js';
import { CifradoService, enmascarar } from '../conductor/cifrado.service.js';
import { ConexionService } from '../conductor/conexion.service.js';
import { PerfilService } from '../conductor/perfil.service.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { type Operador, auditar } from './auditoria.js';
import { comodines } from './comun.js';
import { ParametrosService } from './parametros.service.js';

export interface FiltroConductores {
  q?: string | undefined;
  estado?: string | undefined;
  limite: number;
  desplazar: number;
}

@Injectable()
export class ConductoresOperacionService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(PerfilService) private readonly perfil: PerfilService,
    @Inject(ConexionService) private readonly conexion: ConexionService,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
    @Inject(ALMACENAMIENTO) private readonly almacenamiento: Almacenamiento,
    @Inject(Eventos) private readonly eventos: Eventos,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
  ) {}

  async listar(f: FiltroConductores) {
    const donde = and(
      f.q
        ? or(
            ilike(usuario.nombre, comodines(f.q)),
            ilike(usuario.telefono, comodines(f.q)),
            ilike(vehiculo.placa, comodines(f.q)),
          )
        : undefined,
      f.estado ? sql`${conductor.estadoHabilitacion}::text = ${f.estado}` : undefined,
    );
    const filas = await this.bd.db
      .select({
        id: conductor.usuarioId,
        nombre: usuario.nombre,
        telefono: usuario.telefono,
        estadoHabilitacion: conductor.estadoHabilitacion,
        estadoOperativo: conductor.estadoOperativo,
        bloqueadoPorDeuda: conductor.bloqueadoPorDeuda,
        suspensionManual: conductor.suspensionManual,
        placa: vehiculo.placa,
        categoria: vehiculo.categoria,
        calificacion: conductor.calificacionPromedio,
        creadoEn: conductor.creadoEn,
        actualizadoEn: conductor.actualizadoEn,
        documentosPendientes: sql<number>`(select count(*)::int from documento d where d.estado = 'pendiente' and (d.conductor_id = ${conductor.usuarioId} or d.vehiculo_id in (select vehiculo_id from conductor_vehiculo cv where cv.conductor_id = ${conductor.usuarioId})))`,
      })
      .from(conductor)
      .innerJoin(usuario, eq(usuario.id, conductor.usuarioId))
      .leftJoin(vehiculo, eq(vehiculo.id, conductor.vehiculoActivoId))
      .where(donde)
      // la cola de revisión va por orden de llegada; el resto, lo más reciente primero
      .orderBy(f.estado === 'en_revision' ? asc(conductor.actualizadoEn) : desc(conductor.creadoEn))
      .limit(f.limite)
      .offset(f.desplazar);
    const [t] = await this.bd.db
      .select({ total: sql<number>`count(*)::int` })
      .from(conductor)
      .innerJoin(usuario, eq(usuario.id, conductor.usuarioId))
      .leftJoin(vehiculo, eq(vehiculo.id, conductor.vehiculoActivoId))
      .where(donde);
    const [cola] = await this.bd.db
      .select({ n: sql<number>`count(*)::int` })
      .from(conductor)
      .where(eq(conductor.estadoHabilitacion, 'en_revision'));
    return {
      total: t?.total ?? 0,
      enRevision: cola?.n ?? 0,
      items: filas.map((r) => ({
        ...r,
        creadoEn: r.creadoEn.toISOString(),
        actualizadoEn: r.actualizadoEn.toISOString(),
      })),
    };
  }

  private async cargar(id: string) {
    const [c] = await this.bd.db
      .select({ c: conductor, u: usuario })
      .from(conductor)
      .innerJoin(usuario, eq(usuario.id, conductor.usuarioId))
      .where(eq(conductor.usuarioId, id));
    if (!c) throw noEncontrado('CONDUCTOR_NO_ENCONTRADO', 'No encontramos a ese conductor');
    return c;
  }

  async ficha(id: string) {
    const { db } = this.bd;
    const { c, u } = await this.cargar(id);
    const vehiculos = await db
      .select({ v: vehiculo, relacion: conductorVehiculo.relacion })
      .from(conductorVehiculo)
      .innerJoin(vehiculo, eq(vehiculo.id, conductorVehiculo.vehiculoId))
      .where(eq(conductorVehiculo.conductorId, id));
    const revisor = alias(usuario, 'revisor');
    const docs = await db
      .select({
        d: documento,
        revisor: revisor.nombre,
        placa: vehiculo.placa,
      })
      .from(documento)
      .leftJoin(revisor, eq(revisor.id, documento.revisadoPor))
      .leftJoin(vehiculo, eq(vehiculo.id, documento.vehiculoId))
      .where(
        or(
          eq(documento.conductorId, id),
          sql`${documento.vehiculoId} in (select vehiculo_id from conductor_vehiculo where conductor_id = ${id})`,
        ),
      )
      .orderBy(desc(documento.creadoEn));
    const evaluacion = await this.perfil.evaluarDocumentos(id, c.vehiculoActivoId);
    const [cuenta] = await db
      .select()
      .from(cuentaPagoConductor)
      .where(and(eq(cuentaPagoConductor.conductorId, id), eq(cuentaPagoConductor.activa, true)));
    const saldo = await db.execute<{ saldo: string }>(
      sql`select saldo::text from saldo_conductor where conductor_id = ${id}`,
    );
    const viajes = await db
      .select({
        id: viaje.id,
        codigo: viaje.codigo,
        estado: viaje.estado,
        solicitadoEn: viaje.solicitadoEn,
        precioFinal: viaje.precioFinal,
      })
      .from(viaje)
      .where(eq(viaje.conductorId, id))
      .orderBy(desc(viaje.solicitadoEn))
      .limit(10);
    const [resumen] = (
      await db.execute<{ finalizados: number; cancelados: number; sesiones_h: number }>(sql`
        select
          (select count(*)::int from viaje where conductor_id = ${id} and estado = 'finalizado') as finalizados,
          (select count(*)::int from viaje where conductor_id = ${id} and estado = 'cancelado' and cancelado_por = 'conductor') as cancelados,
          (select coalesce(round(sum(extract(epoch from coalesce(fin, now()) - inicio)) / 3600), 0)::int from sesion_conductor where conductor_id = ${id} and inicio > now() - interval '30 days') as sesiones_h`)
    ).rows;
    const alertas = await db
      .select({
        id: alerta.id,
        tipo: alerta.tipo,
        severidad: alerta.severidad,
        estado: alerta.estado,
        creadaEn: alerta.creadaEn,
      })
      .from(alerta)
      .where(eq(alerta.conductorId, id))
      .orderBy(desc(alerta.creadaEn))
      .limit(10);
    const historial = await db
      .select({
        accion: auditoria.accion,
        quien: usuario.nombre,
        motivo: auditoria.motivo,
        ocurridoEn: auditoria.ocurridoEn,
      })
      .from(auditoria)
      .leftJoin(usuario, eq(usuario.id, auditoria.usuarioId))
      .where(and(eq(auditoria.entidad, 'conductor'), eq(auditoria.entidadId, id)))
      .orderBy(desc(auditoria.ocurridoEn))
      .limit(15);

    return {
      id,
      nombre: u.nombre,
      telefono: u.telefono,
      email: u.email,
      estadoUsuario: u.estado,
      estadoHabilitacion: c.estadoHabilitacion,
      estadoOperativo: c.estadoOperativo,
      bloqueadoPorDeuda: c.bloqueadoPorDeuda,
      suspensionManual: c.suspensionManual,
      aceptaCategoriaInferior: c.aceptaCategoriaInferior,
      aceptaIntermunicipal: c.aceptaIntermunicipal,
      calificacion: c.calificacionPromedio,
      calificaciones: c.calificacionesTotal,
      creadoEn: c.creadoEn.toISOString(),
      vehiculoActivoId: c.vehiculoActivoId,
      vehiculos: vehiculos.map((x) => ({
        id: x.v.id,
        placa: x.v.placa,
        marca: x.v.marca,
        linea: x.v.linea,
        modeloAnio: x.v.modeloAnio,
        color: x.v.color,
        categoria: x.v.categoria,
        fueraDeCatalogo: x.v.fueraDeCatalogo,
        relacion: x.relacion,
      })),
      documentos: docs.map((x) => ({
        id: x.d.id,
        titular: x.d.titular,
        tipo: x.d.tipo,
        numero: x.d.numero,
        venceEn: x.d.venceEn,
        estado: x.d.estado,
        motivoRechazo: x.d.motivoRechazo,
        revisadoPor: x.revisor,
        revisadoEn: x.d.revisadoEn?.toISOString() ?? null,
        placa: x.placa,
        creadoEn: x.d.creadoEn.toISOString(),
      })),
      evaluacion: {
        habilitado: evaluacion.habilitado,
        completo: evaluacion.completo,
        requisitos: evaluacion.requisitos.map((r) => ({ titulo: r.titulo, estado: r.estado })),
      },
      cuentaPago: cuenta
        ? {
            tipo: cuenta.tipo,
            banco: cuenta.banco,
            valor: enmascarar(this.cifrado.descifrar(cuenta.valorCifrado)),
            verificada: cuenta.verificada,
          }
        : null,
      saldo: Number(saldo.rows[0]?.saldo ?? 0),
      resumen: {
        viajesFinalizados: resumen?.finalizados ?? 0,
        cancelacionesPropias: resumen?.cancelados ?? 0,
        horasConectadoUlt30d: resumen?.sesiones_h ?? 0,
      },
      viajes: viajes.map((v) => ({ ...v, solicitadoEn: v.solicitadoEn.toISOString() })),
      alertas: alertas.map((a) => ({ ...a, creadaEn: a.creadaEn.toISOString() })),
      historial: historial.map((h) => ({
        ...h,
        quien: h.quien ?? 'Sistema',
        ocurridoEn: h.ocurridoEn.toISOString(),
      })),
    };
  }

  private avisar(id: string, mensaje: string) {
    this.eventos.aConductor(id, 'conductor:estado', {
      estadoOperativo: 'desconectado',
      motivo: mensaje,
    });
  }

  async aprobarDocumento(docId: string, d: { venceEn?: string | undefined }, operador: Operador) {
    const r = await this.bd.db.transaction(async (tx) => {
      const [doc] = await tx.select().from(documento).where(eq(documento.id, docId)).for('update');
      if (!doc) throw noEncontrado('DOCUMENTO_NO_ENCONTRADO', 'No encontramos ese documento');
      if (doc.estado !== 'pendiente')
        throw conflicto('DOCUMENTO_YA_REVISADO', 'Ese documento ya fue revisado.');
      const venceEn = d.venceEn ?? doc.venceEn;
      if (venceEn && venceEn < fechaBogota(new Date()))
        throw conflicto(
          'DOCUMENTO_VENCIDO',
          'La fecha de vencimiento ya pasó: recházalo para que suba uno vigente.',
        );
      await tx
        .update(documento)
        .set({
          estado: 'aprobado',
          revisadoPor: operador.id,
          revisadoEn: new Date(),
          venceEn,
          motivoRechazo: null,
        })
        .where(eq(documento.id, docId));
      await auditar(tx, operador, {
        accion: 'documento.aprobar',
        entidad: 'documento',
        entidadId: docId,
        antes: { estado: doc.estado, venceEn: doc.venceEn },
        despues: { estado: 'aprobado', venceEn, tipo: doc.tipo },
      });
      return { doc, conductorId: await this.titular(tx, doc) };
    });
    // Un conductor suspendido solo por un documento vencido vuelve cuando el nuevo queda aprobado.
    if (r.conductorId) await this.reactivarSiCorresponde(r.conductorId);
    return { id: docId, estado: 'aprobado' };
  }

  private async titular(tx: DbOTx, doc: typeof documento.$inferSelect): Promise<string | null> {
    if (doc.conductorId) return doc.conductorId;
    if (!doc.vehiculoId) return null;
    const [r] = await tx
      .select({ id: conductorVehiculo.conductorId })
      .from(conductorVehiculo)
      .where(eq(conductorVehiculo.vehiculoId, doc.vehiculoId))
      .limit(1);
    return r?.id ?? null;
  }

  private async reactivarSiCorresponde(id: string) {
    const { c } = await this.cargar(id);
    if (c.estadoHabilitacion !== 'suspendido' || c.suspensionManual) return;
    const ev = await this.perfil.evaluarDocumentos(id, c.vehiculoActivoId);
    if (!ev.habilitado) return;
    await this.bd.db
      .update(conductor)
      .set({ estadoHabilitacion: 'habilitado' })
      .where(eq(conductor.usuarioId, id));
    this.avisar(id, 'Tus documentos están al día. ¡Ya puedes conectarte!');
  }

  async rechazarDocumento(docId: string, motivo: string, operador: Operador) {
    const conductorId = await this.bd.db.transaction(async (tx) => {
      const [doc] = await tx.select().from(documento).where(eq(documento.id, docId)).for('update');
      if (!doc) throw noEncontrado('DOCUMENTO_NO_ENCONTRADO', 'No encontramos ese documento');
      if (doc.estado !== 'pendiente' && doc.estado !== 'aprobado')
        throw conflicto('DOCUMENTO_YA_REVISADO', 'Ese documento ya fue revisado.');
      await tx
        .update(documento)
        .set({
          estado: 'rechazado',
          motivoRechazo: motivo,
          revisadoPor: operador.id,
          revisadoEn: new Date(),
        })
        .where(eq(documento.id, docId));
      await auditar(tx, operador, {
        accion: 'documento.rechazar',
        entidad: 'documento',
        entidadId: docId,
        antes: { estado: doc.estado },
        despues: { estado: 'rechazado', tipo: doc.tipo },
        motivo,
      });
      return this.titular(tx, doc);
    });
    if (conductorId) this.avisar(conductorId, 'Revisamos tus documentos: uno necesita corrección.');
    return { id: docId, estado: 'rechazado' };
  }

  /** Verlo queda anotado: son datos personales (Ley 1581 de 2012). */
  async archivoDocumento(docId: string, operador: Operador) {
    const [doc] = await this.bd.db.select().from(documento).where(eq(documento.id, docId));
    if (!doc) throw noEncontrado('DOCUMENTO_NO_ENCONTRADO', 'No encontramos ese documento');
    await auditar(this.bd.db, operador, {
      accion: 'documento.ver',
      entidad: 'documento',
      entidadId: docId,
      despues: { tipo: doc.tipo },
    });
    const contenido = await this.almacenamiento.leer(doc.archivoClave);
    return { contenido, mime: detectarArchivo(contenido)?.mime ?? 'application/octet-stream' };
  }

  /** Aprueba el registro: exige que todos los documentos requeridos estén aprobados y vigentes. */
  async habilitar(id: string, operador: Operador) {
    const { c } = await this.cargar(id);
    if (c.estadoHabilitacion !== 'en_revision')
      throw conflicto('NO_ESTA_EN_REVISION', 'Este conductor no está en revisión.');
    const ev = await this.perfil.evaluarDocumentos(id, c.vehiculoActivoId);
    if (!ev.habilitado) {
      const faltan = ev.requisitos
        .filter((r) => r.estado !== 'aprobado' && r.estado !== 'por_vencer')
        .map((r) => r.titulo);
      throw conflicto(
        'DOCUMENTOS_PENDIENTES',
        `Faltan documentos por aprobar: ${faltan.join(', ')}.`,
        { faltan },
      );
    }
    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(conductor)
        .set({ estadoHabilitacion: 'habilitado' })
        .where(eq(conductor.usuarioId, id));
      await auditar(tx, operador, {
        accion: 'conductor.habilitar',
        entidad: 'conductor',
        entidadId: id,
        antes: { estadoHabilitacion: c.estadoHabilitacion },
        despues: { estadoHabilitacion: 'habilitado' },
      });
    });
    this.avisar(id, '¡Tu registro fue aprobado! Ya puedes conectarte.');
  }

  /** Devuelve el registro con el motivo: el conductor corrige y lo vuelve a enviar. */
  async rechazarRegistro(id: string, motivo: string, operador: Operador) {
    const { c } = await this.cargar(id);
    if (c.estadoHabilitacion !== 'en_revision')
      throw conflicto('NO_ESTA_EN_REVISION', 'Este conductor no está en revisión.');
    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(conductor)
        .set({ estadoHabilitacion: 'rechazado' })
        .where(eq(conductor.usuarioId, id));
      await auditar(tx, operador, {
        accion: 'conductor.rechazar',
        entidad: 'conductor',
        entidadId: id,
        antes: { estadoHabilitacion: c.estadoHabilitacion },
        despues: { estadoHabilitacion: 'rechazado' },
        motivo,
      });
    });
    this.avisar(id, 'Revisamos tu registro y necesita correcciones.');
  }

  private async sacarDeLinea(id: string) {
    try {
      await this.conexion.desconectar(id); // con un viaje en curso no se interrumpe: lo termina y no recibe más
    } catch {
      /* viaje en curso */
    }
  }

  async suspender(id: string, motivo: string, operador: Operador) {
    const { c } = await this.cargar(id);
    if (c.estadoHabilitacion !== 'habilitado')
      throw conflicto('NO_ESTA_HABILITADO', 'Solo se suspende a un conductor habilitado.');
    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(conductor)
        .set({ estadoHabilitacion: 'suspendido', suspensionManual: true })
        .where(eq(conductor.usuarioId, id));
      await auditar(tx, operador, {
        accion: 'conductor.suspender',
        entidad: 'conductor',
        entidadId: id,
        antes: { estadoHabilitacion: c.estadoHabilitacion },
        despues: { estadoHabilitacion: 'suspendido' },
        motivo,
      });
    });
    await this.sacarDeLinea(id);
    this.avisar(id, 'Tu cuenta fue suspendida temporalmente. Contacta a TransporteYa.');
  }

  async bloquear(id: string, motivo: string, operador: Operador) {
    const { c } = await this.cargar(id);
    if (c.estadoHabilitacion === 'bloqueado') throw conflicto('YA_BLOQUEADO', 'Ya está bloqueado.');
    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(conductor)
        .set({ estadoHabilitacion: 'bloqueado', suspensionManual: true })
        .where(eq(conductor.usuarioId, id));
      await tx.update(usuario).set({ estado: 'bloqueado' }).where(eq(usuario.id, id));
      await tx
        .update(sesion)
        .set({ revocadaEn: new Date() })
        .where(and(eq(sesion.usuarioId, id), isNull(sesion.revocadaEn)));
      await auditar(tx, operador, {
        accion: 'conductor.bloquear',
        entidad: 'conductor',
        entidadId: id,
        antes: { estadoHabilitacion: c.estadoHabilitacion },
        despues: { estadoHabilitacion: 'bloqueado' },
        motivo,
      });
    });
    await this.sacarDeLinea(id);
  }

  async reactivar(id: string, motivo: string, operador: Operador) {
    const { c } = await this.cargar(id);
    if (c.estadoHabilitacion !== 'suspendido' && c.estadoHabilitacion !== 'bloqueado')
      throw conflicto('NO_ESTA_SUSPENDIDO', 'Este conductor no está suspendido ni bloqueado.');
    const ev = await this.perfil.evaluarDocumentos(id, c.vehiculoActivoId);
    if (!ev.habilitado)
      throw conflicto(
        'DOCUMENTOS_NO_VIGENTES',
        'Sus documentos no están vigentes: apruébalos antes de reactivarlo.',
      );
    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(conductor)
        .set({ estadoHabilitacion: 'habilitado', suspensionManual: false })
        .where(eq(conductor.usuarioId, id));
      await tx.update(usuario).set({ estado: 'activo' }).where(eq(usuario.id, id));
      await auditar(tx, operador, {
        accion: 'conductor.reactivar',
        entidad: 'conductor',
        entidadId: id,
        antes: { estadoHabilitacion: c.estadoHabilitacion },
        despues: { estadoHabilitacion: 'habilitado' },
        motivo,
      });
    });
    this.avisar(id, 'Tu cuenta fue reactivada. ¡Ya puedes conectarte!');
  }

  /** Documentos vencidos o por vencer: lo que cumplimiento debe perseguir (OPE-04). */
  async vencimientos(dias?: number) {
    const ventana = dias ?? (await this.parametros.numero('documentos.aviso_dias'));
    const hoy = fechaBogota(new Date());
    const limite = fechaBogota(Date.now() + ventana * 86_400_000);
    const titular = alias(usuario, 'titular');
    const filas = await this.bd.db
      .select({
        id: documento.id,
        tipo: documento.tipo,
        venceEn: documento.venceEn,
        estado: documento.estado,
        conductorId: sql<string>`coalesce(${documento.conductorId}, (select cv.conductor_id from conductor_vehiculo cv where cv.vehiculo_id = ${documento.vehiculoId} limit 1))`,
        placa: vehiculo.placa,
      })
      .from(documento)
      .leftJoin(vehiculo, eq(vehiculo.id, documento.vehiculoId))
      .where(
        and(
          sql`${documento.estado} in ('aprobado', 'vencido')`,
          lte(documento.venceEn, limite),
          gte(documento.venceEn, fechaBogota(Date.now() - 60 * 86_400_000)),
        ),
      )
      .orderBy(documento.venceEn);
    const ids = [...new Set(filas.map((f) => f.conductorId))];
    const nombres = ids.length
      ? await this.bd.db
          .select({ id: titular.id, nombre: titular.nombre, telefono: titular.telefono })
          .from(titular)
          .where(inArray(titular.id, ids))
      : [];
    const por = new Map(nombres.map((n) => [n.id, n]));
    return {
      ventanaDias: ventana,
      items: filas.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        venceEn: f.venceEn,
        estado: f.estado,
        diasRestantes: f.venceEn
          ? Math.round((Date.parse(f.venceEn) - Date.parse(hoy)) / 86_400_000)
          : null,
        conductorId: f.conductorId,
        conductor: por.get(f.conductorId)?.nombre ?? null,
        telefono: por.get(f.conductorId)?.telefono ?? null,
        placa: f.placa,
      })),
    };
  }
}
