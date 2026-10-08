import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { ParametrosService } from '../operacion/parametros.service.js';

export interface ResultadoRetencion {
  particionesCreadas: number;
  particionesEliminadas: number;
  posiciones: number;
  mensajes: number;
  trayectorias: number;
  codigosOtp: number;
  sesiones: number;
}

const DIAS_ADELANTE = 8;

/**
 * Retención de datos (RNF-64): borra lo que ya cumplió su plazo y mantiene creadas las particiones de posiciones de los
 * próximos días. Los plazos son parámetros que Operación puede cambiar; viajes, pagos y libros no se tocan.
 */
@Injectable()
export class RetencionService {
  private readonly log = new Logger('Retencion');

  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(ParametrosService) private readonly parametros: ParametrosService,
  ) {}

  /** Crea las particiones de hoy y los próximos días. Es seguro repetirla. */
  async asegurarParticiones(): Promise<number> {
    const r = await this.bd.db.execute<{ n: number }>(
      sql`select crear_particiones_posicion(((now() at time zone 'America/Bogota')::date), ${DIAS_ADELANTE}) as n`,
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async aplicar(): Promise<ResultadoRetencion> {
    const { db } = this.bd;
    const [posDias, chatDias, trayDias] = await Promise.all([
      this.parametros.numero('retencion.posiciones_dias'),
      this.parametros.numero('retencion.chats_dias'),
      this.parametros.numero('retencion.trayectorias_dias'),
    ]);
    const particionesCreadas = await this.asegurarParticiones();

    // Posiciones: las particiones enteras se sueltan de una vez; lo que quedó en la partición por defecto, fila a fila.
    const eliminadas = await db.execute<{ n: number }>(
      sql`select eliminar_particiones_posicion(((now() at time zone 'America/Bogota')::date - ${posDias}::int)) as n`,
    );
    const otras = await db.execute(
      sql`delete from posicion_conductor_otras where registrada_en < now() - make_interval(days => ${posDias}::int)`,
    );
    const mensajes = await db.execute(
      sql`delete from viaje_mensaje where creado_en < now() - make_interval(days => ${chatDias}::int)`,
    );
    const trayectorias = await db.execute(
      sql`update viaje set trayectoria = null
          where trayectoria is not null and coalesce(finalizado_en, actualizado_en) < now() - make_interval(days => ${trayDias}::int)`,
    );
    const otp = await db.execute(
      sql`delete from otp_codigo where creado_en < now() - interval '1 day'`,
    );
    const sesiones = await db.execute(
      sql`delete from sesion where expira_en < now() - interval '30 days'
          or revocada_en < now() - interval '30 days'`,
    );

    const resultado: ResultadoRetencion = {
      particionesCreadas,
      particionesEliminadas: Number(eliminadas.rows[0]?.n ?? 0),
      posiciones: otras.rowCount ?? 0,
      mensajes: mensajes.rowCount ?? 0,
      trayectorias: trayectorias.rowCount ?? 0,
      codigosOtp: otp.rowCount ?? 0,
      sesiones: sesiones.rowCount ?? 0,
    };
    this.log.log({ evento: 'retencion', msg: 'Retención de datos aplicada', ...resultado });
    return resultado;
  }
}
