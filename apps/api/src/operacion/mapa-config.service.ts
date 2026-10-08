import { Inject, Injectable } from '@nestjs/common';
import { parametro } from '@transportaya/db';
import {
  PRESETS_MAPA,
  PROVEEDORES_MAPA,
  type ConfigMapaPublica,
  type ProveedorMapa,
  ponerClave,
  urlEstiloValida,
} from '@transportaya/dominio';
import { eq } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { CifradoService, enmascarar } from '../conductor/cifrado.service.js';
import { solicitudInvalida } from '../comun/errores.js';
import { type Operador, auditar } from './auditoria.js';

const CLAVE_PARAMETRO = 'mapa.config';

interface Guardada {
  proveedor: ProveedorMapa;
  estilo: string | null;
  estiloOscuro: string | null;
  claveCifrada: string | null;
}

const POR_DEFECTO: Guardada = {
  proveedor: 'openfreemap',
  estilo: PRESETS_MAPA.openfreemap.estilo,
  estiloOscuro: PRESETS_MAPA.openfreemap.estiloOscuro,
  claveCifrada: null,
};

export interface EntradaMapa {
  proveedor: ProveedorMapa;
  estilo?: string | null | undefined;
  estiloOscuro?: string | null | undefined;
  /** `undefined` conserva la clave guardada; `''` la borra. */
  clave?: string | undefined;
  motivo: string;
}

/**
 * Qué mapa muestran las apps (ADR-0009). Se elige desde la App Operación y se guarda en la tabla de parámetros; las
 * apps lo leen al abrir, así que cambiar de proveedor no exige tocar código ni publicar una versión nueva.
 */
@Injectable()
export class MapaConfigService {
  constructor(
    @Inject(BaseDeDatos) private readonly bd: BaseDeDatos,
    @Inject(CifradoService) private readonly cifrado: CifradoService,
  ) {}

  private async leer(): Promise<Guardada> {
    const [f] = await this.bd.db
      .select()
      .from(parametro)
      .where(eq(parametro.clave, CLAVE_PARAMETRO));
    const v = f?.valor as Partial<Guardada> | undefined;
    if (!v || !PROVEEDORES_MAPA.includes(v.proveedor as ProveedorMapa)) return POR_DEFECTO;
    return {
      proveedor: v.proveedor as ProveedorMapa,
      estilo: v.estilo ?? null,
      estiloOscuro: v.estiloOscuro ?? null,
      claveCifrada: v.claveCifrada ?? null,
    };
  }

  private clave(g: Guardada): string | null {
    return g.claveCifrada ? this.cifrado.descifrar(g.claveCifrada) : null;
  }

  /** Lo que reciben las apps. La clave de un mapa en el navegador es pública por naturaleza: se protege por dominio en el proveedor. */
  async publica(): Promise<ConfigMapaPublica> {
    const g = await this.leer();
    if (g.proveedor === 'esquematico')
      return { proveedor: g.proveedor, estilo: null, estiloOscuro: null };
    const clave = this.clave(g);
    return {
      proveedor: g.proveedor,
      estilo: ponerClave(g.estilo, clave),
      estiloOscuro: ponerClave(g.estiloOscuro, clave),
    };
  }

  /** Lo que ve el administrador: las direcciones con `{clave}` sin reemplazar y la clave enmascarada. */
  async paraAdministrador() {
    const g = await this.leer();
    const clave = this.clave(g);
    return {
      proveedor: g.proveedor,
      estilo: g.estilo,
      estiloOscuro: g.estiloOscuro,
      tieneClave: !!clave,
      claveEnmascarada: clave ? enmascarar(clave) : null,
    };
  }

  async guardar(d: EntradaMapa, operador: Operador) {
    const antes = await this.leer();
    const preset = PRESETS_MAPA[d.proveedor];
    const estilo =
      d.estilo !== undefined
        ? d.estilo || null
        : d.proveedor === antes.proveedor
          ? antes.estilo
          : preset.estilo;
    const estiloOscuro =
      d.estiloOscuro !== undefined
        ? d.estiloOscuro || null
        : d.proveedor === antes.proveedor
          ? antes.estiloOscuro
          : preset.estiloOscuro;

    let claveCifrada = antes.claveCifrada;
    if (d.clave !== undefined)
      claveCifrada = d.clave === '' ? null : this.cifrado.cifrar(d.clave.trim());

    if (d.proveedor !== 'esquematico') {
      if (!estilo) throw solicitudInvalida('Falta la dirección del estilo del mapa (style.json).');
      for (const u of [estilo, estiloOscuro]) {
        if (u && !urlEstiloValida(u))
          throw solicitudInvalida(
            'La dirección del estilo debe empezar por https:// (o http://localhost en desarrollo).',
          );
      }
      const usaClave = [estilo, estiloOscuro].some((u) => u?.includes('{clave}'));
      if ((preset.requiereClave || usaClave) && !claveCifrada)
        throw solicitudInvalida('Este mapa necesita una clave. Pégala en el campo «Clave».');
    }
    const nueva: Guardada = { proveedor: d.proveedor, estilo, estiloOscuro, claveCifrada };

    await this.bd.db.transaction(async (tx) => {
      await tx
        .insert(parametro)
        .values({
          clave: CLAVE_PARAMETRO,
          valor: nueva,
          descripcion: 'Proveedor del mapa de las apps',
          actualizadoPor: operador.id,
        })
        .onConflictDoUpdate({
          target: parametro.clave,
          set: { valor: nueva, actualizadoPor: operador.id },
        });
      // La clave nunca va a la auditoría: solo si hay o no.
      await auditar(tx, operador, {
        accion: 'mapa.cambiar',
        entidad: 'parametro',
        antes: {
          proveedor: antes.proveedor,
          estilo: antes.estilo,
          tieneClave: !!antes.claveCifrada,
        },
        despues: {
          proveedor: nueva.proveedor,
          estilo: nueva.estilo,
          estiloOscuro: nueva.estiloOscuro,
          tieneClave: !!nueva.claveCifrada,
        },
        motivo: d.motivo,
      });
    });
    return this.paraAdministrador();
  }
}
