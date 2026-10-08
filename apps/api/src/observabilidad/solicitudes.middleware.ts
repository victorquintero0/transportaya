import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { type ContextoSolicitud, contexto, idValido } from './contexto.js';
import { MetricasService } from './metricas.service.js';

/** Rutas que se miden pero no se escriben en el registro: las consulta un monitor cada pocos segundos. */
const SILENCIOSAS = new Set(['/v1/salud', '/v1/listo', '/v1/metricas']);

/**
 * Le pone a cada solicitud un identificador (el que manda la app en `x-request-id`, o uno nuevo), lo devuelve en la
 * respuesta, lo deja disponible para todo el registro de esa solicitud y mide su duración (RNF-80, RNF-82).
 */
@Injectable()
export class MiddlewareSolicitudes implements NestMiddleware {
  private readonly log = new Logger('Http');

  constructor(@Inject(MetricasService) private readonly metricas: MetricasService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const entrante = req.headers['x-request-id'];
    const ctx: ContextoSolicitud = { id: idValido(entrante) ? entrante : randomUUID() };
    res.setHeader('x-request-id', ctx.id);
    const t0 = process.hrtime.bigint();

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      // La plantilla de la ruta (`/v1/viajes/:id`), no la dirección real: así no se disparan las etiquetas.
      const ruta = req.route?.path ? `${req.baseUrl ?? ''}${String(req.route.path)}` : 'sin_ruta';
      this.metricas.solicitud(req.method, ruta, res.statusCode, ms);
      if (SILENCIOSAS.has(ruta)) return;
      const linea = {
        evento: 'solicitud',
        msg: `${req.method} ${ruta} ${res.statusCode} ${Math.round(ms)} ms`,
        metodo: req.method,
        ruta,
        estado: res.statusCode,
        ms: Math.round(ms * 10) / 10,
        ...(ctx.usuarioId ? { usuario: ctx.usuarioId, rol: ctx.rol } : {}),
      };
      if (res.statusCode >= 500) this.log.error(linea);
      else if (res.statusCode >= 400) this.log.warn(linea);
      else this.log.log(linea);
    });

    contexto.run(ctx, () => next());
  }
}
