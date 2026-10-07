import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Configuracion } from '../config.js';

/**
 * Cifrado de datos sensibles en la base: la llave Bre-B y las cuentas de pago de los conductores (RNF-46).
 * AES-256-GCM con la clave derivada del secreto de la aplicación. El resultado lleva el IV y la etiqueta
 * de autenticación; si alguien altera el texto cifrado, descifrar falla.
 *
 * Pendiente (docs/09): guardar la clave en un gestor de secretos y poder rotarla.
 */
@Injectable()
export class CifradoService {
  private readonly clave: Buffer;

  constructor(@Inject(CONFIG) config: Configuracion) {
    this.clave = Buffer.from(
      hkdfSync('sha256', config.JWT_SECRET, 'transportaya', 'cifrado-de-columnas-v1', 32),
    );
  }

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const cifrador = createCipheriv('aes-256-gcm', this.clave, iv);
    const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
    return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString('base64url');
  }

  descifrar(valor: string): string {
    const bytes = Buffer.from(valor, 'base64url');
    const descifrador = createDecipheriv('aes-256-gcm', this.clave, bytes.subarray(0, 12));
    descifrador.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([descifrador.update(bytes.subarray(28)), descifrador.final()]).toString(
      'utf8',
    );
  }
}

/** Muestra solo el final de un dato sensible: "•••• 4567". */
export function enmascarar(valor: string): string {
  const visibles = valor.length > 8 ? 4 : Math.min(2, Math.floor(valor.length / 3));
  return visibles === 0 ? '••••' : `•••• ${valor.slice(-visibles)}`;
}
