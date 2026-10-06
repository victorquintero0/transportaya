import { z } from 'zod';

const booleano = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url().optional(),
    /** Firma de los tokens. Obligatoria en producción. */
    JWT_SECRET: z.string().min(32).optional(),
    /** Proveedor del OTP (D-13). Hoy solo existe el simulador; WhatsApp y SMS llegan cuando haya proveedor. */
    OTP_PROVEEDOR: z.enum(['simulador']).default('simulador'),
    /** Habilita el simulador de pasajeros y los atajos de desarrollo (cierre diario, pago Bre-B). Nunca en producción. */
    SIMULADOR: booleano.optional(),
    ALMACENAMIENTO_DIR: z.string().default('.almacenamiento'),
    CORS_ORIGENES: z
      .string()
      .default('http://localhost:5171,http://localhost:5172,http://localhost:5173')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const exigir = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    exigir(Boolean(env.DATABASE_URL), 'DATABASE_URL', 'es obligatoria en producción');
    exigir(Boolean(env.JWT_SECRET), 'JWT_SECRET', 'es obligatoria en producción');
    exigir(!env.SIMULADOR, 'SIMULADOR', 'no puede estar activo en producción');
    exigir(
      env.OTP_PROVEEDOR !== 'simulador',
      'OTP_PROVEEDOR',
      'el simulador de OTP no puede usarse en producción',
    );
  })
  .transform((env) => ({
    ...env,
    DATABASE_URL:
      env.DATABASE_URL ?? 'postgres://transportaya:transportaya@localhost:5432/transportaya',
    // Valor fijo solo para desarrollo, para que las sesiones sobrevivan a un reinicio.
    JWT_SECRET: env.JWT_SECRET ?? 'desarrollo-transportaya-no-usar-en-produccion-0123456789',
    SIMULADOR: env.SIMULADOR ?? env.NODE_ENV !== 'production',
  }));

export type Configuracion = z.infer<typeof esquema>;

/** Valida las variables de entorno al arrancar: si falta algo, la app no inicia. */
export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): Configuracion {
  return esquema.parse(env);
}

export const CONFIG = Symbol('CONFIG');
