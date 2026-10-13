import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import type { RolReferido } from '@transportaya/dominio';
import { z } from 'zod';
import { RequiereRol, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { ReferidosService } from './referidos.service.js';

const codigo = z.object({ codigo: z.string().trim().min(3).max(20) });
const abonar = z.object({ puntos: z.number().int().positive().max(1_000_000).optional() });
const movimientos = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(30),
  antes: z.coerce.date().optional(),
});

/**
 * Referidos y puntos para quien usa las apps (PAS-70, CON-40). La app desde la que se pregunta decide el rol: quien
 * entra a la App Conductor usa el código como conductor y quien entra a la App Pasajero, como pasajero.
 */
@Controller('v1/referidos')
export class ReferidosController {
  constructor(@Inject(ReferidosService) private readonly referidos: ReferidosService) {}

  @RequiereRol('pasajero', 'conductor')
  @Get()
  resumen(@UsuarioActual() u: UsuarioAutenticado) {
    return this.referidos.resumen(u.id, u.rol as RolReferido);
  }

  @RequiereRol('pasajero', 'conductor')
  @Get('movimientos')
  movimientos(@UsuarioActual() u: UsuarioAutenticado, @Query() q: unknown) {
    const f = validar(movimientos, q);
    return this.referidos.movimientos(u.id, f.limite, f.antes);
  }

  /** «Tengo un código»: la persona escribe el de quien la invitó. */
  @RequiereRol('pasajero', 'conductor')
  @Post('codigo')
  @HttpCode(200)
  usarCodigo(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.referidos.aplicarCodigo(u.id, u.rol as RolReferido, validar(codigo, cuerpo).codigo);
  }

  /** El conductor paga con puntos parte o toda su comisión pendiente (RN-128). */
  @RequiereRol('conductor')
  @Post('abonar')
  @HttpCode(200)
  abonar(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.referidos.abonarComision(u.id, validar(abonar, cuerpo).puntos);
  }
}
