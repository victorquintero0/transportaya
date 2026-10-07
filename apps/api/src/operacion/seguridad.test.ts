import { describe, expect, it } from 'vitest';
import {
  contrasenaFuerte,
  contrasenaTemporal,
  hashContrasena,
  verificarContrasena,
} from './contrasena.js';
import {
  base32Codificar,
  base32Decodificar,
  codigoTotp,
  generarSecretoTotp,
  uriOtpauth,
  verificarTotp,
} from './totp.js';

describe('TOTP (RFC 6238)', () => {
  // Vectores de prueba del RFC 6238 (SHA1, secreto "12345678901234567890").
  const secreto = base32Codificar(Buffer.from('12345678901234567890'));
  it('coincide con los vectores del RFC', () => {
    expect(codigoTotp(secreto, 59_000)).toBe('287082');
    expect(codigoTotp(secreto, 1_111_111_109_000)).toBe('081804');
    expect(codigoTotp(secreto, 1_234_567_890_000)).toBe('005924');
  });

  it('base32 ida y vuelta', () => {
    const bytes = Buffer.from('transporteya');
    expect(base32Decodificar(base32Codificar(bytes)).toString()).toBe('transporteya');
  });

  it('acepta el paso anterior y el siguiente, pero no uno lejano', () => {
    const s = generarSecretoTotp();
    const t = 1_700_000_000_000;
    expect(verificarTotp(s, codigoTotp(s, t), t)).toBe(true);
    expect(verificarTotp(s, codigoTotp(s, t - 30_000), t)).toBe(true);
    expect(verificarTotp(s, codigoTotp(s, t + 30_000), t)).toBe(true);
    expect(verificarTotp(s, codigoTotp(s, t - 120_000), t)).toBe(false);
    expect(verificarTotp(s, 'abc123', t)).toBe(false);
  });

  it('arma la URI para la app de autenticación', () => {
    expect(uriOtpauth('ABC', 'ana@x.co')).toContain(
      'otpauth://totp/TransporteYa%3Aana%40x.co?secret=ABC',
    );
  });
});

describe('contraseñas', () => {
  it('verifica la correcta y rechaza la incorrecta', async () => {
    const h = await hashContrasena('Clave-Segura-2026');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verificarContrasena('Clave-Segura-2026', h)).toBe(true);
    expect(await verificarContrasena('otra', h)).toBe(false);
    expect(await verificarContrasena('x', 'no-es-un-hash')).toBe(false);
  });

  it('exige una contraseña fuerte', () => {
    expect(contrasenaFuerte('corta')).not.toBeNull();
    expect(contrasenaFuerte('todominusculas123')).not.toBeNull();
    expect(contrasenaFuerte('Clave-Segura-2026')).toBeNull();
  });

  it('la temporal cumple los requisitos', () => {
    expect(contrasenaFuerte(contrasenaTemporal())).toBeNull();
  });
});
