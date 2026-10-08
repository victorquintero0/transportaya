import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { RequiereRol, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { EmpresaPasajeroService } from '../corporativo/empresa-pasajero.service.js';
import { MensajesViajeService } from '../viajes/mensajes.service.js';
import { ReservasService } from '../viajes/reservas.service.js';
import { CompartidoService } from './compartido.service.js';
import { CotizacionesService } from './cotizaciones.service.js';
import { LugaresService } from './lugares.service.js';
import { PagosPasajeroService } from './pagos.service.js';
import { PerfilPasajeroService } from './perfil.service.js';
import { SoportePasajeroService } from './soporte.service.js';
import { ViajesPasajeroService } from './viajes.service.js';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const punto = z.object({ lat, lng, direccion: z.string().trim().max(160).optional() });

const actualizarPerfil = z.object({
  nombre: z.string().trim().min(3, 'escribe tu nombre').max(80).optional(),
  email: z.string().trim().email('correo no válido').max(120).nullable().optional(),
});
const terminos = z.object({ version: z.string().min(1).max(20) });
const contacto = z.object({
  nombre: z.string().trim().min(2).max(60),
  telefono: z.string().trim().min(7).max(25),
});
const lugar = z.object({
  etiqueta: z.string().trim().min(1).max(30),
  direccion: z.string().trim().min(3).max(160),
  lat,
  lng,
});
const cotizar = z
  .object({
    origen: punto,
    /** Una reserva: la hora del servicio, con zona horaria (por ejemplo 2026-10-12T08:30:00-05:00). */
    programadoPara: z
      .string()
      .datetime({ offset: true })
      .transform((v) => new Date(v))
      .optional(),
    destino: punto.optional(),
    ruta: z
      .object({
        destino: z.string().trim().min(2).max(60),
        modalidad: z.enum(['solo_ida', 'ida_y_vuelta']).default('solo_ida'),
      })
      .optional(),
  })
  .refine((c) => c.destino || c.ruta, 'Indica a dónde vas');
const crearViaje = z.object({
  cotizacionId: z.string().uuid(),
  metodoPago: z.enum(['efectivo', 'tarjeta', 'corporativo']),
  metodoPagoId: z.string().uuid().optional(),
  nota: z.string().trim().max(140).optional(),
  centroCostoId: z.string().uuid().optional(),
  motivo: z.string().trim().min(2).max(200).optional(),
});
const calificar = z.object({
  estrellas: z.number().int().min(1).max(5),
  etiquetas: z.array(z.string().trim().min(2).max(30)).max(6).default([]),
  comentario: z.string().trim().max(300).optional(),
});
const propina = z.object({ monto: z.number().int().min(500).max(100_000) });
const mensaje = z.object({ cuerpo: z.string().trim().min(1).max(500) });
const sos = z.object({ lat, lng }).partial().optional();
const tarjeta = z.object({
  token: z.string().min(8).max(120),
  marca: z.string().trim().min(2).max(30),
  ultimos4: z.string().regex(/^[0-9]{4}$/),
});
const pagarDeuda = z.object({ metodoPagoId: z.string().uuid() });
const ticket = z.object({
  tipo: z.enum([
    'cobro_incorrecto',
    'objeto_perdido',
    'queja',
    'peticion',
    'incidente_seguridad',
    'sugerencia',
  ]),
  viajeId: z.string().uuid().optional(),
  asunto: z.string().trim().min(4).max(120),
  detalle: z.string().trim().max(1000).optional(),
});
const historial = z.object({
  limite: z.coerce.number().int().min(1).max(50).default(20),
  antes: z.string().datetime().optional(),
  estado: z.enum(['finalizado', 'cancelado']).optional(),
});

@Controller('v1/pasajero')
@RequiereRol('pasajero')
export class PasajeroController {
  constructor(
    @Inject(PerfilPasajeroService) private readonly perfil: PerfilPasajeroService,
    @Inject(PagosPasajeroService) private readonly pagos: PagosPasajeroService,
    @Inject(LugaresService) private readonly lugares: LugaresService,
    @Inject(CotizacionesService) private readonly cotizaciones: CotizacionesService,
    @Inject(ViajesPasajeroService) private readonly viajes: ViajesPasajeroService,
    @Inject(MensajesViajeService) private readonly mensajes: MensajesViajeService,
    @Inject(CompartidoService) private readonly compartido: CompartidoService,
    @Inject(SoportePasajeroService) private readonly soporte: SoportePasajeroService,
    @Inject(ReservasService) private readonly reservas: ReservasService,
    @Inject(EmpresaPasajeroService) private readonly empresa: EmpresaPasajeroService,
  ) {}

  // ---------------------------------------------------------------- cuenta
  @Get('yo')
  yo(@UsuarioActual() u: UsuarioAutenticado) {
    return this.perfil.obtener(u.id);
  }

  @Patch('yo')
  async actualizar(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    await this.perfil.actualizar(u.id, validar(actualizarPerfil, cuerpo));
    return this.perfil.obtener(u.id);
  }

  @Post('terminos')
  @HttpCode(200)
  async aceptarTerminos(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    await this.perfil.aceptarTerminos(u.id, validar(terminos, cuerpo).version);
    return this.perfil.obtener(u.id);
  }

  @Get('mis-datos')
  misDatos(@UsuarioActual() u: UsuarioAutenticado) {
    return this.perfil.descargarMisDatos(u.id);
  }

  @Delete('cuenta')
  @HttpCode(204)
  async eliminarCuenta(@UsuarioActual() u: UsuarioAutenticado) {
    await this.perfil.eliminarCuenta(u.id);
  }

  @Post('contactos')
  agregarContacto(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.perfil.agregarContacto(u.id, validar(contacto, cuerpo));
  }

  @Delete('contactos/:id')
  @HttpCode(204)
  async quitarContacto(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.perfil.quitarContacto(u.id, id);
  }

  @Post('lugares-guardados')
  guardarLugar(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.perfil.guardarLugar(u.id, validar(lugar, cuerpo));
  }

  @Delete('lugares-guardados/:id')
  @HttpCode(204)
  async quitarLugar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.perfil.quitarLugar(u.id, id);
  }

  // ---------------------------------------------------------------- pagos
  @Post('metodos-pago')
  agregarTarjeta(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.pagos.agregarTarjeta(u.id, validar(tarjeta, cuerpo));
  }

  @Put('metodos-pago/:id/predeterminado')
  @HttpCode(204)
  async predeterminado(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.pagos.hacerPredeterminada(u.id, id);
  }

  @Delete('metodos-pago/:id')
  @HttpCode(204)
  async quitarMetodo(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.pagos.quitar(u.id, id);
  }

  @Post('deuda/pagar')
  @HttpCode(200)
  pagarLaDeuda(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.pagos.pagarDeuda(u.id, validar(pagarDeuda, cuerpo).metodoPagoId);
  }

  // ---------------------------------------------------------------- lugares
  @Get('lugares/buscar')
  async buscar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Query('q') q?: string,
    @Query('lat') latitud?: string,
    @Query('lng') longitud?: string,
  ) {
    const cerca =
      latitud !== undefined &&
      longitud !== undefined &&
      Number.isFinite(Number(latitud)) &&
      Number.isFinite(Number(longitud))
        ? { lat: Number(latitud), lng: Number(longitud) }
        : undefined;
    return {
      resultados: this.lugares.buscar((q ?? '').slice(0, 80), cerca),
      recientes: (q ?? '').trim().length < 2 ? await this.lugares.recientes(u.id) : [],
    };
  }

  @Get('lugares/inversa')
  inversa(@Query('lat') latitud?: string, @Query('lng') longitud?: string) {
    const c = validar(
      z.object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
      }),
      {
        lat: latitud,
        lng: longitud,
      },
    );
    return this.lugares.inversa(c);
  }

  @Get('rutas')
  async rutas() {
    return { rutas: await this.cotizaciones.rutasDisponibles() };
  }

  // ---------------------------------------------------------------- viajes
  @Post('cotizaciones')
  @HttpCode(200)
  cotizar(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    const c = validar(cotizar, cuerpo);
    return this.cotizaciones.cotizar(u.id, c);
  }

  @Post('viajes')
  async crear(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.viajes.crear(u.id, validar(crearViaje, cuerpo));
  }

  // ---------------------------------------------------------------- empresa (PAS-60)
  /** Su empresa, si tiene, y las invitaciones que recibió. */
  @Get('empresa')
  miEmpresa(@UsuarioActual() u: UsuarioAutenticado) {
    return this.empresa.mia(u.id);
  }

  @Post('empresa/invitaciones/:id/aceptar')
  @HttpCode(200)
  async aceptarInvitacion(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.empresa.aceptar(u.id, id);
    return this.empresa.mia(u.id);
  }

  @Post('empresa/invitaciones/:id/rechazar')
  @HttpCode(200)
  async rechazarInvitacion(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.empresa.rechazar(u.id, id);
    return this.empresa.mia(u.id);
  }

  @Post('empresa/salir')
  @HttpCode(200)
  async salirDeLaEmpresa(@UsuarioActual() u: UsuarioAutenticado) {
    await this.empresa.salir(u.id);
    return this.empresa.mia(u.id);
  }

  /** Las reservas que tiene pendientes, de la más próxima a la más lejana (PAS-27). */
  @Get('reservas')
  async misReservas(@UsuarioActual() u: UsuarioAutenticado) {
    return { reservas: await this.reservas.proximasDelPasajero(u.id) };
  }

  @Get('viaje-actual')
  async viajeActual(@UsuarioActual() u: UsuarioAutenticado) {
    return { viaje: await this.viajes.actual(u.id) };
  }

  @Get('viajes')
  async historial(@UsuarioActual() u: UsuarioAutenticado, @Query() q: unknown) {
    const { limite, antes, estado } = validar(historial, q);
    return {
      viajes: await this.viajes.historial(u.id, {
        limite,
        antes: antes ? new Date(antes) : undefined,
        estado,
      }),
    };
  }

  @Get('viajes/:id')
  detalle(@UsuarioActual() u: UsuarioAutenticado, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.viajes.detalle(u.id, id);
  }

  @Get('viajes/:id/recibo')
  recibo(@UsuarioActual() u: UsuarioAutenticado, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.viajes.recibo(u.id, id);
  }

  @Post('viajes/:id/cancelar')
  @HttpCode(200)
  cancelar(@UsuarioActual() u: UsuarioAutenticado, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.viajes.cancelar(u.id, id);
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

  @Post('viajes/:id/propina')
  @HttpCode(200)
  darPropina(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.viajes.darPropina(u.id, id, validar(propina, cuerpo).monto);
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
    return this.mensajes.enviar(u.id, id, validar(mensaje, cuerpo).cuerpo);
  }

  @Post('viajes/:id/compartir')
  compartirViaje(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.compartido.compartir(u.id, id);
  }

  @Delete('viajes/:id/compartir')
  @HttpCode(204)
  async dejarDeCompartir(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.compartido.dejarDeCompartir(u.id, id);
  }

  @Post('sos')
  @HttpCode(200)
  sosPasajero(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    const p = validar(sos, cuerpo);
    return this.viajes.sos(
      u.id,
      p?.lat !== undefined && p.lng !== undefined ? { lat: p.lat, lng: p.lng } : undefined,
    );
  }

  // ---------------------------------------------------------------- soporte
  @Post('soporte/tickets')
  reportar(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.soporte.reportar(u.id, validar(ticket, cuerpo));
  }

  @Get('soporte/tickets')
  async tickets(@UsuarioActual() u: UsuarioAutenticado) {
    return { tickets: await this.soporte.listar(u.id) };
  }
}
