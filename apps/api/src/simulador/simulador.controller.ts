import { Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { conductor, documento, usuario } from '@transportaya/db';
import { and, eq, sql } from 'drizzle-orm';
import { RequiereRol, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado } from '../comun/errores.js';
import { CONFIG, type Configuracion } from '../config.js';
import { PerfilService } from '../conductor/perfil.service.js';

/** Teléfono reservado del revisor simulado. */
const REVISOR_SIMULADO = '+570000000001';

/**
 * Herramientas para probar sin los demás actores. Solo existen con `SIMULADOR=true` (nunca en producción):
 * cualquier otra configuración responde 404 como si la ruta no existiera.
 */
@Controller('v1/dev')
@RequiereRol('conductor')
export class SimuladorController {
  constructor(
    @Inject(CONFIG) private readonly config: Pick<Configuracion, 'SIMULADOR'>,
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(PerfilService) private readonly perfil: PerfilService,
  ) {}

  private exigirSimulador(): void {
    if (!this.config.SIMULADOR) throw noEncontrado('NO_ENCONTRADO', 'Ruta no encontrada');
  }

  /** Hace de analista de cumplimiento: aprueba todos los documentos y habilita al conductor. */
  @Post('conductor/aprobar')
  @HttpCode(200)
  async aprobar(@UsuarioActual() u: UsuarioAutenticado) {
    this.exigirSimulador();
    const { db } = this.bd;
    const [yo] = await db
      .select({ estado: conductor.estadoHabilitacion })
      .from(conductor)
      .where(eq(conductor.usuarioId, u.id));
    if (yo?.estado !== 'en_revision') {
      throw conflicto('NO_ESTA_EN_REVISION', 'Primero envía tu registro a revisión.');
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(usuario)
        .values({ telefono: REVISOR_SIMULADO, nombre: 'Revisión simulada' })
        .onConflictDoNothing();
      const [revisor] = await tx
        .select({ id: usuario.id })
        .from(usuario)
        .where(eq(usuario.telefono, REVISOR_SIMULADO));
      await tx
        .update(documento)
        .set({ estado: 'aprobado', revisadoPor: revisor!.id, revisadoEn: new Date() })
        .where(and(eq(documento.estado, 'pendiente'), eq(documento.conductorId, u.id)));
      // y los de sus vehículos
      await tx.execute(
        sql`update documento set estado = 'aprobado', revisado_por = ${revisor!.id}, revisado_en = now()
          where estado = 'pendiente' and vehiculo_id in (select vehiculo_id from conductor_vehiculo where conductor_id = ${u.id})`,
      );
      await tx
        .update(conductor)
        .set({ estadoHabilitacion: 'habilitado' })
        .where(eq(conductor.usuarioId, u.id));
    });
    return this.perfil.obtener(u.id);
  }
}
