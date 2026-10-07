import { Inject, Injectable } from '@nestjs/common';
import { ciudad, conductor, pasajero, usuario } from '@transportaya/db';
import { eq } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { prohibido, solicitudInvalida } from '../comun/errores.js';
import type { PayloadAcceso } from './jwt.js';
import { OtpService } from './otp.service.js';
import { type MetaSesion, type Tokens, TokensService } from './tokens.service.js';

export interface ResultadoInicioSesion extends Tokens {
  usuario: { id: string; nombre: string; telefono: string };
  /** Primera vez que esta persona entra: la app debe llevarla al registro. */
  nuevo: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(TokensService) private readonly tokens: TokensService,
  ) {}

  /**
   * Inicia sesión con el código OTP. Si el celular no existía se crea la persona y su rol
   * (conductor o pasajero) en la misma operación.
   */
  async iniciarSesion(
    telefono: string,
    codigo: string,
    app: Exclude<PayloadAcceso['rol'], 'interno'>,
    meta: MetaSesion,
  ): Promise<ResultadoInicioSesion> {
    await this.otp.verificar(telefono, codigo);
    const { db } = this.bd;

    let nuevo = false;
    let [persona] = await db.select().from(usuario).where(eq(usuario.telefono, telefono));
    if (!persona) {
      [persona] = await db
        .insert(usuario)
        .values({ telefono, nombre: 'Sin nombre' })
        .onConflictDoNothing()
        .returning();
      // Si dos peticiones llegaron a la vez, la otra ya la creó.
      persona ??= (await db.select().from(usuario).where(eq(usuario.telefono, telefono)))[0];
      nuevo = true;
    }
    if (!persona) throw solicitudInvalida('No se pudo crear la cuenta');
    if (persona.estado !== 'activo') {
      throw prohibido('USUARIO_BLOQUEADO', 'Tu cuenta no está activa. Comunícate con soporte.');
    }

    if (app === 'conductor') {
      const [existente] = await db
        .select({ id: conductor.usuarioId })
        .from(conductor)
        .where(eq(conductor.usuarioId, persona.id));
      if (!existente) {
        nuevo = true;
        const [laCiudad] = await db
          .select({ id: ciudad.id })
          .from(ciudad)
          .where(eq(ciudad.activa, true))
          .limit(1);
        if (!laCiudad)
          throw solicitudInvalida('Todavía no hay una ciudad activa para registrar conductores');
        await db
          .insert(conductor)
          .values({ usuarioId: persona.id, ciudadId: laCiudad.id })
          .onConflictDoNothing();
      }
    } else {
      await db.insert(pasajero).values({ usuarioId: persona.id }).onConflictDoNothing();
    }

    const tokens = await this.tokens.crearSesion(persona.id, app, meta);
    return {
      ...tokens,
      usuario: { id: persona.id, nombre: persona.nombre, telefono: persona.telefono },
      nuevo,
    };
  }
}
