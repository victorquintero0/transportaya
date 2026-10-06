import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { otpCodigo } from '@transportaya/db';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { demasiadasPeticiones, noAutenticado } from '../comun/errores.js';
import { CONFIG, type Configuracion } from '../config.js';
import { PROVEEDOR_OTP, type ProveedorOtp } from './proveedor-otp.js';

const VIGENCIA_MS = 5 * 60_000;
const MAX_INTENTOS = 5;
const MAX_ENVIOS = 5;
const VENTANA_ENVIOS_MS = 15 * 60_000;

@Injectable()
export class OtpService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CONFIG) private readonly config: Configuracion,
    @Inject(PROVEEDOR_OTP) private readonly proveedor: ProveedorOtp,
  ) {}

  /** El código no se guarda: solo su HMAC, atado al teléfono (RNF-42). */
  private hash(telefono: string, codigo: string): string {
    return createHmac('sha256', this.config.JWT_SECRET)
      .update(`${telefono}:${codigo}`)
      .digest('hex');
  }

  async solicitar(telefono: string): Promise<{ expiraEn: Date; codigoSimulado?: string }> {
    const { db } = this.bd;
    const desde = new Date(Date.now() - VENTANA_ENVIOS_MS);
    const [recientes] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(otpCodigo)
      .where(and(eq(otpCodigo.telefono, telefono), gt(otpCodigo.creadoEn, desde)));
    if ((recientes?.n ?? 0) >= MAX_ENVIOS) {
      throw demasiadasPeticiones(
        'DEMASIADOS_CODIGOS',
        'Pediste muchos códigos. Espera unos minutos e intenta de nuevo.',
      );
    }

    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiraEn = new Date(Date.now() + VIGENCIA_MS);
    await db
      .insert(otpCodigo)
      .values({ telefono, codigoHash: this.hash(telefono, codigo), expiraEn });
    await this.proveedor.enviar(telefono, codigo);
    return this.proveedor.simulado ? { expiraEn, codigoSimulado: codigo } : { expiraEn };
  }

  /** Consume el código si es el correcto. Cada código sirve una sola vez. */
  async verificar(telefono: string, codigo: string): Promise<void> {
    const { db } = this.bd;
    const [fila] = await db
      .select()
      .from(otpCodigo)
      .where(
        and(
          eq(otpCodigo.telefono, telefono),
          isNull(otpCodigo.consumidoEn),
          gt(otpCodigo.expiraEn, new Date()),
        ),
      )
      .orderBy(desc(otpCodigo.creadoEn))
      .limit(1);
    if (!fila)
      throw noAutenticado('CODIGO_INVALIDO', 'El código no es válido o ya venció. Pide uno nuevo.');
    if (fila.intentos >= MAX_INTENTOS) {
      throw demasiadasPeticiones(
        'DEMASIADOS_INTENTOS',
        'Demasiados intentos. Pide un código nuevo.',
      );
    }

    const esperado = Buffer.from(fila.codigoHash);
    const recibido = Buffer.from(this.hash(telefono, codigo));
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) {
      await db
        .update(otpCodigo)
        .set({ intentos: sql`${otpCodigo.intentos} + 1` })
        .where(eq(otpCodigo.id, fila.id));
      throw noAutenticado('CODIGO_INVALIDO', 'El código no coincide. Revísalo e intenta de nuevo.');
    }

    // Consumirlo es atómico: si dos peticiones llegan a la vez, solo una lo logra.
    const consumido = await db
      .update(otpCodigo)
      .set({ consumidoEn: new Date() })
      .where(and(eq(otpCodigo.id, fila.id), isNull(otpCodigo.consumidoEn)))
      .returning({ id: otpCodigo.id });
    if (consumido.length === 0)
      throw noAutenticado('CODIGO_INVALIDO', 'Ese código ya se usó. Pide uno nuevo.');
  }
}

export const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');
