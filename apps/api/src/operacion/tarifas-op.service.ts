import { Inject, Injectable } from '@nestjs/common';
import {
  ciudad,
  dinamicaZona,
  festivo,
  rutaFija,
  tarifa,
  tarifaRecargo,
  usuario,
  zona,
} from '@transportaya/db';
import {
  calcularTarifaUrbana,
  fechaBogota,
  recargoHorario,
  type Recargo,
} from '@transportaya/dominio';
import { and, asc, desc, eq, gt, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { type Operador, auditar } from './auditoria.js';
import { comodines } from './comun.js';

export interface RecargoEntrada {
  codigo: string;
  nombre: string;
  tipo: 'fijo' | 'porcentaje';
  valor: number;
  categoria?: 'media' | 'media_alta' | 'alta' | undefined;
  activo?: boolean | undefined;
}

export interface VersionTarifaEntrada {
  base: number;
  valorKm: number;
  valorMinuto: number;
  minima: number;
  cancelacion: number;
  esperaMinuto: number;
  esperaMinutosGratis: number;
  fuente?: string | undefined;
  vigenteDesde?: Date | undefined;
  recargos: RecargoEntrada[];
  motivo: string;
}

@Injectable()
export class TarifasOperacionService {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  private async ciudadActiva(): Promise<string> {
    const [c] = await this.bd.db
      .select({ id: ciudad.id })
      .from(ciudad)
      .where(eq(ciudad.activa, true))
      .limit(1);
    if (!c) throw conflicto('SIN_CIUDAD', 'Todavía no hay una ciudad activa.');
    return c.id;
  }

  async listar() {
    const ciudadId = await this.ciudadActiva();
    const versiones = await this.bd.db
      .select()
      .from(tarifa)
      .where(and(eq(tarifa.ciudadId, ciudadId), eq(tarifa.tipoServicio, 'inmediato')))
      .orderBy(desc(tarifa.version));
    const recargos = await this.bd.db.select().from(tarifaRecargo);
    const ahora = Date.now();
    return versiones.map((t) => {
      const desde = t.vigenteDesde.getTime();
      const hasta = t.vigenteHasta?.getTime() ?? null;
      const estado =
        desde > ahora ? 'programada' : hasta !== null && hasta <= ahora ? 'historica' : 'vigente';
      return {
        id: t.id,
        version: t.version,
        estado,
        base: t.base,
        valorKm: t.valorKm,
        valorMinuto: t.valorMinuto,
        minima: t.minima,
        cancelacion: t.cancelacion,
        esperaMinuto: t.esperaMinuto,
        esperaMinutosGratis: t.esperaMinutosGratis,
        fuente: t.fuente,
        vigenteDesde: t.vigenteDesde.toISOString(),
        vigenteHasta: t.vigenteHasta?.toISOString() ?? null,
        recargos: recargos
          .filter((r) => r.tarifaId === t.id)
          .map((r) => ({
            id: r.id,
            codigo: r.codigo,
            nombre: r.nombre,
            tipo: r.tipo,
            valor: r.valor,
            categoria: r.categoria,
            activo: r.activo,
          })),
      };
    });
  }

  /** Cada cambio es una versión nueva (RN-014): la anterior se cierra donde empieza la nueva. */
  async crearVersion(d: VersionTarifaEntrada, operador: Operador) {
    const ciudadId = await this.ciudadActiva();
    const desde = d.vigenteDesde ?? new Date();
    if (desde.getTime() < Date.now() - 60_000)
      throw solicitudInvalida('La vigencia no puede estar en el pasado.');
    return this.bd.db.transaction(async (tx) => {
      const [ultima] = await tx
        .select()
        .from(tarifa)
        .where(and(eq(tarifa.ciudadId, ciudadId), eq(tarifa.tipoServicio, 'inmediato')))
        .orderBy(desc(tarifa.version))
        .limit(1)
        .for('update');
      if (ultima && desde.getTime() <= ultima.vigenteDesde.getTime())
        throw conflicto(
          'VIGENCIA_INVALIDA',
          'La nueva versión debe empezar después de la última versión.',
        );
      if (
        ultima &&
        (ultima.vigenteHasta === null || ultima.vigenteHasta.getTime() > desde.getTime())
      ) {
        await tx.update(tarifa).set({ vigenteHasta: desde }).where(eq(tarifa.id, ultima.id));
      }
      const [nueva] = await tx
        .insert(tarifa)
        .values({
          ciudadId,
          tipoServicio: 'inmediato',
          version: (ultima?.version ?? 0) + 1,
          base: d.base,
          valorKm: d.valorKm,
          valorMinuto: d.valorMinuto,
          minima: d.minima,
          cancelacion: d.cancelacion,
          esperaMinuto: d.esperaMinuto,
          esperaMinutosGratis: d.esperaMinutosGratis,
          fuente: d.fuente ?? null,
          vigenteDesde: desde,
          creadoPor: operador.id,
        })
        .returning({ id: tarifa.id, version: tarifa.version });
      if (d.recargos.length)
        await tx.insert(tarifaRecargo).values(
          d.recargos.map((r) => ({
            tarifaId: nueva!.id,
            codigo: r.codigo,
            nombre: r.nombre,
            tipo: r.tipo,
            valor: r.valor,
            categoria: r.categoria ?? null,
            activo: r.activo ?? true,
          })),
        );
      await auditar(tx, operador, {
        accion: 'tarifa.crear_version',
        entidad: 'tarifa',
        entidadId: nueva!.id,
        antes: ultima
          ? {
              version: ultima.version,
              base: ultima.base,
              valorKm: ultima.valorKm,
              valorMinuto: ultima.valorMinuto,
              minima: ultima.minima,
            }
          : null,
        despues: {
          version: nueva!.version,
          base: d.base,
          valorKm: d.valorKm,
          valorMinuto: d.valorMinuto,
          minima: d.minima,
          vigenteDesde: desde.toISOString(),
        },
        motivo: d.motivo,
      });
      return { id: nueva!.id, version: nueva!.version };
    });
  }

  /**
   * Simulador de precio (OPE-06): la misma lógica de la cotización, con la versión de tarifa que se elija (la vigente o
   * una programada) para ver el precio antes de publicar.
   */
  async simular(d: {
    tarifaId?: string | undefined;
    categoria: 'media' | 'media_alta' | 'alta';
    distanciaKm: number;
    tiempoDetenidoMin: number;
    instante?: Date | undefined;
    aeropuerto?: boolean | undefined;
    extras?: string[] | undefined;
    multiplicador?: number | undefined;
    peajes?: number | undefined;
  }) {
    const ciudadId = await this.ciudadActiva();
    const instante = d.instante ?? new Date();
    const [t] = d.tarifaId
      ? await this.bd.db.select().from(tarifa).where(eq(tarifa.id, d.tarifaId))
      : await this.bd.db
          .select()
          .from(tarifa)
          .where(
            and(
              eq(tarifa.ciudadId, ciudadId),
              eq(tarifa.tipoServicio, 'inmediato'),
              lte(tarifa.vigenteDesde, instante),
              or(isNull(tarifa.vigenteHasta), gt(tarifa.vigenteHasta, instante)),
            ),
          )
          .orderBy(desc(tarifa.version))
          .limit(1);
    if (!t) throw noEncontrado('SIN_TARIFA', 'No hay una tarifa vigente para esa fecha.');
    const filas = await this.bd.db
      .select()
      .from(tarifaRecargo)
      .where(and(eq(tarifaRecargo.tarifaId, t.id), eq(tarifaRecargo.activo, true)));
    const [esFestivo] = await this.bd.db
      .select({ f: festivo.fecha })
      .from(festivo)
      .where(eq(festivo.fecha, fechaBogota(instante)));
    const aRecargo = (f: (typeof filas)[number]): Recargo =>
      f.tipo === 'fijo'
        ? { nombre: f.codigo, tipo: 'fijo', valor: f.valor }
        : { nombre: f.codigo, tipo: 'porcentaje', puntosBasicos: f.valor };
    const general = (codigo: string) =>
      filas.find((f) => f.codigo === codigo && f.categoria === null);
    const aplicados: Recargo[] = [];
    const horario = recargoHorario(instante, !!esFestivo);
    for (const f of [
      horario ? general(horario) : undefined,
      general('puerta_a_puerta'),
      filas.find((f) => f.codigo === 'categoria' && f.categoria === d.categoria),
      d.aeropuerto ? general('aeropuerto') : undefined,
      ...(d.extras ?? []).map((c) => general(c)),
    ])
      if (f) aplicados.push(aRecargo(f));

    const desglose = calcularTarifaUrbana({
      parametros: {
        base: t.base,
        valorKm: t.valorKm,
        valorMinuto: t.valorMinuto,
        minima: t.minima,
      },
      distanciaM: d.distanciaKm * 1000,
      tiempoCobrableS: d.tiempoDetenidoMin * 60,
      multiplicadorDinamico: d.multiplicador ?? 1,
      recargos: aplicados,
      peajes: d.peajes ?? 0,
    });
    return {
      tarifa: { id: t.id, version: t.version },
      instante: instante.toISOString(),
      festivo: !!esFestivo,
      recargosAplicados: aplicados.map((r) => r.nombre),
      desglose,
    };
  }

  // ── Festivos ───────────────────────────────────────────────────────────────
  festivos(anio: number) {
    return this.bd.db
      .select()
      .from(festivo)
      .where(sql`extract(year from ${festivo.fecha}) = ${anio}`)
      .orderBy(festivo.fecha);
  }

  async agregarFestivo(fecha: string, nombre: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const r = await tx
        .insert(festivo)
        .values({ fecha, nombre })
        .onConflictDoNothing()
        .returning({ f: festivo.fecha });
      if (r.length === 0) throw conflicto('FESTIVO_EXISTE', 'Ese día ya está en el calendario.');
      await auditar(tx, operador, {
        accion: 'festivo.agregar',
        entidad: 'festivo',
        despues: { fecha, nombre },
      });
    });
  }

  async quitarFestivo(fecha: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const r = await tx
        .delete(festivo)
        .where(eq(festivo.fecha, fecha))
        .returning({ nombre: festivo.nombre });
      if (r.length === 0)
        throw noEncontrado('FESTIVO_NO_ENCONTRADO', 'Ese día no está en el calendario.');
      await auditar(tx, operador, {
        accion: 'festivo.quitar',
        entidad: 'festivo',
        antes: { fecha, nombre: r[0]!.nombre },
      });
    });
  }

  // ── Rutas con tarifa fija ──────────────────────────────────────────────────
  async rutas(f: {
    q?: string | undefined;
    activa?: boolean | undefined;
    limite: number;
    desplazar: number;
  }) {
    const donde = and(
      isNull(rutaFija.vigenteHasta),
      f.q ? ilike(rutaFija.destino, comodines(f.q)) : undefined,
      f.activa === undefined ? undefined : eq(rutaFija.activa, f.activa),
    );
    const filas = await this.bd.db
      .select()
      .from(rutaFija)
      .where(donde)
      .orderBy(asc(rutaFija.destino), asc(rutaFija.modalidad))
      .limit(f.limite)
      .offset(f.desplazar);
    const [t] = await this.bd.db
      .select({ total: sql<number>`count(*)::int` })
      .from(rutaFija)
      .where(donde);
    return {
      total: t?.total ?? 0,
      items: filas.map((r) => ({
        id: r.id,
        destino: r.destino,
        modalidad: r.modalidad,
        tarifa: r.tarifa,
        activa: r.activa,
        vigenteDesde: r.vigenteDesde,
        fuente: r.fuente,
        conUbicacion: r.destinoUbicacion !== null,
      })),
    };
  }

  /** Cambiar el valor de una ruta crea una vigencia nueva; activar o desactivar se hace sobre la misma. */
  async actualizarRuta(
    id: string,
    d: { tarifa?: number | undefined; activa?: boolean | undefined; motivo: string },
    operador: Operador,
  ) {
    await this.bd.db.transaction(async (tx) => {
      const [r] = await tx.select().from(rutaFija).where(eq(rutaFija.id, id)).for('update');
      if (!r || r.vigenteHasta)
        throw noEncontrado('RUTA_NO_ENCONTRADA', 'No encontramos esa ruta vigente.');
      const hoy = fechaBogota(new Date());
      let nuevaId = id;
      if (d.tarifa !== undefined && d.tarifa !== r.tarifa) {
        if (r.vigenteDesde >= hoy) {
          await tx.update(rutaFija).set({ tarifa: d.tarifa }).where(eq(rutaFija.id, id));
        } else {
          await tx.update(rutaFija).set({ vigenteHasta: hoy }).where(eq(rutaFija.id, id));
          const [n] = await tx
            .insert(rutaFija)
            .values({
              ciudadOrigenId: r.ciudadOrigenId,
              destino: r.destino,
              modalidad: r.modalidad,
              tarifa: d.tarifa,
              destinoUbicacion: r.destinoUbicacion,
              fuente: r.fuente,
              vigenteDesde: hoy,
              activa: d.activa ?? r.activa,
            })
            .returning({ id: rutaFija.id });
          nuevaId = n!.id;
        }
      }
      if (d.activa !== undefined)
        await tx.update(rutaFija).set({ activa: d.activa }).where(eq(rutaFija.id, nuevaId));
      await auditar(tx, operador, {
        accion: 'ruta_fija.actualizar',
        entidad: 'ruta_fija',
        entidadId: nuevaId,
        antes: { destino: r.destino, tarifa: r.tarifa, activa: r.activa },
        despues: { tarifa: d.tarifa ?? r.tarifa, activa: d.activa ?? r.activa },
        motivo: d.motivo,
      });
    });
  }

  // ── Zonas ──────────────────────────────────────────────────────────────────
  async zonas() {
    const r = await this.bd.db.execute<{
      id: string;
      nombre: string;
      tipo: string;
      activa: boolean;
      geojson: string;
    }>(
      sql`select id, nombre, tipo::text, activa, ST_AsGeoJSON(poligono::geometry) as geojson from zona order by nombre`,
    );
    return r.rows.map((z) => ({
      ...z,
      poligono: JSON.parse(z.geojson) as unknown,
      geojson: undefined,
    }));
  }

  async crearZona(
    d: { nombre: string; tipo: string; anillo: [number, number][]; motivo: string },
    operador: Operador,
  ) {
    const ciudadId = await this.ciudadActiva();
    const cerrado = [...d.anillo];
    const a = cerrado[0]!;
    const b = cerrado[cerrado.length - 1]!;
    if (a[0] !== b[0] || a[1] !== b[1]) cerrado.push(a);
    if (cerrado.length < 4) throw solicitudInvalida('Una zona necesita al menos tres puntos.');
    const geo = JSON.stringify({ type: 'Polygon', coordinates: [cerrado] });
    return this.bd.db.transaction(async (tx) => {
      const r = await tx.execute<{ id: string; valida: boolean }>(sql`
        insert into zona (ciudad_id, tipo, nombre, poligono)
        select ${ciudadId}, ${d.tipo}::tipo_zona, ${d.nombre}, g::geography
        from (select ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326) g) q
        where ST_IsValid(g)
        returning id, true as valida`);
      const fila = r.rows[0];
      if (!fila)
        throw solicitudInvalida('El polígono no es válido: revisa que no se cruce consigo mismo.');
      await auditar(tx, operador, {
        accion: 'zona.crear',
        entidad: 'zona',
        entidadId: fila.id,
        despues: { nombre: d.nombre, tipo: d.tipo, puntos: d.anillo.length },
        motivo: d.motivo,
      });
      return { id: fila.id };
    });
  }

  async actualizarZona(id: string, d: { activa: boolean; motivo: string }, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [z] = await tx
        .select({ activa: zona.activa, nombre: zona.nombre })
        .from(zona)
        .where(eq(zona.id, id));
      if (!z) throw noEncontrado('ZONA_NO_ENCONTRADA', 'No encontramos esa zona');
      await tx.update(zona).set({ activa: d.activa }).where(eq(zona.id, id));
      await auditar(tx, operador, {
        accion: 'zona.actualizar',
        entidad: 'zona',
        entidadId: id,
        antes: { activa: z.activa },
        despues: { activa: d.activa, nombre: z.nombre },
        motivo: d.motivo,
      });
    });
  }

  // ── Dinámica manual por zona ───────────────────────────────────────────────
  async dinamica() {
    const filas = await this.bd.db
      .select({
        id: dinamicaZona.id,
        zonaId: dinamicaZona.zonaId,
        zona: zona.nombre,
        multiplicador: dinamicaZona.multiplicador,
        desde: dinamicaZona.desde,
        hasta: dinamicaZona.hasta,
        motivo: dinamicaZona.motivo,
        creadoPor: usuario.nombre,
      })
      .from(dinamicaZona)
      .innerJoin(zona, eq(zona.id, dinamicaZona.zonaId))
      .innerJoin(usuario, eq(usuario.id, dinamicaZona.creadoPor))
      .where(gt(dinamicaZona.hasta, sql`now() - interval '2 days'`))
      .orderBy(desc(dinamicaZona.desde));
    const ahora = Date.now();
    return filas.map((f) => ({
      ...f,
      estado:
        f.desde.getTime() > ahora
          ? 'programada'
          : f.hasta.getTime() <= ahora
            ? 'terminada'
            : 'activa',
      desde: f.desde.toISOString(),
      hasta: f.hasta.toISOString(),
    }));
  }

  async activarDinamica(
    d: {
      zonaId: string;
      multiplicador: number;
      desde?: Date | undefined;
      hasta: Date;
      motivo: string;
    },
    operador: Operador,
  ) {
    const desde = d.desde ?? new Date();
    if (d.hasta.getTime() <= desde.getTime())
      throw solicitudInvalida('El fin debe ser posterior al inicio.');
    if (d.hasta.getTime() - desde.getTime() > 12 * 3_600_000)
      throw solicitudInvalida(
        'La dinámica manual dura como máximo 12 horas. Renuévala si hace falta.',
      );
    return this.bd.db.transaction(async (tx) => {
      const [z] = await tx
        .select({ nombre: zona.nombre, activa: zona.activa })
        .from(zona)
        .where(eq(zona.id, d.zonaId));
      if (!z || !z.activa)
        throw noEncontrado('ZONA_NO_ENCONTRADA', 'No encontramos esa zona activa.');
      const [f] = await tx
        .insert(dinamicaZona)
        .values({
          zonaId: d.zonaId,
          multiplicador: d.multiplicador,
          desde,
          hasta: d.hasta,
          motivo: d.motivo,
          creadoPor: operador.id,
        })
        .returning({ id: dinamicaZona.id });
      await auditar(tx, operador, {
        accion: 'dinamica.activar',
        entidad: 'dinamica_zona',
        entidadId: f!.id,
        despues: {
          zona: z.nombre,
          multiplicador: d.multiplicador,
          desde: desde.toISOString(),
          hasta: d.hasta.toISOString(),
        },
        motivo: d.motivo,
      });
      return { id: f!.id };
    });
  }

  /** Desactivar: si ya empezó, termina ahora; si aún no empieza, se retira. */
  async desactivarDinamica(id: string, motivo: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [f] = await tx.select().from(dinamicaZona).where(eq(dinamicaZona.id, id)).for('update');
      if (!f) throw noEncontrado('DINAMICA_NO_ENCONTRADA', 'No encontramos esa dinámica');
      const ahora = new Date();
      if (f.hasta <= ahora) throw conflicto('YA_TERMINO', 'Esa dinámica ya terminó.');
      if (f.desde > ahora) await tx.delete(dinamicaZona).where(eq(dinamicaZona.id, id));
      else await tx.update(dinamicaZona).set({ hasta: ahora }).where(eq(dinamicaZona.id, id));
      await auditar(tx, operador, {
        accion: 'dinamica.desactivar',
        entidad: 'dinamica_zona',
        entidadId: id,
        antes: {
          multiplicador: f.multiplicador,
          desde: f.desde.toISOString(),
          hasta: f.hasta.toISOString(),
        },
        motivo,
      });
    });
  }
}
