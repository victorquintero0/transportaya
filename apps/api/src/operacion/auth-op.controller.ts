import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  Publico,
  RequiereRol,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../auth/decoradores.js';
import { noEncontrado } from '../comun/errores.js';
import { validar } from '../comun/zod.js';
import { AuthOperacionService } from './auth-op.service.js';
import { EmpleadosService } from './empleados.service.js';

const credenciales = z.object({
  email: z.string().email().max(200),
  contrasena: z.string().min(1).max(200),
});
const ingreso = credenciales.extend({
  codigo: z
    .string()
    .regex(/^[0-9]{6}$/, 'debe tener 6 dígitos')
    .optional(),
});
const cambio = z.object({ actual: z.string().min(1).max(200), nueva: z.string().min(1).max(200) });

interface PeticionConIp {
  ip?: string;
}

@Controller('v1/op')
export class AuthOperacionController {
  constructor(
    @Inject(AuthOperacionService) private readonly auth: AuthOperacionService,
    @Inject(EmpleadosService) private readonly empleados: EmpleadosService,
  ) {}

  /** Primer ingreso: da el secreto del segundo factor para la app de autenticación. */
  @Publico()
  @Post('auth/enrolar')
  @HttpCode(200)
  enrolar(@Body() cuerpo: unknown) {
    const d = validar(credenciales, cuerpo);
    return this.auth.enrolar(d.email, d.contrasena);
  }

  /** Correo + contraseña + código TOTP (RNF-43). */
  @Publico()
  @Post('auth/ingresar')
  @HttpCode(200)
  ingresar(@Body() cuerpo: unknown, @Req() req: PeticionConIp) {
    return this.auth.ingresar(validar(ingreso, cuerpo), { ip: req.ip });
  }

  /** Cuentas de demostración para entrar con un clic. Solo existe con el simulador activo. */
  @Publico()
  @Get('auth/demo')
  demo() {
    const r = this.auth.cuentasDemo();
    if (!r) throw noEncontrado('NO_ENCONTRADO', 'Ruta no encontrada');
    return r;
  }

  @RequiereRol('interno')
  @Get('yo')
  yo(@UsuarioActual() u: UsuarioAutenticado) {
    return this.empleados.perfil(u.id);
  }

  @RequiereRol('interno')
  @Post('yo/contrasena')
  @HttpCode(204)
  async cambiarContrasena(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    const d = validar(cambio, cuerpo);
    await this.auth.cambiarContrasena(u.id, d.actual, d.nueva, req.ip);
  }
}
