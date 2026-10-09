import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { parametro } from '@transportaya/db';
import { RESERVA_POR_DEFECTO, type ParametrosReserva } from '@transportaya/dominio';
import { like } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { CATALOGO_PARAMETROS, type ClaveParametro } from './parametros.js';

const CACHE_MS = 10_000;

/** Lee los parámetros editables desde la base, con el valor por defecto cuando nadie los ha cambiado. */
@Injectable()
export class ParametrosService {
  private cache: { en: number; valores: Map<string, unknown> } | null = null;

  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  private async valores(): Promise<Map<string, unknown>> {
    if (this.cache && Date.now() - this.cache.en < CACHE_MS) return this.cache.valores;
    const filas = await this.bd.db.select().from(parametro);
    const valores = new Map(filas.map((f) => [f.clave, f.valor]));
    this.cache = { en: Date.now(), valores };
    return valores;
  }

  invalidar(): void {
    this.cache = null;
  }

  async numero(clave: ClaveParametro): Promise<number> {
    const v = (await this.valores()).get(clave);
    return typeof v === 'number' && Number.isFinite(v) ? v : CATALOGO_PARAMETROS[clave].defecto;
  }

  /** Los plazos de las reservas (RN-080 a RN-085) con los cambios que haya hecho Operación. */
  async reservas(): Promise<ParametrosReserva> {
    const [a, b, c, d, e, f, g, h, i] = await Promise.all([
      this.numero('reservas.anticipacion_min_min'),
      this.numero('reservas.anticipacion_max_dias'),
      this.numero('reservas.tablero_h'),
      this.numero('reservas.confirmar_min'),
      this.numero('reservas.despacho_min'),
      this.numero('reservas.alerta_min'),
      this.numero('reservas.cancelacion_gratis_min'),
      this.numero('reservas.soltar_min'),
      this.numero('reservas.espera_extra_min'),
    ]);
    return {
      ...RESERVA_POR_DEFECTO,
      anticipacionMinMin: a,
      anticipacionMaxDias: b,
      tableroH: c,
      confirmarMin: d,
      despachoMin: e,
      alertaMin: f,
      cancelacionGratisMin: g,
      soltarMin: h,
      esperaExtraMin: i,
    };
  }

  /** Los valores que alguien cambió a propósito, sin los que siguen en su valor por defecto. */
  async personalizados(prefijo: string): Promise<Record<string, number>> {
    const filas = await this.bd.db
      .select()
      .from(parametro)
      .where(like(parametro.clave, `${prefijo}%`));
    const r: Record<string, number> = {};
    for (const f of filas) if (typeof f.valor === 'number') r[f.clave] = f.valor;
    return r;
  }
}

@Global()
@Module({ providers: [ParametrosService], exports: [ParametrosService] })
export class ParametrosModule {}
