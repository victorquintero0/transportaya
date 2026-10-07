import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt con sal propia. Formato: `scrypt$N$r$p$sal$hash` (base64url). */
const N = 16384;
const R = 8;
const P = 1;

function derivar(contrasena: string, sal: Buffer, n = N, r = R, p = P): Promise<Buffer> {
  return new Promise((resolver, rechazar) =>
    scrypt(contrasena, sal, 32, { N: n, r, p }, (e, clave) => (e ? rechazar(e) : resolver(clave))),
  );
}

export async function hashContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(16);
  const clave = await derivar(contrasena, sal);
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64url')}$${clave.toString('base64url')}`;
}

export async function verificarContrasena(
  contrasena: string,
  almacenado: string,
): Promise<boolean> {
  const [esquema, n, r, p, sal, hash] = almacenado.split('$');
  if (esquema !== 'scrypt' || !n || !r || !p || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64url');
  const calculado = await derivar(contrasena, Buffer.from(sal, 'base64url'), +n, +r, +p);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Requisitos mínimos de una contraseña de personal interno (RNF-43). */
export function contrasenaFuerte(c: string): string | null {
  if (c.length < 10) return 'Debe tener al menos 10 caracteres.';
  if (!/[a-z]/.test(c) || !/[A-Z]/.test(c) || !/[0-9]/.test(c))
    return 'Debe mezclar mayúsculas, minúsculas y números.';
  return null;
}

/** Contraseña temporal legible que se muestra una sola vez al crear o restablecer una cuenta. */
export function contrasenaTemporal(): string {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(14);
  let s = '';
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return `${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10)}A7`;
}
