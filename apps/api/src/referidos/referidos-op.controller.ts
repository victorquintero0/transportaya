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
import { motivoObligatorio, operadorDe, paginacion } from '../operacion/comun.js';
import { ReferidosOpService } from './referidos-op.service.js';

interface PeticionConIp {
  ip?: string;
}

const filtro = paginacion.extend({
  estado: z.enum(['pendiente', 'otorgado', 'rechazado']).optional(),
  q: z.string().trim().max(60).optional(),
});
const ajuste = motivoObligatorio.extend({
  puntos: z
    .number()
    .int()
    .refine((n) => n !== 0, 'el ajuste no puede ser cero')
    .refine((n) => Math.abs(n) <= 100_000, 'máximo 100.000 puntos por ajuste'),
});

/** OPE-14: el programa de referidos y puntos visto desde la operación. */
@Controller('v1/op/referidos')
export class ReferidosOperacionController {
  constructor(@Inject(ReferidosOpService) private readonly servicio: ReferidosOpService) {}

  @RequierePermiso('referidos.ver')
  @Get('resumen')
  resumen() {
    return this.servicio.resumen();
  }

  @RequierePermiso('referidos.ver')
  @Get()
  listar(@Query() q: unknown) {
    return this.servicio.listar(validar(filtro, q));
  }

  @RequierePermiso('referidos.ver')
  @Get('personas/:id')
  persona(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.persona(id);
  }

  @RequierePermiso('referidos.gestionar')
  @Post('personas/:id/ajustar')
  @HttpCode(200)
  ajustar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Req() req: PeticionConIp,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    const d = validar(ajuste, cuerpo);
    return this.servicio.ajustar(operadorDe(u, req.ip), id, d.puntos, d.motivo);
  }

  @RequierePermiso('referidos.gestionar')
  @Post(':id/rechazar')
  @HttpCode(200)
  rechazar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Req() req: PeticionConIp,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.servicio.rechazar(
      operadorDe(u, req.ip),
      id,
      validar(motivoObligatorio, cuerpo).motivo,
    );
  }

  @RequierePermiso('referidos.gestionar')
  @Post(':id/revertir')
  @HttpCode(200)
  revertir(
    @UsuarioActual() u: UsuarioAutenticado,
    @Req() req: PeticionConIp,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.servicio.revertir(
      operadorDe(u, req.ip),
      id,
      validar(motivoObligatorio, cuerpo).motivo,
    );
  }
}
