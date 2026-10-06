import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sesion, usuario } from '@transportaya/db';
import { and, eq, isNull } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { noAutenticado } from '../comun/errores.js';
import { CONFIG, type Configuracion } from '../config.js';
import type { UsuarioAutenticado } from './decoradores.js';
import { firmarJwt, type PayloadAcceso, verificarJwt } from './jwt.js';
import { sha256 } from './otp.service.js';

/** Tokens de acceso de corta vida (RNF-41). */
export const TTL_ACCESO_S = 15 * 60;
const TTL_REFRESCO_MS = 30 * 24 * 60 * 60_000;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Segundos que dura el token de acceso. */
  expiraEnS: number;
}

export interface MetaSesion {
  dispositivo?: string | undefined;
  ip?: string | undefined;
}

@Injectable()
export class TokensService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CONFIG) private readonly config: Configuracion,
  ) {}

  async crearSesion(
    usuarioId: string,
    rol: PayloadAcceso['rol'],
    meta: MetaSesion = {},
  ): Promise<Tokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const [fila] = await this.bd.db
      .insert(sesion)
      .values({
        usuarioId,
        rol,
        tokenHash: sha256(refreshToken),
        dispositivo: meta.dispositivo ?? null,
        ip: meta.ip ?? null,
        expiraEn: new Date(Date.now() + TTL_REFRESCO_MS),
      })
      .returning({ id: sesion.id });
    const accessToken = firmarJwt(
      { sub: usuarioId, sid: fila!.id, rol },
      this.config.JWT_SECRET,
      TTL_ACCESO_S,
    );
    return { accessToken, refreshToken, expiraEnS: TTL_ACCESO_S };
  }

  /**
   * Cambia un refresh token por uno nuevo y revoca el anterior (rotación). Si alguien presenta un
   * token ya usado, se asume robo y se cierran todas las sesiones de esa persona.
   */
  async refrescar(refreshToken: string, meta: MetaSesion = {}): Promise<Tokens> {
    const { db } = this.bd;
    const [fila] = await db
      .select()
      .from(sesion)
      .where(eq(sesion.tokenHash, sha256(refreshToken)));
    if (!fila)
      throw noAutenticado('SESION_INVALIDA', 'Tu sesión no es válida. Inicia sesión de nuevo.');

    if (fila.revocadaEn) {
      await db
        .update(sesion)
        .set({ revocadaEn: new Date() })
        .where(and(eq(sesion.usuarioId, fila.usuarioId), isNull(sesion.revocadaEn)));
      throw noAutenticado(
        'SESION_REVOCADA',
        'Tu sesión se cerró por seguridad. Inicia sesión de nuevo.',
      );
    }
    if (fila.expiraEn.getTime() <= Date.now()) {
      throw noAutenticado('SESION_VENCIDA', 'Tu sesión venció. Inicia sesión de nuevo.');
    }

    const revocada = await db
      .update(sesion)
      .set({ revocadaEn: new Date() })
      .where(and(eq(sesion.id, fila.id), isNull(sesion.revocadaEn)))
      .returning({ id: sesion.id });
    if (revocada.length === 0) throw noAutenticado('SESION_REVOCADA', 'Tu sesión ya no es válida.');

    return this.crearSesion(fila.usuarioId, fila.rol as PayloadAcceso['rol'], {
      dispositivo: meta.dispositivo ?? fila.dispositivo ?? undefined,
      ip: meta.ip ?? fila.ip ?? undefined,
    });
  }

  async revocar(sesionId: string): Promise<void> {
    await this.bd.db
      .update(sesion)
      .set({ revocadaEn: new Date() })
      .where(and(eq(sesion.id, sesionId), isNull(sesion.revocadaEn)));
  }

  /**
   * Valida un token de acceso y que su sesión siga vigente y su usuario activo. Lo usan el guard de
   * HTTP y el WebSocket. Devuelve `null` si algo no cuadra.
   */
  async autenticar(token: string): Promise<UsuarioAutenticado | null> {
    const payload = verificarJwt(token, this.config.JWT_SECRET);
    if (!payload) return null;
    const [fila] = await this.bd.db
      .select({ revocadaEn: sesion.revocadaEn, expiraEn: sesion.expiraEn, estado: usuario.estado })
      .from(sesion)
      .innerJoin(usuario, eq(usuario.id, sesion.usuarioId))
      .where(eq(sesion.id, payload.sid));
    if (
      !fila ||
      fila.revocadaEn ||
      fila.expiraEn.getTime() <= Date.now() ||
      fila.estado !== 'activo'
    )
      return null;
    return { id: payload.sub, sesionId: payload.sid, rol: payload.rol };
  }
}
