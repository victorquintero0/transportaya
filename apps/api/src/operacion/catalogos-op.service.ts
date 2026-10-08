import { Inject, Injectable } from '@nestjs/common';
import {
  catalogoVehiculo,
  conductor,
  peaje,
  usuario,
  vehiculo,
  conductorVehiculo,
} from '@transportaya/db';
import type { CategoriaVehiculo } from '@transportaya/dominio';
import { and, asc, count, desc, eq, ilike, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { type Operador, auditar } from './auditoria.js';
import { comodines } from './comun.js';

export interface DatosCatalogo {
  marca: string;
  linea: string;
  categoria: CategoriaVehiculo;
  anioDesde: number;
  anioHasta?: number | null | undefined;
  carroceria?: string | null | undefined;
  pasajeros?: number | null | undefined;
  puertas?: number | null | undefined;
}

const vistaCatalogo = (c: typeof catalogoVehiculo.$inferSelect, vehiculos: number) => ({
  id: c.id,
  marca: c.marca,
  linea: c.linea,
  categoria: c.categoria,
  anioDesde: c.anioDesde,
  anioHasta: c.anioHasta,
  carroceria: c.carroceria,
  pasajeros: c.pasajeros,
  puertas: c.puertas,
  activo: c.activo,
  vehiculos,
});

const claveUnica = (e: unknown): boolean =>
  ((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code) === '23505';

/**
 * Catálogo de vehículos y revisión de los que no están en él (OPE-06, D-21), y la tabla de peajes (RN-091). La
 * categoría de un vehículo decide cuánto suma a la carrera (RN-006): por eso cada cambio pide motivo y queda auditado.
 */
@Injectable()
export class CatalogosOperacionService {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  // ───────────────────────────────────────────────────────── catálogo
  async listar(f: {
    q?: string | undefined;
    categoria?: CategoriaVehiculo | undefined;
    activo?: boolean | undefined;
    limite: number;
    desplazar: number;
  }) {
    const donde = and(
      f.q
        ? sql`(${catalogoVehiculo.marca} ilike ${comodines(f.q)} or ${catalogoVehiculo.linea} ilike ${comodines(f.q)})`
        : undefined,
      f.categoria ? eq(catalogoVehiculo.categoria, f.categoria) : undefined,
      f.activo === undefined ? undefined : eq(catalogoVehiculo.activo, f.activo),
    );
    const [filas, [t], porCategoria] = await Promise.all([
      this.bd.db
        .select({
          c: catalogoVehiculo,
          vehiculos: sql<number>`(select count(*)::int from vehiculo v where v.catalogo_vehiculo_id = catalogo_vehiculo.id)`,
        })
        .from(catalogoVehiculo)
        .where(donde)
        .orderBy(
          asc(catalogoVehiculo.marca),
          asc(catalogoVehiculo.linea),
          asc(catalogoVehiculo.anioDesde),
        )
        .limit(f.limite)
        .offset(f.desplazar),
      this.bd.db.select({ n: count() }).from(catalogoVehiculo).where(donde),
      this.bd.db
        .select({ categoria: catalogoVehiculo.categoria, n: count() })
        .from(catalogoVehiculo)
        .where(eq(catalogoVehiculo.activo, true))
        .groupBy(catalogoVehiculo.categoria),
    ]);
    return {
      total: Number(t?.n ?? 0),
      porCategoria: Object.fromEntries(porCategoria.map((x) => [x.categoria, Number(x.n)])),
      items: filas.map(({ c, vehiculos }) => vistaCatalogo(c, vehiculos)),
    };
  }

  async crear(d: DatosCatalogo, motivo: string, operador: Operador) {
    if (d.anioHasta != null && d.anioHasta < d.anioDesde)
      throw solicitudInvalida('El año final no puede ser anterior al inicial.');
    try {
      return await this.bd.db.transaction(async (tx) => {
        const [c] = await tx
          .insert(catalogoVehiculo)
          .values({
            marca: d.marca.trim(),
            linea: d.linea.trim(),
            categoria: d.categoria,
            anioDesde: d.anioDesde,
            anioHasta: d.anioHasta ?? null,
            carroceria: d.carroceria ?? null,
            pasajeros: d.pasajeros ?? null,
            puertas: d.puertas ?? null,
          })
          .returning();
        await auditar(tx, operador, {
          accion: 'catalogo.crear',
          entidad: 'catalogo_vehiculo',
          entidadId: c!.id,
          despues: {
            marca: c!.marca,
            linea: c!.linea,
            categoria: c!.categoria,
            anioDesde: c!.anioDesde,
          },
          motivo,
        });
        return vistaCatalogo(c!, 0);
      });
    } catch (e) {
      if (claveUnica(e))
        throw conflicto(
          'CATALOGO_REPETIDO',
          'Ya hay un vehículo con esa marca, línea y año inicial.',
        );
      throw e;
    }
  }

  async actualizar(
    id: string,
    d: Partial<Omit<DatosCatalogo, 'marca' | 'linea'>> & {
      activo?: boolean | undefined;
      /** Pasa también a los vehículos ya registrados con esta entrada. Por defecto solo rige para los nuevos. */
      aplicarAVehiculos?: boolean | undefined;
    },
    motivo: string,
    operador: Operador,
  ) {
    return this.bd.db.transaction(async (tx) => {
      const [antes] = await tx
        .select()
        .from(catalogoVehiculo)
        .where(eq(catalogoVehiculo.id, id))
        .for('update');
      if (!antes)
        throw noEncontrado('CATALOGO_NO_ENCONTRADO', 'No encontramos ese vehículo del catálogo');
      const desde = d.anioDesde ?? antes.anioDesde;
      const hasta = d.anioHasta === undefined ? antes.anioHasta : d.anioHasta;
      if (hasta !== null && hasta < desde)
        throw solicitudInvalida('El año final no puede ser anterior al inicial.');

      const cambios: Partial<typeof catalogoVehiculo.$inferInsert> = {};
      if (d.categoria !== undefined) cambios.categoria = d.categoria;
      if (d.anioDesde !== undefined) cambios.anioDesde = d.anioDesde;
      if (d.anioHasta !== undefined) cambios.anioHasta = d.anioHasta;
      if (d.carroceria !== undefined) cambios.carroceria = d.carroceria;
      if (d.pasajeros !== undefined) cambios.pasajeros = d.pasajeros;
      if (d.puertas !== undefined) cambios.puertas = d.puertas;
      if (d.activo !== undefined) cambios.activo = d.activo;
      if (Object.keys(cambios).length === 0) throw solicitudInvalida('No hay nada que cambiar.');

      let c: typeof antes | undefined;
      try {
        [c] = await tx
          .update(catalogoVehiculo)
          .set({ ...cambios, actualizadoEn: new Date() })
          .where(eq(catalogoVehiculo.id, id))
          .returning();
      } catch (e) {
        if (claveUnica(e))
          throw conflicto(
            'CATALOGO_REPETIDO',
            'Ya hay un vehículo con esa marca, línea y año inicial.',
          );
        throw e;
      }

      let afectados = 0;
      if (d.aplicarAVehiculos && d.categoria !== undefined && d.categoria !== antes.categoria) {
        const r = await tx
          .update(vehiculo)
          .set({ categoria: d.categoria })
          .where(eq(vehiculo.catalogoVehiculoId, id))
          .returning({ id: vehiculo.id });
        afectados = r.length;
      }
      await auditar(tx, operador, {
        accion: 'catalogo.cambiar',
        entidad: 'catalogo_vehiculo',
        entidadId: id,
        antes: {
          categoria: antes.categoria,
          anioDesde: antes.anioDesde,
          anioHasta: antes.anioHasta,
          activo: antes.activo,
        },
        despues: { ...cambios, vehiculosActualizados: afectados },
        motivo,
      });
      const [{ n }] = (await tx
        .select({ n: count() })
        .from(vehiculo)
        .where(eq(vehiculo.catalogoVehiculoId, id))) as [{ n: number }];
      return { ...vistaCatalogo(c!, Number(n)), vehiculosActualizados: afectados };
    });
  }

  // ───────────────────────────────────────────── vehículos fuera del catálogo
  async fueraDeCatalogo(f: { limite: number; desplazar: number }) {
    const donde = eq(vehiculo.fueraDeCatalogo, true);
    const [filas, [t]] = await Promise.all([
      this.bd.db
        .select({
          v: vehiculo,
          conductorId: conductorVehiculo.conductorId,
          conductor: usuario.nombre,
          habilitacion: conductor.estadoHabilitacion,
        })
        .from(vehiculo)
        .leftJoin(conductorVehiculo, eq(conductorVehiculo.vehiculoId, vehiculo.id))
        .leftJoin(usuario, eq(usuario.id, conductorVehiculo.conductorId))
        .leftJoin(conductor, eq(conductor.usuarioId, conductorVehiculo.conductorId))
        .where(donde)
        .orderBy(desc(vehiculo.creadoEn))
        .limit(f.limite)
        .offset(f.desplazar),
      this.bd.db.select({ n: count() }).from(vehiculo).where(donde),
    ]);
    return {
      total: Number(t?.n ?? 0),
      items: filas.map((x) => ({
        id: x.v.id,
        placa: x.v.placa,
        marca: x.v.marca,
        linea: x.v.linea,
        modeloAnio: x.v.modeloAnio,
        color: x.v.color,
        categoria: x.v.categoria,
        creadoEn: x.v.creadoEn.toISOString(),
        conductor: x.conductorId
          ? { id: x.conductorId, nombre: x.conductor, habilitacion: x.habilitacion }
          : null,
      })),
    };
  }

  /**
   * Resuelve un vehículo que el conductor registró escribiendo marca y línea: lo enlaza con una entrada del catálogo
   * (`asignar`) o crea la entrada con la categoría que se decida (`agregar`). Ya no vuelve a la cola.
   */
  async revisarVehiculo(
    id: string,
    d:
      | { accion: 'asignar'; catalogoVehiculoId: string }
      | { accion: 'agregar'; categoria: CategoriaVehiculo },
    motivo: string,
    operador: Operador,
  ) {
    return this.bd.db.transaction(async (tx) => {
      const [v] = await tx.select().from(vehiculo).where(eq(vehiculo.id, id)).for('update');
      if (!v) throw noEncontrado('VEHICULO_NO_ENCONTRADO', 'No encontramos ese vehículo');
      if (!v.fueraDeCatalogo)
        throw conflicto('YA_REVISADO', 'Ese vehículo ya está en el catálogo.');

      let entrada: typeof catalogoVehiculo.$inferSelect;
      if (d.accion === 'asignar') {
        const [c] = await tx
          .select()
          .from(catalogoVehiculo)
          .where(eq(catalogoVehiculo.id, d.catalogoVehiculoId));
        if (!c || !c.activo)
          throw noEncontrado(
            'CATALOGO_NO_ENCONTRADO',
            'Ese vehículo del catálogo no existe o está inactivo.',
          );
        if (v.modeloAnio < c.anioDesde || (c.anioHasta !== null && v.modeloAnio > c.anioHasta))
          throw solicitudInvalida(
            `El ${c.marca} ${c.linea} no existe en el modelo ${v.modeloAnio}.`,
          );
        entrada = c;
      } else {
        try {
          [entrada] = (await tx
            .insert(catalogoVehiculo)
            .values({
              marca: v.marca,
              linea: v.linea,
              categoria: d.categoria,
              anioDesde: v.modeloAnio,
            })
            .returning()) as [typeof catalogoVehiculo.$inferSelect];
        } catch (e) {
          if (claveUnica(e))
            throw conflicto(
              'CATALOGO_REPETIDO',
              'Ya hay una entrada para esa marca, línea y año: asigna el vehículo a ella.',
            );
          throw e;
        }
      }
      await tx
        .update(vehiculo)
        .set({
          catalogoVehiculoId: entrada.id,
          marca: entrada.marca,
          linea: entrada.linea,
          categoria: entrada.categoria,
          fueraDeCatalogo: false,
        })
        .where(eq(vehiculo.id, id));
      await auditar(tx, operador, {
        accion: d.accion === 'asignar' ? 'vehiculo.asignar_catalogo' : 'vehiculo.agregar_catalogo',
        entidad: 'vehiculo',
        entidadId: id,
        antes: { categoria: v.categoria, marca: v.marca, linea: v.linea },
        despues: { categoria: entrada.categoria, catalogoVehiculoId: entrada.id },
        motivo,
      });
      return { id, categoria: entrada.categoria, catalogoVehiculoId: entrada.id };
    });
  }

  // ───────────────────────────────────────────────────────── peajes
  async peajes(f: { q?: string | undefined; activo?: boolean | undefined }) {
    const filas = await this.bd.db
      .select()
      .from(peaje)
      .where(
        and(
          f.q ? ilike(peaje.nombre, comodines(f.q)) : undefined,
          f.activo === undefined ? undefined : eq(peaje.activo, f.activo),
        ),
      )
      .orderBy(asc(peaje.nombre));
    return filas.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      lat: p.ubicacion.lat,
      lng: p.ubicacion.lng,
      valor: p.valor,
      fuente: p.fuente,
      activo: p.activo,
    }));
  }

  async crearPeaje(
    d: { nombre: string; lat: number; lng: number; valor: number; fuente?: string | undefined },
    motivo: string,
    operador: Operador,
  ) {
    try {
      return await this.bd.db.transaction(async (tx) => {
        const [p] = await tx
          .insert(peaje)
          .values({
            nombre: d.nombre.trim(),
            ubicacion: { lat: d.lat, lng: d.lng },
            valor: d.valor,
            fuente: d.fuente ?? null,
          })
          .returning();
        await auditar(tx, operador, {
          accion: 'peaje.crear',
          entidad: 'peaje',
          entidadId: p!.id,
          despues: { nombre: p!.nombre, valor: p!.valor, lat: d.lat, lng: d.lng },
          motivo,
        });
        return { id: p!.id };
      });
    } catch (e) {
      if (claveUnica(e)) throw conflicto('PEAJE_REPETIDO', 'Ya hay un peaje con ese nombre.');
      throw e;
    }
  }

  async actualizarPeaje(
    id: string,
    d: {
      nombre?: string | undefined;
      lat?: number | undefined;
      lng?: number | undefined;
      valor?: number | undefined;
      activo?: boolean | undefined;
    },
    motivo: string,
    operador: Operador,
  ) {
    if ((d.lat === undefined) !== (d.lng === undefined))
      throw solicitudInvalida('Para mover el peaje hay que dar la latitud y la longitud.');
    await this.bd.db.transaction(async (tx) => {
      const [antes] = await tx.select().from(peaje).where(eq(peaje.id, id)).for('update');
      if (!antes) throw noEncontrado('PEAJE_NO_ENCONTRADO', 'No encontramos ese peaje');
      const cambios: Partial<typeof peaje.$inferInsert> = {};
      if (d.nombre !== undefined) cambios.nombre = d.nombre.trim();
      if (d.valor !== undefined) cambios.valor = d.valor;
      if (d.activo !== undefined) cambios.activo = d.activo;
      if (d.lat !== undefined && d.lng !== undefined)
        cambios.ubicacion = { lat: d.lat, lng: d.lng };
      if (Object.keys(cambios).length === 0) throw solicitudInvalida('No hay nada que cambiar.');
      try {
        await tx.update(peaje).set(cambios).where(eq(peaje.id, id));
      } catch (e) {
        if (claveUnica(e)) throw conflicto('PEAJE_REPETIDO', 'Ya hay un peaje con ese nombre.');
        throw e;
      }
      await auditar(tx, operador, {
        accion: 'peaje.cambiar',
        entidad: 'peaje',
        entidadId: id,
        antes: {
          nombre: antes.nombre,
          valor: antes.valor,
          activo: antes.activo,
          ...antes.ubicacion,
        },
        despues: cambios,
        motivo,
      });
    });
    return { id };
  }
}
