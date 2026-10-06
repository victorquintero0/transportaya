import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { fechaBogota } from '@transportaya/dominio';
import { ConexionService } from './conductor/conexion.service.js';
import { VencimientosService } from './conductor/vencimientos.service.js';
import { CierresService } from './dinero/cierres.service.js';
import { ViajesService } from './viajes/viajes.service.js';

/** Trabajos periódicos de vigilancia. En producción se moverán a BullMQ (docs/08). */
@Injectable()
export class TareasService {
  private readonly log = new Logger('Tareas');

  constructor(
    @Inject(ConexionService) private readonly conexion: ConexionService,
    @Inject(ViajesService) private readonly viajes: ViajesService,
    @Inject(CierresService) private readonly cierres: CierresService,
    @Inject(VencimientosService) private readonly vencimientos: VencimientosService,
  ) {}

  @Interval(15_000)
  async vigilarSenal(): Promise<void> {
    try {
      const perdidos = await this.conexion.marcarSinSenal();
      const alertados = await this.viajes.vigilarSenal();
      if (perdidos.length || alertados.length) {
        this.log.warn(
          `Sin señal: ${perdidos.length} conductores, ${alertados.length} viajes en curso`,
        );
      }
    } catch (e) {
      this.log.error(`Vigilancia de señal: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 00:00 en Bogotá: cierra el día que acaba de terminar (RN-063, RN-070). */
  @Cron('0 0 * * *', { timeZone: 'America/Bogota' })
  async cierreDiario(): Promise<void> {
    try {
      await this.cierres.cerrarDia(fechaBogota(Date.now() - 3_600_000));
    } catch (e) {
      this.log.error(`Cierre diario: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** 00:05 en Bogotá: vence documentos y suspende a quien se quedó sin los obligatorios (RN-112). */
  @Cron('5 0 * * *', { timeZone: 'America/Bogota' })
  async vencimientosDiarios(): Promise<void> {
    try {
      await this.vencimientos.revisar();
    } catch (e) {
      this.log.error(`Vencimientos: ${e instanceof Error ? e.message : e}`);
    }
  }
}
