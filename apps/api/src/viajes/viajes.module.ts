import { Module } from '@nestjs/common';
import { ConductorModule } from '../conductor/conductor.module.js';
import { DESPACHO_POR_DEFECTO, DespachoService, PARAMETROS_DESPACHO } from './despacho.service.js';
import { PrecioService } from './precio.service.js';
import { ViajesController } from './viajes.controller.js';
import { ViajesService } from './viajes.service.js';

@Module({
  imports: [ConductorModule],
  controllers: [ViajesController],
  providers: [
    PrecioService,
    DespachoService,
    ViajesService,
    { provide: PARAMETROS_DESPACHO, useValue: DESPACHO_POR_DEFECTO },
  ],
  exports: [DespachoService, ViajesService, PrecioService],
})
export class ViajesModule {}
