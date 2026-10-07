import { Module } from '@nestjs/common';
import { ConductorModule } from '../conductor/conductor.module.js';
import { ViajesModule } from '../viajes/viajes.module.js';
import { CompartidoController } from './compartido.controller.js';
import { CompartidoService } from './compartido.service.js';
import { CotizacionesService } from './cotizaciones.service.js';
import { LugaresService } from './lugares.service.js';
import { PagosPasajeroService } from './pagos.service.js';
import { PasajeroController } from './pasajero.controller.js';
import { PerfilPasajeroService } from './perfil.service.js';
import { SoportePasajeroService } from './soporte.service.js';
import { ViajesPasajeroService } from './viajes.service.js';

@Module({
  imports: [ConductorModule, ViajesModule],
  controllers: [PasajeroController, CompartidoController],
  providers: [
    PerfilPasajeroService,
    PagosPasajeroService,
    LugaresService,
    CotizacionesService,
    ViajesPasajeroService,
    CompartidoService,
    SoportePasajeroService,
  ],
  exports: [PagosPasajeroService, ViajesPasajeroService, CotizacionesService],
})
export class PasajeroModule {}
