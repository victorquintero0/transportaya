import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { POLITICA_DATOS, TIPOS_SOLICITUD_DATOS } from '@transportaya/dominio';
import { z } from 'zod';
import {
  Publico,
  RequierePermiso,
  RequiereRol,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { operadorDe, paginacion } from '../operacion/comun.js';
import { PrivacidadService } from './privacidad.service.js';
import type { RolTitular } from './anonimizacion.service.js';

const nuevaSolicitud = z.object({
  tipo: z.enum(TIPOS_SOLICITUD_DATOS),
  detalle: z.string().trim().min(5).max(2000),
});
const resolucion = z.object({
  resultado: z.enum(['aceptar', 'rechazar']),
  respuesta: z.string().trim().min(5).max(2000),
});
const filtro = paginacion.extend({ estado: z.enum(['abiertas', 'resueltas']).optional() });

interface PeticionConIp {
  ip?: string;
}

/** Lo que ven las personas (conductores y pasajeros) sobre sus datos: la política, su descarga y sus solicitudes. */
@Controller('v1')
export class PrivacidadController {
  constructor(@Inject(PrivacidadService) private readonly privacidad: PrivacidadService) {}

  /** Pública: se puede leer antes de crear la cuenta. */
  @Publico()
  @Get('politica-datos')
  @Header('cache-control', 'public, max-age=300')
  politica() {
    return POLITICA_DATOS;
  }

  @RequiereRol('conductor', 'pasajero')
  @Get('datos/exportar')
  exportar(@UsuarioActual() u: UsuarioAutenticado) {
    return this.privacidad.exportar(u.id, u.rol as RolTitular);
  }

  @RequiereRol('conductor', 'pasajero')
  @Get('datos/solicitudes')
  mias(@UsuarioActual() u: UsuarioAutenticado) {
    return this.privacidad.mias(u.id);
  }

  @RequiereRol('conductor', 'pasajero')
  @Post('datos/solicitudes')
  crear(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.privacidad.crear(u.id, u.rol as RolTitular, validar(nuevaSolicitud, cuerpo));
  }
}

/** Lo que ve el personal que atiende las solicitudes. */
@Controller('v1/op/privacidad')
export class PrivacidadOpController {
  constructor(@Inject(PrivacidadService) private readonly privacidad: PrivacidadService) {}

  @RequierePermiso('privacidad.ver')
  @Get('solicitudes')
  listar(@Query() q: unknown) {
    const f = validar(filtro, q);
    return this.privacidad.listar({ estado: f.estado, limite: f.limite, desplazar: f.desplazar });
  }

  @RequierePermiso('privacidad.ver')
  @Get('solicitudes/:id')
  detalle(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.privacidad.detalle(id);
  }

  @RequierePermiso('privacidad.responder')
  @Post('solicitudes/:id/tomar')
  tomar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: PeticionConIp,
  ) {
    return this.privacidad.tomar(id, operadorDe(u, req.ip));
  }

  @RequierePermiso('privacidad.responder')
  @Post('solicitudes/:id/resolver')
  resolver(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.privacidad.resolver(
      id,
      validar(resolucion, cuerpo),
      operadorDe(u, req.ip),
      u.roles ?? [],
    );
  }
}
