import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Configuracion = z.infer<typeof esquema>;

/** Valida las variables de entorno al arrancar: si falta algo, la app no inicia. */
export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): Configuracion {
  return esquema.parse(env);
}
