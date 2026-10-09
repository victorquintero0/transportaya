import {
  Body,
  Controller,
  Get,
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
import { CatalogosOperacionService } from './catalogos-op.service.js';
import { operadorDe, paginacion } from './comun.js';

interface PeticionConIp {
  ip?: string;
}

const motivo = z.string().trim().min(5).max(500);
const anio = z.number().int().min(1950).max(2100);
const texto = z.string().trim().min(1).max(80);
const booleano = z.enum(['true', 'false']).transform((v) => v === 'true');

const nuevoCatalogo = z.object({
  marca: texto,
  linea: texto,
  categoria: z.enum(CATEGORIAS_VEHICULO),
  anioDesde: anio,
  anioHasta: anio.nullable().optional(),
  carroceria: z.string().trim().max(40).nullable().optional(),
  pasajeros: z.number().int().min(1).max(60).nullable().optional(),
  puertas: z.number().int().min(1).max(8).nullable().optional(),
  motivo,
});
const cambioCatalogo = z.object({
  categoria: z.enum(CATEGORIAS_VEHICULO).optional(),
  anioDesde: anio.optional(),
  anioHasta: anio.nullable().optional(),
  carroceria: z.string().trim().max(40).nullable().optional(),
  pasajeros: z.number().int().min(1).max(60).nullable().optional(),
  puertas: z.number().int().min(1).max(8).nullable().optional(),
  activo: z.boolean().optional(),
  aplicarAVehiculos: z.boolean().optional(),
  motivo,
});
const revision = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('asignar'), catalogoVehiculoId: z.string().uuid(), motivo }),
  z.object({ accion: z.literal('agregar'), categoria: z.enum(CATEGORIAS_VEHICULO), motivo }),
]);
// Colombia: latitud 0 a 13, longitud -80 a -66. Un peaje fuera de eso casi seguro tiene las coordenadas al revés.
const lat = z.number().min(-5).max(14);
const lng = z.number().min(-82).max(-66);
const nuevoPeaje = z.object({
  nombre: z.string().trim().min(2).max(80),
  lat,
  lng,
  valor: z.number().int().min(1).max(500_000),
  fuente: z.string().trim().max(120).optional(),
  motivo,
});
const cambioPeaje = z.object({
  nombre: z.string().trim().min(2).max(80).optional(),
  lat: lat.optional(),
  lng: lng.optional(),
  valor: z.number().int().min(1).max(500_000).optional(),
  activo: z.boolean().optional(),
  motivo,
});

@Controller('v1/op')
export class CatalogosOperacionController {
  constructor(
    @Inject(CatalogosOperacionService) private readonly catalogos: CatalogosOperacionService,
  ) {}

  @RequierePermiso('catalogo.ver')
  @Get('catalogo-vehiculos')
  listar(@Query() q: unknown) {
    const f = validar(
      paginacion.extend({
        q: z.string().trim().max(60).optional(),
        categoria: z.enum(CATEGORIAS_VEHICULO).optional(),
        activo: booleano.optional(),
      }),
      q,
    );
    return this.catalogos.listar(f);
  }

  @RequierePermiso('catalogo.editar')
  @Post('catalogo-vehiculos')
  crear(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const { motivo: m, ...d } = validar(nuevoCatalogo, cuerpo);
    return this.catalogos.crear(d, m, operadorDe(u, req.ip));
  }

  @RequierePermiso('catalogo.editar')
  @Patch('catalogo-vehiculos/:id')
  actualizar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const { motivo: m, ...d } = validar(cambioCatalogo, cuerpo);
    return this.catalogos.actualizar(id, d, m, operadorDe(u, req.ip));
  }

  @RequierePermiso('catalogo.ver')
  @Get('vehiculos-fuera-de-catalogo')
  fuera(@Query() q: unknown) {
    return this.catalogos.fueraDeCatalogo(validar(paginacion, q));
  }

  @RequierePermiso('catalogo.editar')
  @Post('vehiculos/:id/revisar')
  revisar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const { motivo: m, ...d } = validar(revision, cuerpo);
    return this.catalogos.revisarVehiculo(id, d, m, operadorDe(u, req.ip));
  }

  @RequierePermiso('tarifas.ver')
  @Get('peajes')
  peajes(@Query() q: unknown) {
    return this.catalogos.peajes(
      validar(
        z.object({ q: z.string().trim().max(60).optional(), activo: booleano.optional() }),
        q,
      ),
    );
  }

  @RequierePermiso('tarifas.editar')
  @Post('peajes')
  crearPeaje(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const { motivo: m, ...d } = validar(nuevoPeaje, cuerpo);
    return this.catalogos.crearPeaje(d, m, operadorDe(u, req.ip));
  }

  @RequierePermiso('tarifas.editar')
  @Patch('peajes/:id')
  actualizarPeaje(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const { motivo: m, ...d } = validar(cambioPeaje, cuerpo);
    return this.catalogos.actualizarPeaje(id, d, m, operadorDe(u, req.ip));
  }
}
