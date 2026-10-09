import { empresa } from '@transportaya/db';
import { descuentoCorporativo } from '@transportaya/dominio';
import { eq } from 'drizzle-orm';
import type { DbOTx } from '../bd/bd.module.js';

/** Lo que el contrato de la empresa descuenta de un cobro (un viaje o una tarifa de cancelación). 0 si no es corporativo. */
export async function descuentoDeEmpresa(
  tx: DbOTx,
  empresaId: string | null,
  monto: number,
): Promise<number> {
  if (!empresaId) return 0;
  const [e] = await tx
    .select({ pb: empresa.descuentoPb })
    .from(empresa)
    .where(eq(empresa.id, empresaId));
  return descuentoCorporativo(monto, e?.pb ?? 0);
}
