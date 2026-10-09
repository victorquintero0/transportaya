import { randomBytes } from 'node:crypto';
import {
  centroCosto,
  empleado,
  empresa,
  estadoCuenta,
  politicaUso,
  usuario,
  usuarioRol,
  viaje,
  vinculoEmpresa,
} from '@transportaya/db';
import {
  DIAS_PAGO_POR_DEFECTO,
  cicloCerrado,
  cicloDe,
  descuentoCorporativo,
  diasDeMora,
  estadoDeCuenta,
  fechaBogota,
  vencimientoDe,
  type PoliticaUso,
} from '@transportaya/dominio';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { CONFIG, type Configuracion } from '../config.js';
import { type Operador, auditar } from '../operacion/auditoria.js';
import { AuthOperacionService } from '../operacion/auth-op.service.js';
import { EmpleadosService } from '../operacion/empleados.service.js';

export interface DatosContrato {
  nombre?: string | undefined;
  contactoNombre?: string | undefined;
  contactoTelefono?: string | null | undefined;
  contactoEmail?: string | null | undefined;
  descuentoPb?: number | undefined;
  aplicaDinamica?: boolean | undefined;
  cupo?: number | null | undefined;
  diaCorte?: number | undefined;
  diasPago?: number | undefined;
}

export interface DatosPolitica {
  nombre: string;
  dias: number[];
  desdeMin: number;
  hastaMin: number;
  montoMaximo: number | null;
  categorias: PoliticaUso['categorias'][number][];
  tiposServicio: PoliticaUso['tiposServicio'][number][];
  motivoObligatorio: boolean;
}

/**
 * Lo que debe una empresa y lo que le queda de cupo: estados de cuenta sin pagar más los viajes ya hechos (o
 * reservados) que todavía no están en ninguno (RN-104).
 */
export interface Exposicion {
  porPagar: number;
  sinFacturar: number;
  total: number;
  vencimientoMasAntiguo: string | null;
}

/**
 * Clientes corporativos (OPE-10): contrato, centros de costo, políticas, empleados y estados de cuenta. Todo método
 * recibe la empresa explícitamente y verifica que cada registro le pertenezca: el administrador externo nunca elige la
 * empresa, la API la lee de su cuenta (aislamiento, D-09).
 */
@Injectable()
export class CorporativoService implements OnApplicationBootstrap {
  private readonly log = new Logger('Corporativo');

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(EmpleadosService) private readonly empleados: EmpleadosService,
    @Inject(AuthOperacionService) private readonly authOp: AuthOperacionService,
    @Inject(CONFIG) private readonly config: Configuracion,
  ) {}

  /** Con el simulador y sin ninguna empresa, se crea una de demostración con su administrador. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.SIMULADOR) return;
    const [{ n } = { n: 0 }] = await this.bd.db
      .select({ n: sql<number>`count(*)::int` })
      .from(empresa);
    if (n > 0) return;
    const [e] = await this.bd.db
      .insert(empresa)
      .values({
        nombre: 'Constructora Andina S.A.S. (demostración)',
        nit: '900123456-7',
        contactoNombre: 'Elena Empresaria',
        contactoEmail: 'empresa@transporteya.demo',
        descuentoPb: 500,
        aplicaDinamica: false,
        cupo: 2_000_000,
        diaCorte: 1,
        diasPago: 15,
      })
      .returning({ id: empresa.id });
    await this.bd.db
      .insert(centroCosto)
      .values({ empresaId: e!.id, codigo: 'GENERAL', nombre: 'General' });
    await this.bd.db.insert(politicaUso).values({ empresaId: e!.id, nombre: 'General' });
    await this.authOp.crearCuentaDemoEmpresa(e!.id);
    this.log.warn('Empresa de demostración creada (SIMULADOR).');
  }

  // ───────────────────────────────────────────────────────────── empresas

  /** La empresa a la que pertenece el administrador externo que hace la petición. */
  async empresaDelAdministrador(usuarioId: string): Promise<string> {
    const [fila] = await this.bd.db
      .select({ empresaId: empleado.empresaId })
      .from(empleado)
      .where(eq(empleado.usuarioId, usuarioId));
    if (!fila?.empresaId)
      throw noEncontrado('EMPRESA_NO_ENCONTRADA', 'Tu cuenta no está ligada a ninguna empresa.');
    return fila.empresaId;
  }

  private async cargar(empresaId: string, db: DbOTx = this.bd.db) {
    const [e] = await db.select().from(empresa).where(eq(empresa.id, empresaId));
    if (!e) throw noEncontrado('EMPRESA_NO_ENCONTRADA', 'No encontramos esa empresa.');
    return e;
  }

  async listarEmpresas() {
    const filas = await this.bd.db.select().from(empresa).orderBy(asc(empresa.nombre));
    const resultado = [];
    for (const e of filas) {
      const exp = await this.exposicion(e.id);
      const [{ n } = { n: 0 }] = await this.bd.db
        .select({ n: sql<number>`count(*)::int` })
        .from(vinculoEmpresa)
        .where(and(eq(vinculoEmpresa.empresaId, e.id), eq(vinculoEmpresa.estado, 'activo')));
      resultado.push({ ...this.vista(e), empleadosActivos: n, ...exp });
    }
    return resultado;
  }

  private vista(e: typeof empresa.$inferSelect) {
    return {
      id: e.id,
      nombre: e.nombre,
      nit: e.nit,
      contactoNombre: e.contactoNombre,
      contactoTelefono: e.contactoTelefono,
      contactoEmail: e.contactoEmail,
      estado: e.estado,
      motivoSuspension: e.motivoSuspension,
      descuentoPb: e.descuentoPb,
      aplicaDinamica: e.aplicaDinamica,
      cupo: e.cupo,
      diaCorte: e.diaCorte,
      diasPago: e.diasPago,
      creadaEn: e.creadoEn.toISOString(),
    };
  }

  /** Detalle de la empresa con su consumo frente al cupo y el ciclo vigente. */
  async detalle(empresaId: string) {
    const e = await this.cargar(empresaId);
    const hoy = fechaBogota(new Date());
    const exp = await this.exposicion(empresaId);
    const [{ n } = { n: 0 }] = await this.bd.db
      .select({ n: sql<number>`count(*)::int` })
      .from(vinculoEmpresa)
      .where(and(eq(vinculoEmpresa.empresaId, empresaId), eq(vinculoEmpresa.estado, 'activo')));
    const ciclo = cicloDe(e.diaCorte, hoy);
    return {
      ...this.vista(e),
      ...exp,
      empleadosActivos: n,
      cicloVigente: ciclo,
      disponible: e.cupo === null ? null : Math.max(0, e.cupo - exp.total),
      enMora: exp.vencimientoMasAntiguo !== null && exp.vencimientoMasAntiguo < hoy,
    };
  }

  async crearEmpresa(
    d: DatosContrato & { nombre: string; nit: string; contactoNombre: string },
    operador: Operador,
  ) {
    const nit = d.nit.replace(/\s/g, '');
    return this.bd.db.transaction(async (tx) => {
      const [existe] = await tx
        .select({ id: empresa.id })
        .from(empresa)
        .where(eq(empresa.nit, nit));
      if (existe) throw conflicto('NIT_EN_USO', 'Ya hay una empresa con ese NIT.');
      const [e] = await tx
        .insert(empresa)
        .values({
          nombre: d.nombre,
          nit,
          contactoNombre: d.contactoNombre,
          contactoTelefono: d.contactoTelefono ?? null,
          contactoEmail: d.contactoEmail ?? null,
          descuentoPb: d.descuentoPb ?? 0,
          aplicaDinamica: d.aplicaDinamica ?? false,
          cupo: d.cupo ?? null,
          diaCorte: d.diaCorte ?? 1,
          diasPago: d.diasPago ?? DIAS_PAGO_POR_DEFECTO,
        })
        .returning();
      // Toda empresa arranca con un centro de costo y una política sin restricciones, para poder empezar a usarla.
      await tx
        .insert(centroCosto)
        .values({ empresaId: e!.id, codigo: 'GENERAL', nombre: 'General' });
      await tx.insert(politicaUso).values({ empresaId: e!.id, nombre: 'General' });
      await auditar(tx, operador, {
        accion: 'empresa.crear',
        entidad: 'empresa',
        entidadId: e!.id,
        despues: this.vista(e!),
      });
      return this.vista(e!);
    });
  }

  async actualizarContrato(
    empresaId: string,
    d: DatosContrato,
    motivo: string,
    operador: Operador,
  ) {
    return this.bd.db.transaction(async (tx) => {
      const antes = await this.cargar(empresaId, tx);
      const cambios: Partial<typeof empresa.$inferInsert> = {};
      for (const k of [
        'nombre',
        'contactoNombre',
        'contactoTelefono',
        'contactoEmail',
        'descuentoPb',
        'aplicaDinamica',
        'cupo',
        'diaCorte',
        'diasPago',
      ] as const) {
        if (d[k] !== undefined) (cambios as Record<string, unknown>)[k] = d[k];
      }
      if (Object.keys(cambios).length === 0) throw solicitudInvalida('No hay nada que cambiar.');
      const [despues] = await tx
        .update(empresa)
        .set(cambios)
        .where(eq(empresa.id, empresaId))
        .returning();
      await auditar(tx, operador, {
        accion: 'empresa.contrato',
        entidad: 'empresa',
        entidadId: empresaId,
        antes: this.vista(antes),
        despues: this.vista(despues!),
        motivo,
      });
      return this.vista(despues!);
    });
  }

  async cambiarEstado(
    empresaId: string,
    estado: 'activa' | 'suspendida',
    motivo: string,
    operador: Operador,
  ) {
    await this.bd.db.transaction(async (tx) => {
      const antes = await this.cargar(empresaId, tx);
      if (antes.estado === estado)
        throw conflicto(
          'SIN_CAMBIO',
          `La empresa ya está ${estado === 'activa' ? 'activa' : 'suspendida'}.`,
        );
      await tx
        .update(empresa)
        .set({ estado, motivoSuspension: estado === 'suspendida' ? motivo : null })
        .where(eq(empresa.id, empresaId));
      await auditar(tx, operador, {
        accion: estado === 'suspendida' ? 'empresa.suspender' : 'empresa.reactivar',
        entidad: 'empresa',
        entidadId: empresaId,
        antes: { estado: antes.estado },
        despues: { estado },
        motivo,
      });
    });
  }

  /** Crea la cuenta del administrador corporativo (rol externo). Devuelve la contraseña temporal una sola vez. */
  async crearAdministrador(
    empresaId: string,
    d: { nombre: string; telefono: string; email: string },
    operador: Operador,
  ) {
    await this.cargar(empresaId);
    const contrasena = `Tmp-${randomBytes(6).toString('base64url')}9!`;
    const id = await this.empleados.crear(
      { ...d, contrasena, roles: ['empresa'], empresaId },
      operador,
    );
    return { id, email: d.email.trim().toLowerCase(), contrasenaTemporal: contrasena };
  }

  /** Comprueba que la cuenta sea de un administrador de esa empresa (y no de otra ni del personal). */
  async verificarAdministrador(empresaId: string, usuarioId: string): Promise<void> {
    const [f] = await this.bd.db
      .select({ id: empleado.usuarioId })
      .from(empleado)
      .where(and(eq(empleado.usuarioId, usuarioId), eq(empleado.empresaId, empresaId)));
    if (!f)
      throw noEncontrado('ADMINISTRADOR_NO_ENCONTRADO', 'No encontramos a ese administrador.');
  }

  async listarAdministradores(empresaId: string) {
    return this.bd.db
      .select({
        id: empleado.usuarioId,
        nombre: usuario.nombre,
        email: empleado.email,
        telefono: usuario.telefono,
        activo: empleado.activo,
      })
      .from(empleado)
      .innerJoin(usuario, eq(usuario.id, empleado.usuarioId))
      .innerJoin(usuarioRol, eq(usuarioRol.usuarioId, empleado.usuarioId))
      .where(and(eq(empleado.empresaId, empresaId), eq(usuarioRol.rol, 'empresa')))
      .orderBy(asc(usuario.nombre));
  }

  // ───────────────────────────────────────────────────────────── consumo y cupo

  /** RN-104: lo que la empresa ya debe o tiene en camino. */
  async exposicion(empresaId: string, db: DbOTx = this.bd.db): Promise<Exposicion> {
    const [cuentas] = await db
      .select({
        total: sql<number>`coalesce(sum(${estadoCuenta.total}), 0)::bigint`,
        vence: sql<string | null>`min(${estadoCuenta.venceEn})::text`,
      })
      .from(estadoCuenta)
      .where(and(eq(estadoCuenta.empresaId, empresaId), eq(estadoCuenta.estado, 'emitido')));
    const [abiertos] = await db
      .select({
        // Cobrados o cancelados con costo: lo real. En curso o reservados: el máximo estimado menos el descuento.
        total: sql<number>`coalesce(sum(
          case when ${viaje.estado} in ('finalizado', 'cancelado')
            then coalesce(${viaje.precioFinal}, 0) - ${viaje.descuentoCorporativo}
            when ${viaje.estado} in ('programado', 'buscando_conductor', 'asignado', 'en_sitio', 'en_curso')
            then ${viaje.precioEstimadoMax} - floor(${viaje.precioEstimadoMax} * (select e.descuento_pb from empresa e where e.id = ${viaje.empresaId}) / 10000.0)
            else 0 end), 0)::bigint`,
      })
      .from(viaje)
      .where(and(eq(viaje.empresaId, empresaId), isNull(viaje.estadoCuentaId)));
    const porPagar = Number(cuentas?.total ?? 0);
    const sinFacturar = Number(abiertos?.total ?? 0);
    return {
      porPagar,
      sinFacturar,
      total: porPagar + sinFacturar,
      vencimientoMasAntiguo: cuentas?.vence ?? null,
    };
  }

  // ───────────────────────────────────────────────────────────── centros de costo

  async listarCentros(empresaId: string) {
    return this.bd.db
      .select({
        id: centroCosto.id,
        codigo: centroCosto.codigo,
        nombre: centroCosto.nombre,
        activo: centroCosto.activo,
        empleados: sql<number>`(select count(*)::int from vinculo_empresa v where v.centro_costo_id = ${centroCosto.id} and v.estado = 'activo')`,
      })
      .from(centroCosto)
      .where(eq(centroCosto.empresaId, empresaId))
      .orderBy(asc(centroCosto.codigo));
  }

  async crearCentro(empresaId: string, d: { codigo: string; nombre: string }, operador: Operador) {
    await this.cargar(empresaId);
    const codigo = d.codigo.trim().toUpperCase();
    return this.bd.db.transaction(async (tx) => {
      const [existe] = await tx
        .select({ id: centroCosto.id })
        .from(centroCosto)
        .where(and(eq(centroCosto.empresaId, empresaId), eq(centroCosto.codigo, codigo)));
      if (existe) throw conflicto('CENTRO_EXISTE', 'Ya hay un centro de costo con ese código.');
      const [c] = await tx
        .insert(centroCosto)
        .values({ empresaId, codigo, nombre: d.nombre })
        .returning();
      await auditar(tx, operador, {
        accion: 'centro_costo.crear',
        entidad: 'centro_costo',
        entidadId: c!.id,
        despues: { empresaId, codigo, nombre: d.nombre },
      });
      return c!;
    });
  }

  async actualizarCentro(
    empresaId: string,
    id: string,
    d: { nombre?: string | undefined; activo?: boolean | undefined },
    operador: Operador,
  ) {
    return this.bd.db.transaction(async (tx) => {
      const [antes] = await tx
        .select()
        .from(centroCosto)
        .where(and(eq(centroCosto.id, id), eq(centroCosto.empresaId, empresaId)));
      if (!antes) throw noEncontrado('CENTRO_NO_ENCONTRADO', 'No encontramos ese centro de costo.');
      if (d.activo === false) {
        const [{ n } = { n: 0 }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(centroCosto)
          .where(
            and(
              eq(centroCosto.empresaId, empresaId),
              eq(centroCosto.activo, true),
              ne(centroCosto.id, id),
            ),
          );
        if (n === 0)
          throw conflicto(
            'ULTIMO_CENTRO',
            'La empresa necesita al menos un centro de costo activo.',
          );
      }
      const cambios = {
        ...(d.nombre !== undefined ? { nombre: d.nombre } : {}),
        ...(d.activo !== undefined ? { activo: d.activo } : {}),
      };
      if (Object.keys(cambios).length === 0) throw solicitudInvalida('No hay nada que cambiar.');
      const [despues] = await tx
        .update(centroCosto)
        .set(cambios)
        .where(eq(centroCosto.id, id))
        .returning();
      await auditar(tx, operador, {
        accion: 'centro_costo.actualizar',
        entidad: 'centro_costo',
        entidadId: id,
        antes: { nombre: antes.nombre, activo: antes.activo },
        despues: { nombre: despues!.nombre, activo: despues!.activo },
      });
      return despues!;
    });
  }

  // ───────────────────────────────────────────────────────────── políticas

  async listarPoliticas(empresaId: string) {
    return this.bd.db
      .select({
        id: politicaUso.id,
        nombre: politicaUso.nombre,
        dias: politicaUso.dias,
        desdeMin: politicaUso.desdeMin,
        hastaMin: politicaUso.hastaMin,
        montoMaximo: politicaUso.montoMaximo,
        categorias: politicaUso.categorias,
        tiposServicio: politicaUso.tiposServicio,
        motivoObligatorio: politicaUso.motivoObligatorio,
        activa: politicaUso.activa,
        empleados: sql<number>`(select count(*)::int from vinculo_empresa v where v.politica_id = ${politicaUso.id} and v.estado = 'activo')`,
      })
      .from(politicaUso)
      .where(eq(politicaUso.empresaId, empresaId))
      .orderBy(asc(politicaUso.nombre));
  }

  private validarPolitica(d: DatosPolitica) {
    if (d.dias.some((x) => x < 1 || x > 7))
      throw solicitudInvalida('Los días van de 1 (lunes) a 7 (domingo).');
    if (d.desdeMin < 0 || d.desdeMin > 1439 || d.hastaMin < 1 || d.hastaMin > 1440)
      throw solicitudInvalida('El horario permitido no es válido.');
  }

  async crearPolitica(empresaId: string, d: DatosPolitica, operador: Operador) {
    await this.cargar(empresaId);
    this.validarPolitica(d);
    return this.bd.db.transaction(async (tx) => {
      const [existe] = await tx
        .select({ id: politicaUso.id })
        .from(politicaUso)
        .where(and(eq(politicaUso.empresaId, empresaId), eq(politicaUso.nombre, d.nombre)));
      if (existe) throw conflicto('POLITICA_EXISTE', 'Ya hay una política con ese nombre.');
      const [p] = await tx
        .insert(politicaUso)
        .values({ empresaId, ...d, dias: [...new Set(d.dias)].sort() })
        .returning();
      await auditar(tx, operador, {
        accion: 'politica_uso.crear',
        entidad: 'politica_uso',
        entidadId: p!.id,
        despues: d,
      });
      return p!;
    });
  }

  async actualizarPolitica(
    empresaId: string,
    id: string,
    d: DatosPolitica & { activa?: boolean | undefined },
    operador: Operador,
  ) {
    this.validarPolitica(d);
    return this.bd.db.transaction(async (tx) => {
      const [antes] = await tx
        .select()
        .from(politicaUso)
        .where(and(eq(politicaUso.id, id), eq(politicaUso.empresaId, empresaId)));
      if (!antes) throw noEncontrado('POLITICA_NO_ENCONTRADA', 'No encontramos esa política.');
      const [otra] = await tx
        .select({ id: politicaUso.id })
        .from(politicaUso)
        .where(
          and(
            eq(politicaUso.empresaId, empresaId),
            eq(politicaUso.nombre, d.nombre),
            ne(politicaUso.id, id),
          ),
        );
      if (otra) throw conflicto('POLITICA_EXISTE', 'Ya hay una política con ese nombre.');
      const { activa, ...resto } = d;
      const [despues] = await tx
        .update(politicaUso)
        .set({
          ...resto,
          dias: [...new Set(d.dias)].sort(),
          ...(activa !== undefined ? { activa } : {}),
        })
        .where(eq(politicaUso.id, id))
        .returning();
      await auditar(tx, operador, {
        accion: 'politica_uso.actualizar',
        entidad: 'politica_uso',
        entidadId: id,
        antes,
        despues,
      });
      return despues!;
    });
  }

  // ───────────────────────────────────────────────────────────── empleados

  async listarEmpleados(empresaId: string) {
    const filas = await this.bd.db
      .select({
        id: vinculoEmpresa.id,
        nombre: vinculoEmpresa.nombre,
        telefono: vinculoEmpresa.telefono,
        estado: vinculoEmpresa.estado,
        centroCostoId: vinculoEmpresa.centroCostoId,
        centroCosto: centroCosto.nombre,
        politicaId: vinculoEmpresa.politicaId,
        politica: politicaUso.nombre,
        invitadoEn: vinculoEmpresa.invitadoEn,
        aceptadoEn: vinculoEmpresa.aceptadoEn,
        viajes: sql<number>`(select count(*)::int from viaje x where x.vinculo_empresa_id = ${vinculoEmpresa.id})`,
      })
      .from(vinculoEmpresa)
      .leftJoin(centroCosto, eq(centroCosto.id, vinculoEmpresa.centroCostoId))
      .leftJoin(politicaUso, eq(politicaUso.id, vinculoEmpresa.politicaId))
      .where(and(eq(vinculoEmpresa.empresaId, empresaId), ne(vinculoEmpresa.estado, 'retirado')))
      .orderBy(asc(vinculoEmpresa.nombre));
    return filas.map((f) => ({
      ...f,
      invitadoEn: f.invitadoEn.toISOString(),
      aceptadoEn: f.aceptadoEn?.toISOString() ?? null,
    }));
  }

  private async asegurarDeLaEmpresa(
    tx: DbOTx,
    empresaId: string,
    centroCostoId?: string | null,
    politicaId?: string | null,
  ) {
    if (centroCostoId) {
      const [c] = await tx
        .select({ id: centroCosto.id })
        .from(centroCosto)
        .where(
          and(
            eq(centroCosto.id, centroCostoId),
            eq(centroCosto.empresaId, empresaId),
            eq(centroCosto.activo, true),
          ),
        );
      if (!c) throw noEncontrado('CENTRO_NO_ENCONTRADO', 'No encontramos ese centro de costo.');
    }
    if (politicaId) {
      const [p] = await tx
        .select({ id: politicaUso.id })
        .from(politicaUso)
        .where(
          and(
            eq(politicaUso.id, politicaId),
            eq(politicaUso.empresaId, empresaId),
            eq(politicaUso.activa, true),
          ),
        );
      if (!p) throw noEncontrado('POLITICA_NO_ENCONTRADA', 'No encontramos esa política.');
    }
  }

  /** RN-101: invita a una persona por su celular; ella la acepta desde la app del pasajero. */
  async invitar(
    empresaId: string,
    d: {
      telefono: string;
      nombre: string;
      centroCostoId?: string | undefined;
      politicaId?: string | undefined;
    },
    operador: Operador,
  ) {
    await this.cargar(empresaId);
    return this.bd.db.transaction(async (tx) => {
      await this.asegurarDeLaEmpresa(tx, empresaId, d.centroCostoId, d.politicaId);
      const [existe] = await tx
        .select({ id: vinculoEmpresa.id })
        .from(vinculoEmpresa)
        .where(
          and(
            eq(vinculoEmpresa.empresaId, empresaId),
            eq(vinculoEmpresa.telefono, d.telefono),
            ne(vinculoEmpresa.estado, 'retirado'),
          ),
        );
      if (existe)
        throw conflicto('YA_INVITADO', 'Esa persona ya está invitada o vinculada a la empresa.');
      // Sin elegir, el empleado queda en el primer centro y con la primera política de la empresa.
      const centroId =
        d.centroCostoId ??
        (
          await tx
            .select({ id: centroCosto.id })
            .from(centroCosto)
            .where(and(eq(centroCosto.empresaId, empresaId), eq(centroCosto.activo, true)))
            .orderBy(asc(centroCosto.creadoEn))
            .limit(1)
        )[0]?.id ??
        null;
      const politicaId =
        d.politicaId ??
        (
          await tx
            .select({ id: politicaUso.id })
            .from(politicaUso)
            .where(and(eq(politicaUso.empresaId, empresaId), eq(politicaUso.activa, true)))
            .orderBy(asc(politicaUso.creadoEn))
            .limit(1)
        )[0]?.id ??
        null;
      const [v] = await tx
        .insert(vinculoEmpresa)
        .values({
          empresaId,
          telefono: d.telefono,
          nombre: d.nombre,
          centroCostoId: centroId,
          politicaId,
          invitadoPor: operador.id,
        })
        .returning();
      await auditar(tx, operador, {
        accion: 'empleado_empresa.invitar',
        entidad: 'vinculo_empresa',
        entidadId: v!.id,
        despues: { empresaId, telefono: d.telefono, nombre: d.nombre },
      });
      return v!;
    });
  }

  async actualizarEmpleado(
    empresaId: string,
    id: string,
    d: { centroCostoId?: string | undefined; politicaId?: string | undefined },
    operador: Operador,
  ) {
    return this.bd.db.transaction(async (tx) => {
      const [antes] = await tx
        .select()
        .from(vinculoEmpresa)
        .where(
          and(
            eq(vinculoEmpresa.id, id),
            eq(vinculoEmpresa.empresaId, empresaId),
            ne(vinculoEmpresa.estado, 'retirado'),
          ),
        );
      if (!antes) throw noEncontrado('EMPLEADO_NO_ENCONTRADO', 'No encontramos a ese empleado.');
      await this.asegurarDeLaEmpresa(tx, empresaId, d.centroCostoId, d.politicaId);
      const cambios = {
        ...(d.centroCostoId ? { centroCostoId: d.centroCostoId } : {}),
        ...(d.politicaId ? { politicaId: d.politicaId } : {}),
      };
      if (Object.keys(cambios).length === 0) throw solicitudInvalida('No hay nada que cambiar.');
      await tx.update(vinculoEmpresa).set(cambios).where(eq(vinculoEmpresa.id, id));
      await auditar(tx, operador, {
        accion: 'empleado_empresa.actualizar',
        entidad: 'vinculo_empresa',
        entidadId: id,
        antes: { centroCostoId: antes.centroCostoId, politicaId: antes.politicaId },
        despues: cambios,
      });
    });
  }

  async retirar(empresaId: string, id: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [antes] = await tx
        .select()
        .from(vinculoEmpresa)
        .where(
          and(
            eq(vinculoEmpresa.id, id),
            eq(vinculoEmpresa.empresaId, empresaId),
            ne(vinculoEmpresa.estado, 'retirado'),
          ),
        );
      if (!antes) throw noEncontrado('EMPLEADO_NO_ENCONTRADO', 'No encontramos a ese empleado.');
      await tx
        .update(vinculoEmpresa)
        .set({ estado: 'retirado', retiradoEn: new Date() })
        .where(eq(vinculoEmpresa.id, id));
      await auditar(tx, operador, {
        accion: 'empleado_empresa.retirar',
        entidad: 'vinculo_empresa',
        entidadId: id,
        antes: { estado: antes.estado, telefono: antes.telefono },
      });
    });
  }

  // ───────────────────────────────────────────────────────────── viajes de la empresa

  async listarViajes(
    empresaId: string,
    f: {
      desde?: Date | undefined;
      hasta?: Date | undefined;
      centroCostoId?: string | undefined;
      limite: number;
      desplazar: number;
    },
  ) {
    const condiciones = [
      eq(viaje.empresaId, empresaId),
      ...(f.desde ? [sql`${viaje.solicitadoEn} >= ${f.desde}`] : []),
      ...(f.hasta ? [sql`${viaje.solicitadoEn} <= ${f.hasta}`] : []),
      ...(f.centroCostoId ? [eq(viaje.centroCostoId, f.centroCostoId)] : []),
    ];
    const filas = await this.bd.db
      .select({
        id: viaje.id,
        codigo: viaje.codigo,
        estado: viaje.estado,
        solicitadoEn: viaje.solicitadoEn,
        programadoPara: viaje.programadoPara,
        empleado: vinculoEmpresa.nombre,
        centroCosto: centroCosto.nombre,
        motivo: viaje.motivoCorporativo,
        origen: viaje.origenDireccion,
        destino: viaje.destinoDireccion,
        precioFinal: viaje.precioFinal,
        descuento: viaje.descuentoCorporativo,
        estadoCuentaId: viaje.estadoCuentaId,
      })
      .from(viaje)
      .leftJoin(vinculoEmpresa, eq(vinculoEmpresa.id, viaje.vinculoEmpresaId))
      .leftJoin(centroCosto, eq(centroCosto.id, viaje.centroCostoId))
      .where(and(...condiciones))
      .orderBy(desc(viaje.solicitadoEn))
      .limit(f.limite)
      .offset(f.desplazar);
    const [{ total } = { total: 0 }] = await this.bd.db
      .select({ total: sql<number>`count(*)::int` })
      .from(viaje)
      .where(and(...condiciones));
    return {
      total,
      items: filas.map((v) => ({
        ...v,
        solicitadoEn: v.solicitadoEn.toISOString(),
        programadoPara: v.programadoPara?.toISOString() ?? null,
      })),
    };
  }

  // ───────────────────────────────────────────────────────────── estados de cuenta (RN-105)

  async listarEstados(empresaId?: string) {
    const hoy = fechaBogota(new Date());
    const filas = await this.bd.db
      .select({ e: estadoCuenta, empresa: empresa.nombre })
      .from(estadoCuenta)
      .innerJoin(empresa, eq(empresa.id, estadoCuenta.empresaId))
      .where(empresaId ? eq(estadoCuenta.empresaId, empresaId) : undefined)
      .orderBy(desc(estadoCuenta.periodoHasta), asc(empresa.nombre))
      .limit(200);
    return filas.map(({ e, empresa: nombre }) => this.vistaEstado(e, nombre, hoy));
  }

  private vistaEstado(e: typeof estadoCuenta.$inferSelect, nombreEmpresa: string, hoy: string) {
    const estado = estadoDeCuenta(e, hoy);
    return {
      id: e.id,
      codigo: e.codigo,
      empresaId: e.empresaId,
      empresa: nombreEmpresa,
      periodoDesde: e.periodoDesde,
      periodoHasta: e.periodoHasta,
      viajes: e.viajes,
      subtotal: e.subtotal,
      descuento: e.descuento,
      total: e.total,
      estado,
      emitidoEn: e.emitidoEn.toISOString(),
      venceEn: e.venceEn,
      diasDeMora: estado === 'vencido' ? diasDeMora(e.venceEn, hoy) : 0,
      pagadoEn: e.pagadoEn?.toISOString() ?? null,
      referenciaPago: e.referenciaPago,
    };
  }

  /** El estado de cuenta con su detalle por empleado, por centro de costo y viaje por viaje. */
  async detalleEstado(empresaId: string, id: string) {
    const [fila] = await this.bd.db
      .select({ e: estadoCuenta, empresa: empresa.nombre })
      .from(estadoCuenta)
      .innerJoin(empresa, eq(empresa.id, estadoCuenta.empresaId))
      .where(and(eq(estadoCuenta.id, id), eq(estadoCuenta.empresaId, empresaId)));
    if (!fila) throw noEncontrado('ESTADO_NO_ENCONTRADO', 'No encontramos ese estado de cuenta.');
    const viajes = await this.bd.db
      .select({
        id: viaje.id,
        codigo: viaje.codigo,
        fecha: sql<Date>`coalesce(${viaje.finalizadoEn}, ${viaje.canceladoEn})`,
        estado: viaje.estado,
        empleado: sql<string>`coalesce(${vinculoEmpresa.nombre}, 'Sin nombre')`,
        centroCosto: sql<string>`coalesce(${centroCosto.nombre}, 'Sin centro')`,
        motivo: viaje.motivoCorporativo,
        origen: viaje.origenDireccion,
        destino: viaje.destinoDireccion,
        valor: sql<number>`coalesce(${viaje.precioFinal}, 0)`,
        descuento: viaje.descuentoCorporativo,
      })
      .from(viaje)
      .leftJoin(vinculoEmpresa, eq(vinculoEmpresa.id, viaje.vinculoEmpresaId))
      .leftJoin(centroCosto, eq(centroCosto.id, viaje.centroCostoId))
      .where(eq(viaje.estadoCuentaId, id))
      .orderBy(asc(sql`coalesce(${viaje.finalizadoEn}, ${viaje.canceladoEn})`));
    const agrupar = (clave: (v: (typeof viajes)[number]) => string) => {
      const m = new Map<
        string,
        { nombre: string; viajes: number; subtotal: number; descuento: number }
      >();
      for (const v of viajes) {
        const k = clave(v);
        const a = m.get(k) ?? { nombre: k, viajes: 0, subtotal: 0, descuento: 0 };
        a.viajes += 1;
        a.subtotal += Number(v.valor);
        a.descuento += v.descuento;
        m.set(k, a);
      }
      return [...m.values()]
        .map((a) => ({ ...a, total: a.subtotal - a.descuento }))
        .sort((x, y) => y.total - x.total);
    };
    return {
      ...this.vistaEstado(fila.e, fila.empresa, fechaBogota(new Date())),
      porEmpleado: agrupar((v) => v.empleado),
      porCentroCosto: agrupar((v) => v.centroCosto),
      viajesDetalle: viajes.map((v) => ({
        ...v,
        fecha: new Date(v.fecha).toISOString(),
        valor: Number(v.valor),
      })),
    };
  }

  /**
   * Cierra el ciclo que termina en `hasta`: junta los viajes cobrables que todavía no están en ningún estado de cuenta
   * y terminaron hasta ese día. Devuelve `null` si no hay nada que cobrar.
   */
  async generarEstado(empresaId: string, hasta: string, operador: Operador | null) {
    return this.bd.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`estado-cuenta:${empresaId}`}))`,
      );
      const e = await this.cargar(empresaId, tx);
      const [existe] = await tx
        .select({ id: estadoCuenta.id })
        .from(estadoCuenta)
        .where(and(eq(estadoCuenta.empresaId, empresaId), eq(estadoCuenta.periodoHasta, hasta)));
      if (existe) return null;
      // Fin del día `hasta` en Bogotá (UTC−5) = 05:00 UTC del día siguiente.
      const limite = new Date(Date.parse(`${hasta}T00:00:00Z`) + 29 * 3_600_000);
      const pendientes = await tx
        .select({
          id: viaje.id,
          valor: sql<number>`coalesce(${viaje.precioFinal}, 0)`,
          descuento: viaje.descuentoCorporativo,
        })
        .from(viaje)
        .where(
          and(
            eq(viaje.empresaId, empresaId),
            isNull(viaje.estadoCuentaId),
            inArray(viaje.estado, ['finalizado', 'cancelado']),
            sql`coalesce(${viaje.precioFinal}, 0) > 0`,
            lte(sql`coalesce(${viaje.finalizadoEn}, ${viaje.canceladoEn})`, limite),
          ),
        );
      if (pendientes.length === 0) return null;
      const [anterior] = await tx
        .select({ hasta: estadoCuenta.periodoHasta })
        .from(estadoCuenta)
        .where(eq(estadoCuenta.empresaId, empresaId))
        .orderBy(desc(estadoCuenta.periodoHasta))
        .limit(1);
      const desde = anterior
        ? new Date(Date.parse(`${anterior.hasta}T00:00:00Z`) + 86_400_000)
            .toISOString()
            .slice(0, 10)
        : cicloDe(e.diaCorte, hasta).desde;
      const subtotal = pendientes.reduce((s, v) => s + Number(v.valor), 0);
      const descuento = pendientes.reduce((s, v) => s + v.descuento, 0);
      const emision = fechaBogota(new Date());
      const [cuenta] = await tx
        .insert(estadoCuenta)
        .values({
          codigo: `EC-${hasta.replaceAll('-', '')}-${e.nit.replace(/\D/g, '').slice(0, 10) || e.id.slice(0, 8)}`,
          empresaId,
          periodoDesde: desde,
          periodoHasta: hasta,
          viajes: pendientes.length,
          subtotal,
          descuento,
          total: subtotal - descuento,
          venceEn: vencimientoDe(emision, e.diasPago),
        })
        .returning();
      await tx
        .update(viaje)
        .set({ estadoCuentaId: cuenta!.id })
        .where(
          inArray(
            viaje.id,
            pendientes.map((p) => p.id),
          ),
        );
      await auditar(tx, operador, {
        accion: 'estado_cuenta.generar',
        entidad: 'estado_cuenta',
        entidadId: cuenta!.id,
        despues: {
          empresaId,
          periodo: [desde, hasta],
          viajes: pendientes.length,
          total: cuenta!.total,
        },
      });
      return cuenta!;
    });
  }

  /** Trabajo diario: genera el estado de cuenta del último ciclo cerrado de cada empresa (idempotente). */
  async generarPendientes(hoy = fechaBogota(new Date())): Promise<number> {
    const empresas = await this.bd.db.select().from(empresa);
    let generados = 0;
    for (const e of empresas) {
      const ciclo = cicloCerrado(e.diaCorte, hoy);
      if (await this.generarEstado(e.id, ciclo.hasta, null)) generados += 1;
    }
    return generados;
  }

  async registrarPago(id: string, d: { referencia: string }, motivo: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [antes] = await tx
        .select()
        .from(estadoCuenta)
        .where(eq(estadoCuenta.id, id))
        .for('update');
      if (!antes)
        throw noEncontrado('ESTADO_NO_ENCONTRADO', 'No encontramos ese estado de cuenta.');
      if (antes.estado !== 'emitido')
        throw conflicto('ESTADO_INVALIDO', 'Ese estado de cuenta ya está pagado o anulado.');
      await tx
        .update(estadoCuenta)
        .set({ estado: 'pagado', pagadoEn: new Date(), referenciaPago: d.referencia })
        .where(eq(estadoCuenta.id, id));
      await auditar(tx, operador, {
        accion: 'estado_cuenta.pago',
        entidad: 'estado_cuenta',
        entidadId: id,
        antes: { estado: antes.estado },
        despues: { estado: 'pagado', referencia: d.referencia, total: antes.total },
        motivo,
      });
    });
  }

  /** Anula un estado de cuenta emitido y libera sus viajes para que entren en el siguiente. */
  async anular(id: string, motivo: string, operador: Operador) {
    await this.bd.db.transaction(async (tx) => {
      const [antes] = await tx
        .select()
        .from(estadoCuenta)
        .where(eq(estadoCuenta.id, id))
        .for('update');
      if (!antes)
        throw noEncontrado('ESTADO_NO_ENCONTRADO', 'No encontramos ese estado de cuenta.');
      if (antes.estado !== 'emitido')
        throw conflicto(
          'ESTADO_INVALIDO',
          'Solo se anula un estado de cuenta que sigue por pagar.',
        );
      await tx.update(viaje).set({ estadoCuentaId: null }).where(eq(viaje.estadoCuentaId, id));
      // El código y el ciclo quedan libres para volver a emitirlo.
      await tx
        .update(estadoCuenta)
        .set({
          estado: 'anulado',
          codigo: `${antes.codigo}-ANULADO-${id.slice(0, 8)}`,
          periodoHasta: sql`${estadoCuenta.periodoDesde}`,
        })
        .where(eq(estadoCuenta.id, id));
      await auditar(tx, operador, {
        accion: 'estado_cuenta.anular',
        entidad: 'estado_cuenta',
        entidadId: id,
        antes: { estado: antes.estado, total: antes.total, viajes: antes.viajes },
        motivo,
      });
    });
  }

  /** Descuento que le corresponde a un valor según el contrato de la empresa. */
  async descuentoPara(empresaId: string, valor: number, db: DbOTx = this.bd.db): Promise<number> {
    const e = await this.cargar(empresaId, db);
    return descuentoCorporativo(valor, e.descuentoPb);
  }
}
