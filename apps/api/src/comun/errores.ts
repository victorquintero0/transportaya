import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { contextoActual } from '../observabilidad/contexto.js';

/** Error de negocio con un código estable que las apps pueden interpretar (docs/10). */
export class ErrorNegocio extends HttpException {
  constructor(
    status: number,
    readonly codigo: string,
    readonly detalle: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super({ codigo, detalle, ...extra }, status);
  }
}

export const solicitudInvalida = (detalle: string, extra?: Record<string, unknown>) =>
  new ErrorNegocio(400, 'SOLICITUD_INVALIDA', detalle, extra);
export const noAutenticado = (
  codigo = 'NO_AUTENTICADO',
  detalle = 'Inicia sesión para continuar',
) => new ErrorNegocio(401, codigo, detalle);
export const prohibido = (codigo: string, detalle: string) =>
  new ErrorNegocio(403, codigo, detalle);
export const noEncontrado = (codigo: string, detalle: string) =>
  new ErrorNegocio(404, codigo, detalle);
export const conflicto = (codigo: string, detalle: string, extra?: Record<string, unknown>) =>
  new ErrorNegocio(409, codigo, detalle, extra);
export const demasiadasPeticiones = (codigo: string, detalle: string) =>
  new ErrorNegocio(429, codigo, detalle);

/** Respuestas de error en formato Problem Details (RFC 9457) con un `codigo` estable. */
@Catch()
export class FiltroProblemas implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost): void {
    const res = host
      .switchToHttp()
      .getResponse<{ status: (n: number) => { json: (b: unknown) => void } }>();

    if (error instanceof ErrorNegocio) {
      res.status(error.getStatus()).json({
        type: `/errores/${error.codigo.toLowerCase().replaceAll('_', '-')}`,
        title: error.detalle,
        status: error.getStatus(),
        codigo: error.codigo,
        detail: error.detalle,
        ...error.extra,
      });
      return;
    }
    if (error instanceof ZodError) {
      res.status(400).json({
        type: '/errores/solicitud-invalida',
        title: 'La solicitud no es válida',
        status: 400,
        codigo: 'SOLICITUD_INVALIDA',
        detail: error.issues.map((i) => `${i.path.join('.') || 'cuerpo'}: ${i.message}`).join('; '),
        errores: error.issues,
      });
      return;
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      res.status(status).json({
        type: 'about:blank',
        title: error.message,
        status,
        codigo: status === 404 ? 'NO_ENCONTRADO' : 'ERROR_HTTP',
        detail: error.message,
      });
      return;
    }
    const causa =
      error instanceof Error && error.cause instanceof Error
        ? `\nCausa: ${error.cause.message}`
        : '';
    this.log.error(
      (error instanceof Error ? (error.stack ?? error.message) : String(error)) + causa,
    );
    res.status(500).json({
      type: '/errores/error-interno',
      title: 'Algo salió mal de nuestro lado',
      status: 500,
      codigo: 'ERROR_INTERNO',
      detail: 'Intenta de nuevo en unos segundos',
      idSolicitud: contextoActual()?.id,
    });
  }
}
