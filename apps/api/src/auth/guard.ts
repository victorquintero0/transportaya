import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { contextoActual } from '../observabilidad/contexto.js';
import { noAutenticado, prohibido } from '../comun/errores.js';
import { tienePermiso } from '@transportaya/dominio';
import { PERMISO, PUBLICO, ROLES, type UsuarioAutenticado } from './decoradores.js';
import type { Permiso } from '@transportaya/dominio';
import type { PayloadAcceso } from './jwt.js';
import { TokensService } from './tokens.service.js';

/** Guard global: toda ruta exige sesión salvo las marcadas con @Publico(). */
@Injectable()
export class GuardAutenticacion implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokensService) private readonly tokens: TokensService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // El WebSocket se autentica una sola vez al conectarse (TiempoRealGateway); este guard es solo para HTTP.
    if (ctx.getType() !== 'http') return true;
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, objetivos)) return true;

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      usuario?: UsuarioAutenticado;
    }>();
    const cabecera = req.headers['authorization'] ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
    if (!token) throw noAutenticado();

    const usuario = await this.tokens.autenticar(token);
    if (!usuario)
      throw noAutenticado('SESION_INVALIDA', 'Tu sesión venció. Inicia sesión de nuevo.');

    const roles = this.reflector.getAllAndOverride<PayloadAcceso['rol'][] | undefined>(
      ROLES,
      objetivos,
    );
    if (roles && !roles.includes(usuario.rol)) {
      throw prohibido('ROL_NO_PERMITIDO', 'Esta acción no está disponible para tu tipo de cuenta.');
    }
    const permiso = this.reflector.getAllAndOverride<Permiso | undefined>(PERMISO, objetivos);
    if (permiso) {
      if (usuario.rol !== 'interno' || !tienePermiso(usuario.roles ?? [], permiso)) {
        throw prohibido('SIN_PERMISO', 'Tu rol no tiene permiso para esta acción.');
      }
    }
    req.usuario = usuario;
    const solicitud = contextoActual();
    if (solicitud) {
      solicitud.usuarioId = usuario.id;
      solicitud.rol = usuario.rol;
    }
    return true;
  }
}
