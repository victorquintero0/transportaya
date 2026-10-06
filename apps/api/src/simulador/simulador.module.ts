import { Module } from '@nestjs/common';
import { ConductorModule } from '../conductor/conductor.module.js';
import { DineroModule } from '../dinero/dinero.module.js';
import { ViajesModule } from '../viajes/viajes.module.js';
import { PasajerosSimuladosService } from './pasajeros.service.js';
import { SimuladorController } from './simulador.controller.js';

@Module({
  imports: [ConductorModule, ViajesModule, DineroModule],
  controllers: [SimuladorController],
  providers: [PasajerosSimuladosService],
})
export class SimuladorModule {}
