import { createHmac, timingSafeEqual } from 'node:crypto';

/** JWT HS256 mínimo, sin dependencias: se firma con HMAC-SHA256 y solo se acepta ese algoritmo. */
const ENCABEZADO = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

export interface PayloadAcceso {
  /** Id del usuario. */
  sub: string;
  /** Id de la sesión: permite cerrarla de forma remota (RNF-41). */
  sid: string;
  rol: 'conductor' | 'pasajero' | 'interno';
  iat: number;
  exp: number;
}

const firmar = (datos: string, secreto: string) =>
  createHmac('sha256', secreto).update(datos).digest('base64url');

export function firmarJwt(
  payload: Omit<PayloadAcceso, 'iat' | 'exp'>,
  secreto: string,
  ttlS: number,
  ahoraMs = Date.now(),
): string {
  const iat = Math.floor(ahoraMs / 1000);
  const cuerpo = Buffer.from(JSON.stringify({ ...payload, iat, exp: iat + ttlS })).toString(
    'base64url',
  );
  return `${ENCABEZADO}.${cuerpo}.${firmar(`${ENCABEZADO}.${cuerpo}`, secreto)}`;
}

/** Devuelve el contenido si la firma es válida y no ha vencido; si no, `null`. */
export function verificarJwt(
  token: string,
  secreto: string,
  ahoraMs = Date.now(),
): PayloadAcceso | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [encabezado, cuerpo, firma] = partes as [string, string, string];
  if (encabezado !== ENCABEZADO) return null; // rechaza "alg: none" y cualquier otro algoritmo

  const esperada = Buffer.from(firmar(`${encabezado}.${cuerpo}`, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as PayloadAcceso;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= ahoraMs) return null;
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}
