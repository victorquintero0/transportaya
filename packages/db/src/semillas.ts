import { readFileSync } from 'node:fs';
import { TARIFA_TAXI_MANIZALES_2026 as TAXI } from '@transportaya/dominio';
import { and, eq } from 'drizzle-orm';
import type { Conexion } from './conexion.js';
import {
  catalogoVehiculo,
  ciudad,
  rutaFija,
  tarifa,
  tarifaRecargo,
  type categoriaVehiculo,
} from './schema.js';

type Categoria = (typeof categoriaVehiculo.enumValues)[number];

const DATOS = new URL('../../../docs/datos/', import.meta.url);

function leerCsv(nombre: string): Record<string, string>[] {
  const [encabezado, ...filas] = readFileSync(new URL(nombre, DATOS), 'utf8').trim().split('\n');
  const columnas = (encabezado ?? '').split(',');
  return filas.map((fila) => {
    const valores = fila.split(',');
    return Object.fromEntries(columnas.map((c, i) => [c, valores[i] ?? '']));
  });
}

export interface ResultadoSemilla {
  ciudadId: string;
  tarifaId: string;
  rutas: number;
  vehiculos: number;
}

/**
 * Carga inicial de Manizales: la ciudad, la tarifa urbana del Decreto 0641 de 2025 con sus
 * recargos, las 193 rutas con tarifa fija desde Manizales y el catálogo de vehículos.
 * Es idempotente: volver a correrla no duplica nada.
 */
export async function sembrarManizales(conexion: Pick<Conexion, 'db'>): Promise<ResultadoSemilla> {
  // En una sola transacción: si algo falla no queda una tarifa a medias.
  return conexion.db.transaction(async (db) => {
    await db
      .insert(ciudad)
      .values({ nombre: 'Manizales', departamento: 'Caldas' })
      .onConflictDoNothing();
    const [laCiudad] = await db
      .select({ id: ciudad.id })
      .from(ciudad)
      .where(and(eq(ciudad.nombre, 'Manizales'), eq(ciudad.departamento, 'Caldas')));
    if (!laCiudad) throw new Error('No se pudo crear la ciudad de Manizales');

    // Tarifa urbana (D-20). Los recargos de horario van en dos códigos porque son excluyentes.
    const existente = await db
      .select({ id: tarifa.id })
      .from(tarifa)
      .where(
        and(
          eq(tarifa.ciudadId, laCiudad.id),
          eq(tarifa.tipoServicio, 'inmediato'),
          eq(tarifa.version, 1),
        ),
      );
    let tarifaId = existente[0]?.id;
    if (!tarifaId) {
      const [creada] = await db
        .insert(tarifa)
        .values({
          ciudadId: laCiudad.id,
          tipoServicio: 'inmediato',
          version: 1,
          ...TAXI.parametros,
          fuente: TAXI.fuente,
          vigenteDesde: new Date(`${TAXI.vigenteDesde}T00:00:00-05:00`),
        })
        .returning({ id: tarifa.id });
      tarifaId = creada?.id;
      if (!tarifaId) throw new Error('No se pudo crear la tarifa');

      const fijo = (codigo: string, nombre: string, valor: number, categoria?: Categoria) => ({
        tarifaId: tarifaId as string,
        codigo,
        nombre,
        valor,
        ...(categoria ? { categoria } : {}),
      });
      await db
        .insert(tarifaRecargo)
        .values([
          fijo('aeropuerto', 'Aeropuerto', TAXI.recargos.aeropuerto),
          fijo('nocturno', 'Nocturno', TAXI.recargos.horario),
          fijo('dominical_festivo', 'Dominical y festivo', TAXI.recargos.horario),
          fijo(
            'puerta_a_puerta',
            'Servicio por aplicación (puerta a puerta)',
            TAXI.recargos.puertaAPuerta,
          ),
          fijo('moteles', 'Moteles', TAXI.recargos.moteles),
          fijo('zona_termales', 'Zona de termales', TAXI.recargos.zonaTermales),
          fijo('mascotas', 'Mascotas', TAXI.recargos.mascotas),
          fijo('categoria', 'Categoría Media Alta', TAXI.recargoCategoria.media_alta, 'media_alta'),
          fijo('categoria', 'Categoría Alta', TAXI.recargoCategoria.alta, 'alta'),
        ]);
    }

    const rutas = leerCsv('tarifas-rutas-manizales-2026.csv').map((r) => ({
      ciudadOrigenId: laCiudad.id,
      destino: r.destino as string,
      modalidad: r.modalidad as 'solo_ida' | 'ida_y_vuelta',
      tarifa: Number(r.tarifa_cop),
      fuente: 'Tarifas sugeridas 2026 (Manizales)',
      vigenteDesde: '2026-01-01',
    }));
    await db.insert(rutaFija).values(rutas).onConflictDoNothing();

    const vehiculos = leerCsv('catalogo-vehiculos.csv').map((v) => ({
      marca: v.marca as string,
      linea: v.linea as string,
      carroceria: v.carroceria as string,
      categoria: v.categoria_propuesta as Categoria,
    }));
    await db.insert(catalogoVehiculo).values(vehiculos).onConflictDoNothing();

    return { ciudadId: laCiudad.id, tarifaId, rutas: rutas.length, vehiculos: vehiculos.length };
  });
}
