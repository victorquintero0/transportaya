/**
 * Permisos de la App Operación por rol interno (docs/02, matriz de permisos). Es la única fuente: la API los exige y la
 * app los usa para mostrar solo lo que cada persona puede hacer.
 */
export const ROLES_INTERNOS = [
  'monitor',
  'soporte',
  'cumplimiento',
  'financiero',
  'supervisor',
  'admin',
] as const;
export type RolInterno = (typeof ROLES_INTERNOS)[number];

export const ETIQUETA_ROL: Record<RolInterno, string> = {
  monitor: 'Monitor',
  soporte: 'Soporte',
  cumplimiento: 'Cumplimiento',
  financiero: 'Financiero',
  supervisor: 'Supervisor',
  admin: 'Administrador',
};

const TODOS = ROLES_INTERNOS;

export const PERMISOS = {
  /** Ver la torre de control y las alertas. */
  'torre.ver': ['monitor', 'soporte', 'cumplimiento', 'supervisor', 'admin'],
  /** Tomar y cerrar alertas. */
  'torre.operar': ['monitor', 'supervisor', 'admin'],
  'viajes.ver': TODOS,
  /** Despachar a mano, reasignar y cancelar viajes. */
  'viajes.despachar': ['monitor', 'supervisor', 'admin'],
  'viajes.ajustar_tarifa': ['supervisor', 'admin'],
  'conductores.ver': TODOS,
  'conductores.aprobar': ['cumplimiento', 'supervisor', 'admin'],
  /** Suspender (el monitor solo de forma temporal). */
  'conductores.suspender': ['monitor', 'cumplimiento', 'supervisor', 'admin'],
  'conductores.bloquear': ['cumplimiento', 'supervisor', 'admin'],
  'pasajeros.ver': ['monitor', 'soporte', 'financiero', 'supervisor', 'admin'],
  'pasajeros.bloquear': ['soporte', 'supervisor', 'admin'],
  'tickets.ver': ['monitor', 'soporte', 'financiero', 'supervisor', 'admin'],
  'tickets.gestionar': ['soporte', 'supervisor', 'admin'],
  'reembolsos.crear': ['soporte', 'financiero', 'supervisor', 'admin'],
  'finanzas.ver': ['financiero', 'supervisor', 'admin'],
  /** Conciliar pagos, habilitar por deuda, confirmar pagos a conductores y correr el cierre. */
  'finanzas.operar': ['financiero', 'supervisor', 'admin'],
  'finanzas.proponer_ajuste': ['financiero', 'supervisor', 'admin'],
  'finanzas.aprobar_ajuste': ['supervisor', 'admin'],
  'tarifas.ver': ['monitor', 'financiero', 'supervisor', 'admin'],
  'tarifas.editar': ['admin'],
  /** Activar la dinámica manual por zona. */
  'dinamica.activar': ['monitor', 'admin'],
  'reportes.ver': ['monitor', 'financiero', 'supervisor', 'admin'],
  'usuarios.ver': ['supervisor', 'admin'],
  'usuarios.gestionar': ['admin'],
  'config.ver': ['supervisor', 'admin'],
  'config.editar': ['admin'],
  /** Solicitudes de las personas sobre sus datos personales (Ley 1581). */
  'privacidad.ver': ['soporte', 'supervisor', 'admin'],
  'privacidad.responder': ['soporte', 'supervisor', 'admin'],
  /** Aceptar borrar datos o revocar la autorización: anonimiza la cuenta. */
  'privacidad.suprimir': ['supervisor', 'admin'],
  /** Pantalla «Sistema»: salud, tareas programadas y tráfico de la API. */
  'sistema.ver': ['supervisor', 'admin'],
} as const satisfies Record<string, readonly RolInterno[]>;

export type Permiso = keyof typeof PERMISOS;

export function tienePermiso(roles: readonly RolInterno[], permiso: Permiso): boolean {
  const permitidos: readonly RolInterno[] = PERMISOS[permiso];
  return roles.some((r) => permitidos.includes(r));
}

/** Todos los permisos que dan estos roles. */
export function permisosDe(roles: readonly RolInterno[]): Permiso[] {
  return (Object.keys(PERMISOS) as Permiso[]).filter((p) => tienePermiso(roles, p));
}
