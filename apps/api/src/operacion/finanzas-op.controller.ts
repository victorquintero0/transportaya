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
import { motivoObligatorio, operadorDe, paginacion } from './comun.js';
import { FinanzasOperacionService } from './finanzas-op.service.js';

interface PeticionConIp {
  ip?: string;
}
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

@Controller('v1/op/finanzas')
export class FinanzasOperacionController {
  constructor(
    @Inject(FinanzasOperacionService) private readonly finanzas: FinanzasOperacionService,
  ) {}

  @RequierePermiso('finanzas.ver')
  @Get('resumen')
  resumen() {
    return this.finanzas.resumen();
  }

  @RequierePermiso('finanzas.ver')
  @Get('cierres')
  cierres(@Query() q: unknown) {
    return this.finanzas.listarCierres(
      validar(
        paginacion.extend({ dia: fecha.optional(), estado: z.string().max(30).optional() }),
        q,
      ),
    );
  }

  @RequierePermiso('finanzas.operar')
  @Post('cierres/ejecutar')
  @HttpCode(200)
  ejecutar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.finanzas.ejecutarCierre(
      validar(z.object({ dia: fecha }), cuerpo).dia,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('finanzas.ver')
  @Get('cobranza')
  cobranza() {
    return this.finanzas.cobranza();
  }

  @RequierePermiso('finanzas.operar')
  @Post('pagos-comision/:id/conciliar')
  @HttpCode(200)
  conciliar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: PeticionConIp,
  ) {
    return this.finanzas.conciliar(id, operadorDe(u, req.ip));
  }

  @RequierePermiso('finanzas.operar')
  @Post('pagos-comision/:id/rechazar')
  @HttpCode(204)
  async rechazarComision(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.finanzas.rechazarPagoComision(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('finanzas.operar')
  @Post('conductores/:id/habilitar')
  @HttpCode(204)
  async habilitar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.finanzas.habilitarPorDeuda(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('finanzas.ver')
  @Get('conductores/:id/movimientos')
  libro(@Param('id', new ParseUUIDPipe()) id: string, @Query('limite') limite?: string) {
    return this.finanzas.libro(id, Math.min(200, Math.max(1, Number(limite) || 50)));
  }

  @RequierePermiso('finanzas.ver')
  @Get('pagos-conductor')
  pagosConductor(@Query('estado') estado?: string) {
    return this.finanzas.pagosAConductores(estado);
  }

  @RequierePermiso('finanzas.operar')
  @Post('pagos-conductor/:id/enviar')
  @HttpCode(204)
  async enviar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: PeticionConIp,
  ) {
    await this.finanzas.enviarPagoAConductor(id, operadorDe(u, req.ip));
  }

  @RequierePermiso('finanzas.operar')
  @Post('pagos-conductor/:id/confirmar')
  @HttpCode(200)
  confirmar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: PeticionConIp,
  ) {
    return this.finanzas.confirmarPagoAConductor(id, operadorDe(u, req.ip));
  }

  @RequierePermiso('finanzas.operar')
  @Post('pagos-conductor/:id/rechazar')
  @HttpCode(204)
  async rechazarPagoConductor(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.finanzas.rechazarPagoAConductor(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('finanzas.ver')
  @Get('ajustes')
  ajustes(@Query('estado') estado?: string) {
    return this.finanzas.ajustes(estado);
  }

  @RequierePermiso('finanzas.proponer_ajuste')
  @Post('ajustes')
  @HttpCode(201)
  proponer(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(
      z.object({
        conductorId: z.string().uuid(),
        monto: z
          .number()
          .int()
          .refine((m) => m !== 0, 'no puede ser cero')
          .refine((m) => Math.abs(m) <= 5_000_000, 'excede el máximo'),
        motivo: z.string().trim().min(10).max(500),
        viajeId: z.string().uuid().optional(),
      }),
      cuerpo,
    );
    return this.finanzas.proponerAjuste(d, operadorDe(u, req.ip));
  }

  @RequierePermiso('finanzas.aprobar_ajuste')
  @Post('ajustes/:id/aprobar')
  @HttpCode(200)
  aprobar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: PeticionConIp,
  ) {
    return this.finanzas.aprobarAjuste(id, operadorDe(u, req.ip));
  }

  @RequierePermiso('finanzas.aprobar_ajuste')
  @Post('ajustes/:id/rechazar')
  @HttpCode(204)
  async rechazarAjuste(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.finanzas.rechazarAjuste(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }
}
