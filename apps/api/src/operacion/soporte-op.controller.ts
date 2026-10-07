import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { RequierePermiso, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { operadorDe, paginacion } from './comun.js';
import { SoporteOperacionService } from './soporte-op.service.js';

interface PeticionConIp {
  ip?: string;
}

const tipos = [
  'peticion',
  'queja',
  'reclamo',
  'sugerencia',
  'objeto_perdido',
  'cobro_incorrecto',
  'incidente_seguridad',
] as const;
const prioridades = ['baja', 'normal', 'alta', 'critica'] as const;
const estados = ['abierto', 'en_proceso', 'esperando_usuario', 'resuelto', 'cerrado'] as const;

const filtro = paginacion.extend({
  q: z.string().trim().max(80).optional(),
  estado: z.string().max(30).optional(),
  tipo: z.enum(tipos).optional(),
  prioridad: z.enum(prioridades).optional(),
  asignado: z.string().max(40).optional(),
  vencidos: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
const nuevo = z.object({
  usuarioId: z.string().uuid(),
  tipo: z.enum(tipos),
  prioridad: z.enum(prioridades).optional(),
  viajeId: z.string().uuid().optional(),
  asunto: z.string().trim().min(5).max(200),
  detalle: z.string().trim().max(2000).optional(),
});
const respuesta = z.object({
  cuerpo: z.string().trim().min(1).max(2000),
  interno: z.boolean().default(false),
});
const cambio = z.object({
  estado: z.enum(estados).optional(),
  prioridad: z.enum(prioridades).optional(),
  asignadoA: z.string().uuid().nullable().optional(),
});
const reembolso = z.object({
  monto: z.number().int().positive().max(2_000_000),
  motivo: z.string().trim().min(5).max(500),
});

@Controller('v1/op')
export class SoporteOperacionController {
  constructor(@Inject(SoporteOperacionService) private readonly soporte: SoporteOperacionService) {}

  @RequierePermiso('tickets.ver')
  @Get('tickets')
  listar(@UsuarioActual() u: UsuarioAutenticado, @Query() q: unknown) {
    return this.soporte.listar(validar(filtro, q), u.id);
  }

  @RequierePermiso('tickets.ver')
  @Get('agentes')
  agentes() {
    return this.soporte.agentes();
  }

  @RequierePermiso('tickets.ver')
  @Get('tickets/:id')
  detalle(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.soporte.detalle(id);
  }

  @RequierePermiso('tickets.gestionar')
  @Post('tickets')
  @HttpCode(201)
  crear(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.soporte.crear(validar(nuevo, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('tickets.gestionar')
  @Post('tickets/:id/mensajes')
  @HttpCode(204)
  async responder(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.soporte.responder(id, validar(respuesta, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('tickets.gestionar')
  @Patch('tickets/:id')
  @HttpCode(204)
  async actualizar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.soporte.actualizar(id, validar(cambio, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('reembolsos.crear')
  @Post('tickets/:id/reembolso')
  @HttpCode(201)
  reembolsar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.soporte.reembolsar(
      id,
      validar(reembolso, cuerpo),
      operadorDe(u, req.ip),
      u.roles ?? [],
    );
  }
}
