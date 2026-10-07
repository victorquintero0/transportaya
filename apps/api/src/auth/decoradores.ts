import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permiso, RolInterno } from '@transportaya/dominio';
import type { PayloadAcceso } from './jwt.js';

export const PUBLICO = 'publico';
export const ROLES = 'roles';
export const PERMISO = 'permiso';

/** La ruta no exige sesión. Todas las demás sí. */
export const Publico = () => SetMetadata(PUBLICO, true);
/** La ruta solo es para estos roles. */
export const RequiereRol = (...roles: PayloadAcceso['rol'][]) => SetMetadata(ROLES, roles);

/** La ruta es de la App Operación y exige un rol interno con este permiso (docs/02). */
export const RequierePermiso = (permiso: Permiso) => SetMetadata(PERMISO, permiso);

export interface UsuarioAutenticado {
  id: string;
  sesionId: string;
  rol: PayloadAcceso['rol'];
  /** Solo para personal interno: sus roles vigentes, leídos de la base en cada petición. */
  roles?: RolInterno[];
}

export const UsuarioActual = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<{ usuario: UsuarioAutenticado }>().usuario;
});
