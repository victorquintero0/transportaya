import { Module } from '@nestjs/common';
import { ConductorModule } from '../conductor/conductor.module.js';
import { AnonimizacionService } from './anonimizacion.service.js';
import { PrivacidadController, PrivacidadOpController } from './privacidad.controller.js';
import { PrivacidadService } from './privacidad.service.js';
import { RetencionService } from './retencion.service.js';

@Module({
  imports: [ConductorModule],
  controllers: [PrivacidadController, PrivacidadOpController],
  providers: [AnonimizacionService, PrivacidadService, RetencionService],
  exports: [AnonimizacionService, PrivacidadService, RetencionService],
})
export class PrivacidadModule {}
