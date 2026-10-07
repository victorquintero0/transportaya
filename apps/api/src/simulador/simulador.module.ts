import { Module } from '@nestjs/common';
import { ConductorModule } from '../conductor/conductor.module.js';
import { DineroModule } from '../dinero/dinero.module.js';
import { ViajesModule } from '../viajes/viajes.module.js';
import { PasajeroModule } from '../pasajero/pasajero.module.js';
import { ConductoresSimuladosService } from './conductores.service.js';
import { SimuladorPasajeroController } from './pasajero.controller.js';
import { PasajerosSimuladosService } from './pasajeros.service.js';
import { SimuladorController } from './simulador.controller.js';

@Module({
  imports: [ConductorModule, ViajesModule, DineroModule, PasajeroModule],
  controllers: [SimuladorController, SimuladorPasajeroController],
  providers: [PasajerosSimuladosService, ConductoresSimuladosService],
})
export class SimuladorModule {}
