import { createHash, randomBytes } from 'node:crypto';
import { conductor, usuario, vehiculo, viaje, viajeCompartido } from '@transportaya/db';
import { distanciaMetros } from '@transportaya/dominio';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { UbicacionStore } from '../conductor/ubicacion.store.js';
import { zonaDeDireccion } from '../viajes/eventos-viaje.js';

const VIGENCIA_ENLACE_MS = 24 * 3_600_000;
/** Cuánto tiempo, tras terminar el viaje, el enlace sigue mostrando que llegó. */
const GRACIA_FINALIZADO_MS = 30 * 60_000;
const FACTOR_RUTA = 1.35;
const VELOCIDAD_MEDIA_MS = 25 / 3.6;

const hashDe = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Enlace temporal para que otra persona siga el viaje (PAS-34, RN-132). Solo se guarda el hash del token. No muestra
 * datos personales del pasajero ni el destino exacto: nombre del conductor, vehículo, placa, posición y zona de destino.
 */
@Injectable()
export class CompartidoService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(UbicacionStore) private readonly ubicaciones: UbicacionStore,
  ) {}

  async compartir(pasajeroId: string, viajeId: string) {
    const { db } = this.bd;
    const [v] = await db
      .select({ id: viaje.id, estado: viaje.estado })
      .from(viaje)
      .where(and(eq(viaje.id, viajeId), eq(viaje.pasajeroId, pasajeroId)));
    if (!v) throw noEncontrado('VIAJE_NO_ENCONTRADO', 'No encontramos ese viaje');
    if (!['asignado', 'en_sitio', 'en_curso'].includes(v.estado))
      throw conflicto('ESTADO_INVALIDO', 'Puedes compartir el viaje cuando ya tiene conductor.');
    const token = randomBytes(24).toString('base64url');
    await db.insert(viajeCompartido).values({
      viajeId: v.id,
      tokenHash: hashDe(token),
      expiraEn: new Date(Date.now() + VIGENCIA_ENLACE_MS),
    });
    return { token, ruta: `/c/${token}` };
  }

  /** Deja sin efecto todos los enlaces del viaje. */
  async dejarDeCompartir(pasajeroId: string, viajeId: string) {
    await this.bd.db.execute(sql`
      update viaje_compartido set expira_en = now()
      where viaje_id = (select id from viaje where id = ${viajeId} and pasajero_id = ${pasajeroId})
        and (expira_en is null or expira_en > now())`);
  }

  /** Lo que ve quien abre el enlace. Es público: sin sesión. */
  async ver(token: string) {
    const { db } = this.bd;
    const [enlace] = await db
      .select()
      .from(viajeCompartido)
      .where(eq(viajeCompartido.tokenHash, hashDe(token)));
    if (!enlace || (enlace.expiraEn && enlace.expiraEn.getTime() < Date.now()))
      throw noEncontrado('ENLACE_NO_VALIDO', 'Este enlace ya no está disponible.');
    const [v] = await db.select().from(viaje).where(eq(viaje.id, enlace.viajeId));
    if (!v) throw noEncontrado('ENLACE_NO_VALIDO', 'Este enlace ya no está disponible.');

    const terminado = ['finalizado', 'cancelado'].includes(v.estado);
    const finTs = (v.finalizadoEn ?? v.canceladoEn)?.getTime();
    if (terminado && finTs !== undefined && Date.now() - finTs > GRACIA_FINALIZADO_MS)
      throw noEncontrado('ENLACE_NO_VALIDO', 'Este viaje ya terminó.');

    let conductorInfo = null;
    if (v.conductorId) {
      const [c] = await db
        .select({
          nombre: usuario.nombre,
          marca: vehiculo.marca,
          linea: vehiculo.linea,
          color: vehiculo.color,
          placa: vehiculo.placa,
        })
        .from(conductor)
        .innerJoin(usuario, eq(usuario.id, conductor.usuarioId))
        .innerJoin(vehiculo, eq(vehiculo.id, v.vehiculoId ?? conductor.vehiculoActivoId))
        .where(eq(conductor.usuarioId, v.conductorId));
      const u = this.ubicaciones.obtener(v.conductorId);
      const enRuta =
        ['asignado', 'en_sitio', 'en_curso'].includes(v.estado) && u && Number.isFinite(u.lat);
      const meta = v.estado === 'en_curso' ? v.destino : v.origen;
      const distanciaM = enRuta ? Math.round(distanciaMetros(u!, meta) * FACTOR_RUTA) : null;
      if (c)
        conductorInfo = {
          nombre: c.nombre.split(/\s+/)[0] ?? c.nombre,
          vehiculo: { marca: c.marca, linea: c.linea, color: c.color, placa: c.placa },
          posicion: enRuta ? { lat: u!.lat, lng: u!.lng, t: u!.instanteMs } : null,
          etaS: distanciaM === null ? null : Math.round(distanciaM / VELOCIDAD_MEDIA_MS),
        };
    }
    return {
      estado: v.estado,
      codigo: v.codigo,
      origen: { lat: v.origen.lat, lng: v.origen.lng },
      destino: {
        zona: zonaDeDireccion(v.destinoDireccion),
        lat: v.destino.lat,
        lng: v.destino.lng,
      },
      conductor: conductorInfo,
      iniciadoEn: v.iniciadoEn?.toISOString() ?? null,
      finalizadoEn: v.finalizadoEn?.toISOString() ?? null,
    };
  }

  /** Para las pruebas: ¿hay enlaces vigentes? */
  async vigentes(viajeId: string): Promise<number> {
    const filas = await this.bd.db
      .select({ id: viajeCompartido.id })
      .from(viajeCompartido)
      .where(
        and(
          inArray(viajeCompartido.viajeId, [viajeId]),
          sql`${viajeCompartido.expiraEn} is null or ${viajeCompartido.expiraEn} > now()`,
        ),
      );
    return filas.length;
  }
}
