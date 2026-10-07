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
import { ROLES_INTERNOS } from '@transportaya/dominio';
import { z } from 'zod';
import { RequierePermiso, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { normalizarTelefono } from '../comun/telefono.js';
import { validar } from '../comun/zod.js';
import { contrasenaTemporal } from './contrasena.js';
import { EmpleadosService } from './empleados.service.js';
import { paginacion } from './comun.js';

const rol = z.enum(ROLES_INTERNOS);
const nuevo = z.object({
  nombre: z.string().trim().min(3).max(120),
  telefono: z.string().min(7).max(25),
  email: z.string().email().max(200),
  roles: z.array(rol).min(1),
});
const cambio = z.object({
  roles: z.array(rol).min(1).optional(),
  activo: z.boolean().optional(),
  motivo: z.string().trim().min(5).max(500),
});
const soloMotivo = z.object({ motivo: z.string().trim().min(5).max(500) });
const filtroAuditoria = z.object({
  usuarioId: z.string().uuid().optional(),
  entidad: z.string().max(60).optional(),
  entidadId: z.string().uuid().optional(),
  accion: z.string().max(80).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

interface PeticionConIp {
  ip?: string;
}

@Controller('v1/op')
export class UsuariosOperacionController {
  constructor(@Inject(EmpleadosService) private readonly empleados: EmpleadosService) {}

  @RequierePermiso('usuarios.ver')
  @Get('usuarios')
  listar() {
    return this.empleados.listar();
  }

  @RequierePermiso('usuarios.gestionar')
  @Post('usuarios')
  @HttpCode(201)
  async crear(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(nuevo, cuerpo);
    const temporal = contrasenaTemporal();
    const id = await this.empleados.crear(
      { ...d, telefono: normalizarTelefono(d.telefono), contrasena: temporal },
      { id: u.id, ip: req.ip },
    );
    return { id, contrasenaTemporal: temporal };
  }

  @RequierePermiso('usuarios.gestionar')
  @Patch('usuarios/:id')
  actualizar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.empleados.actualizar(id, validar(cambio, cuerpo), { id: u.id, ip: req.ip });
  }

  @RequierePermiso('usuarios.gestionar')
  @Post('usuarios/:id/reiniciar-segundo-factor')
  @HttpCode(204)
  async reiniciarTotp(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.empleados.reiniciarSegundoFactor(id, validar(soloMotivo, cuerpo).motivo, {
      id: u.id,
      ip: req.ip,
    });
  }

  @RequierePermiso('usuarios.gestionar')
  @Post('usuarios/:id/restablecer-contrasena')
  @HttpCode(200)
  restablecer(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.empleados.restablecerContrasena(id, validar(soloMotivo, cuerpo).motivo, {
      id: u.id,
      ip: req.ip,
    });
  }

  @RequierePermiso('usuarios.ver')
  @Get('auditoria')
  auditoria(@Query() q: unknown) {
    const f = validar(filtroAuditoria.extend(paginacion.shape), q);
    return this.empleados.consultarAuditoria(f);
  }
}
