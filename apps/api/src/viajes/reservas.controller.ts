import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequiereRol, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { ReservasService } from './reservas.service.js';

/** Tablero de reservas del conductor (CON-30): ver las que puede tomar, tomarlas, confirmarlas y soltarlas. */
@Controller('v1/conductor/reservas')
@RequiereRol('conductor')
export class ReservasConductorController {
  constructor(@Inject(ReservasService) private readonly reservas: ReservasService) {}

  @Get()
  async listar(@UsuarioActual() u: UsuarioAutenticado) {
    const [disponibles, mias] = await Promise.all([
      this.reservas.tablero(u.id),
      this.reservas.mias(u.id),
    ]);
    return { disponibles, mias };
  }

  @Post(':id/tomar')
  @HttpCode(200)
  async tomar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.reservas.tomar(u.id, id);
    return { mias: await this.reservas.mias(u.id) };
  }

  @Post(':id/confirmar')
  @HttpCode(200)
  async confirmar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.reservas.confirmar(u.id, id);
    return { mias: await this.reservas.mias(u.id) };
  }

  @Post(':id/soltar')
  @HttpCode(200)
  async soltar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.reservas.soltar(u.id, id);
    return { mias: await this.reservas.mias(u.id) };
  }
}
