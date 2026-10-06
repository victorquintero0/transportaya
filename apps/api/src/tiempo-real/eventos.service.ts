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

  aConductor<E extends keyof EventosAConductor>(
    conductorId: string,
    evento: E,
    datos: EventosAConductor[E],
  ): void {
    if (!this.server) return;
    this.server.to(`conductor:${conductorId}`).emit(evento, datos);
    this.log.debug(`${evento} → conductor ${conductorId}`);
  }
}
