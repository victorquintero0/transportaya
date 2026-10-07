import { Module } from '@nestjs/common';
import { ALMACENAMIENTO, AlmacenamientoLocal } from './almacenamiento.service.js';
import { CifradoService } from './cifrado.service.js';
import { ConductorController } from './conductor.controller.js';
import { ConexionService } from './conexion.service.js';
import { DocumentosService } from './documentos.service.js';
import { PerfilService } from './perfil.service.js';
import { UbicacionesService } from './ubicaciones.service.js';
import { UbicacionStore } from './ubicacion.store.js';
import { VehiculosService } from './vehiculos.service.js';
import { VencimientosService } from './vencimientos.service.js';

@Module({
  controllers: [ConductorController],
  providers: [
    CifradoService,
    PerfilService,
    VehiculosService,
    DocumentosService,
    ConexionService,
    UbicacionesService,
    UbicacionStore,
    VencimientosService,
    { provide: ALMACENAMIENTO, useClass: AlmacenamientoLocal },
  ],
  exports: [
    ALMACENAMIENTO,
    CifradoService,
    PerfilService,
    ConexionService,
    UbicacionStore,
    UbicacionesService,
    VencimientosService,
  ],
})
export class ConductorModule {}
