import { Module } from '@nestjs/common';
import { ConductorModule } from '../conductor/conductor.module.js';
import { SimuladorController } from './simulador.controller.js';

@Module({ imports: [ConductorModule], controllers: [SimuladorController] })
export class SimuladorModule {}
