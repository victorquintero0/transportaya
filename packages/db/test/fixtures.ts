import { eq } from 'drizzle-orm';
import {
  ciudad,
  conductor,
  cotizacion,
  pasajero,
  tarifa,
  usuario,
  vehiculo,
  viaje,
} from '../src/index.js';
import type { BaseDePrueba } from './ayudas.js';

type Db = BaseDePrueba['db'];

let contador = 0;
const siguiente = () => {
  contador += 1;
  return contador;
};

export async function crearUsuario(db: Db, nombre = 'Usuario de prueba') {
  const n = siguiente();
  const [fila] = await db
    .insert(usuario)
    .values({ telefono: `+57300${String(n).padStart(7, '0')}`, nombre })
    .returning({ id: usuario.id });
  return fila!.id;
}

export async function crearPasajero(db: Db) {
  const id = await crearUsuario(db, 'Pasajero');
  await db.insert(pasajero).values({ usuarioId: id });
  return id;
}

export async function crearVehiculo(db: Db) {
  const n = siguiente();
  const [fila] = await db
    .insert(vehiculo)
    .values({
      placa: `TST${String(n % 1000).padStart(3, '0')}`,
      marca: 'Chevrolet',
      linea: 'Onix',
      modeloAnio: 2022,
      color: 'Blanco',
      categoria: 'media',
    })
    .returning({ id: vehiculo.id });
  return fila!.id;
}

export async function crearConductor(db: Db, ciudadId: string) {
  const id = await crearUsuario(db, 'Conductor');
  const vehiculoId = await crearVehiculo(db);
  await db.insert(conductor).values({ usuarioId: id, ciudadId, vehiculoActivoId: vehiculoId });
  return { conductorId: id, vehiculoId };
}

export async function crearCiudad(db: Db) {
  const n = siguiente();
  const [fila] = await db
    .insert(ciudad)
    .values({ nombre: `Ciudad ${n}`, departamento: 'Caldas' })
    .returning({ id: ciudad.id });
  return fila!.id;
}

/** Ciudad, tarifa, pasajero, conductor con vehículo y una cotización lista para crear viajes. */
export async function crearContexto(db: Db) {
  const ciudadId = await crearCiudad(db);
  const [laTarifa] = await db
    .insert(tarifa)
    .values({
      ciudadId,
      version: 1,
      base: 3700,
      valorKm: 1784,
      valorMinuto: 223,
      minima: 6300,
      vigenteDesde: new Date('2026-01-01T00:00:00-05:00'),
    })
    .returning({ id: tarifa.id });
  const pasajeroId = await crearPasajero(db);
  const { conductorId, vehiculoId } = await crearConductor(db, ciudadId);
  const [laCotizacion] = await db
    .insert(cotizacion)
    .values({
      pasajeroId,
      ciudadId,
      categoria: 'media',
      tipoServicio: 'inmediato',
      origen: { lat: 5.0703, lng: -75.5138 },
      destino: { lat: 5.0589, lng: -75.4852 },
      tarifaId: laTarifa!.id,
      precioMin: 14_000,
      precioMax: 18_000,
      expiraEn: new Date(Date.now() + 5 * 60_000),
    })
    .returning({ id: cotizacion.id });
  return {
    ciudadId,
    tarifaId: laTarifa!.id,
    pasajeroId,
    conductorId,
    vehiculoId,
    cotizacionId: laCotizacion!.id,
  };
}

export type Contexto = Awaited<ReturnType<typeof crearContexto>>;

export async function crearViaje(
  db: Db,
  ctx: Contexto,
  extra: Partial<typeof viaje.$inferInsert> = {},
) {
  const [fila] = await db
    .insert(viaje)
    .values({
      pasajeroId: ctx.pasajeroId,
      tipoServicio: 'inmediato',
      categoria: 'media',
      origen: { lat: 5.0703, lng: -75.5138 },
      destino: { lat: 5.0589, lng: -75.4852 },
      cotizacionId: ctx.cotizacionId,
      tarifaId: ctx.tarifaId,
      metodoPago: 'efectivo',
      precioEstimadoMin: 14_000,
      precioEstimadoMax: 18_000,
      ...extra,
    })
    .returning({ id: viaje.id });
  return fila!.id;
}

export async function estadoDeViaje(db: Db, id: string) {
  const [fila] = await db.select({ estado: viaje.estado }).from(viaje).where(eq(viaje.id, id));
  return fila?.estado;
}
