import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  conductor,
  cuentaPagoConductor,
  documento,
  pasajero,
  sesion,
  suscripcionPush,
  usuario,
  viaje,
} from '@transportaya/db';
import { ESTADOS_VIAJE, esEstadoFinal } from '@transportaya/dominio';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';
import { ALMACENAMIENTO, type Almacenamiento } from '../conductor/almacenamiento.service.js';

export type RolTitular = 'conductor' | 'pasajero';
const ACTIVOS = ESTADOS_VIAJE.filter((e) => !esEstadoFinal(e));

/** Lo que impide borrar los datos de una persona hoy. Se le dice con claridad para que pueda resolverlo. */
export interface Bloqueador {
  codigo: 'VIAJE_EN_CURSO' | 'DEUDA_PENDIENTE' | 'SALDO_PENDIENTE';
  detalle: string;
  monto?: number;
}

/**
 * Borrado de datos personales (Ley 1581, RNF-62). No se borra la fila de la persona: viajes, pagos y libros se conservan
 * por obligaciones contables (RNF-64) y apuntan a ella. Se le quita todo lo que la identifica y la cuenta queda
 * `anonimizada`, sin forma de volver a entrar. El número de celular se libera para que pueda registrarse de nuevo.
 */
@Injectable()
export class AnonimizacionService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(ALMACENAMIENTO) private readonly almacenamiento: Almacenamiento,
  ) {}

  async bloqueadores(usuarioId: string, rol: RolTitular): Promise<Bloqueador[]> {
    const { db } = this.bd;
    const lista: Bloqueador[] = [];
    const [activo] = await db
      .select({ n: count() })
      .from(viaje)
      .where(
        and(
          eq(rol === 'pasajero' ? viaje.pasajeroId : viaje.conductorId, usuarioId),
          inArray(viaje.estado, ACTIVOS),
        ),
      );
    if (Number(activo?.n ?? 0) > 0)
      lista.push({ codigo: 'VIAJE_EN_CURSO', detalle: 'Tiene un viaje en curso.' });

    if (rol === 'pasajero') {
      const [p] = await db
        .select({ deuda: pasajero.deudaPendiente })
        .from(pasajero)
        .where(eq(pasajero.usuarioId, usuarioId));
      if (p && p.deuda > 0)
        lista.push({
          codigo: 'DEUDA_PENDIENTE',
          detalle: 'Tiene una deuda por pagar.',
          monto: p.deuda,
        });
    } else {
      const saldo = await db.execute<{ saldo: string }>(
        sql`select saldo::text from saldo_conductor where conductor_id = ${usuarioId}`,
      );
      const s = Number(saldo.rows[0]?.saldo ?? 0);
      if (s !== 0)
        lista.push({
          codigo: 'SALDO_PENDIENTE',
          detalle:
            s < 0
              ? 'Debe una comisión: hay que saldarla antes.'
              : 'Tiene saldo a favor: hay que pagárselo antes.',
          monto: s,
        });
    }
    return lista;
  }

  /**
   * Anonimiza a la persona dentro de la transacción dada. Quien llama ya comprobó los bloqueadores. Devuelve las claves
   * de archivos para borrarlos del almacenamiento una vez confirmada la transacción.
   */
  async anonimizar(tx: DbOTx, usuarioId: string, rol: RolTitular): Promise<string[]> {
    const archivos: string[] = [];

    await tx.update(sesion).set({ revocadaEn: new Date() }).where(eq(sesion.usuarioId, usuarioId));
    await tx.delete(suscripcionPush).where(eq(suscripcionPush.usuarioId, usuarioId));

    // Lo que escribió: sus mensajes y comentarios dejan de mostrar su texto; los de la otra parte siguen.
    await tx.execute(
      sql`update viaje_mensaje set cuerpo = '[mensaje eliminado]' where autor_id = ${usuarioId}`,
    );
    await tx.execute(
      sql`update calificacion set comentario = null where de_usuario_id = ${usuarioId}`,
    );
    // El recorrido GPS es lo más delicado de los viajes: se quita. El precio, las fechas y el pago se conservan.
    const columna = rol === 'pasajero' ? 'pasajero_id' : 'conductor_id';
    await tx.execute(
      sql`update viaje set trayectoria = null where ${sql.raw(columna)} = ${usuarioId} and trayectoria is not null`,
    );

    if (rol === 'pasajero') {
      await tx.execute(sql`delete from contacto_confianza where pasajero_id = ${usuarioId}`);
      await tx.execute(sql`delete from lugar_guardado where pasajero_id = ${usuarioId}`);
      await tx.execute(sql`delete from metodo_pago where pasajero_id = ${usuarioId}`);
      // Aceptó términos como persona que ya no existe: se quita para que no parezca una autorización vigente.
      await tx
        .update(pasajero)
        .set({ aceptoTerminosEn: null, versionTerminos: null })
        .where(eq(pasajero.usuarioId, usuarioId));
    } else {
      const docs = await tx
        .select({ id: documento.id, clave: documento.archivoClave })
        .from(documento)
        .where(and(eq(documento.conductorId, usuarioId), eq(documento.titular, 'conductor')));
      archivos.push(...docs.map((d) => d.clave));
      if (docs.length)
        await tx.delete(documento).where(
          inArray(
            documento.id,
            docs.map((d) => d.id),
          ),
        );
      await tx.delete(cuentaPagoConductor).where(eq(cuentaPagoConductor.conductorId, usuarioId));
      await tx
        .update(conductor)
        .set({
          rut: null,
          estadoHabilitacion: 'bloqueado',
          estadoOperativo: 'desconectado',
          vehiculoActivoId: null,
          aceptoTerminosEn: null,
          versionTerminos: null,
        })
        .where(eq(conductor.usuarioId, usuarioId));
    }

    // El teléfono es único y obligatorio: se cambia por uno inválido para liberar el número real.
    const marcador = `+99${Array.from({ length: 11 }, () => randomInt(0, 10)).join('')}`;
    await tx
      .update(usuario)
      .set({
        nombre: 'Cuenta eliminada',
        email: null,
        fotoClave: null,
        telefono: marcador,
        estado: 'anonimizado',
        actualizadoEn: new Date(),
      })
      .where(eq(usuario.id, usuarioId));
    return archivos;
  }

  /** Borra del almacenamiento los archivos de una persona ya anonimizada. Un fallo se registra pero no deshace nada. */
  async borrarArchivos(claves: string[]): Promise<number> {
    let borrados = 0;
    for (const c of claves) {
      try {
        await this.almacenamiento.borrar(c);
        borrados += 1;
      } catch {
        /* queda para la limpieza periódica */
      }
    }
    return borrados;
  }
}
