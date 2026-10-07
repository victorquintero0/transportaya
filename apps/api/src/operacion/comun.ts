import { z } from 'zod';
import type { Operador } from './auditoria.js';
import type { UsuarioAutenticado } from '../auth/decoradores.js';

/** Paginación de las listas de la App Operación: `limite` (máx. 200) y `desplazar`. */
export const paginacion = z.object({
  limite: z.coerce.number().int().min(1).max(200).default(50),
  desplazar: z.coerce.number().int().min(0).default(0),
});

export const motivoObligatorio = z.object({ motivo: z.string().trim().min(5).max(500) });

export const operadorDe = (u: UsuarioAutenticado, ip?: string): Operador => ({ id: u.id, ip });

/** Escapa un texto para usarlo en `ilike` sin que `%` o `_` cambien el sentido. */
export const comodines = (texto: string): string =>
  `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
