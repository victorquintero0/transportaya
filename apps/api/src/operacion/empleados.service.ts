import { Inject, Injectable } from '@nestjs/common';
import { auditoria, empleado, empresa, sesion, usuario, usuarioRol } from '@transportaya/db';
import { permisosDe, type RolInterno } from '@transportaya/dominio';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';
import { CifradoService } from '../conductor/cifrado.service.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { type Operador, auditar } from './auditoria.js';
import { contrasenaTemporal, hashContrasena } from './contrasena.js';

export interface NuevoEmpleado {
  nombre: string;
  telefono: string;
  email: string;
  contrasena: string;
  roles: RolInterno[];
  /** Solo para cuentas de demostración: deja el segundo factor ya configurado. */
  totpSecreto?: string;
  /** Administrador de una empresa cliente (rol `empresa`): la empresa que puede ver. */
  empresaId?: string;
}

/** Personal interno: crear, listar, cambiar roles, desactivar y reiniciar el segundo factor (OPE-11). */
@Injectable()
export class EmpleadosService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
  ) {}

  async crear(d: NuevoEmpleado, operador: Operador | null, db: DbOTx = this.bd.db) {
    const email = d.email.trim().toLowerCase();
    const hash = await hashContrasena(d.contrasena);
    const hacer = async (tx: DbOTx) => {
      const existe = await tx
        .select({ id: empleado.usuarioId })
        .from(empleado)
        .where(eq(empleado.email, email));
      if (existe.length) throw conflicto('EMAIL_EN_USO', 'Ya hay una cuenta con ese correo.');
      const [persona] = await tx
        .insert(usuario)
        .values({ telefono: d.telefono, email, nombre: d.nombre })
        .onConflictDoNothing()
        .returning({ id: usuario.id });
      if (!persona) throw conflicto('TELEFONO_EN_USO', 'Ese celular ya pertenece a otra persona.');
      await tx.insert(empleado).values({
        usuarioId: persona.id,
        email,
        contrasenaHash: hash,
        ...(d.empresaId ? { empresaId: d.empresaId } : {}),
        ...(d.totpSecreto
          ? { totpSecretoCifrado: this.cifrado.cifrar(d.totpSecreto), totpActivo: true }
          : {}),
      });
      await tx.insert(usuarioRol).values(d.roles.map((rol) => ({ usuarioId: persona.id, rol })));
      await auditar(tx, operador, {
        accion: 'empleado.crear',
        entidad: 'empleado',
        entidadId: persona.id,
        despues: { email, nombre: d.nombre, roles: d.roles },
      });
      return persona.id;
    };
    // Si ya viene una transacción se usa; si no, se abre una.
    return 'transaction' in db ? (db as typeof this.bd.db).transaction(hacer) : hacer(db);
  }

  async cantidad(): Promise<number> {
    const filas = await this.bd.db.select({ id: empleado.usuarioId }).from(empleado);
    return filas.length;
  }

  async listar() {
    const filas = await this.bd.db
      .select({
        id: empleado.usuarioId,
        nombre: usuario.nombre,
        email: empleado.email,
        telefono: usuario.telefono,
        activo: empleado.activo,
        totpActivo: empleado.totpActivo,
        ultimoIngresoEn: empleado.ultimoIngresoEn,
        creadoEn: empleado.creadoEn,
      })
      .from(empleado)
      .innerJoin(usuario, eq(usuario.id, empleado.usuarioId))
      // Los administradores de empresas clientes se gestionan desde la empresa, no aquí.
      .where(isNull(empleado.empresaId))
      .orderBy(usuario.nombre);
    const roles = await this.bd.db.select().from(usuarioRol);
    return filas.map((f) => {
      const suyos = roles.filter((r) => r.usuarioId === f.id).map((r) => r.rol as RolInterno);
      return {
        ...f,
        ultimoIngresoEn: f.ultimoIngresoEn?.toISOString() ?? null,
        creadoEn: f.creadoEn.toISOString(),
        roles: suyos,
        permisos: permisosDe(suyos),
      };
    });
  }

  async rolesDe(id: string): Promise<RolInterno[]> {
    const r = await this.bd.db
      .select({ rol: usuarioRol.rol })
      .from(usuarioRol)
      .where(eq(usuarioRol.usuarioId, id));
    return r.map((x) => x.rol as RolInterno);
  }

  async perfil(id: string) {
    const [f] = await this.bd.db
      .select({
        id: empleado.usuarioId,
        nombre: usuario.nombre,
        email: empleado.email,
        empresaId: empleado.empresaId,
        empresa: empresa.nombre,
      })
      .from(empleado)
      .innerJoin(usuario, eq(usuario.id, empleado.usuarioId))
      .leftJoin(empresa, eq(empresa.id, empleado.empresaId))
      .where(eq(empleado.usuarioId, id));
    if (!f) throw noEncontrado('EMPLEADO_NO_ENCONTRADO', 'No encontramos a esa persona.');
    const roles = await this.rolesDe(id);
    return { ...f, roles, permisos: permisosDe(roles) };
  }

  private revocarSesiones(tx: DbOTx, id: string) {
    return tx
      .update(sesion)
      .set({ revocadaEn: new Date() })
      .where(and(eq(sesion.usuarioId, id), isNull(sesion.revocadaEn)));
  }

  /** Cambia roles y/o estado de una cuenta. Nadie puede quitarse a sí mismo el acceso de administración. */
  async actualizar(
    id: string,
    d: { roles?: RolInterno[] | undefined; activo?: boolean | undefined; motivo: string },
    operador: Operador,
  ) {
    const antes = await this.perfil(id);
    const [emp] = await this.bd.db.select().from(empleado).where(eq(empleado.usuarioId, id));
    if (id === operador.id) {
      if (d.activo === false)
        throw conflicto('NO_PUEDES_DESACTIVARTE', 'No puedes desactivar tu propia cuenta.');
      if (d.roles && !d.roles.includes('admin') && antes.roles.includes('admin'))
        throw conflicto('NO_PUEDES_QUITARTE_ADMIN', 'No puedes quitarte el rol de administrador.');
    }
    if (emp?.empresaId && d.roles)
      throw conflicto(
        'ADMIN_DE_EMPRESA',
        'Esa cuenta es de una empresa cliente: su rol no se cambia desde Usuarios.',
      );
    if (d.roles && d.roles.length === 0) throw solicitudInvalida('Elige al menos un rol.');
    await this.bd.db.transaction(async (tx) => {
      if (d.roles) {
        await tx.delete(usuarioRol).where(eq(usuarioRol.usuarioId, id));
        await tx.insert(usuarioRol).values(d.roles.map((rol) => ({ usuarioId: id, rol })));
      }
      if (d.activo !== undefined) {
        await tx.update(empleado).set({ activo: d.activo }).where(eq(empleado.usuarioId, id));
        if (!d.activo) await this.revocarSesiones(tx, id);
      }
      await auditar(tx, operador, {
        accion: d.activo === false ? 'empleado.desactivar' : 'empleado.actualizar',
        entidad: 'empleado',
        entidadId: id,
        antes: { roles: antes.roles, activo: emp?.activo },
        despues: { roles: d.roles ?? antes.roles, activo: d.activo ?? emp?.activo },
        motivo: d.motivo,
      });
    });
    return this.perfil(id);
  }

  /** Para quien perdió su dispositivo de autenticación: la próxima vez configura uno nuevo. */
  async reiniciarSegundoFactor(id: string, motivo: string, operador: Operador) {
    await this.perfil(id);
    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(empleado)
        .set({ totpActivo: false, totpSecretoCifrado: null })
        .where(eq(empleado.usuarioId, id));
      await this.revocarSesiones(tx, id);
      await auditar(tx, operador, {
        accion: 'empleado.reiniciar_totp',
        entidad: 'empleado',
        entidadId: id,
        motivo,
      });
    });
  }

  /** La contraseña temporal se muestra una sola vez; no queda guardada en claro. */
  async restablecerContrasena(id: string, motivo: string, operador: Operador) {
    await this.perfil(id);
    const temporal = contrasenaTemporal();
    const hash = await hashContrasena(temporal);
    await this.bd.db.transaction(async (tx) => {
      await tx.update(empleado).set({ contrasenaHash: hash }).where(eq(empleado.usuarioId, id));
      await this.revocarSesiones(tx, id);
      await auditar(tx, operador, {
        accion: 'empleado.restablecer_contrasena',
        entidad: 'empleado',
        entidadId: id,
        motivo,
      });
    });
    return { contrasenaTemporal: temporal };
  }

  async consultarAuditoria(f: {
    usuarioId?: string | undefined;
    entidad?: string | undefined;
    entidadId?: string | undefined;
    accion?: string | undefined;
    desde?: Date | undefined;
    hasta?: Date | undefined;
    limite: number;
    desplazar: number;
  }) {
    const donde = and(
      f.usuarioId ? eq(auditoria.usuarioId, f.usuarioId) : undefined,
      f.entidad ? eq(auditoria.entidad, f.entidad) : undefined,
      f.entidadId ? eq(auditoria.entidadId, f.entidadId) : undefined,
      f.accion ? sql`${auditoria.accion} like ${f.accion + '%'}` : undefined,
      f.desde ? gte(auditoria.ocurridoEn, f.desde) : undefined,
      f.hasta ? lte(auditoria.ocurridoEn, f.hasta) : undefined,
    );
    const filas = await this.bd.db
      .select({
        id: auditoria.id,
        usuarioId: auditoria.usuarioId,
        quien: usuario.nombre,
        accion: auditoria.accion,
        entidad: auditoria.entidad,
        entidadId: auditoria.entidadId,
        antes: auditoria.antes,
        despues: auditoria.despues,
        motivo: auditoria.motivo,
        ip: auditoria.ip,
        ocurridoEn: auditoria.ocurridoEn,
      })
      .from(auditoria)
      .leftJoin(usuario, eq(usuario.id, auditoria.usuarioId))
      .where(donde)
      .orderBy(desc(auditoria.ocurridoEn), desc(auditoria.id))
      .limit(f.limite)
      .offset(f.desplazar);
    const [{ total }] = (await this.bd.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditoria)
      .where(donde)) as [{ total: number }];
    return {
      total,
      items: filas.map((r) => ({
        ...r,
        quien: r.quien ?? 'Sistema',
        ocurridoEn: r.ocurridoEn.toISOString(),
      })),
    };
  }
}
