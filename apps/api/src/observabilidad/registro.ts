import type { LogLevel, LoggerService } from '@nestjs/common';
import { contextoActual } from './contexto.js';

export type NivelRegistro = 'debug' | 'info' | 'warn' | 'error';
const ORDEN: Record<NivelRegistro, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const DE_NEST: Record<string, NivelRegistro> = {
  verbose: 'debug',
  debug: 'debug',
  log: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

/**
 * Registro de la API: una línea JSON por evento, con el identificador de la solicitud (RNF-80). En desarrollo se
 * imprime legible. Nunca se escriben contraseñas, tokens ni datos de tarjetas: quien registra decide qué campos pasa.
 */
export class RegistroApp implements LoggerService {
  constructor(
    private readonly formato: 'json' | 'texto',
    private readonly nivel: NivelRegistro = 'info',
    private readonly salida: (linea: string) => void = (l) => process.stdout.write(`${l}\n`),
  ) {}

  log(mensaje: unknown, ...resto: unknown[]) {
    this.escribir('log', mensaje, resto);
  }
  warn(mensaje: unknown, ...resto: unknown[]) {
    this.escribir('warn', mensaje, resto);
  }
  error(mensaje: unknown, ...resto: unknown[]) {
    this.escribir('error', mensaje, resto);
  }
  debug(mensaje: unknown, ...resto: unknown[]) {
    this.escribir('debug', mensaje, resto);
  }
  verbose(mensaje: unknown, ...resto: unknown[]) {
    this.escribir('verbose', mensaje, resto);
  }
  fatal(mensaje: unknown, ...resto: unknown[]) {
    this.escribir('fatal', mensaje, resto);
  }
  setLogLevels(_niveles: LogLevel[]) {
    /* El nivel se define por configuración (LOG_NIVEL). */
  }

  private escribir(nestNivel: string, mensaje: unknown, resto: unknown[]) {
    const nivel = DE_NEST[nestNivel] ?? 'info';
    if (ORDEN[nivel] < ORDEN[this.nivel]) return;

    // Nest pasa el contexto como último texto; en los errores, antes puede venir la pila.
    const textos = resto.filter((r): r is string => typeof r === 'string');
    const contextoNest = textos.length > 0 ? textos[textos.length - 1] : undefined;
    const pila = nivel === 'error' && textos.length > 1 ? textos[0] : undefined;

    const campos =
      typeof mensaje === 'object' && mensaje !== null && !(mensaje instanceof Error)
        ? (mensaje as Record<string, unknown>)
        : undefined;
    const texto =
      mensaje instanceof Error
        ? mensaje.message
        : campos
          ? String(campos['msg'] ?? campos['evento'] ?? '')
          : String(mensaje);
    const ctx = contextoActual();

    if (this.formato === 'json') {
      const linea: Record<string, unknown> = {
        t: new Date().toISOString(),
        nivel,
        contexto: contextoNest,
        ...(ctx ? { req: ctx.id } : {}),
        ...(campos ?? {}),
        msg: texto,
        ...(mensaje instanceof Error ? { pila: mensaje.stack } : pila ? { pila } : {}),
      };
      this.salida(JSON.stringify(linea));
      return;
    }
    const extra = campos
      ? ` ${JSON.stringify(Object.fromEntries(Object.entries(campos).filter(([k]) => k !== 'msg')))}`
      : '';
    this.salida(
      `${new Date().toISOString().slice(11, 23)} ${nivel.toUpperCase().padEnd(5)} [${contextoNest ?? '-'}]${ctx ? ` (${ctx.id.slice(0, 8)})` : ''} ${texto}${extra}${pila ? `\n${pila}` : ''}`,
    );
  }
}
