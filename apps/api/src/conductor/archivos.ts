/** Tipos de archivo que aceptamos para documentos y fotos, identificados por su contenido real, no por su nombre. */
export interface ArchivoValido {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  extension: 'jpg' | 'png' | 'webp' | 'pdf';
}

export const TAMANO_MAXIMO_ARCHIVO = 6 * 1024 * 1024;

export function detectarArchivo(bytes: Buffer): ArchivoValido | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { mime: 'image/jpeg', extension: 'jpg' };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: 'webp' };
  }
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-')
    return { mime: 'application/pdf', extension: 'pdf' };
  return null;
}
