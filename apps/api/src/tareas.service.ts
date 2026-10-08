import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { fechaBogota } from '@transportaya/dominio';
import { ConexionService } from './conductor/conexion.service.js';
import { VencimientosService } from './conductor/vencimientos.service.js';
import { CierresService } from './dinero/cierres.service.js';
import { EstadoTareasService } from './observabilidad/estado-tareas.service.js';
import { CorporativoService } from './corporativo/corporativo.service.js';
import { RetencionService } from './privacidad/retencion.service.js';
import { ReservasService } from './viajes/reservas.service.js';
import { ViajesService } from './viajes/viajes.service.js';

const DIA_MS = 24 * 3_600_000;

/** Trabajos periódicos de vigilancia. En producción se moverán a BullMQ (docs/08). */
@Injectable()
export class TareasService implements OnModuleInit, OnApplicationBootstrap {
  private readonly log = new Logger('Tareas');

  constructor(
    @Inject(ConexionService) private readonly conexion: ConexionService,
    @Inject(ViajesService) private readonly viajes: ViajesService,
    @Inject(CierresService) private readonly cierres: CierresService,
    @Inject(VencimientosService) private readonly vencimientos: VencimientosService,
    @Inject(EstadoTareasService) private readonly estado: EstadoTareasService,
    @Inject(RetencionService) private readonly retencion: RetencionService,
    @Inject(ReservasService) private readonly reservas: ReservasService,
    @Inject(CorporativoService) private readonly corporativo: CorporativoService,
  ) {}

  onModuleInit(): void {
    this.estado.registrar(
      'vigilar_senal',
      'Marca sin señal a quien dejó de reportar posición',
      15_000,
    );
    this.estado.registrar(
      'reservas',
      'Libera las reservas sin confirmar, activa las que llegaron a su hora y alerta las que siguen sin conductor',
      30_000,
    );
    this.estado.registrar('cierre_diario', 'Cierre de cuentas del día (00:00)', DIA_MS);
    this.estado.registrar(
      'retencion',
      'Borra datos que cumplieron su plazo y crea particiones (03:30)',
      DIA_MS,
    );
    this.estado.registrar(
      'estados_cuenta',
      'Genera los estados de cuenta de las empresas clientes al cerrar su ciclo (00:10)',
      DIA_MS,
    );
    this.estado.registrar(
      'vencimientos',
      'Vence documentos y suspende a quien no los tiene (00:05)',
      DIA_MS,
    );
  }

  /** Al arrancar se aseguran las particiones de posiciones de hoy y los próximos días, sin esperar a la madrugada. */
  async onApplicationBootstrap(): Promise<void> {
    await this.estado.correr('retencion', async () => {
      await this.retencion.asegurarParticiones();
    });
    // Las reservas que debieron activarse mientras la API estaba caída se activan de una vez.
    await this.estado.correr('reservas', () => this.reservas.mantener());
    // Si la API estuvo caída el día de corte, el estado de cuenta se genera al volver (es idempotente).
    await this.estado.correr('estados_cuenta', () => this.corporativo.generarPendientes());
  }

  /** Cada día a las 00:10: el estado de cuenta del ciclo que cerró (RN-105). */
  @Cron('10 0 * * *', { timeZone: 'America/Bogota' })
  async estadosDeCuentaDiarios(): Promise<void> {
    await this.estado.correr('estados_cuenta', () => this.corporativo.generarPendientes());
  }

  /** Cada 30 s: el ciclo de vida de las reservas (RN-082, RN-083). */
  @Interval(30_000)
  async reservasPeriodicas(): Promise<void> {
    await this.estado.correr('reservas', () => this.reservas.mantener());
  }

  @Interval(15_000)
  async vigilarSenal(): Promise<void> {
    await this.estado.correr('vigilar_senal', async () => {
      const perdidos = await this.conexion.marcarSinSenal();
      const alertados = await this.viajes.vigilarSenal();
      if (perdidos.length || alertados.length) {
        this.log.warn(
          `Sin señal: ${perdidos.length} conductores, ${alertados.length} viajes en curso`,
        );
      }
    });
  }

  /** 00:00 en Bogotá: cierra el día que acaba de terminar (RN-063, RN-070). */
  @Cron('0 0 * * *', { timeZone: 'America/Bogota' })
  async cierreDiario(): Promise<void> {
    await this.estado.correr('cierre_diario', () =>
      this.cierres.cerrarDia(fechaBogota(Date.now() - 3_600_000)),
    );
  }

  /** 00:05 en Bogotá: vence documentos y suspende a quien se quedó sin los obligatorios (RN-112). */
  @Cron('5 0 * * *', { timeZone: 'America/Bogota' })
  async vencimientosDiarios(): Promise<void> {
    await this.estado.correr('vencimientos', () => this.vencimientos.revisar());
  }

  /** 03:30 en Bogotá: crea las particiones de los próximos días y borra lo que ya cumplió su plazo (RNF-64). */
  @Cron('30 3 * * *', { timeZone: 'America/Bogota' })
  async retencionDiaria(): Promise<void> {
    await this.estado.correr('retencion', () => this.retencion.aplicar());
  }
}
