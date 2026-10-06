import { describe, expect, it } from 'vitest';
import { leerConfiguracion } from '../config.js';
import { detectarArchivo } from './archivos.js';
import { CifradoService, enmascarar } from './cifrado.service.js';

describe('detectarArchivo', () => {
  const relleno = Buffer.alloc(16);
  it('reconoce JPG, PNG, WebP y PDF por su contenido', () => {
    expect(
      detectarArchivo(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), relleno]))?.mime,
    ).toBe('image/jpeg');
    expect(
      detectarArchivo(
        Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), relleno]),
      )?.mime,
    ).toBe('image/png');
    expect(
      detectarArchivo(
        Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), relleno]),
      )?.mime,
    ).toBe('image/webp');
    expect(detectarArchivo(Buffer.concat([Buffer.from('%PDF-1.7\n'), relleno]))?.mime).toBe(
      'application/pdf',
    );
  });
  it('rechaza lo que se hace pasar por una imagen', () => {
    expect(
      detectarArchivo(Buffer.from('<script>alert(1)</script> esto no es una foto')),
    ).toBeNull();
    expect(
      detectarArchivo(Buffer.from('MZ\x90\x00 un ejecutable de Windows...........')),
    ).toBeNull();
    expect(detectarArchivo(Buffer.alloc(0))).toBeNull();
  });
});

describe('CifradoService', () => {
  const config = leerConfiguracion({
    JWT_SECRET: 'una-clave-de-prueba-con-más-de-treinta-y-dos-caracteres',
  });
  const cifrado = new CifradoService(config);

  it('descifra lo que cifra y no guarda el texto en claro', () => {
    const c = cifrado.cifrar('3001234567');
    expect(c).not.toContain('3001234567');
    expect(cifrado.descifrar(c)).toBe('3001234567');
  });
  it('cifra distinto cada vez (IV aleatorio)', () => {
    expect(cifrado.cifrar('hola')).not.toBe(cifrado.cifrar('hola'));
  });
  it('detecta si el texto cifrado fue alterado', () => {
    const c = Buffer.from(cifrado.cifrar('3001234567'), 'base64url');
    c[c.length - 1] = c[c.length - 1]! ^ 1;
    expect(() => cifrado.descifrar(c.toString('base64url'))).toThrow();
  });
  it('otra clave no puede descifrar', () => {
    const otro = new CifradoService(
      leerConfiguracion({ JWT_SECRET: 'otra-clave-distinta-también-con-más-de-32-caracteres!' }),
    );
    expect(() => otro.descifrar(cifrado.cifrar('secreto'))).toThrow();
  });
});

describe('enmascarar', () => {
  it('deja visibles solo los últimos dígitos', () => {
    expect(enmascarar('3001234567')).toBe('•••• 4567');
    expect(enmascarar('ana@correo.com')).toBe('•••• .com');
    expect(enmascarar('abc')).toBe('•••• c');
    expect(enmascarar('ab')).toBe('••••');
  });
});
