import { sql } from 'drizzle-orm';
import { bigint, customType, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Identificador UUID v7 (ordenable por fecha) generado por la base: ver la migración de extensiones. */
export const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuid_v7()`);

export const creadoEn = () => timestamp('creado_en', { withTimezone: true }).notNull().defaultNow();

/** Se mantiene con el disparador `fijar_actualizado_en`. */
export const actualizadoEn = () =>
  timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow();

export const marca = (nombre: string) => timestamp(nombre, { withTimezone: true });

/** Dinero: pesos colombianos (COP) como enteros. Nunca decimales ni flotantes. */
export const cop = (nombre: string) => bigint(nombre, { mode: 'number' });

export interface Coordenada {
  lat: number;
  lng: number;
}

/** Lee un punto de PostGIS en formato EWKB hexadecimal, que es como lo entrega `pg`. */
export function leerPuntoEwkb(hex: string): Coordenada {
  const b = Buffer.from(hex, 'hex');
  const littleEndian = b[0] === 1;
  const tipo = littleEndian ? b.readUInt32LE(1) : b.readUInt32BE(1);
  const tieneSrid = (tipo & 0x20000000) !== 0;
  const desplazamiento = tieneSrid ? 9 : 5;
  const x = littleEndian ? b.readDoubleLE(desplazamiento) : b.readDoubleBE(desplazamiento);
  const y = littleEndian ? b.readDoubleLE(desplazamiento + 8) : b.readDoubleBE(desplazamiento + 8);
  return { lat: y, lng: x };
}

/** `geography(Point, 4326)`. Se escribe y se lee como `{ lat, lng }`. */
export const punto = customType<{ data: Coordenada; driverData: string }>({
  dataType: () => 'geography(Point,4326)',
  toDriver: (v) => sql`ST_SetSRID(ST_MakePoint(${v.lng}, ${v.lat}), 4326)::geography` as never,
  fromDriver: (v) => leerPuntoEwkb(v),
});

/** Geometría GeoJSON mínima para escribir polígonos y trayectorias. */
export interface GeoJson {
  type: 'Polygon' | 'MultiPolygon' | 'LineString';
  coordinates: unknown;
}

function geografia(tipo: 'Polygon' | 'LineString') {
  return customType<{ data: GeoJson; driverData: string }>({
    dataType: () => `geography(${tipo},4326)`,
    toDriver: (v) => sql`ST_GeomFromGeoJSON(${JSON.stringify(v)})::geography` as never,
    // Al leer, pida la columna con ST_AsGeoJSON(columna): aquí solo viaja el EWKB sin interpretar.
    fromDriver: (v) => ({ type: tipo, coordinates: v }) as GeoJson,
  });
}

export const poligono = geografia('Polygon');
export const lineaGeografica = geografia('LineString');
