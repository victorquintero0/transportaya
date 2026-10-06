import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PayloadAcceso } from './jwt.js';

export const PUBLICO = 'publico';
export const ROLES = 'roles';

/** La ruta no exige sesión. Todas las demás sí. */
export const Publico = () => SetMetadata(PUBLICO, true);
/** La ruta solo es para estos roles. */
export const RequiereRol = (...roles: PayloadAcceso['rol'][]) => SetMetadata(ROLES, roles);

export interface UsuarioAutenticado {
  id: string;
  sesionId: string;
  rol: PayloadAcceso['rol'];
}

export const UsuarioActual = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<{ usuario: UsuarioAutenticado }>().usuario;
});
