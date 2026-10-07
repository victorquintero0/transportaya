import { auditoria } from '@transportaya/db';
import type { DbOTx } from '../bd/bd.module.js';

/** Quien hace una acción desde la App Operación. */
export interface Operador {
  id: string;
  ip?: string | undefined;
}

export interface EntradaAuditoria {
  /** Acción en minúsculas separada por puntos: `conductor.suspender`. */
  accion: string;
  entidad: string;
  entidadId?: string | null | undefined;
  antes?: unknown;
  despues?: unknown;
  motivo?: string | null | undefined;
}

/**
 * Deja constancia de una acción sensible (RNF-48): quién, qué, antes, después y por qué. Se llama dentro de la misma
 * transacción que el cambio, para que no pueda haber cambio sin registro ni registro sin cambio.
 */
export async function auditar(
  db: DbOTx,
  operador: Operador | null,
  e: EntradaAuditoria,
): Promise<void> {
  await db.insert(auditoria).values({
    usuarioId: operador?.id ?? null,
    accion: e.accion,
    entidad: e.entidad,
    entidadId: e.entidadId ?? null,
    antes: e.antes === undefined ? null : e.antes,
    despues: e.despues === undefined ? null : e.despues,
    motivo: e.motivo ?? null,
    ip: operador?.ip ?? null,
  });
}
