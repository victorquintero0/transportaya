import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { RequiereRol, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { DespachoService } from './despacho.service.js';
import { MensajesViajeService } from './mensajes.service.js';
import { ViajesService } from './viajes.service.js';

const entero = z.number().int().min(0).max(2_000_000);
const posicion = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

const llegue = posicion.partial().optional();
const iniciar = z.object({
  pin: z
    .string()
    .regex(/^[0-9]{4}$/, 'el PIN tiene 4 dígitos')
    .optional(),
});
const finalizar = z.object({ distanciaM: entero, tiempoDetenidoS: entero, duracionS: entero });
const efectivo = z.object({ monto: z.number().int().min(0).max(5_000_000) });
const cancelar = z.object({
  motivo: z.enum(['pasajero_ausente', 'emergencia', 'problema_vehiculo', 'otro']),
  detalle: z.string().trim().max(300).optional(),
});
const calificar = z.object({
  estrellas: z.number().int().min(1).max(5),
  etiquetas: z.array(z.string().trim().min(2).max(30)).max(6).default([]),
  comentario: z.string().trim().max(300).optional(),
});
const sos = posicion.partial().optional();

@Controller('v1/conductor')
@RequiereRol('conductor')
export class ViajesController {
  constructor(
    @Inject(ViajesService) private readonly viajes: ViajesService,
    @Inject(DespachoService) private readonly despacho: DespachoService,
    @Inject(MensajesViajeService) private readonly mensajes: MensajesViajeService,
  ) {}

  @Get('oferta-actual')
  async ofertaActual(@UsuarioActual() u: UsuarioAutenticado) {
    return { oferta: await this.despacho.ofertaPendiente(u.id) };
  }

  @Post('ofertas/:id/aceptar')
  @HttpCode(200)
  async aceptar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.despacho.aceptar(u.id, id);
    return this.viajes.actual(u.id);
  }

  @Post('ofertas/:id/rechazar')
  @HttpCode(204)
  async rechazar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.despacho.rechazar(u.id, id);
  }

  @Get('viaje-actual')
  async viajeActual(@UsuarioActual() u: UsuarioAutenticado) {
    return { viaje: await this.viajes.actual(u.id) };
  }

  @Get('viajes')
  async historial(@UsuarioActual() u: UsuarioAutenticado, @Query('limite') limite?: string) {
    const n = Math.min(Math.max(Number(limite) || 30, 1), 100);
    return { viajes: await this.viajes.historial(u.id, n) };
  }

  @Post('viajes/:id/llegue')
  @HttpCode(200)
  llegue(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    const p = validar(llegue, cuerpo);
    return this.viajes.llegue(
      u.id,
      id,
      p?.lat !== undefined && p.lng !== undefined ? { lat: p.lat, lng: p.lng } : undefined,
    );
  }

  @Post('viajes/:id/iniciar')
  @HttpCode(200)
  iniciar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.viajes.iniciar(u.id, id, validar(iniciar, cuerpo).pin);
  }

  @Post('viajes/:id/finalizar')
  @HttpCode(200)
  finalizar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.viajes.finalizar(u.id, id, validar(finalizar, cuerpo));
  }

  @Post('viajes/:id/efectivo-recibido')
  @HttpCode(200)
  efectivo(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.viajes.efectivoRecibido(u.id, id, validar(efectivo, cuerpo).monto);
  }

  @Post('viajes/:id/cancelar')
  @HttpCode(200)
  cancelar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    const d = validar(cancelar, cuerpo);
    return this.viajes.cancelar(u.id, id, d.motivo, d.detalle);
  }

  @Post('viajes/:id/calificacion')
  @HttpCode(200)
  calificar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.viajes.calificar(u.id, id, validar(calificar, cuerpo));
  }

  @Get('viajes/:id/mensajes')
  async mensajesDelViaje(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { mensajes: await this.mensajes.listar(u.id, id) };
  }

  @Post('viajes/:id/mensajes')
  enviarMensaje(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.mensajes.enviar(
      u.id,
      id,
      validar(z.object({ cuerpo: z.string().trim().min(1).max(500) }), cuerpo).cuerpo,
    );
  }

  @Post('sos')
  @HttpCode(200)
  sos(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    const p = validar(sos, cuerpo);
    return this.viajes.sos(
      u.id,
      p?.lat !== undefined && p.lng !== undefined ? { lat: p.lat, lng: p.lng } : undefined,
    );
  }
}
