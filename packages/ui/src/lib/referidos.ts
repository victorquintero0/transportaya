/** Lo que responde `GET /v1/referidos` (docs/10): el programa de puntos visto por una persona. */
export interface ResumenReferidos {
  activo: boolean;
  codigo: string;
  saldo: number;
  valorPunto: number;
  valorSaldo: number;
  topeDescuentoPct: number;
  minAbonoPuntos: number;
  recompensas: {
    invitarPasajero: number;
    invitarConductor: number;
    bienvenidaPasajero: number;
    bienvenidaConductor: number;
    viajeMinimo: number;
  };
  usoCodigo: {
    codigo: string;
    estado: EstadoReferido;
    referidor: string;
    puntos: number;
  } | null;
  puedeUsarCodigo: boolean;
  ventanaDias: number;
  invitados: {
    id: string;
    nombre: string;
    rol: 'pasajero' | 'conductor';
    estado: EstadoReferido;
    puntos: number;
    creadoEn: string;
  }[];
  totales: { invitados: number; otorgados: number; pendientes: number; puntosGanados: number };
  /** Solo conductores: lo que debe y lo que podría pagar hoy con sus puntos. */
  deuda?: number;
  abono?: { puntos: number; monto: number } | null;
}

export type EstadoReferido = 'pendiente' | 'otorgado' | 'rechazado' | 'revertido';

export interface MovimientoPuntos {
  id: string;
  tipo: string;
  puntos: number;
  valor: number;
  motivo: string | null;
  viaje: string | null;
  creadoEn: string;
}

/** El mensaje para invitar a alguien: lo que se comparte por WhatsApp o donde sea. */
export function mensajeInvitacion(codigo: string, puntos: number, origen: string): string {
  return `Pide tus viajes con TransporteYa. Usa mi código ${codigo} y gana ${puntos} puntos en tu primer viaje. ${origen}`;
}

/** Texto corto para cada tipo de movimiento del libro de puntos. */
export const NOMBRE_TIPO_PUNTOS: Readonly<Record<string, string>> = {
  referido_referidor: 'Tu invitado ya viajó',
  referido_invitado: 'Puntos de bienvenida',
  canje_descuento: 'Descuento en un viaje',
  canje_abono: 'Abono a tu comisión',
  reverso: 'Puntos devueltos',
  ajuste: 'Ajuste de TransporteYa',
};
