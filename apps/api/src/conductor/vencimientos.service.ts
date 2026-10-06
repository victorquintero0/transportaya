import { alerta, conductor, documento } from '@transportaya/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { fechaBogota } from '@transportaya/dominio';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { Eventos } from '../tiempo-real/eventos.service.js';
import { ConexionService } from './conexion.service.js';
import { PerfilService } from './perfil.service.js';

export interface ResultadoVencimientos {
  documentosVencidos: number;
  suspendidos: string[];
  reactivados: string[];
}

/** RN-112: al vencer un documento obligatorio el conductor queda suspendido hasta que se apruebe el nuevo. */
@Injectable()
export class VencimientosService {
  private readonly log = new Logger('Vencimientos');

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(PerfilService) private readonly perfil: PerfilService,
    @Inject(ConexionService) private readonly conexion: ConexionService,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  async revisar(hoy = fechaBogota(new Date())): Promise<ResultadoVencimientos> {
    const { db } = this.bd;
    const vencidos = await db
      .update(documento)
      .set({ estado: 'vencido' })
      .where(and(eq(documento.estado, 'aprobado'), lt(documento.venceEn, hoy)))
      .returning({ id: documento.id });

    const suspendidos: string[] = [];
    const reactivados: string[] = [];
    const filas = await db
      .select({
        id: conductor.usuarioId,
        estado: conductor.estadoHabilitacion,
        vehiculoId: conductor.vehiculoActivoId,
      })
      .from(conductor)
      .where(inArray(conductor.estadoHabilitacion, ['habilitado', 'suspendido']));

    for (const c of filas) {
      const evaluacion = await this.perfil.evaluarDocumentos(c.id, c.vehiculoId, hoy);
      if (c.estado === 'habilitado' && !evaluacion.habilitado) {
        await db
          .update(conductor)
          .set({ estadoHabilitacion: 'suspendido' })
          .where(eq(conductor.usuarioId, c.id));
        const malos = evaluacion.requisitos
          .filter((r) => r.estado !== 'aprobado' && r.estado !== 'por_vencer')
          .map((r) => r.titulo);
        await db.insert(alerta).values({
          tipo: 'documento_vencido',
          severidad: 'baja',
          conductorId: c.id,
          datos: { documentos: malos },
        });
        try {
          await this.conexion.desconectar(c.id); // si va en un viaje, lo termina; no se le interrumpe
        } catch {
          /* viaje en curso */
        }
        this.eventos.aConductor(c.id, 'conductor:estado', {
          estadoOperativo: 'desconectado',
          motivo: 'documento_vencido',
        });
        suspendidos.push(c.id);
      } else if (c.estado === 'suspendido' && evaluacion.habilitado) {
        await db
          .update(conductor)
          .set({ estadoHabilitacion: 'habilitado' })
          .where(eq(conductor.usuarioId, c.id));
        reactivados.push(c.id);
      }
    }
    this.log.log(
      `Vencimientos al ${hoy}: ${vencidos.length} documentos, ${suspendidos.length} suspendidos, ${reactivados.length} reactivados`,
    );
    return { documentosVencidos: vencidos.length, suspendidos, reactivados };
  }
}
