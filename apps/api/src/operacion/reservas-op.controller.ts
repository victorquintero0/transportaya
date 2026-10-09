import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { RequierePermiso, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { ReservasService } from '../viajes/reservas.service.js';
import { operadorDe } from './comun.js';

interface PeticionConIp {
  ip?: string;
}

const filtro = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  estado: z
    .enum(['sin_conductor', 'tomada', 'confirmada', 'buscando', 'asignada', 'en_curso', 'cerrada'])
    .optional(),
});
const motivo = z.string().trim().min(5).max(500);

/** OPE-09: las reservas por hora, con su estado, y la asignación o liberación de conductor a mano. */
@Controller('v1/op/reservas')
export class ReservasOperacionController {
  constructor(@Inject(ReservasService) private readonly reservas: ReservasService) {}

  @RequierePermiso('viajes.ver')
  @Get()
  listar(@Query() q: unknown) {
    const f = validar(filtro, q);
    const desde = f.desde ?? new Date(Date.now() - 3 * 3_600_000);
    const hasta = f.hasta ?? new Date(Date.now() + 8 * 86_400_000);
    return this.reservas.listarParaOperacion({ desde, hasta, estado: f.estado });
  }

  @RequierePermiso('viajes.despachar')
  @Get(':id/conductores')
  conductores(@Param('id', new ParseUUIDPipe()) id: string, @Query('q') q?: string) {
    return this.reservas.conductoresParaReserva(id, q?.slice(0, 60));
  }

  @RequierePermiso('viajes.despachar')
  @Post(':id/asignar')
  @HttpCode(200)
  async asignar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(z.object({ conductorId: z.string().uuid(), motivo }), cuerpo);
    await this.reservas.asignarDesdeOperacion(id, d.conductorId, d.motivo, operadorDe(u, req.ip));
    return { ok: true };
  }

  @RequierePermiso('viajes.despachar')
  @Post(':id/liberar')
  @HttpCode(200)
  async liberar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(z.object({ motivo }), cuerpo);
    await this.reservas.liberarDesdeOperacion(id, d.motivo, operadorDe(u, req.ip));
    return { ok: true };
  }
}
