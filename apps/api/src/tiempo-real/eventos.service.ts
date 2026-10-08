import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Eventos del servidor hacia el conductor (docs/10). */
export interface EventosAConductor {
  'oferta:nueva': OfertaParaConductor;
  'oferta:retirada': {
    ofertaId: string;
    viajeId: string;
    motivo: 'expirada' | 'cancelada' | 'tomada';
  };
  'viaje:estado': { viajeId: string; estado: string; [clave: string]: unknown };
  'conductor:estado': { estadoOperativo: string; motivo?: string };
  'viaje:mensaje': MensajeDeViaje;
  /** Cambió una de sus reservas (la operación se la asignó o se la quitó). */
  'reserva:cambio': { viajeId: string; motivo: 'asignada' | 'liberada' | 'cancelada' };
}

/** Eventos del servidor hacia el pasajero (docs/10). */
export interface EventosAPasajero {
  'viaje:estado': { viajeId: string; estado: string; [clave: string]: unknown };
  /** Posición del conductor asignado, con lo que falta para llegar a la recogida o al destino. */
  'viaje:ubicacion_conductor': {
    viajeId: string;
    lat: number;
    lng: number;
    rumbo: number | null;
    /** Segundos y metros que faltan hasta el punto al que va (recogida o destino). */
    etaS: number;
    distanciaM: number;
    hacia: 'recogida' | 'destino';
    t: number;
  };
  'viaje:mensaje': MensajeDeViaje;
}

export interface MensajeDeViaje {
  id: string;
  viajeId: string;
  deQuien: 'pasajero' | 'conductor';
  cuerpo: string;
  creadoEn: string;
}

/** Lo que ve el conductor de una oferta (RN-034): suficiente para decidir, sin el destino exacto (D-11). */
export interface OfertaParaConductor {
  ofertaId: string;
  viajeId: string;
  expiraEn: string;
  /** Segundos que tiene para responder. */
  segundosParaResponder: number;
  recogida: {
    lat: number;
    lng: number;
    direccion: string | null;
    distanciaM: number;
    etaS: number;
  };
  destino: { zona: string; distanciaViajeM: number };
  gananciaEstimada: number;
  precioEstimado: { min: number; max: number };
  metodoPago: 'efectivo' | 'tarjeta' | 'local';
  categoria: string;
  tipoServicio: string;
  pasajero: { nombre: string; calificacion: number | null };
}

/**
 * Punto único para avisar al conductor en tiempo real. El resto de la API no conoce Socket.IO: solo
 * llama a `aConductor`. Si no hay servidor de WebSocket (por ejemplo, en una prueba), no hace nada.
 */
@Injectable()
export class Eventos {
  private readonly log = new Logger('Eventos');
  private server: Server | null = null;

  vincular(server: Server): void {
    this.server = server;
  }

  private torrePendiente = false;

  /** Avisa a la torre de control que algo cambió. Se agrupa: como mucho un aviso por segundo. */
  avisarTorre(): void {
    if (!this.server || this.torrePendiente) return;
    this.torrePendiente = true;
    setTimeout(() => {
      this.torrePendiente = false;
      this.server?.to('operacion').emit('torre:cambio', { t: Date.now() });
    }, 700).unref();
  }

  /** Eventos hacia la App Operación (sala `operacion`). */
  aOperacion(evento: string, datos: unknown): void {
    this.server?.to('operacion').emit(evento, datos);
  }

  aConductor<E extends keyof EventosAConductor>(
    conductorId: string,
    evento: E,
    datos: EventosAConductor[E],
  ): void {
    this.avisarTorre();
    if (!this.server) return;
    this.server.to(`conductor:${conductorId}`).emit(evento, datos);
    this.log.debug(`${evento} → conductor ${conductorId}`);
  }

  aPasajero<E extends keyof EventosAPasajero>(
    pasajeroId: string,
    evento: E,
    datos: EventosAPasajero[E],
  ): void {
    this.avisarTorre();
    if (!this.server) return;
    this.server.to(`pasajero:${pasajeroId}`).emit(evento, datos);
    this.log.debug(`${evento} → pasajero ${pasajeroId}`);
  }
}
