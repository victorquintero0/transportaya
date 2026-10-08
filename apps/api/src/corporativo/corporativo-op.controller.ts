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
import { fechaBogota } from '@transportaya/dominio';
import { z } from 'zod';
import { RequierePermiso, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { conflicto } from '../comun/errores.js';
import { validar } from '../comun/zod.js';
import { EmpleadosService } from '../operacion/empleados.service.js';
import { operadorDe } from '../operacion/comun.js';
import { CorporativoService } from './corporativo.service.js';
import {
  cambioCentro,
  cambioContrato,
  cambioEmpleado,
  cambioPolitica,
  centro,
  filtroViajes,
  generar,
  invitacion,
  nuevaEmpresa,
  nuevoAdministrador,
  pago,
  politica,
  soloMotivo,
} from './esquemas.js';

interface PeticionConIp {
  ip?: string;
}

const uuid = () => new ParseUUIDPipe();

/**
 * OPE-10: empresas clientes vistas por el personal de TransporteYa. Quien solo consulta (soporte) ve todo; quien gestiona
 * (finanzas, supervisión, administración) pacta el contrato, suspende, genera estados de cuenta y registra sus pagos.
 */
@Controller('v1/op/empresas')
export class EmpresasOperacionController {
  constructor(
    @Inject(CorporativoService) private readonly corporativo: CorporativoService,
    @Inject(EmpleadosService) private readonly empleados: EmpleadosService,
  ) {}

  @RequierePermiso('corporativo.ver')
  @Get()
  listar() {
    return this.corporativo.listarEmpresas();
  }

  @RequierePermiso('corporativo.gestionar')
  @Post()
  @HttpCode(201)
  crear(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.crearEmpresa(validar(nuevaEmpresa, cuerpo), operadorDe(u, req.ip));
  }

  // Los estados de cuenta van antes de `:id` para que no se confundan con una empresa.
  @RequierePermiso('corporativo.ver')
  @Get('estados-cuenta')
  estados() {
    return this.corporativo.listarEstados();
  }

  @RequierePermiso('corporativo.gestionar')
  @Post('estados-cuenta/:estadoId/pago')
  @HttpCode(200)
  async pagar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('estadoId', uuid()) estadoId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(pago, cuerpo);
    await this.corporativo.registrarPago(
      estadoId,
      { referencia: d.referencia },
      d.motivo,
      operadorDe(u, req.ip),
    );
    return { ok: true };
  }

  @RequierePermiso('corporativo.gestionar')
  @Post('estados-cuenta/:estadoId/anular')
  @HttpCode(200)
  async anular(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('estadoId', uuid()) estadoId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.corporativo.anular(
      estadoId,
      validar(soloMotivo, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
    return { ok: true };
  }

  @RequierePermiso('corporativo.ver')
  @Get(':id')
  detalle(@Param('id', uuid()) id: string) {
    return this.corporativo.detalle(id);
  }

  @RequierePermiso('corporativo.gestionar')
  @Patch(':id/contrato')
  contrato(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const { motivo, ...datos } = validar(cambioContrato, cuerpo);
    return this.corporativo.actualizarContrato(id, datos, motivo, operadorDe(u, req.ip));
  }

  @RequierePermiso('corporativo.gestionar')
  @Post(':id/suspender')
  @HttpCode(200)
  async suspender(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.corporativo.cambiarEstado(
      id,
      'suspendida',
      validar(soloMotivo, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
    return { ok: true };
  }

  @RequierePermiso('corporativo.gestionar')
  @Post(':id/reactivar')
  @HttpCode(200)
  async reactivar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.corporativo.cambiarEstado(
      id,
      'activa',
      validar(soloMotivo, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
    return { ok: true };
  }

  // ───────────────────────────────────────── administradores corporativos (rol externo)

  @RequierePermiso('corporativo.ver')
  @Get(':id/administradores')
  administradores(@Param('id', uuid()) id: string) {
    return this.corporativo.listarAdministradores(id);
  }

  @RequierePermiso('corporativo.gestionar')
  @Post(':id/administradores')
  @HttpCode(201)
  crearAdministrador(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.crearAdministrador(
      id,
      validar(nuevoAdministrador, cuerpo),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('corporativo.gestionar')
  @Post(':id/administradores/:usuarioId/restablecer')
  @HttpCode(200)
  async restablecer(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Param('usuarioId', uuid()) usuarioId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.corporativo.verificarAdministrador(id, usuarioId);
    return this.empleados.restablecerContrasena(
      usuarioId,
      validar(soloMotivo, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('corporativo.gestionar')
  @Post(':id/administradores/:usuarioId/reiniciar-segundo-factor')
  @HttpCode(204)
  async reiniciarTotp(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Param('usuarioId', uuid()) usuarioId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.corporativo.verificarAdministrador(id, usuarioId);
    await this.empleados.reiniciarSegundoFactor(
      usuarioId,
      validar(soloMotivo, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('corporativo.gestionar')
  @Patch(':id/administradores/:usuarioId')
  async activar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Param('usuarioId', uuid()) usuarioId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(soloMotivo.extend({ activo: z.boolean() }), cuerpo);
    await this.corporativo.verificarAdministrador(id, usuarioId);
    if (usuarioId === u.id)
      throw conflicto('NO_PUEDES_DESACTIVARTE', 'No puedes cambiar tu propia cuenta.');
    await this.empleados.actualizar(
      usuarioId,
      { activo: d.activo, motivo: d.motivo },
      operadorDe(u, req.ip),
    );
    return { ok: true };
  }

  // ───────────────────────────────────────── centros, políticas, empleados, viajes

  @RequierePermiso('corporativo.ver')
  @Get(':id/centros')
  centros(@Param('id', uuid()) id: string) {
    return this.corporativo.listarCentros(id);
  }

  @RequierePermiso('corporativo.gestionar')
  @Post(':id/centros')
  @HttpCode(201)
  crearCentro(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.crearCentro(id, validar(centro, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('corporativo.gestionar')
  @Patch(':id/centros/:centroId')
  actualizarCentro(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Param('centroId', uuid()) centroId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.actualizarCentro(
      id,
      centroId,
      validar(cambioCentro, cuerpo),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('corporativo.ver')
  @Get(':id/politicas')
  politicas(@Param('id', uuid()) id: string) {
    return this.corporativo.listarPoliticas(id);
  }

  @RequierePermiso('corporativo.gestionar')
  @Post(':id/politicas')
  @HttpCode(201)
  crearPolitica(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.crearPolitica(id, validar(politica, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('corporativo.gestionar')
  @Put(':id/politicas/:politicaId')
  actualizarPolitica(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Param('politicaId', uuid()) politicaId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.actualizarPolitica(
      id,
      politicaId,
      validar(cambioPolitica, cuerpo),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('corporativo.ver')
  @Get(':id/empleados')
  listarEmpleados(@Param('id', uuid()) id: string) {
    return this.corporativo.listarEmpleados(id);
  }

  @RequierePermiso('corporativo.gestionar')
  @Post(':id/empleados')
  @HttpCode(201)
  invitar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.corporativo.invitar(id, validar(invitacion, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('corporativo.gestionar')
  @Patch(':id/empleados/:vinculoId')
  async actualizarEmpleado(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Param('vinculoId', uuid()) vinculoId: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.corporativo.actualizarEmpleado(
      id,
      vinculoId,
      validar(cambioEmpleado, cuerpo),
      operadorDe(u, req.ip),
    );
    return { ok: true };
  }

  @RequierePermiso('corporativo.gestionar')
  @Delete(':id/empleados/:vinculoId')
  @HttpCode(204)
  async retirar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Param('vinculoId', uuid()) vinculoId: string,
    @Req() req: PeticionConIp,
  ): Promise<void> {
    await this.corporativo.retirar(id, vinculoId, operadorDe(u, req.ip));
  }

  @RequierePermiso('corporativo.ver')
  @Get(':id/viajes')
  viajes(@Param('id', uuid()) id: string, @Query() q: unknown) {
    return this.corporativo.listarViajes(id, validar(filtroViajes, q));
  }

  @RequierePermiso('corporativo.ver')
  @Get(':id/estados-cuenta')
  estadosDe(@Param('id', uuid()) id: string) {
    return this.corporativo.listarEstados(id);
  }

  @RequierePermiso('corporativo.ver')
  @Get(':id/estados-cuenta/:estadoId')
  estado(@Param('id', uuid()) id: string, @Param('estadoId', uuid()) estadoId: string) {
    return this.corporativo.detalleEstado(id, estadoId);
  }

  @RequierePermiso('corporativo.gestionar')
  @Post(':id/estados-cuenta/generar')
  @HttpCode(200)
  async generar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', uuid()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(generar, cuerpo);
    const hasta = d.hasta ?? fechaBogota(Date.now() - 86_400_000);
    if (hasta >= fechaBogota(new Date()))
      throw conflicto(
        'CICLO_ABIERTO',
        'Solo se cobran días que ya terminaron: elige una fecha anterior a hoy.',
      );
    const e = await this.corporativo.generarEstado(id, hasta, operadorDe(u, req.ip));
    if (!e)
      throw conflicto(
        'NADA_QUE_COBRAR',
        'No hay viajes por cobrar hasta esa fecha, o ya se generó ese estado de cuenta.',
      );
    return { id: e.id, codigo: e.codigo, total: e.total };
  }
}
