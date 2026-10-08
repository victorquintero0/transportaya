import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Ip,
  Logger,
  Post,
  Res,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { z } from 'zod';
import { Publico, RequierePermiso } from '../auth/decoradores.js';
import { BaseDeDatos } from '../bd/bd.module.js';
import { demasiadasPeticiones, noEncontrado, noAutenticado } from '../comun/errores.js';
import { validar } from '../comun/zod.js';
import { CONFIG, type Configuracion } from '../config.js';
import { EstadoTareasService } from './estado-tareas.service.js';
import { MetricasService } from './metricas.service.js';

const errorDeApp = z.object({
  app: z.enum(['conductor', 'pasajero', 'operacion']),
  mensaje: z.string().trim().min(1).max(500),
  pila: z.string().max(2000).optional(),
  ruta: z.string().max(200).optional(),
  version: z.string().max(40).optional(),
  idSolicitud: z.string().max(64).optional(),
});

const POR_MINUTO_Y_DIRECCION = 20;

export type EstadoGeneral = 'ok' | 'degradado' | 'caido';

@Controller('v1')
export class ObservabilidadController {
  private readonly log = new Logger('Cliente');
  private readonly avisos = new Map<string, number[]>();

  constructor(
    @Inject(CONFIG)
    private readonly config: Pick<
      Configuracion,
      'METRICAS_TOKEN' | 'NODE_ENV' | 'VERSION' | 'SIMULADOR'
    >,
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(MetricasService) private readonly metricas: MetricasService,
    @Inject(EstadoTareasService) private readonly tareas: EstadoTareasService,
  ) {}

  /** Mide si la base responde y cuánto tarda. */
  async sondearBd(): Promise<{ ok: boolean; latenciaMs: number | null }> {
    const t0 = process.hrtime.bigint();
    try {
      await Promise.race([
        this.bd.pool.query('select 1'),
        new Promise((_, no) => setTimeout(() => no(new Error('tiempo agotado')), 2000).unref()),
      ]);
      return { ok: true, latenciaMs: Math.round(Number(process.hrtime.bigint() - t0) / 1e5) / 10 };
    } catch {
      return { ok: false, latenciaMs: null };
    }
  }

  /** ¿Puede esta instancia atender tráfico? Es lo que consulta el balanceador: 503 si la base no responde. */
  @Publico()
  @Get('listo')
  async listo(@Res({ passthrough: true }) res: Response) {
    const bd = await this.sondearBd();
    const atrasadas = this.tareas
      .estado()
      .filter((t) => t.atrasada)
      .map((t) => t.nombre);
    if (!bd.ok) res.status(503);
    return {
      estado: (bd.ok ? (atrasadas.length ? 'degradado' : 'ok') : 'caido') satisfies EstadoGeneral,
      baseDatos: bd.ok,
      tareasAtrasadas: atrasadas,
      version: this.config.VERSION,
    };
  }

  /**
   * Métricas en formato Prometheus (RNF-82). Con `METRICAS_TOKEN` exige `Authorization: Bearer <token>`; en producción,
   * sin token configurado, no existe.
   */
  @Publico()
  @Get('metricas')
  async verMetricas(@Headers('authorization') cabecera: string | undefined, @Res() res: Response) {
    const token = this.config.METRICAS_TOKEN;
    if (!token && this.config.NODE_ENV === 'production')
      throw noEncontrado('NO_ENCONTRADO', 'No encontrado');
    if (token) {
      const dado = Buffer.from((cabecera ?? '').replace(/^Bearer /, ''));
      const esperado = Buffer.from(token);
      if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado))
        throw noAutenticado('NO_AUTENTICADO', 'Falta el token de métricas');
    }
    res.setHeader('content-type', this.metricas.registro.contentType);
    res.send(await this.metricas.registro.metrics());
  }

  /** Errores que las apps no pudieron manejar. Van al registro con el identificador de la solicitud (RNF-80). */
  @Publico()
  @Post('telemetria/errores')
  @HttpCode(204)
  reportarError(@Body() cuerpo: unknown, @Ip() ip: string): void {
    const ahora = Date.now();
    const recientes = (this.avisos.get(ip) ?? []).filter((t) => ahora - t < 60_000);
    if (recientes.length >= POR_MINUTO_Y_DIRECCION)
      throw demasiadasPeticiones(
        'DEMASIADAS_PETICIONES',
        'Demasiados reportes. Espera un momento.',
      );
    recientes.push(ahora);
    this.avisos.set(ip, recientes);
    if (this.avisos.size > 5000) this.avisos.clear();

    const e = validar(errorDeApp, cuerpo);
    this.metricas.errorDeApp(e.app);
    this.log.warn({
      evento: 'error_de_app',
      msg: `${e.app}: ${e.mensaje}`,
      app: e.app,
      ruta: e.ruta,
      version: e.version,
      solicitudAnterior: e.idSolicitud,
      pila: e.pila,
    });
  }

  /** Estado del sistema para la pantalla «Sistema» de la App Operación. */
  @RequierePermiso('sistema.ver')
  @Get('op/sistema')
  async sistema() {
    const [bd, negocio] = await Promise.all([this.sondearBd(), this.metricas.negocio()]);
    const tareas = this.tareas.estado();
    const http15 = this.metricas.http(15);
    const tasa5xx = http15.solicitudes >= 20 ? http15.errores5xx / http15.solicitudes : 0;
    const problemas: string[] = [];
    if (!bd.ok) problemas.push('La base de datos no responde.');
    for (const t of tareas.filter((x) => x.atrasada))
      problemas.push(`La tarea «${t.nombre}» está atrasada.`);
    if (tasa5xx > 0.05)
      problemas.push(
        `Más del 5 % de las solicitudes fallan (${http15.errores5xx} de ${http15.solicitudes}).`,
      );
    const pool = this.bd.pool;
    return {
      estado: (!bd.ok ? 'caido' : problemas.length ? 'degradado' : 'ok') satisfies EstadoGeneral,
      problemas,
      version: this.config.VERSION,
      entorno: this.config.NODE_ENV,
      simulador: this.config.SIMULADOR,
      inicioEn: new Date(this.metricas.inicio).toISOString(),
      memoriaMb: Math.round(process.memoryUsage().rss / 1_048_576),
      baseDatos: {
        ...bd,
        pool: { total: pool.totalCount, ociosas: pool.idleCount, esperando: pool.waitingCount },
      },
      tiempoReal: this.metricas.conexionesPorRol(),
      http: { ultimos15min: http15, serie: this.metricas.serie(30) },
      tareas,
      negocio,
      erroresDeApps15min: this.metricas.erroresDeAppsEn(15),
    };
  }
}
