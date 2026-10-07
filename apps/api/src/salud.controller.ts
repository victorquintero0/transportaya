import { Controller, Get, Inject } from '@nestjs/common';
import { Publico } from './auth/decoradores.js';
import { CONFIG, type Configuracion } from './config.js';

@Controller('v1/salud')
export class SaludController {
  constructor(@Inject(CONFIG) private readonly config: Pick<Configuracion, 'SIMULADOR'>) {}

  /** Estado de la API. La app del conductor usa `simulador` para mostrar las herramientas de demostración. */
  @Publico()
  @Get()
  estado(): { estado: 'ok'; servicio: string; hora: string; simulador: boolean } {
    return {
      estado: 'ok',
      servicio: 'transportaya-api',
      hora: new Date().toISOString(),
      simulador: this.config.SIMULADOR,
    };
  }
}
