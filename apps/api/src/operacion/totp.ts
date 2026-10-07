import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Codificar(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function base32Decodificar(texto: string): Buffer {
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of texto.replace(/=+$/, '').toUpperCase()) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('Base32 no válido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secreto nuevo de 160 bits en base32, listo para una app de autenticación. */
export function generarSecretoTotp(): string {
  return base32Codificar(randomBytes(20));
}

const PASO_S = 30;

/** Código TOTP de 6 dígitos (RFC 6238, HMAC-SHA1, pasos de 30 s). */
export function codigoTotp(secreto: string, ahoraMs = Date.now()): string {
  const contador = Math.floor(ahoraMs / 1000 / PASO_S);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac('sha1', base32Decodificar(secreto)).update(buffer).digest();
  const desplazamiento = hmac[hmac.length - 1]! & 15;
  const numero = hmac.readUInt32BE(desplazamiento) & 0x7fffffff;
  return String(numero % 1_000_000).padStart(6, '0');
}

/** Acepta el paso actual y uno antes o después, para tolerar relojes desajustados. */
export function verificarTotp(secreto: string, codigo: string, ahoraMs = Date.now()): boolean {
  if (!/^[0-9]{6}$/.test(codigo)) return false;
  const dado = Buffer.from(codigo);
  let ok = false;
  for (const paso of [-1, 0, 1]) {
    const esperado = Buffer.from(codigoTotp(secreto, ahoraMs + paso * PASO_S * 1000));
    if (timingSafeEqual(dado, esperado)) ok = true;
  }
  return ok;
}

export function uriOtpauth(secreto: string, cuenta: string, emisor = 'TransporteYa'): string {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=${PASO_S}`;
}
