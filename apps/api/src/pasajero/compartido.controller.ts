import { Controller, Get, Inject, Param } from '@nestjs/common';
import { Publico } from '../auth/decoradores.js';
import { CompartidoService } from './compartido.service.js';

/** Enlace del viaje en vivo (PAS-34). Es público: lo abre quien recibe el enlace, sin cuenta. */
@Controller('v1/compartido')
export class CompartidoController {
  constructor(@Inject(CompartidoService) private readonly compartido: CompartidoService) {}

  @Publico()
  @Get(':token')
  ver(@Param('token') token: string) {
    return this.compartido.ver(token.slice(0, 80));
  }
}
