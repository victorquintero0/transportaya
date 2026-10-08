import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Configuracion } from '../config.js';

export const ALMACENAMIENTO = Symbol('ALMACENAMIENTO');

/** Dónde se guardan los documentos y fotos. En desarrollo es el disco; en producción será S3 (docs/08). */
export interface Almacenamiento {
  guardar(clave: string, contenido: Buffer): Promise<void>;
  leer(clave: string): Promise<Buffer>;
  /** Borra el archivo. Si ya no existe, no es un error. */
  borrar(clave: string): Promise<void>;
}

@Injectable()
export class AlmacenamientoLocal implements Almacenamiento {
  private readonly raiz: string;

  constructor(@Inject(CONFIG) config: Configuracion) {
    this.raiz = resolve(config.ALMACENAMIENTO_DIR);
  }

  /** Resuelve la clave dentro de la raíz; rechaza cualquier intento de salirse de ella. */
  private ruta(clave: string): string {
    const ruta = resolve(this.raiz, clave);
    if (!ruta.startsWith(this.raiz + sep)) throw new Error('Clave de almacenamiento inválida');
    return ruta;
  }

  async guardar(clave: string, contenido: Buffer): Promise<void> {
    const ruta = this.ruta(clave);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, contenido, { mode: 0o600 });
  }

  leer(clave: string): Promise<Buffer> {
    return readFile(this.ruta(clave));
  }

  async borrar(clave: string): Promise<void> {
    await rm(this.ruta(clave), { force: true });
  }
}
