export { URL_ADMIN, baseDisponible, crearBaseDePrueba, type BaseDePrueba } from '../src/pruebas.js';

export interface Violacion {
  codigo?: string;
  restriccion?: string;
  mensaje: string;
}

/** Ejecuta algo que debe violar una regla de la base y devuelve el error de PostgreSQL. */
export async function violacion(operacion: PromiseLike<unknown>): Promise<Violacion> {
  try {
    await operacion;
  } catch (error) {
    const causa = ((error as { cause?: unknown }).cause ?? error) as {
      code?: string;
      constraint?: string;
      message: string;
    };
    return {
      ...(causa.code ? { codigo: causa.code } : {}),
      ...(causa.constraint ? { restriccion: causa.constraint } : {}),
      mensaje: causa.message,
    };
  }
  throw new Error('Se esperaba una violación de integridad, pero la operación tuvo éxito');
}

// Códigos de error de PostgreSQL usados en las pruebas.
export const UNICA = '23505';
export const CHECK = '23514';
export const FORANEA = '23503';
export const EXCLUSION = '23P01';
export const INTEGRIDAD = '23000';
