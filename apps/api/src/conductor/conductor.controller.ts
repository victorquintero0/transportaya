import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TIPOS_DOCUMENTO } from '@transportaya/dominio';
import { z } from 'zod';
import { RequiereRol, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { ConexionService } from './conexion.service.js';
import { TAMANO_MAXIMO_ARCHIVO } from './archivos.js';
import { DocumentosService } from './documentos.service.js';
import { PerfilService } from './perfil.service.js';
import { UbicacionesService } from './ubicaciones.service.js';
import { VehiculosService } from './vehiculos.service.js';

const coordenada = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};

const actualizarPerfil = z.object({
  nombre: z.string().trim().min(3, 'escribe tu nombre completo').max(80).optional(),
  email: z.string().trim().email('correo no válido').max(120).nullable().optional(),
  aceptaCategoriaInferior: z.boolean().optional(),
  aceptaIntermunicipal: z.boolean().optional(),
});

const vehiculoNuevo = z.object({
  placa: z.string().trim().min(5).max(10),
  color: z.string().trim().min(3).max(30),
  modeloAnio: z
    .number()
    .int()
    .min(1990)
    .max(new Date().getFullYear() + 1),
  catalogoVehiculoId: z.string().uuid().optional(),
  marca: z.string().trim().min(2).max(40).optional(),
  linea: z.string().trim().min(1).max(60).optional(),
});

const cuentaPago = z.object({
  tipo: z.enum(['llave_bre_b', 'cuenta_bancaria']),
  valor: z
    .string()
    .trim()
    .min(3, 'es muy corta')
    .max(60)
    .regex(/^[\p{L}\p{N}@.+_-]+$/u, 'solo letras, números y @ . + _ -'),
  banco: z.string().trim().max(60).optional(),
});

const subirDocumento = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO),
  vehiculoId: z.string().uuid().optional(),
  numero: z.string().trim().max(40).optional(),
  venceEn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'usa el formato AAAA-MM-DD')
    .optional(),
});

const conectar = z
  .object({ ...coordenada, precisionM: z.number().min(0).max(10_000).optional() })
  .partial()
  .optional();

const ubicaciones = z.object({
  puntos: z
    .array(
      z.object({
        ...coordenada,
        t: z.number().int().positive(),
        precisionM: z.number().min(0).max(10_000).nullish(),
        velocidadKmh: z.number().min(0).max(400).nullish(),
        rumbo: z.number().min(0).max(360).nullish(),
      }),
    )
    .min(1)
    .max(300),
});

@Controller('v1')
@RequiereRol('conductor')
export class ConductorController {
  constructor(
    @Inject(PerfilService) private readonly perfil: PerfilService,
    @Inject(VehiculosService) private readonly vehiculos: VehiculosService,
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
    @Inject(ConexionService) private readonly conexion: ConexionService,
    @Inject(UbicacionesService) private readonly ubicaciones: UbicacionesService,
  ) {}

  @Get('conductor/yo')
  yo(@UsuarioActual() u: UsuarioAutenticado) {
    return this.perfil.obtener(u.id);
  }

  @Patch('conductor/yo')
  async actualizar(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    await this.perfil.actualizar(u.id, validar(actualizarPerfil, cuerpo));
    return this.perfil.obtener(u.id);
  }

  @Get('catalogo-vehiculos')
  catalogo() {
    return this.perfil.catalogo();
  }

  @Post('conductor/vehiculos')
  async registrarVehiculo(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    const creado = await this.vehiculos.registrar(u.id, validar(vehiculoNuevo, cuerpo));
    return { ...creado, perfil: await this.perfil.obtener(u.id) };
  }

  @Put('conductor/vehiculo-activo')
  @HttpCode(204)
  async activarVehiculo(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    const { vehiculoId } = validar(z.object({ vehiculoId: z.string().uuid() }), cuerpo);
    await this.vehiculos.activar(u.id, vehiculoId);
  }

  @Get('conductor/documentos')
  async listarDocumentos(@UsuarioActual() u: UsuarioAutenticado) {
    const [perfil, lista] = await Promise.all([
      this.perfil.obtener(u.id),
      this.documentos.listar(u.id),
    ]);
    return { requisitos: perfil.documentos.requisitos, historial: lista };
  }

  @Post('conductor/documentos')
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO, files: 1 } }),
  )
  async subirDocumento(
    @UsuarioActual() u: UsuarioAutenticado,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo: Express.Multer.File | undefined,
  ) {
    const datos = validar(subirDocumento, cuerpo);
    return this.documentos.subir(u.id, { ...datos, archivo: archivo?.buffer ?? Buffer.alloc(0) });
  }

  @Get('conductor/documentos/:id/archivo')
  async archivoDocumento(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: { setHeader(n: string, v: string): void; send(b: Buffer): void },
  ) {
    const { contenido, mime } = await this.documentos.archivo(u.id, id);
    res.setHeader('content-type', mime);
    res.setHeader('cache-control', 'private, max-age=300');
    res.send(contenido);
  }

  @Put('conductor/cuenta-pago')
  async guardarCuentaPago(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    await this.perfil.guardarCuentaPago(u.id, validar(cuentaPago, cuerpo));
    return (await this.perfil.obtener(u.id)).cuentaPago;
  }

  @Post('conductor/enviar-revision')
  @HttpCode(200)
  async enviarRevision(@UsuarioActual() u: UsuarioAutenticado) {
    await this.perfil.enviarARevision(u.id);
    return this.perfil.obtener(u.id);
  }

  @Post('conductor/conectar')
  @HttpCode(200)
  conectar(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    const ubicacion = validar(conectar, cuerpo);
    return this.conexion.conectar(
      u.id,
      ubicacion?.lat !== undefined && ubicacion.lng !== undefined
        ? { lat: ubicacion.lat, lng: ubicacion.lng, precisionM: ubicacion.precisionM }
        : undefined,
    );
  }

  @Post('conductor/desconectar')
  @HttpCode(204)
  async desconectar(@UsuarioActual() u: UsuarioAutenticado) {
    await this.conexion.desconectar(u.id);
  }

  @Post('conductor/ubicaciones')
  @HttpCode(200)
  guardarUbicaciones(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.ubicaciones.guardar(u.id, validar(ubicaciones, cuerpo).puntos);
  }
}
