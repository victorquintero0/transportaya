import { Module } from '@nestjs/common';
import { ConductorModule } from '../conductor/conductor.module.js';
import { CancelacionPasajeroService } from './cancelacion-pasajero.service.js';
import { DESPACHO_POR_DEFECTO, DespachoService, PARAMETROS_DESPACHO } from './despacho.service.js';
import { MensajesViajeService } from './mensajes.service.js';
import { PeajesService } from './peajes.service.js';
import { PrecioService } from './precio.service.js';
import { ReservasConductorController } from './reservas.controller.js';
import { ReservasService } from './reservas.service.js';
import { ViajesController } from './viajes.controller.js';
import { ViajesService } from './viajes.service.js';

@Module({
  imports: [ConductorModule],
  controllers: [ViajesController, ReservasConductorController],
  providers: [
    PrecioService,
    PeajesService,
    ReservasService,
    DespachoService,
    ViajesService,
    CancelacionPasajeroService,
    MensajesViajeService,
    { provide: PARAMETROS_DESPACHO, useFactory: () => ({ ...DESPACHO_POR_DEFECTO }) },
  ],
  exports: [
    DespachoService,
    ReservasService,
    ViajesService,
    PrecioService,
    CancelacionPasajeroService,
    MensajesViajeService,
  ],
})
export class ViajesModule {}
