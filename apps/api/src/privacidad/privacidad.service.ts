import { Inject, Injectable } from '@nestjs/common';
import { solicitudDatos, usuario } from '@transportaya/db';
import {
  PLAZO_DIAS_HABILES,
  esSolicitudDeSupresion,
  fechaLimiteHabil,
  diasHabilesRestantes,
  semaforoDePlazo,
  type EstadoSolicitudDatos,
  type TipoSolicitudDatos,
  tienePermiso,
  type RolInterno,
} from '@transportaya/dominio';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado, prohibido } from '../comun/errores.js';
import { type Operador, auditar } from '../operacion/auditoria.js';
import { AnonimizacionService, type RolTitular } from './anonimizacion.service.js';

const MAX_ABIERTAS = 5;

type Fila = typeof solicitudDatos.$inferSelect;

const vista = (f: Fila) => ({
  id: f.id,
  tipo: f.tipo as TipoSolicitudDatos,
  detalle: f.detalle,
  estado: f.estado as EstadoSolicitudDatos,
  creadaEn: f.creadaEn.toISOString(),
  venceEn: f.venceEn.toISOString(),
  respuesta: f.respuesta,
  resueltaEn: f.resueltaEn?.toISOString() ?? null,
});

/** Solicitudes de las personas sobre sus datos (Ley 1581, arts. 14 y 15) y la exportación de lo que guardamos. */
@Injectable()
export class PrivacidadService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(AnonimizacionService) private readonly anonimizacion: AnonimizacionService,
  ) {}

  private async festivos(): Promise<Set<string>> {
    const r = await this.bd.db.execute<{ f: string }>(sql`select fecha::text as f from festivo`);
    return new Set(r.rows.map((x) => x.f));
  }

  // ─────────────────────────────────────────────── de la persona
  async crear(
    usuarioId: string,
    rol: RolTitular,
    d: { tipo: TipoSolicitudDatos; detalle: string },
  ) {
    const [abiertas] = await this.bd.db
      .select({ n: count() })
      .from(solicitudDatos)
      .where(
        and(
          eq(solicitudDatos.usuarioId, usuarioId),
          inArray(solicitudDatos.estado, ['recibida', 'en_tramite']),
        ),
      );
    if (Number(abiertas?.n ?? 0) >= MAX_ABIERTAS)
      throw conflicto(
        'DEMASIADAS_SOLICITUDES',
        'Ya tienes varias solicitudes en trámite. Espera a que respondamos alguna.',
      );
    const [f] = await this.bd.db
      .insert(solicitudDatos)
      .values({
        usuarioId,
        rol,
        tipo: d.tipo,
        detalle: d.detalle,
        venceEn: fechaLimiteHabil(new Date(), PLAZO_DIAS_HABILES[d.tipo], await this.festivos()),
      })
      .returning();
    return vista(f!);
  }

  async mias(usuarioId: string) {
    const filas = await this.bd.db
      .select()
      .from(solicitudDatos)
      .where(eq(solicitudDatos.usuarioId, usuarioId))
      .orderBy(desc(solicitudDatos.creadaEn))
      .limit(50);
    return filas.map(vista);
  }

  /** Cuando la propia persona borra su cuenta desde la app, queda constancia de que ejerció el derecho. */
  async registrarAutoeliminacion(
    tx: Parameters<Parameters<BaseDeDatos['db']['transaction']>[0]>[0],
    usuarioId: string,
    rol: RolTitular,
  ) {
    await tx.insert(solicitudDatos).values({
      usuarioId,
      rol,
      tipo: 'supresion',
      detalle: 'La persona eliminó su cuenta desde la app.',
      estado: 'ejecutada',
      venceEn: new Date(),
      respuesta: 'Cuenta eliminada por su titular.',
      resueltaEn: new Date(),
    });
  }

  /** Todo lo que guardamos de la persona (PAS-05, RNF-62). Sin contenido de archivos ni datos de otras personas. */
  async exportar(usuarioId: string, rol: RolTitular) {
    const { db } = this.bd;
    const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows;
    const [u] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));
    const base = {
      generadoEn: new Date().toISOString(),
      rol,
      perfil: u
        ? {
            nombre: u.nombre,
            telefono: u.telefono,
            email: u.email,
            creadoEn: u.creadoEn.toISOString(),
          }
        : null,
      solicitudesDeDatos: await this.mias(usuarioId),
      tickets: await rows(
        sql`select asunto, estado, creado_en from ticket where usuario_id = ${usuarioId} order by creado_en desc`,
      ),
      calificacionesQueDio: await rows(
        sql`select estrellas, etiquetas, comentario, creado_en from calificacion where de_usuario_id = ${usuarioId} order by creado_en desc`,
      ),
      mensajesQueEscribio: await rows(
        sql`select viaje_id, cuerpo, creado_en from viaje_mensaje where autor_id = ${usuarioId} order by creado_en desc limit 1000`,
      ),
    };
    if (rol === 'pasajero')
      return {
        ...base,
        pasajero: (
          await rows(
            sql`select calificacion_promedio, calificaciones_total, deuda_pendiente, acepto_terminos_en, version_terminos from pasajero where usuario_id = ${usuarioId}`,
          )
        )[0],
        contactosDeConfianza: await rows(
          sql`select nombre, telefono from contacto_confianza where pasajero_id = ${usuarioId}`,
        ),
        lugaresGuardados: await rows(
          sql`select etiqueta, direccion from lugar_guardado where pasajero_id = ${usuarioId}`,
        ),
        metodosDePago: await rows(
          sql`select tipo, marca, ultimos4, activo from metodo_pago where pasajero_id = ${usuarioId}`,
        ),
        viajes: await rows(sql`
          select codigo, estado, tipo_servicio, metodo_pago, origen_direccion, destino_direccion,
                 solicitado_en, finalizado_en, precio_final, propina
          from viaje where pasajero_id = ${usuarioId} order by solicitado_en desc`),
      };
    return {
      ...base,
      conductor: (
        await rows(
          sql`select estado_habilitacion, rut, calificacion_promedio, calificaciones_total, acepto_terminos_en, version_terminos, creado_en from conductor where usuario_id = ${usuarioId}`,
        )
      )[0],
      vehiculos: await rows(sql`
        select v.placa, v.marca, v.linea, v.modelo_anio, v.color, v.categoria, cv.relacion
        from conductor_vehiculo cv join vehiculo v on v.id = cv.vehiculo_id where cv.conductor_id = ${usuarioId}`),
      documentos: await rows(
        sql`select d.titular, d.tipo, d.numero, d.vence_en, d.estado, d.creado_en
            from documento d
            where d.conductor_id = ${usuarioId}
               or d.vehiculo_id in (select vehiculo_id from conductor_vehiculo where conductor_id = ${usuarioId})
            order by d.creado_en desc`,
      ),
      cuentaDePago: await rows(
        sql`select tipo, banco, verificada, activa from cuenta_pago_conductor where conductor_id = ${usuarioId}`,
      ),
      viajes: await rows(sql`
        select codigo, estado, tipo_servicio, metodo_pago, origen_direccion, destino_direccion,
               solicitado_en, finalizado_en, precio_final
        from viaje where conductor_id = ${usuarioId} order by solicitado_en desc`),
      movimientosDeSaldo: await rows(
        sql`select tipo, monto, viaje_id, creado_en from movimiento_saldo where conductor_id = ${usuarioId} order by creado_en desc limit 5000`,
      ),
    };
  }

  // ─────────────────────────────────────────────── de la App Operación
  async listar(f: {
    estado?: 'abiertas' | 'resueltas' | undefined;
    limite: number;
    desplazar: number;
  }) {
    const abiertas = inArray(solicitudDatos.estado, ['recibida', 'en_tramite']);
    const donde =
      f.estado === 'resueltas'
        ? sql`not (${abiertas})`
        : f.estado === 'abiertas'
          ? abiertas
          : undefined;
    const [filas, [total], festivos] = await Promise.all([
      this.bd.db
        .select({ s: solicitudDatos, nombre: usuario.nombre, telefono: usuario.telefono })
        .from(solicitudDatos)
        .innerJoin(usuario, eq(usuario.id, solicitudDatos.usuarioId))
        .where(donde)
        .orderBy(
          f.estado === 'resueltas' ? desc(solicitudDatos.resueltaEn) : solicitudDatos.venceEn,
        )
        .limit(f.limite)
        .offset(f.desplazar),
      this.bd.db.select({ n: count() }).from(solicitudDatos).where(donde),
      this.festivos(),
    ]);
    const ahora = new Date();
    return {
      total: Number(total?.n ?? 0),
      filas: filas.map(({ s, nombre, telefono }) => ({
        ...vista(s),
        rol: s.rol as RolTitular,
        titular: { id: s.usuarioId, nombre, telefono },
        ...(s.resueltaEn
          ? {}
          : {
              semaforo: semaforoDePlazo(s.venceEn, ahora, festivos),
              diasHabilesRestantes: diasHabilesRestantes(s.venceEn, ahora, festivos),
            }),
      })),
    };
  }

  async detalle(id: string) {
    const [fila] = await this.bd.db
      .select({
        s: solicitudDatos,
        nombre: usuario.nombre,
        telefono: usuario.telefono,
        estadoCuenta: usuario.estado,
      })
      .from(solicitudDatos)
      .innerJoin(usuario, eq(usuario.id, solicitudDatos.usuarioId))
      .where(eq(solicitudDatos.id, id));
    if (!fila) throw noEncontrado('SOLICITUD_NO_ENCONTRADA', 'No encontramos esa solicitud');
    const { s } = fila;
    const abierta = !s.resueltaEn;
    const bloqueadores =
      abierta &&
      esSolicitudDeSupresion(s.tipo as TipoSolicitudDatos) &&
      fila.estadoCuenta === 'activo'
        ? await this.anonimizacion.bloqueadores(s.usuarioId, s.rol as RolTitular)
        : [];
    return {
      ...vista(s),
      rol: s.rol as RolTitular,
      titular: {
        id: s.usuarioId,
        nombre: fila.nombre,
        telefono: fila.telefono,
        estadoCuenta: fila.estadoCuenta,
      },
      bloqueadores,
    };
  }

  async tomar(id: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [s] = await tx
        .update(solicitudDatos)
        .set({ estado: 'en_tramite' })
        .where(and(eq(solicitudDatos.id, id), eq(solicitudDatos.estado, 'recibida')))
        .returning();
      if (!s) {
        const [existe] = await tx.select().from(solicitudDatos).where(eq(solicitudDatos.id, id));
        if (!existe) throw noEncontrado('SOLICITUD_NO_ENCONTRADA', 'No encontramos esa solicitud');
        return; // ya estaba en trámite o resuelta: no hay nada que cambiar
      }
      await auditar(tx, operador, {
        accion: 'privacidad.tomar',
        entidad: 'solicitud_datos',
        entidadId: id,
        antes: { estado: 'recibida' },
        despues: { estado: 'en_tramite' },
        motivo: 'Se empezó a atender la solicitud',
      });
    });
    return this.detalle(id);
  }

  /**
   * Responde la solicitud. Aceptar una de borrar datos o revocar la autorización **la ejecuta**: anonimiza la cuenta en
   * la misma transacción, y solo se puede si no hay un viaje en curso, deuda ni saldo pendiente.
   */
  async resolver(
    id: string,
    d: { resultado: 'aceptar' | 'rechazar'; respuesta: string },
    operador: Operador,
    roles: readonly RolInterno[],
  ) {
    const archivos: string[] = [];
    await this.bd.db.transaction(async (tx) => {
      const [s] = await tx
        .select()
        .from(solicitudDatos)
        .where(eq(solicitudDatos.id, id))
        .for('update');
      if (!s) throw noEncontrado('SOLICITUD_NO_ENCONTRADA', 'No encontramos esa solicitud');
      if (s.resueltaEn) throw conflicto('SOLICITUD_RESUELTA', 'Esa solicitud ya tiene respuesta.');

      const tipo = s.tipo as TipoSolicitudDatos;
      const suprime = esSolicitudDeSupresion(tipo);
      if (d.resultado === 'aceptar' && suprime && !tienePermiso(roles, 'privacidad.suprimir'))
        throw prohibido('SIN_PERMISO', 'Borrar datos lo hace supervisión o administración.');

      let estado: EstadoSolicitudDatos = d.resultado === 'rechazar' ? 'rechazada' : 'aceptada';
      if (d.resultado === 'aceptar' && suprime) {
        const bloqueadores = await this.anonimizacion.bloqueadores(
          s.usuarioId,
          s.rol as RolTitular,
        );
        if (bloqueadores.length)
          throw conflicto(
            'NO_SE_PUEDE_BORRAR_AUN',
            `No se pueden borrar los datos todavía: ${bloqueadores.map((b) => b.detalle).join(' ')}`,
            { bloqueadores },
          );
        archivos.push(
          ...(await this.anonimizacion.anonimizar(tx, s.usuarioId, s.rol as RolTitular)),
        );
        estado = 'ejecutada';
      }
      await tx
        .update(solicitudDatos)
        .set({
          estado,
          respuesta: d.respuesta,
          resueltaPor: operador.id,
          resueltaEn: new Date(),
        })
        .where(eq(solicitudDatos.id, id));
      await auditar(tx, operador, {
        accion: 'privacidad.resolver',
        entidad: 'solicitud_datos',
        entidadId: id,
        antes: { estado: s.estado, tipo },
        despues: { estado, tipo, titular: s.usuarioId },
        motivo: d.respuesta,
      });
    });
    await this.anonimizacion.borrarArchivos(archivos);
    return this.detalle(id);
  }
}
