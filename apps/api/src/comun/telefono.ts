import { solicitudInvalida } from './errores.js';

/**
 * Lleva un celular colombiano a formato E.164 (+573001234567).
 * Acepta "300 123 4567", "3001234567", "573001234567" y "+57 300-123-4567".
 */
export function normalizarTelefono(entrada: string): string {
  const limpio = entrada.replace(/[\s\-().]/g, '');
  const e164 = /^\+[1-9][0-9]{7,14}$/;
  if (limpio.startsWith('+')) {
    if (e164.test(limpio)) return limpio;
  } else if (/^3[0-9]{9}$/.test(limpio)) {
    return `+57${limpio}`;
  } else if (/^573[0-9]{9}$/.test(limpio)) {
    return `+${limpio}`;
  }
  throw solicitudInvalida('El número de celular no es válido. Escríbelo así: 300 123 4567');
}
