import type { z } from 'zod';
import { solicitudInvalida } from './errores.js';

/** Valida el cuerpo o los parámetros de una petición con un esquema de Zod. */
export function validar<T extends z.ZodType>(esquema: T, valor: unknown): z.infer<T> {
  const r = esquema.safeParse(valor);
  if (!r.success) {
    throw solicitudInvalida(
      r.error.issues.map((i) => `${i.path.join('.') || 'cuerpo'}: ${i.message}`).join('; '),
      { errores: r.error.issues },
    );
  }
  return r.data;
}
