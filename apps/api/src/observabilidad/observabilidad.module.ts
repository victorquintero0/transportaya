import { Global, Module } from '@nestjs/common';
import { EstadoTareasService } from './estado-tareas.service.js';
import { MetricasService } from './metricas.service.js';
import { ObservabilidadController } from './observabilidad.controller.js';
import { MiddlewareSolicitudes } from './solicitudes.middleware.js';

@Global()
@Module({
  controllers: [ObservabilidadController],
  providers: [MetricasService, EstadoTareasService, MiddlewareSolicitudes],
  exports: [MetricasService, EstadoTareasService, MiddlewareSolicitudes],
})
export class ObservabilidadModule {}
