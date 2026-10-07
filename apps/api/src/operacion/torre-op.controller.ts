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
import { TorreService } from './torre.service.js';
import { ViajesOperacionService } from './viajes-op.service.js';

interface PeticionConIp {
  ip?: string;
}

const filtroViajes = paginacion.extend({
  q: z.string().trim().max(80).optional(),
  estado: z.string().max(30).optional(),
  tipoServicio: z.string().max(30).optional(),
  conductorId: z.string().uuid().optional(),
  pasajeroId: z.string().uuid().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});
const despachar = z.object({ conductorId: z.string().uuid() });
const reasignar = z.object({
  conductorId: z.string().uuid().optional(),
  motivo: z.string().trim().min(5).max(500),
});
const ajustar = z.object({
  precioFinal: z.number().int().positive().max(5_000_000),
  motivo: z.string().trim().min(10).max(500),
});
const cerrarAlerta = z.object({ nota: z.string().trim().min(5).max(500) });

@Controller('v1/op')
export class TorreOperacionController {
  constructor(
    @Inject(TorreService) private readonly torre: TorreService,
    @Inject(ViajesOperacionService) private readonly viajes: ViajesOperacionService,
  ) {}

  @RequierePermiso('torre.ver')
  @Get('torre')
  resumen() {
    return this.torre.resumen();
  }

  @RequierePermiso('torre.ver')
  @Get('alertas')
  alertas(@Query('estado') estado?: string) {
    const estados = (estado ?? 'abierta,tomada')
      .split(',')
      .filter((e): e is 'abierta' | 'tomada' | 'cerrada' =>
        ['abierta', 'tomada', 'cerrada'].includes(e),
      );
    return this.torre.alertas(estados.length ? estados : ['abierta', 'tomada']);
  }

  @RequierePermiso('torre.operar')
  @Post('alertas/:id/tomar')
  @HttpCode(204)
  async tomar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.torre.tomar(id, operadorDe(u, req.ip));
  }

  @RequierePermiso('torre.operar')
  @Post('alertas/:id/cerrar')
  @HttpCode(204)
  async cerrar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.torre.cerrar(id, validar(cerrarAlerta, cuerpo).nota, operadorDe(u, req.ip));
  }

  @RequierePermiso('viajes.ver')
  @Get('viajes')
  listar(@Query() q: unknown) {
    return this.viajes.listar(validar(filtroViajes, q));
  }

  @RequierePermiso('viajes.ver')
  @Get('viajes/:id')
  detalle(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.viajes.detalle(id);
  }

  @RequierePermiso('viajes.ver')
  @Get('viajes/:id/recorrido')
  recorrido(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.viajes.recorrido(id);
  }

  @RequierePermiso('viajes.despachar')
  @Post('viajes/:id/despachar')
  @HttpCode(204)
  async despachar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.viajes.despachar(id, validar(despachar, cuerpo).conductorId, operadorDe(u, req.ip));
  }

  @RequierePermiso('viajes.despachar')
  @Post('viajes/:id/reasignar')
  @HttpCode(204)
  async reasignar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.viajes.reasignar(id, validar(reasignar, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('viajes.despachar')
  @Post('viajes/:id/cancelar')
  @HttpCode(204)
  async cancelar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.viajes.cancelar(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('viajes.ajustar_tarifa')
  @Post('viajes/:id/ajustar-precio')
  @HttpCode(200)
  ajustarPrecio(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(ajustar, cuerpo);
    return this.viajes.ajustarPrecio(id, d.precioFinal, d.motivo, operadorDe(u, req.ip));
  }
}
