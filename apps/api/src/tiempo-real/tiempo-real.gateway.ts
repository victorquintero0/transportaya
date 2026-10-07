import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { UsuarioAutenticado } from '../auth/decoradores.js';
import { TokensService } from '../auth/tokens.service.js';
import { UbicacionesService } from '../conductor/ubicaciones.service.js';
import { Eventos } from './eventos.service.js';

const mensajeUbicacion = z.object({
  puntos: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        t: z.number().int().positive(),
        precisionM: z.number().min(0).max(10_000).nullish(),
        velocidadKmh: z.number().min(0).max(400).nullish(),
        rumbo: z.number().min(0).max(360).nullish(),
      }),
    )
    .min(1)
    .max(300),
});

/**
 * WebSocket del conductor. Se autentica con el mismo token de acceso (`auth: { token }`) y entra a su
 * sala. Los cambios de estado se hacen siempre por REST; aquí solo se reciben posiciones y se envían avisos.
 */
@WebSocketGateway({ transports: ['websocket', 'polling'] })
export class TiempoRealGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(UbicacionesService) private readonly ubicaciones: UbicacionesService,
    @Inject(Eventos) private readonly eventos: Eventos,
  ) {}

  afterInit(server: Server): void {
    this.eventos.vincular(server);
  }

  async handleConnection(socket: Socket): Promise<void> {
    const token =
      typeof socket.handshake.auth?.['token'] === 'string' ? socket.handshake.auth['token'] : '';
    const usuario = token ? await this.tokens.autenticar(token) : null;
    if (!usuario || (usuario.rol !== 'conductor' && usuario.rol !== 'pasajero')) {
      socket.emit('error:autenticacion', { codigo: 'SESION_INVALIDA' });
      socket.disconnect(true);
      return;
    }
    socket.data['usuario'] = usuario;
    await socket.join(`${usuario.rol}:${usuario.id}`);
    socket.emit('listo', { conductorId: usuario.id });
  }

  /** Posiciones en vivo. Responde con el resultado para que la app sepa qué quedó guardado. */
  @SubscribeMessage('conductor:ubicacion')
  async ubicacion(@ConnectedSocket() socket: Socket, @MessageBody() cuerpo: unknown) {
    const usuario = socket.data['usuario'] as UsuarioAutenticado | undefined;
    if (!usuario || usuario.rol !== 'conductor') return { error: 'SESION_INVALIDA' };
    const r = mensajeUbicacion.safeParse(cuerpo);
    if (!r.success) return { error: 'SOLICITUD_INVALIDA' };
    try {
      return { ok: true, ...(await this.ubicaciones.guardar(usuario.id, r.data.puntos)) };
    } catch (e) {
      return { error: (e as { codigo?: string }).codigo ?? 'ERROR' };
    }
  }

  @SubscribeMessage('latido')
  latido(): { ok: true; hora: number } {
    return { ok: true, hora: Date.now() };
  }
}
