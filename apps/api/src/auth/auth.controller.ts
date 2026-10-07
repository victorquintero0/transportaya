import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { normalizarTelefono } from '../comun/telefono.js';
import { validar } from '../comun/zod.js';
import { AuthService, type ResultadoInicioSesion } from './auth.service.js';
import { Publico, UsuarioActual, type UsuarioAutenticado } from './decoradores.js';
import { OtpService } from './otp.service.js';
import { type Tokens, TokensService } from './tokens.service.js';

const solicitarOtp = z.object({ telefono: z.string().min(7).max(25) });
const verificarOtp = z.object({
  telefono: z.string().min(7).max(25),
  codigo: z.string().regex(/^[0-9]{6}$/, 'debe tener 6 dígitos'),
  app: z.enum(['conductor', 'pasajero']),
  dispositivo: z.string().max(200).optional(),
});
const refrescar = z.object({ refreshToken: z.string().min(20).max(200) });

interface PeticionConIp {
  ip?: string;
}

@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(TokensService) private readonly tokens: TokensService,
  ) {}

  /** Envía el código por WhatsApp o SMS. Con el proveedor simulado devuelve el código para mostrarlo en la app. */
  @Publico()
  @Post('otp')
  @HttpCode(200)
  async solicitar(
    @Body() cuerpo: unknown,
  ): Promise<{ telefono: string; expiraEn: string; simulado?: { codigo: string } }> {
    const { telefono: bruto } = validar(solicitarOtp, cuerpo);
    const telefono = normalizarTelefono(bruto);
    const r = await this.otp.solicitar(telefono);
    return {
      telefono,
      expiraEn: r.expiraEn.toISOString(),
      ...(r.codigoSimulado ? { simulado: { codigo: r.codigoSimulado } } : {}),
    };
  }

  @Publico()
  @Post('otp/verificar')
  @HttpCode(200)
  verificar(@Body() cuerpo: unknown, @Req() req: PeticionConIp): Promise<ResultadoInicioSesion> {
    const datos = validar(verificarOtp, cuerpo);
    return this.auth.iniciarSesion(normalizarTelefono(datos.telefono), datos.codigo, datos.app, {
      dispositivo: datos.dispositivo,
      ip: req.ip,
    });
  }

  @Publico()
  @Post('refrescar')
  @HttpCode(200)
  refrescar(@Body() cuerpo: unknown, @Req() req: PeticionConIp): Promise<Tokens> {
    const { refreshToken } = validar(refrescar, cuerpo);
    return this.tokens.refrescar(refreshToken, { ip: req.ip });
  }

  @Post('salir')
  @HttpCode(204)
  async salir(@UsuarioActual() usuario: UsuarioAutenticado): Promise<void> {
    await this.tokens.revocar(usuario.sesionId);
  }
}
