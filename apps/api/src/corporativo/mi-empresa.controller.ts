import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { RequierePermiso, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { operadorDe } from '../operacion/comun.js';
import { CorporativoService } from './corporativo.service.js';
import {
  cambioCentro,
  cambioEmpleado,
  cambioPolitica,
  centro,
  filtroViajes,
  invitacion,
  politica,
} from './esquemas.js';

interface PeticionConIp {
  ip?: string;
}

const uuid = () => new ParseUUIDPipe();

/**
 * Portal del administrador corporativo (D-09). La empresa nunca viaja en la petición: se lee de la cuenta de quien
 * pregunta, así que no hay forma de pedir los datos de otra. Puede gestionar empleados, centros de costo y políticas, y
 * ver el consumo y los estados de cuenta, pero no tocar el contrato ni los pagos.
 */
@Controller('v1/op/mi-empresa')
export class MiEmpresaController {
  constructor(@Inject(CorporativoService) private readonly corporativo: CorporativoService) {}

  @RequierePermiso('empresa.portal')
  @Get()
  async resumen(@UsuarioActual() u: UsuarioAutenticado) {
    return this.corporativo.detalle(await this.corporativo.empresaDelAdministrador(u.id));
  }

  @RequierePermiso('empresa.portal')
  @Get('centros')
  async centros(@UsuarioActual() u: UsuarioAutenticado) {
    return this.corporativo.listarCentros(await this.corporativo.empresaDelAdministrador(u.id));
  }

  @RequierePermiso('empresa.portal')
  @Post('centros')
  @HttpCode(201)
  async crearCentro(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.crearCentro(
      await this.corporativo.empresaDelAdministrador(u.id),
      validar(centro, cuerpo),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('empresa.portal')
  @Patch('centros/:centroId')
  async actualizarCentro(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('centroId', uuid()) centroId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.actualizarCentro(
      await this.corporativo.empresaDelAdministrador(u.id),
      centroId,
      validar(cambioCentro, cuerpo),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('empresa.portal')
  @Get('politicas')
  async politicas(@UsuarioActual() u: UsuarioAutenticado) {
    return this.corporativo.listarPoliticas(await this.corporativo.empresaDelAdministrador(u.id));
  }

  @RequierePermiso('empresa.portal')
  @Post('politicas')
  @HttpCode(201)
  async crearPolitica(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.crearPolitica(
      await this.corporativo.empresaDelAdministrador(u.id),
      validar(politica, cuerpo),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('empresa.portal')
  @Put('politicas/:politicaId')
  async actualizarPolitica(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('politicaId', uuid()) politicaId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.actualizarPolitica(
      await this.corporativo.empresaDelAdministrador(u.id),
      politicaId,
      validar(cambioPolitica, cuerpo),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('empresa.portal')
  @Get('empleados')
  async empleados(@UsuarioActual() u: UsuarioAutenticado) {
    return this.corporativo.listarEmpleados(await this.corporativo.empresaDelAdministrador(u.id));
  }

  @RequierePermiso('empresa.portal')
  @Post('empleados')
  @HttpCode(201)
  async invitar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.invitar(
      await this.corporativo.empresaDelAdministrador(u.id),
      validar(invitacion, cuerpo),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('empresa.portal')
  @Patch('empleados/:vinculoId')
  async actualizarEmpleado(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('vinculoId', uuid()) vinculoId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.corporativo.actualizarEmpleado(
      await this.corporativo.empresaDelAdministrador(u.id),
      vinculoId,
      validar(cambioEmpleado, cuerpo),
      operadorDe(u, req.ip),
    );
    return { ok: true };
  }

  @RequierePermiso('empresa.portal')
  @Delete('empleados/:vinculoId')
  @HttpCode(204)
  async retirar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('vinculoId', uuid()) vinculoId: string,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.corporativo.retirar(
      await this.corporativo.empresaDelAdministrador(u.id),
      vinculoId,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('empresa.portal')
  @Get('viajes')
  async viajes(@UsuarioActual() u: UsuarioAutenticado, @Query() q: unknown) {
    return this.corporativo.listarViajes(
      await this.corporativo.empresaDelAdministrador(u.id),
      validar(filtroViajes, q),
    );
  }

  @RequierePermiso('empresa.portal')
  @Get('estados-cuenta')
  async estados(@UsuarioActual() u: UsuarioAutenticado) {
    return this.corporativo.listarEstados(await this.corporativo.empresaDelAdministrador(u.id));
  }

  @RequierePermiso('empresa.portal')
  @Get('estados-cuenta/:estadoId')
  async estado(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('estadoId', uuid()) estadoId: string,
  ) {
    return this.corporativo.detalleEstado(
      await this.corporativo.empresaDelAdministrador(u.id),
      estadoId,
    );
  }
}
