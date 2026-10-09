import { Body, Controller, Get, Header, Inject, Put, Req } from '@nestjs/common';
import { PROVEEDORES_MAPA } from '@transportaya/dominio';
import { z } from 'zod';
import {
  Publico,
  RequierePermiso,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { operadorDe } from './comun.js';
import { MapaConfigService } from './mapa-config.service.js';

const entrada = z.object({
  proveedor: z.enum(PROVEEDORES_MAPA),
  estilo: z.string().trim().max(600).nullish(),
  estiloOscuro: z.string().trim().max(600).nullish(),
  clave: z.string().max(300).optional(),
  motivo: z.string().trim().min(5).max(500),
});

interface PeticionConIp {
  ip?: string;
}

@Controller('v1')
export class MapaController {
  constructor(@Inject(MapaConfigService) private readonly mapa: MapaConfigService) {}

  /** Las tres apps lo leen al abrir para saber qué mapa mostrar. No lleva nada sensible. */
  @Publico()
  @Get('mapa/config')
  @Header('cache-control', 'public, max-age=60')
  publica() {
    return this.mapa.publica();
  }

  @RequierePermiso('config.ver')
  @Get('op/mapa')
  administrador() {
    return this.mapa.paraAdministrador();
  }

  @RequierePermiso('config.editar')
  @Put('op/mapa')
  guardar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(entrada, cuerpo);
    return this.mapa.guardar(d, operadorDe(u, req.ip));
  }
}
