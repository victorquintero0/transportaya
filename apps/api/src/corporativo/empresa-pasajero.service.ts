import { centroCosto, empresa, politicaUso, usuario, vinculoEmpresa } from '@transportaya/db';
import {
  POLITICA_SIN_RESTRICCIONES,
  descuentoCorporativo,
  evaluarEmpresa,
  evaluarPolitica,
  fechaBogota,
  type CategoriaVehiculo,
  type PoliticaUso,
  type TipoServicio,
} from '@transportaya/dominio';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { CorporativoService } from './corporativo.service.js';

export interface EntradaViajeCorporativo {
  /** Hora del servicio: ahora, o la de la reserva. */
  instante: Date;
  categoria: CategoriaVehiculo;
  tipoServicio: TipoServicio;
  precioMaximo: number;
  centroCostoId?: string | undefined;
  motivo?: string | null | undefined;
}

export interface ResultadoCorporativo {
  permitido: boolean;
  codigo: string | null;
  detalle: string | null;
}

/**
 * El lado del empleado (PAS-60, PAS-61): ver sus invitaciones y su empresa, aceptarlas o dejarla, y comprobar —antes de
 * confirmar y otra vez al crear el viaje— que un viaje cumple la política y el contrato (RN-103, RN-104).
 */
@Injectable()
export class EmpresaPasajeroService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CorporativoService) private readonly corporativo: CorporativoService,
  ) {}

  /** El vínculo activo del pasajero con su empresa, centro y política. */
  async vinculoActivo(pasajeroId: string, db: DbOTx = this.bd.db) {
    const [f] = await db
      .select({ v: vinculoEmpresa, e: empresa, politica: politicaUso })
      .from(vinculoEmpresa)
      .innerJoin(empresa, eq(empresa.id, vinculoEmpresa.empresaId))
      .leftJoin(politicaUso, eq(politicaUso.id, vinculoEmpresa.politicaId))
      .where(and(eq(vinculoEmpresa.usuarioId, pasajeroId), eq(vinculoEmpresa.estado, 'activo')));
    return f ?? null;
  }

  private politicaDe(p: typeof politicaUso.$inferSelect | null): PoliticaUso {
    if (!p || !p.activa) return POLITICA_SIN_RESTRICCIONES;
    return {
      dias: p.dias,
      desdeMin: p.desdeMin,
      hastaMin: p.hastaMin,
      montoMaximo: p.montoMaximo,
      categorias: p.categorias,
      tiposServicio: p.tiposServicio,
      motivoObligatorio: p.motivoObligatorio,
    };
  }

  /** Su empresa (si tiene) y las invitaciones que le hicieron a su celular. */
  async mia(pasajeroId: string) {
    const [u] = await this.bd.db
      .select({ telefono: usuario.telefono })
      .from(usuario)
      .where(eq(usuario.id, pasajeroId));
    const invitaciones = u
      ? await this.bd.db
          .select({
            id: vinculoEmpresa.id,
            empresa: empresa.nombre,
            invitadoEn: vinculoEmpresa.invitadoEn,
          })
          .from(vinculoEmpresa)
          .innerJoin(empresa, eq(empresa.id, vinculoEmpresa.empresaId))
          .where(
            and(eq(vinculoEmpresa.telefono, u.telefono), eq(vinculoEmpresa.estado, 'invitado')),
          )
      : [];
    const activo = await this.vinculoActivo(pasajeroId);
    let vinculo = null;
    if (activo) {
      const exp = await this.corporativo.exposicion(activo.e.id);
      const disponible = evaluarEmpresa(
        { estado: activo.e.estado, cupo: activo.e.cupo, diasPago: activo.e.diasPago },
        {
          exposicion: exp.total,
          nuevo: 0,
          vencimientoMasAntiguo: exp.vencimientoMasAntiguo,
          hoy: fechaBogota(new Date()),
        },
      );
      const centros = await this.bd.db
        .select({ id: centroCosto.id, codigo: centroCosto.codigo, nombre: centroCosto.nombre })
        .from(centroCosto)
        .where(and(eq(centroCosto.empresaId, activo.e.id), eq(centroCosto.activo, true)))
        .orderBy(asc(centroCosto.codigo));
      const pol = this.politicaDe(activo.politica);
      vinculo = {
        id: activo.v.id,
        empresa: { id: activo.e.id, nombre: activo.e.nombre },
        centrosCosto: centros,
        centroCostoId: activo.v.centroCostoId,
        politica: {
          nombre: activo.politica?.nombre ?? null,
          motivoObligatorio: pol.motivoObligatorio,
          montoMaximo: pol.montoMaximo,
        },
        perfilDisponible: disponible.disponible,
        razon: disponible.disponible ? null : disponible.detalle,
      };
    }
    return {
      vinculo,
      invitaciones: invitaciones.map((i) => ({ ...i, invitadoEn: i.invitadoEn.toISOString() })),
    };
  }

  private async invitacionDe(tx: DbOTx, pasajeroId: string, id: string) {
    const [u] = await tx
      .select({ telefono: usuario.telefono })
      .from(usuario)
      .where(eq(usuario.id, pasajeroId));
    const [inv] = await tx
      .select()
      .from(vinculoEmpresa)
      .where(
        and(
          eq(vinculoEmpresa.id, id),
          eq(vinculoEmpresa.telefono, u?.telefono ?? ''),
          eq(vinculoEmpresa.estado, 'invitado'),
        ),
      )
      .for('update');
    if (!inv) throw noEncontrado('INVITACION_NO_ENCONTRADA', 'No encontramos esa invitación.');
    return inv;
  }

  async aceptar(pasajeroId: string, id: string) {
    await this.bd.db.transaction(async (tx) => {
      const inv = await this.invitacionDe(tx, pasajeroId, id);
      const [otra] = await tx
        .select({ id: vinculoEmpresa.id })
        .from(vinculoEmpresa)
        .where(and(eq(vinculoEmpresa.usuarioId, pasajeroId), eq(vinculoEmpresa.estado, 'activo')));
      if (otra)
        throw conflicto(
          'YA_TIENE_EMPRESA',
          'Ya estás vinculado a una empresa. Sal de ella antes de aceptar otra invitación.',
        );
      await tx
        .update(vinculoEmpresa)
        .set({ estado: 'activo', usuarioId: pasajeroId, aceptadoEn: new Date() })
        .where(eq(vinculoEmpresa.id, inv.id));
    });
  }

  async rechazar(pasajeroId: string, id: string) {
    await this.bd.db.transaction(async (tx) => {
      const inv = await this.invitacionDe(tx, pasajeroId, id);
      await tx
        .update(vinculoEmpresa)
        .set({ estado: 'retirado', retiradoEn: new Date() })
        .where(eq(vinculoEmpresa.id, inv.id));
    });
  }

  /** Deja la empresa. Los viajes ya hechos siguen cargados a ella. */
  async salir(pasajeroId: string) {
    const r = await this.bd.db
      .update(vinculoEmpresa)
      .set({ estado: 'retirado', retiradoEn: new Date() })
      .where(and(eq(vinculoEmpresa.usuarioId, pasajeroId), eq(vinculoEmpresa.estado, 'activo')))
      .returning({ id: vinculoEmpresa.id });
    if (r.length === 0) throw noEncontrado('SIN_EMPRESA', 'No estás vinculado a ninguna empresa.');
  }

  /**
   * Para la pantalla de cotizar: por cada opción, si se puede cargar a la empresa y por qué no. `null` si la persona no
   * pertenece a ninguna empresa (la app no muestra la opción corporativa).
   */
  async evaluarOpciones(
    pasajeroId: string,
    contexto: { instante: Date; tipoServicio: TipoServicio },
    opciones: { id: string; categoria: CategoriaVehiculo; precioMaximo: number }[],
  ): Promise<Map<string, ResultadoCorporativo> | null> {
    const activo = await this.vinculoActivo(pasajeroId);
    if (!activo) return null;
    const exp = await this.corporativo.exposicion(activo.e.id);
    const politica = this.politicaDe(activo.politica);
    const hoy = fechaBogota(new Date());
    const resultado = new Map<string, ResultadoCorporativo>();
    for (const o of opciones) {
      const nuevo = o.precioMaximo - descuentoCorporativo(o.precioMaximo, activo.e.descuentoPb);
      const emp = evaluarEmpresa(
        { estado: activo.e.estado, cupo: activo.e.cupo, diasPago: activo.e.diasPago },
        { exposicion: exp.total, nuevo, vencimientoMasAntiguo: exp.vencimientoMasAntiguo, hoy },
      );
      if (!emp.disponible) {
        resultado.set(o.id, { permitido: false, codigo: emp.codigo, detalle: emp.detalle });
        continue;
      }
      // El motivo se pide después de elegir: aquí solo se mira lo que ya se sabe del viaje.
      const pol = evaluarPolitica(
        { ...politica, motivoObligatorio: false },
        { ...contexto, categoria: o.categoria, precioMaximo: o.precioMaximo },
      );
      resultado.set(
        o.id,
        pol.permitido
          ? { permitido: true, codigo: null, detalle: null }
          : { permitido: false, codigo: pol.codigo, detalle: pol.detalle },
      );
    }
    return resultado;
  }

  /**
   * Autoriza el viaje corporativo dentro de la transacción que lo crea. Bloquea a la empresa mientras decide para que
   * dos empleados no pasen del cupo a la vez.
   */
  async autorizar(tx: DbOTx, pasajeroId: string, e: EntradaViajeCorporativo) {
    const activo = await this.vinculoActivo(pasajeroId, tx);
    if (!activo)
      throw conflicto('SIN_EMPRESA', 'Tu perfil corporativo no está activo. Viaja como persona.');
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`empresa:${activo.e.id}`}))`);
    const exp = await this.corporativo.exposicion(activo.e.id, tx);
    const nuevo = e.precioMaximo - descuentoCorporativo(e.precioMaximo, activo.e.descuentoPb);
    const emp = evaluarEmpresa(
      { estado: activo.e.estado, cupo: activo.e.cupo, diasPago: activo.e.diasPago },
      {
        exposicion: exp.total,
        nuevo,
        vencimientoMasAntiguo: exp.vencimientoMasAntiguo,
        hoy: fechaBogota(new Date()),
      },
    );
    if (!emp.disponible) throw conflicto(emp.codigo, emp.detalle);
    const pol = evaluarPolitica(this.politicaDe(activo.politica), e);
    if (!pol.permitido) throw conflicto(pol.codigo, pol.detalle);

    const centroId = e.centroCostoId ?? activo.v.centroCostoId;
    if (!centroId) throw conflicto('CENTRO_REQUERIDO', 'Elige el centro de costo del viaje.');
    const [centro] = await tx
      .select({ id: centroCosto.id })
      .from(centroCosto)
      .where(
        and(
          eq(centroCosto.id, centroId),
          eq(centroCosto.empresaId, activo.e.id),
          eq(centroCosto.activo, true),
        ),
      );
    if (!centro)
      throw conflicto('CENTRO_INVALIDO', 'Ese centro de costo no existe o ya no está activo.');
    return {
      empresaId: activo.e.id,
      vinculoEmpresaId: activo.v.id,
      centroCostoId: centro.id,
      motivo: e.motivo?.trim() || null,
    };
  }
}
