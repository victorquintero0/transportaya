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
  Query,
  Req,
} from '@nestjs/common';
import { CATEGORIAS_VEHICULO } from '@transportaya/dominio';
import { z } from 'zod';
import { RequierePermiso, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { motivoObligatorio, operadorDe, paginacion } from './comun.js';
import { TarifasOperacionService } from './tarifas-op.service.js';

interface PeticionConIp {
  ip?: string;
}

const entero = z.number().int().min(0).max(10_000_000);
const recargo = z.object({
  codigo: z
    .string()
    .regex(/^[a-z_]+$/)
    .max(40),
  nombre: z.string().trim().min(2).max(80),
  tipo: z.enum(['fijo', 'porcentaje']),
  valor: entero,
  categoria: z.enum(CATEGORIAS_VEHICULO).optional(),
  activo: z.boolean().optional(),
});
const version = z.object({
  base: entero,
  valorKm: entero,
  valorMinuto: entero,
  minima: entero,
  cancelacion: entero,
  esperaMinuto: entero,
  esperaMinutosGratis: z.number().int().min(0).max(60),
  fuente: z.string().trim().max(200).optional(),
  vigenteDesde: z.coerce.date().optional(),
  recargos: z.array(recargo).max(40),
  motivo: z.string().trim().min(5).max(500),
});
const simular = z.object({
  tarifaId: z.string().uuid().optional(),
  categoria: z.enum(CATEGORIAS_VEHICULO).default('media'),
  distanciaKm: z.number().min(0).max(100),
  tiempoDetenidoMin: z.number().min(0).max(240).default(0),
  instante: z.coerce.date().optional(),
  aeropuerto: z.boolean().optional(),
  extras: z.array(z.string().max(40)).max(10).optional(),
  multiplicador: z.number().min(1).max(5).optional(),
  peajes: entero.optional(),
});
const festivoEntrada = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nombre: z.string().trim().min(3).max(80),
});
const rutaCambio = z
  .object({
    tarifa: z.number().int().min(1000).max(5_000_000).optional(),
    activa: z.boolean().optional(),
    motivo: z.string().trim().min(5).max(500),
  })
  .refine((d) => d.tarifa !== undefined || d.activa !== undefined, 'Indica qué cambiar');
const zonaNueva = z.object({
  nombre: z.string().trim().min(3).max(80),
  tipo: z.enum([
    'area_servicio',
    'aeropuerto',
    'restringida',
    'punto_encuentro',
    'termales',
    'moteles',
  ]),
  /** Anillo de puntos `[lng, lat]`. */
  anillo: z
    .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
    .min(3)
    .max(500),
  motivo: z.string().trim().min(5).max(500),
});
const zonaCambio = z.object({ activa: z.boolean(), motivo: z.string().trim().min(5).max(500) });
const dinamica = z.object({
  zonaId: z.string().uuid(),
  multiplicador: z.number().min(1.05).max(3),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date(),
  motivo: z.string().trim().min(5).max(500),
});

@Controller('v1/op')
export class TarifasOperacionController {
  constructor(@Inject(TarifasOperacionService) private readonly tarifas: TarifasOperacionService) {}

  @RequierePermiso('tarifas.ver')
  @Get('tarifas')
  listar() {
    return this.tarifas.listar();
  }

  @RequierePermiso('tarifas.editar')
  @Post('tarifas')
  @HttpCode(201)
  crear(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.tarifas.crearVersion(validar(version, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('tarifas.ver')
  @Post('tarifas/simular')
  @HttpCode(200)
  simular(@Body() cuerpo: unknown) {
    return this.tarifas.simular(validar(simular, cuerpo));
  }

  @RequierePermiso('tarifas.ver')
  @Get('festivos')
  festivos(@Query('anio') anio?: string) {
    return this.tarifas.festivos(Number(anio) || new Date().getFullYear());
  }

  @RequierePermiso('tarifas.editar')
  @Post('festivos')
  @HttpCode(204)
  async agregarFestivo(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(festivoEntrada, cuerpo);
    await this.tarifas.agregarFestivo(d.fecha, d.nombre, operadorDe(u, req.ip));
  }

  @RequierePermiso('tarifas.editar')
  @Delete('festivos/:fecha')
  @HttpCode(204)
  async quitarFestivo(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('fecha') fecha: string,
    @Req() req: PeticionConIp,
  ) {
    await this.tarifas.quitarFestivo(
      validar(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), fecha),
      operadorDe(u, req.ip),
    );
  }

  @RequierePermiso('tarifas.ver')
  @Get('rutas-fijas')
  rutas(@Query() q: unknown) {
    const f = validar(
      paginacion.extend({
        q: z.string().trim().max(60).optional(),
        activa: z
          .enum(['true', 'false'])
          .transform((v) => v === 'true')
          .optional(),
      }),
      q,
    );
    return this.tarifas.rutas(f);
  }

  @RequierePermiso('tarifas.editar')
  @Patch('rutas-fijas/:id')
  @HttpCode(204)
  async actualizarRuta(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.tarifas.actualizarRuta(id, validar(rutaCambio, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('tarifas.ver')
  @Get('zonas')
  zonas() {
    return this.tarifas.zonas();
  }

  @RequierePermiso('tarifas.editar')
  @Post('zonas')
  @HttpCode(201)
  crearZona(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.tarifas.crearZona(validar(zonaNueva, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('tarifas.editar')
  @Patch('zonas/:id')
  @HttpCode(204)
  async actualizarZona(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.tarifas.actualizarZona(id, validar(zonaCambio, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('tarifas.ver')
  @Get('dinamica')
  dinamica() {
    return this.tarifas.dinamica();
  }

  @RequierePermiso('dinamica.activar')
  @Post('dinamica')
  @HttpCode(201)
  activar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    return this.tarifas.activarDinamica(validar(dinamica, cuerpo), operadorDe(u, req.ip));
  }

  @RequierePermiso('dinamica.activar')
  @Post('dinamica/:id/desactivar')
  @HttpCode(204)
  async desactivar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.tarifas.desactivarDinamica(
      id,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }
}
