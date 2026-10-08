import {
  contactoConfianza,
  lugarGuardado,
  metodoPago,
  pasajero,
  usuario,
  viaje,
} from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { normalizarTelefono } from '../comun/telefono.js';
import { AnonimizacionService } from '../privacidad/anonimizacion.service.js';
import { PrivacidadService } from '../privacidad/privacidad.service.js';
import { VERSION_TERMINOS } from '@transportaya/dominio';

/** Versión vigente de los términos y de la política de datos (Ley 1581 de 2012). Al cambiarla, se vuelve a pedir la aceptación. */
export { VERSION_TERMINOS };

const ESTADOS_ACTIVOS = ['buscando_conductor', 'asignado', 'en_sitio', 'en_curso'] as const;
const MAX_CONTACTOS = 5;
const MAX_LUGARES = 20;

@Injectable()
export class PerfilPasajeroService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(AnonimizacionService) private readonly anonimizacion: AnonimizacionService,
    @Inject(PrivacidadService) private readonly privacidad: PrivacidadService,
  ) {}

  async obtener(pasajeroId: string) {
    const { db } = this.bd;
    const [fila] = await db
      .select({ u: usuario, p: pasajero })
      .from(pasajero)
      .innerJoin(usuario, eq(usuario.id, pasajero.usuarioId))
      .where(eq(pasajero.usuarioId, pasajeroId));
    if (!fila) throw noEncontrado('PASAJERO_NO_ENCONTRADO', 'No encontramos tu cuenta');
    const [contactos, lugares, metodos, [activo]] = await Promise.all([
      this.contactos(pasajeroId),
      this.lugares(pasajeroId),
      this.metodosDePago(pasajeroId),
      db
        .select({ id: viaje.id })
        .from(viaje)
        .where(and(eq(viaje.pasajeroId, pasajeroId), inArray(viaje.estado, [...ESTADOS_ACTIVOS]))),
    ]);
    const { u, p } = fila;
    return {
      usuario: {
        id: u.id,
        nombre: u.nombre === 'Sin nombre' ? '' : u.nombre,
        telefono: u.telefono,
        email: u.email,
      },
      calificacionPromedio: p.calificacionPromedio,
      calificacionesTotal: p.calificacionesTotal,
      deuda: p.deudaPendiente,
      terminos: {
        version: VERSION_TERMINOS,
        aceptados: p.versionTerminos === VERSION_TERMINOS,
        aceptoEn: p.aceptoTerminosEn?.toISOString() ?? null,
      },
      contactos,
      lugares,
      metodosPago: metodos,
      viajeActivoId: activo?.id ?? null,
    };
  }

  async actualizar(pasajeroId: string, d: { nombre?: string; email?: string | null }) {
    const cambios: Partial<typeof usuario.$inferInsert> = {};
    if (d.nombre !== undefined) cambios.nombre = d.nombre;
    if (d.email !== undefined) cambios.email = d.email;
    if (Object.keys(cambios).length === 0) return;
    await this.bd.db
      .update(usuario)
      .set({ ...cambios, actualizadoEn: new Date() })
      .where(eq(usuario.id, pasajeroId));
  }

  /** PAS-02: autorización previa, expresa e informada para el tratamiento de datos (RNF-60). */
  async aceptarTerminos(pasajeroId: string, version: string) {
    if (version !== VERSION_TERMINOS)
      throw conflicto('VERSION_TERMINOS', 'Esa versión de los términos ya no está vigente.', {
        versionVigente: VERSION_TERMINOS,
      });
    await this.bd.db
      .update(pasajero)
      .set({ aceptoTerminosEn: new Date(), versionTerminos: version })
      .where(eq(pasajero.usuarioId, pasajeroId));
  }

  // ---------------------------------------------------------------- contactos de confianza
  contactos(pasajeroId: string) {
    return this.bd.db
      .select({
        id: contactoConfianza.id,
        nombre: contactoConfianza.nombre,
        telefono: contactoConfianza.telefono,
      })
      .from(contactoConfianza)
      .where(eq(contactoConfianza.pasajeroId, pasajeroId))
      .orderBy(contactoConfianza.nombre);
  }

  async agregarContacto(pasajeroId: string, d: { nombre: string; telefono: string }) {
    const telefono = normalizarTelefono(d.telefono);
    const actuales = await this.contactos(pasajeroId);
    if (actuales.length >= MAX_CONTACTOS)
      throw conflicto(
        'DEMASIADOS_CONTACTOS',
        `Puedes tener hasta ${MAX_CONTACTOS} contactos de confianza.`,
      );
    if (actuales.some((c) => c.telefono === telefono))
      throw conflicto('CONTACTO_REPETIDO', 'Ya tienes a esa persona como contacto.');
    const [c] = await this.bd.db
      .insert(contactoConfianza)
      .values({ pasajeroId, nombre: d.nombre, telefono })
      .returning({ id: contactoConfianza.id });
    return { id: c!.id, nombre: d.nombre, telefono };
  }

  async quitarContacto(pasajeroId: string, id: string) {
    const r = await this.bd.db
      .delete(contactoConfianza)
      .where(and(eq(contactoConfianza.id, id), eq(contactoConfianza.pasajeroId, pasajeroId)))
      .returning({ id: contactoConfianza.id });
    if (r.length === 0) throw noEncontrado('CONTACTO_NO_ENCONTRADO', 'No encontramos ese contacto');
  }

  // ---------------------------------------------------------------- lugares guardados
  async lugares(pasajeroId: string) {
    const filas = await this.bd.db
      .select()
      .from(lugarGuardado)
      .where(eq(lugarGuardado.pasajeroId, pasajeroId))
      .orderBy(lugarGuardado.etiqueta);
    return filas.map((l) => ({
      id: l.id,
      etiqueta: l.etiqueta,
      direccion: l.direccion,
      lat: l.ubicacion.lat,
      lng: l.ubicacion.lng,
    }));
  }

  async guardarLugar(
    pasajeroId: string,
    d: { etiqueta: string; direccion: string; lat: number; lng: number },
  ) {
    const { db } = this.bd;
    const [{ n }] = (
      await db.execute<{ n: number }>(
        sql`select count(*)::int as n from lugar_guardado where pasajero_id = ${pasajeroId}`,
      )
    ).rows as [{ n: number }];
    if (n >= MAX_LUGARES)
      throw conflicto('DEMASIADOS_LUGARES', `Puedes guardar hasta ${MAX_LUGARES} lugares.`);
    // "Casa" y "Trabajo" son únicos: guardar otra vez reemplaza el anterior.
    const clave = d.etiqueta.trim().toLowerCase();
    if (clave === 'casa' || clave === 'trabajo') {
      await db
        .delete(lugarGuardado)
        .where(
          and(
            eq(lugarGuardado.pasajeroId, pasajeroId),
            sql`lower(${lugarGuardado.etiqueta}) = ${clave}`,
          ),
        );
    }
    const [l] = await db
      .insert(lugarGuardado)
      .values({
        pasajeroId,
        etiqueta: d.etiqueta,
        direccion: d.direccion,
        ubicacion: { lat: d.lat, lng: d.lng },
      })
      .returning({ id: lugarGuardado.id });
    return { id: l!.id, ...d };
  }

  async quitarLugar(pasajeroId: string, id: string) {
    const r = await this.bd.db
      .delete(lugarGuardado)
      .where(and(eq(lugarGuardado.id, id), eq(lugarGuardado.pasajeroId, pasajeroId)))
      .returning({ id: lugarGuardado.id });
    if (r.length === 0) throw noEncontrado('LUGAR_NO_ENCONTRADO', 'No encontramos ese lugar');
  }

  // ---------------------------------------------------------------- métodos de pago (lectura)
  async metodosDePago(pasajeroId: string) {
    const filas = await this.bd.db
      .select()
      .from(metodoPago)
      .where(and(eq(metodoPago.pasajeroId, pasajeroId), eq(metodoPago.activo, true)))
      .orderBy(desc(metodoPago.predeterminado), desc(metodoPago.creadoEn));
    return filas.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      marca: m.marca,
      ultimos4: m.ultimos4,
      predeterminado: m.predeterminado,
    }));
  }

  // ---------------------------------------------------------------- derechos del titular (RNF-62)
  /** PAS-05: todo lo que TransporteYa guarda de la persona, en un archivo que puede descargar. */
  async descargarMisDatos(pasajeroId: string) {
    const { db } = this.bd;
    const perfil = await this.obtener(pasajeroId);
    const viajes = await db.execute(sql`
      select codigo, estado, tipo_servicio, metodo_pago, origen_direccion, destino_direccion,
             solicitado_en, finalizado_en, precio_final, propina
      from viaje where pasajero_id = ${pasajeroId} order by solicitado_en desc`);
    const calificaciones = await db.execute(sql`
      select estrellas, etiquetas, comentario, creado_en from calificacion where de_usuario_id = ${pasajeroId} order by creado_en desc`);
    return {
      generadoEn: new Date().toISOString(),
      perfil,
      viajes: viajes.rows,
      calificacionesQueDio: calificaciones.rows,
    };
  }

  /**
   * PAS-05: elimina la cuenta. Los viajes se conservan sin datos personales por obligaciones contables (RNF-64). No se
   * puede mientras haya un viaje activo o una deuda.
   */
  async eliminarCuenta(pasajeroId: string) {
    const { db } = this.bd;
    const perfil = await this.obtener(pasajeroId);
    if (perfil.viajeActivoId)
      throw conflicto('VIAJE_EN_CURSO', 'Termina o cancela tu viaje antes de eliminar la cuenta.');
    if (perfil.deuda > 0)
      throw conflicto('DEUDA_PENDIENTE', 'Paga lo que debes antes de eliminar la cuenta.', {
        deuda: perfil.deuda,
      });
    await db.transaction(async (tx) => {
      await this.anonimizacion.anonimizar(tx, pasajeroId, 'pasajero');
      await this.privacidad.registrarAutoeliminacion(tx, pasajeroId, 'pasajero');
    });
  }
}
