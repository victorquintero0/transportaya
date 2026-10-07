import { randomBytes } from 'node:crypto';
import { metodoPago, pago, pasajero, viaje } from '@transportaya/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { BaseDeDatos } from '../bd/bd.module.js';
import { conflicto, noEncontrado, solicitudInvalida } from '../comun/errores.js';
import { cobroSimulado, luhnValido, marcaDeTarjeta } from '../comun/tarjetas.js';

@Injectable()
export class PagosPasajeroService {
  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {}

  /**
   * Simula la tokenización de Wompi: la tarjeta completa solo pasa por aquí, nunca se guarda (RN-051, RNF-44). Con la
   * pasarela real, la app la tokeniza directamente con el formulario de Wompi y no llega al servidor.
   * Un número terminado en 0002 genera una tarjeta que la pasarela rechaza al cobrar, para probar la deuda.
   */
  tokenizarSimulado(d: { numero: string; vence: string; cvc: string }) {
    const numero = d.numero.replace(/\s+/g, '');
    if (!/^\d{13,19}$/.test(numero) || !luhnValido(numero))
      throw solicitudInvalida('El número de la tarjeta no es válido. Revísalo.');
    const m = d.vence.match(/^(\d{2})\/(\d{2})$/);
    if (!m) throw solicitudInvalida('La fecha de vencimiento debe verse así: 08/28');
    const mes = Number(m[1]);
    const anio = 2000 + Number(m[2]);
    if (mes < 1 || mes > 12) throw solicitudInvalida('El mes de vencimiento no es válido.');
    const hoy = new Date();
    if (anio < hoy.getFullYear() || (anio === hoy.getFullYear() && mes < hoy.getMonth() + 1))
      throw solicitudInvalida('La tarjeta está vencida.');
    if (!/^\d{3,4}$/.test(d.cvc)) throw solicitudInvalida('El código de seguridad no es válido.');
    const declinada = numero.endsWith('0002');
    return {
      token: `tok_sim_${declinada ? 'declinada_' : ''}${randomBytes(8).toString('hex')}`,
      marca: marcaDeTarjeta(numero),
      ultimos4: numero.slice(-4),
    };
  }

  async agregarTarjeta(pasajeroId: string, d: { token: string; marca: string; ultimos4: string }) {
    const { db } = this.bd;
    const existente = await db
      .select({ id: metodoPago.id })
      .from(metodoPago)
      .where(and(eq(metodoPago.pasajeroId, pasajeroId), eq(metodoPago.activo, true)));
    const [m] = await db
      .insert(metodoPago)
      .values({
        pasajeroId,
        tipo: 'tarjeta',
        proveedor: 'wompi',
        tokenProveedor: d.token,
        marca: d.marca,
        ultimos4: d.ultimos4,
        predeterminado: existente.length === 0,
      })
      .onConflictDoNothing()
      .returning({ id: metodoPago.id, predeterminado: metodoPago.predeterminado });
    if (!m) throw conflicto('TARJETA_REPETIDA', 'Esa tarjeta ya está agregada.');
    return { id: m.id, marca: d.marca, ultimos4: d.ultimos4, predeterminado: m.predeterminado };
  }

  async hacerPredeterminada(pasajeroId: string, id: string) {
    await this.bd.db.transaction(async (tx) => {
      const [m] = await tx
        .select({ id: metodoPago.id })
        .from(metodoPago)
        .where(
          and(
            eq(metodoPago.id, id),
            eq(metodoPago.pasajeroId, pasajeroId),
            eq(metodoPago.activo, true),
          ),
        );
      if (!m) throw noEncontrado('METODO_NO_ENCONTRADO', 'No encontramos ese método de pago');
      await tx
        .update(metodoPago)
        .set({ predeterminado: false })
        .where(eq(metodoPago.pasajeroId, pasajeroId));
      await tx.update(metodoPago).set({ predeterminado: true }).where(eq(metodoPago.id, id));
    });
  }

  async quitar(pasajeroId: string, id: string) {
    const { db } = this.bd;
    await db.transaction(async (tx) => {
      const [enUso] = await tx
        .select({ id: viaje.id })
        .from(viaje)
        .where(
          and(
            eq(viaje.metodoPagoId, id),
            sql`${viaje.estado} in ('buscando_conductor', 'asignado', 'en_sitio', 'en_curso')`,
          ),
        );
      if (enUso)
        throw conflicto('METODO_EN_USO', 'Esa tarjeta se está usando en un viaje en curso.');
      const r = await tx
        .update(metodoPago)
        .set({ activo: false, predeterminado: false })
        .where(
          and(
            eq(metodoPago.id, id),
            eq(metodoPago.pasajeroId, pasajeroId),
            eq(metodoPago.activo, true),
          ),
        )
        .returning({ id: metodoPago.id });
      if (r.length === 0)
        throw noEncontrado('METODO_NO_ENCONTRADO', 'No encontramos ese método de pago');
      // Si era la predeterminada, la más reciente que quede pasa a serlo.
      const [otra] = await tx
        .select({ id: metodoPago.id })
        .from(metodoPago)
        .where(and(eq(metodoPago.pasajeroId, pasajeroId), eq(metodoPago.activo, true)))
        .orderBy(sql`${metodoPago.creadoEn} desc`)
        .limit(1);
      const [hay] = await tx
        .select({ id: metodoPago.id })
        .from(metodoPago)
        .where(
          and(
            eq(metodoPago.pasajeroId, pasajeroId),
            eq(metodoPago.activo, true),
            eq(metodoPago.predeterminado, true),
          ),
        );
      if (otra && !hay)
        await tx.update(metodoPago).set({ predeterminado: true }).where(eq(metodoPago.id, otra.id));
    });
  }

  /**
   * PAS-13: paga lo que debe con una tarjeta. Con la pasarela real se cobraría el valor; aquí el simulador lo aprueba
   * salvo que la tarjeta sea de las rechazadas.
   */
  async pagarDeuda(pasajeroId: string, metodoPagoId: string) {
    const { db } = this.bd;
    return db.transaction(async (tx) => {
      const [p] = await tx
        .select({ deuda: pasajero.deudaPendiente })
        .from(pasajero)
        .where(eq(pasajero.usuarioId, pasajeroId))
        .for('update');
      if (!p || p.deuda <= 0) throw conflicto('SIN_DEUDA', 'No tienes nada pendiente por pagar.');
      const [m] = await tx
        .select()
        .from(metodoPago)
        .where(
          and(
            eq(metodoPago.id, metodoPagoId),
            eq(metodoPago.pasajeroId, pasajeroId),
            eq(metodoPago.activo, true),
          ),
        );
      if (!m) throw noEncontrado('METODO_NO_ENCONTRADO', 'Elige una tarjeta para pagar.');
      if (cobroSimulado(m.tokenProveedor) === 'rechazado')
        throw conflicto('COBRO_RECHAZADO', 'Tu banco rechazó el cobro. Prueba con otra tarjeta.');
      await tx
        .update(pasajero)
        .set({ deudaPendiente: 0 })
        .where(eq(pasajero.usuarioId, pasajeroId));
      await tx
        .update(pago)
        .set({ estado: 'pagado', actualizadoEn: new Date() })
        .where(
          and(
            eq(pago.estado, 'fallido'),
            sql`${pago.viajeId} in (select id from viaje where pasajero_id = ${pasajeroId})`,
          ),
        );
      await tx
        .update(viaje)
        .set({ estadoPago: 'pagado' })
        .where(and(eq(viaje.pasajeroId, pasajeroId), eq(viaje.estadoPago, 'fallido')));
      return { pagado: p.deuda };
    });
  }
}
