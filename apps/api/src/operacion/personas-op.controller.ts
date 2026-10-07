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
  Res,
} from '@nestjs/common';
import { tienePermiso } from '@transportaya/dominio';
import { z } from 'zod';
import { RequierePermiso, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { prohibido } from '../comun/errores.js';
import { validar } from '../comun/zod.js';
import { motivoObligatorio, operadorDe, paginacion } from './comun.js';
import { ConductoresOperacionService } from './conductores-op.service.js';
import { PasajerosOperacionService } from './pasajeros-op.service.js';

interface PeticionConIp {
  ip?: string;
}
interface Respuesta {
  setHeader(n: string, v: string): void;
  end(b: Buffer): void;
}

const filtroConductores = paginacion.extend({
  q: z.string().trim().max(80).optional(),
  estado: z.string().max(30).optional(),
});
const filtroPasajeros = paginacion.extend({
  q: z.string().trim().max(80).optional(),
  estado: z.string().max(30).optional(),
  conDeuda: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
const aprobar = z.object({
  venceEn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
const dias = z.object({ dias: z.coerce.number().int().min(1).max(365).optional() });

@Controller('v1/op')
export class PersonasOperacionController {
  constructor(
    @Inject(ConductoresOperacionService) private readonly conductores: ConductoresOperacionService,
    @Inject(PasajerosOperacionService) private readonly pasajeros: PasajerosOperacionService,
  ) {}

  @RequierePermiso('conductores.ver')
  @Get('conductores')
  listar(@Query() q: unknown) {
    return this.conductores.listar(validar(filtroConductores, q));
  }

  @RequierePermiso('conductores.ver')
  @Get('vencimientos')
  vencimientos(@Query() q: unknown) {
    return this.conductores.vencimientos(validar(dias, q).dias);
  }

  @RequierePermiso('conductores.ver')
  @Get('conductores/:id')
  ficha(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.conductores.ficha(id);
  }

  @RequierePermiso('conductores.aprobar')
  @Get('documentos/:id/archivo')
  async archivo(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: PeticionConIp,
    @Res() res: Respuesta,
  ): Promise<void> {
    const { contenido, mime } = await this.conductores.archivoDocumento(id, operadorDe(u, req.ip));
    res.setHeader('content-type', mime);
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.end(contenido);
  }

  @RequierePermiso('conductores.aprobar')
  @Post('documentos/:id/aprobar')
  @HttpCode(200)
  aprobarDocumento(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.conductores.aprobarDocumento(
      id,
      validar(aprobar, cuerpo ?? {}),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('conductores.aprobar')
  @Post('documentos/:id/rechazar')
  @HttpCode(200)
  rechazarDocumento(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.conductores.rechazarDocumento(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('conductores.aprobar')
  @Post('conductores/:id/habilitar')
  @HttpCode(204)
  async habilitar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.conductores.habilitar(id, operadorDe(u, req.ip));
  }

  @RequierePermiso('conductores.aprobar')
  @Post('conductores/:id/rechazar-registro')
  @HttpCode(204)
  async rechazarRegistro(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.conductores.rechazarRegistro(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('conductores.suspender')
  @Post('conductores/:id/suspender')
  @HttpCode(204)
  async suspender(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.conductores.suspender(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('conductores.bloquear')
  @Post('conductores/:id/bloquear')
  @HttpCode(204)
  async bloquear(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.conductores.bloquear(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  /** El monitor levanta suspensiones temporales; un bloqueo solo lo levanta quien puede bloquear. */
  @RequierePermiso('conductores.suspender')
  @Post('conductores/:id/reactivar')
  @HttpCode(204)
  async reactivar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    const motivo = validar(motivoObligatorio, cuerpo).motivo;
    const ficha = await this.conductores.ficha(id);
    if (
      ficha.estadoHabilitacion === 'bloqueado' &&
      !tienePermiso(u.roles ?? [], 'conductores.bloquear')
    )
      throw prohibido('SIN_PERMISO', 'Solo cumplimiento o supervisión levantan un bloqueo.');
    await this.conductores.reactivar(id, motivo, operadorDe(u, req.ip));
  }

  @RequierePermiso('pasajeros.ver')
  @Get('pasajeros')
  listarPasajeros(@Query() q: unknown) {
    return this.pasajeros.listar(validar(filtroPasajeros, q));
  }

  @RequierePermiso('pasajeros.ver')
  @Get('pasajeros/:id')
  fichaPasajero(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.pasajeros.ficha(id);
  }

  @RequierePermiso('pasajeros.bloquear')
  @Post('pasajeros/:id/bloquear')
  @HttpCode(204)
  async bloquearPasajero(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.pasajeros.bloquear(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('pasajeros.bloquear')
  @Post('pasajeros/:id/desbloquear')
  @HttpCode(204)
  async desbloquearPasajero(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.pasajeros.desbloquear(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }
}
