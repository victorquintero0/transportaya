import {
  catalogoVehiculo,
  ciudad,
  conductor,
  conductorVehiculo,
  cuentaPagoConductor,
  documento,
  usuario,
  vehiculo,
} from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import {
  type DocumentoRegistrado,
  type EvaluacionDocumentos,
  evaluarDocumentos,
  fechaBogota,
} from '@transportaya/dominio';
import { and, desc, eq, sql } from 'drizzle-orm';
import { BaseDeDatos, type DbOTx } from '../bd/bd.module.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { CifradoService, enmascarar } from './cifrado.service.js';

export interface MotivoNoConectar {
  codigo: 'NO_HABILITADO' | 'SIN_VEHICULO' | 'DEUDA_PENDIENTE' | 'DOCUMENTOS_NO_VIGENTES';
  mensaje: string;
  /** Pesos que debe, si el motivo es una deuda. */
  deuda?: number;
  documentos?: string[];
}

export interface PasoOnboarding {
  id: 'datos' | 'vehiculo' | 'documentos' | 'cuenta' | 'revision';
  titulo: string;
  completo: boolean;
}

export interface PerfilConductor {
  usuario: { id: string; nombre: string; telefono: string; email: string | null };
  ciudad: { id: string; nombre: string };
  conductor: {
    estadoHabilitacion: string;
    estadoOperativo: string;
    bloqueadoPorDeuda: boolean;
    aceptaCategoriaInferior: boolean;
    aceptaIntermunicipal: boolean;
    calificacionPromedio: number | null;
    calificacionesTotal: number;
  };
  vehiculos: {
    id: string;
    placa: string;
    marca: string;
    linea: string;
    modeloAnio: number;
    color: string;
    categoria: string;
    activo: boolean;
    fueraDeCatalogo: boolean;
  }[];
  cuentaPago: { tipo: string; valorEnmascarado: string; verificada: boolean } | null;
  documentos: EvaluacionDocumentos;
  onboarding: { pasos: PasoOnboarding[]; puedeEnviarRevision: boolean };
  conexion: { puedeConectarse: boolean; motivos: MotivoNoConectar[] };
}

const MENSAJE_ESTADO: Record<string, string> = {
  registro_incompleto: 'Termina tu registro para empezar a trabajar.',
  en_revision: 'Estamos revisando tus documentos. Te avisamos apenas estén listos.',
  rechazado: 'Hay documentos que corregir antes de que podamos habilitarte.',
  suspendido: 'Tu cuenta está suspendida. Revisa tus documentos o comunícate con soporte.',
  bloqueado: 'Tu cuenta está bloqueada. Comunícate con soporte.',
};

export const NOMBRE_PENDIENTE = 'Sin nombre';

@Injectable()
export class PerfilService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
  ) {}

  /** Saldo del conductor en pesos: negativo es lo que debe (RN-063). */
  async saldo(conductorId: string, db: DbOTx = this.bd.db): Promise<number> {
    const r = await db.execute<{ saldo: string }>(
      sql`select saldo::text from saldo_conductor where conductor_id = ${conductorId}`,
    );
    return Number(r.rows[0]?.saldo ?? 0);
  }

  async obtener(conductorId: string): Promise<PerfilConductor> {
    const { db } = this.bd;
    const [base] = await db
      .select({ u: usuario, c: conductor, ciudad: { id: ciudad.id, nombre: ciudad.nombre } })
      .from(conductor)
      .innerJoin(usuario, eq(usuario.id, conductor.usuarioId))
      .innerJoin(ciudad, eq(ciudad.id, conductor.ciudadId))
      .where(eq(conductor.usuarioId, conductorId));
    if (!base)
      throw noEncontrado('CONDUCTOR_NO_ENCONTRADO', 'No encontramos tu perfil de conductor');

    const vehiculos = await db
      .select({ v: vehiculo })
      .from(conductorVehiculo)
      .innerJoin(vehiculo, eq(vehiculo.id, conductorVehiculo.vehiculoId))
      .where(eq(conductorVehiculo.conductorId, conductorId))
      .orderBy(desc(vehiculo.creadoEn));

    const activoId = base.c.vehiculoActivoId;
    const docs = await db
      .select()
      .from(documento)
      .where(
        activoId
          ? sql`${documento.conductorId} = ${conductorId} or ${documento.vehiculoId} = ${activoId}`
          : eq(documento.conductorId, conductorId),
      );
    const registrados: DocumentoRegistrado[] = docs.map((d) => ({
      titular: d.titular,
      tipo: d.tipo,
      estado: d.estado,
      venceEn: d.venceEn,
      creadoEn: d.creadoEn,
      motivoRechazo: d.motivoRechazo,
    }));
    const evaluacion = evaluarDocumentos(registrados, fechaBogota(new Date()));

    const [cuenta] = await db
      .select()
      .from(cuentaPagoConductor)
      .where(
        and(eq(cuentaPagoConductor.conductorId, conductorId), eq(cuentaPagoConductor.activa, true)),
      );

    const nombreCompleto = base.u.nombre !== NOMBRE_PENDIENTE && base.u.nombre.trim().length >= 3;
    const pasos: PasoOnboarding[] = [
      { id: 'datos', titulo: 'Tus datos', completo: nombreCompleto },
      { id: 'vehiculo', titulo: 'Tu vehículo', completo: !!activoId },
      { id: 'documentos', titulo: 'Tus documentos', completo: evaluacion.completo },
      { id: 'cuenta', titulo: 'Dónde te pagamos', completo: !!cuenta },
      {
        id: 'revision',
        titulo: 'Revisión de TransporteYa',
        completo: ['habilitado', 'suspendido'].includes(base.c.estadoHabilitacion),
      },
    ];
    const listoParaEnviar = pasos.slice(0, 4).every((p) => p.completo);
    const puedeEnviarRevision =
      listoParaEnviar && ['registro_incompleto', 'rechazado'].includes(base.c.estadoHabilitacion);

    const motivos = await this.motivos(base.c, evaluacion, conductorId);
    return {
      usuario: {
        id: base.u.id,
        nombre: base.u.nombre,
        telefono: base.u.telefono,
        email: base.u.email,
      },
      ciudad: base.ciudad,
      conductor: {
        estadoHabilitacion: base.c.estadoHabilitacion,
        estadoOperativo: base.c.estadoOperativo,
        bloqueadoPorDeuda: base.c.bloqueadoPorDeuda,
        aceptaCategoriaInferior: base.c.aceptaCategoriaInferior,
        aceptaIntermunicipal: base.c.aceptaIntermunicipal,
        calificacionPromedio: base.c.calificacionPromedio,
        calificacionesTotal: base.c.calificacionesTotal,
      },
      vehiculos: vehiculos.map(({ v }) => ({
        id: v.id,
        placa: v.placa,
        marca: v.marca,
        linea: v.linea,
        modeloAnio: v.modeloAnio,
        color: v.color,
        categoria: v.categoria,
        activo: v.id === activoId,
        fueraDeCatalogo: v.fueraDeCatalogo,
      })),
      cuentaPago: cuenta
        ? {
            tipo: cuenta.tipo,
            valorEnmascarado: enmascarar(this.cifrado.descifrar(cuenta.valorCifrado)),
            verificada: cuenta.verificada,
          }
        : null,
      documentos: evaluacion,
      onboarding: { pasos, puedeEnviarRevision },
      conexion: { puedeConectarse: motivos.length === 0, motivos },
    };
  }

  private async motivos(
    c: typeof conductor.$inferSelect,
    evaluacion: EvaluacionDocumentos,
    conductorId: string,
  ): Promise<MotivoNoConectar[]> {
    const motivos: MotivoNoConectar[] = [];
    if (c.estadoHabilitacion !== 'habilitado') {
      motivos.push({
        codigo: 'NO_HABILITADO',
        mensaje: MENSAJE_ESTADO[c.estadoHabilitacion] ?? 'Tu cuenta no está habilitada.',
      });
      return motivos;
    }
    if (!c.vehiculoActivoId) {
      motivos.push({
        codigo: 'SIN_VEHICULO',
        mensaje: 'Elige el vehículo con el que vas a trabajar.',
      });
    }
    if (c.bloqueadoPorDeuda) {
      const deuda = Math.max(0, -(await this.saldo(conductorId)));
      motivos.push({
        codigo: 'DEUDA_PENDIENTE',
        mensaje: 'Paga tu comisión pendiente por llave o Bre-B para volver a conectarte.',
        deuda,
      });
    }
    if (!evaluacion.habilitado) {
      const malos = evaluacion.requisitos
        .filter((r) => r.estado !== 'aprobado' && r.estado !== 'por_vencer')
        .map((r) => r.titulo);
      motivos.push({
        codigo: 'DOCUMENTOS_NO_VIGENTES',
        mensaje: `Estos documentos no están vigentes: ${malos.join(', ')}.`,
        documentos: malos,
      });
    }
    return motivos;
  }

  async motivosNoConectar(conductorId: string): Promise<MotivoNoConectar[]> {
    return (await this.obtener(conductorId)).conexion.motivos;
  }

  async actualizar(
    conductorId: string,
    datos: {
      nombre?: string | undefined;
      email?: string | null | undefined;
      aceptaCategoriaInferior?: boolean | undefined;
      aceptaIntermunicipal?: boolean | undefined;
    },
  ): Promise<void> {
    await this.bd.db.transaction(async (tx) => {
      const personales: Partial<typeof usuario.$inferInsert> = {};
      if (datos.nombre !== undefined) personales.nombre = datos.nombre.trim().replace(/\s+/g, ' ');
      if (datos.email !== undefined) personales.email = datos.email;
      if (Object.keys(personales).length)
        await tx.update(usuario).set(personales).where(eq(usuario.id, conductorId));

      const preferencias: Partial<typeof conductor.$inferInsert> = {};
      if (datos.aceptaCategoriaInferior !== undefined)
        preferencias.aceptaCategoriaInferior = datos.aceptaCategoriaInferior;
      if (datos.aceptaIntermunicipal !== undefined)
        preferencias.aceptaIntermunicipal = datos.aceptaIntermunicipal;
      if (Object.keys(preferencias).length)
        await tx.update(conductor).set(preferencias).where(eq(conductor.usuarioId, conductorId));
    });
  }

  /** La llave o cuenta donde se le paga. Se guarda cifrada y solo se muestra enmascarada. */
  async guardarCuentaPago(
    conductorId: string,
    datos: { tipo: 'llave_bre_b' | 'cuenta_bancaria'; valor: string; banco?: string | undefined },
  ): Promise<void> {
    await this.bd.db.transaction(async (tx) => {
      await tx
        .update(cuentaPagoConductor)
        .set({ activa: false })
        .where(
          and(
            eq(cuentaPagoConductor.conductorId, conductorId),
            eq(cuentaPagoConductor.activa, true),
          ),
        );
      await tx.insert(cuentaPagoConductor).values({
        conductorId,
        tipo: datos.tipo,
        valorCifrado: this.cifrado.cifrar(datos.valor),
        banco: datos.banco ?? null,
      });
    });
  }

  /** Valor descifrado de la cuenta activa: solo para ejecutar pagos, nunca se devuelve a la app. */
  async cuentaPagoActiva(conductorId: string, db: DbOTx = this.bd.db) {
    const [cuenta] = await db
      .select()
      .from(cuentaPagoConductor)
      .where(
        and(eq(cuentaPagoConductor.conductorId, conductorId), eq(cuentaPagoConductor.activa, true)),
      );
    return cuenta ? { ...cuenta, valor: this.cifrado.descifrar(cuenta.valorCifrado) } : null;
  }

  async enviarARevision(conductorId: string): Promise<void> {
    const perfil = await this.obtener(conductorId);
    if (!['registro_incompleto', 'rechazado'].includes(perfil.conductor.estadoHabilitacion)) {
      throw conflicto('ESTADO_NO_PERMITE_ENVIAR', 'Tu cuenta ya está en revisión o habilitada.');
    }
    const faltan = perfil.onboarding.pasos.slice(0, 4).filter((p) => !p.completo);
    if (faltan.length) {
      throw solicitudInvalida(`Falta completar: ${faltan.map((p) => p.titulo).join(', ')}.`, {
        pendientes: faltan.map((p) => p.id),
      });
    }
    await this.bd.db
      .update(conductor)
      .set({ estadoHabilitacion: 'en_revision' })
      .where(eq(conductor.usuarioId, conductorId));
  }

  async catalogo() {
    const filas = await this.bd.db
      .select()
      .from(catalogoVehiculo)
      .where(eq(catalogoVehiculo.activo, true))
      .orderBy(catalogoVehiculo.marca, catalogoVehiculo.linea);
    const porMarca = new Map<
      string,
      {
        id: string;
        linea: string;
        carroceria: string | null;
        categoria: string;
        anioDesde: number;
        anioHasta: number | null;
      }[]
    >();
    for (const f of filas) {
      const lineas = porMarca.get(f.marca) ?? [];
      lineas.push({
        id: f.id,
        linea: f.linea,
        carroceria: f.carroceria,
        categoria: f.categoria,
        anioDesde: f.anioDesde,
        anioHasta: f.anioHasta,
      });
      porMarca.set(f.marca, lineas);
    }
    return [...porMarca].map(([marca, lineas]) => ({ marca, lineas }));
  }
}
