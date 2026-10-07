import { randomUUID } from 'node:crypto';
import { conductorVehiculo, documento } from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENTOS_REQUERIDOS,
  diasEntre,
  fechaBogota,
  type TipoDocumento,
} from '@transportaya/dominio';
import { and, desc, eq, or } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { ErrorNegocio, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { ALMACENAMIENTO, type Almacenamiento } from './almacenamiento.service.js';
import { detectarArchivo, TAMANO_MAXIMO_ARCHIVO } from './archivos.js';

export interface SubirDocumento {
  tipo: TipoDocumento;
  vehiculoId?: string | undefined;
  numero?: string | undefined;
  /** AAAA-MM-DD */
  venceEn?: string | undefined;
  archivo: Buffer;
}

@Injectable()
export class DocumentosService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(ALMACENAMIENTO) private readonly almacenamiento: Almacenamiento,
  ) {}

  async subir(conductorId: string, datos: SubirDocumento) {
    const requerido = DOCUMENTOS_REQUERIDOS.find((d) => d.tipo === datos.tipo);
    if (!requerido) throw solicitudInvalida('Ese tipo de documento no se pide.');

    if (datos.archivo.length === 0) throw solicitudInvalida('Adjunta el archivo del documento.');
    if (datos.archivo.length > TAMANO_MAXIMO_ARCHIVO)
      throw solicitudInvalida('El archivo pesa más de 6 MB.');
    const tipoArchivo = detectarArchivo(datos.archivo);
    if (!tipoArchivo)
      throw solicitudInvalida('El archivo debe ser una foto (JPG, PNG o WebP) o un PDF.');

    if (requerido.vence) {
      if (!datos.venceEn) throw solicitudInvalida('Escribe la fecha de vencimiento del documento.');
      if (diasEntre(fechaBogota(new Date()), datos.venceEn) < 0) {
        throw new ErrorNegocio(
          400,
          'DOCUMENTO_VENCIDO',
          'Ese documento ya está vencido. Súbelo renovado.',
        );
      }
    }

    let vehiculoId: string | null = null;
    if (requerido.titular === 'vehiculo') {
      if (!datos.vehiculoId)
        throw solicitudInvalida('Indica a qué vehículo pertenece el documento.');
      const [vinculo] = await this.bd.db
        .select({ v: conductorVehiculo.vehiculoId })
        .from(conductorVehiculo)
        .where(
          and(
            eq(conductorVehiculo.conductorId, conductorId),
            eq(conductorVehiculo.vehiculoId, datos.vehiculoId),
          ),
        );
      if (!vinculo)
        throw noEncontrado('VEHICULO_NO_ENCONTRADO', 'Ese vehículo no está en tu cuenta');
      vehiculoId = datos.vehiculoId;
    }

    const clave = `documentos/${conductorId}/${randomUUID()}.${tipoArchivo.extension}`;
    await this.almacenamiento.guardar(clave, datos.archivo);
    const [fila] = await this.bd.db
      .insert(documento)
      .values({
        titular: requerido.titular,
        conductorId: requerido.titular === 'conductor' ? conductorId : null,
        vehiculoId,
        tipo: datos.tipo,
        numero: datos.numero ?? null,
        venceEn: requerido.vence ? (datos.venceEn ?? null) : null,
        archivoClave: clave,
      })
      .returning();
    return resumen(fila!);
  }

  async listar(conductorId: string) {
    const filas = await this.bd.db
      .select()
      .from(documento)
      .leftJoin(conductorVehiculo, eq(conductorVehiculo.vehiculoId, documento.vehiculoId))
      .where(
        or(eq(documento.conductorId, conductorId), eq(conductorVehiculo.conductorId, conductorId)),
      )
      .orderBy(desc(documento.creadoEn));
    return filas.map((f) => resumen(f.documento));
  }

  /** Solo el dueño del documento puede ver su archivo. */
  async archivo(
    conductorId: string,
    documentoId: string,
  ): Promise<{ contenido: Buffer; mime: string }> {
    const filas = await this.bd.db
      .select({ d: documento })
      .from(documento)
      .leftJoin(conductorVehiculo, eq(conductorVehiculo.vehiculoId, documento.vehiculoId))
      .where(
        and(
          eq(documento.id, documentoId),
          or(
            eq(documento.conductorId, conductorId),
            eq(conductorVehiculo.conductorId, conductorId),
          ),
        ),
      );
    const fila = filas[0]?.d;
    if (!fila) throw noEncontrado('DOCUMENTO_NO_ENCONTRADO', 'No encontramos ese documento');
    const contenido = await this.almacenamiento.leer(fila.archivoClave);
    return { contenido, mime: detectarArchivo(contenido)?.mime ?? 'application/octet-stream' };
  }
}

function resumen(d: typeof documento.$inferSelect) {
  return {
    id: d.id,
    tipo: d.tipo,
    titular: d.titular,
    estado: d.estado,
    venceEn: d.venceEn,
    numero: d.numero,
    motivoRechazo: d.motivoRechazo,
    creadoEn: d.creadoEn.toISOString(),
  };
}
