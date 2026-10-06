import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { BdModule } from './bd/bd.module.js';
import { FiltroProblemas } from './comun/errores.js';
import { ConductorModule } from './conductor/conductor.module.js';
import { ConfigModule } from './config.module.js';
import { SimuladorModule } from './simulador/simulador.module.js';
import { SaludController } from './salud.controller.js';
import { TarifasController } from './tarifas.controller.js';

@Module({
  imports: [ConfigModule, BdModule, AuthModule, ConductorModule, SimuladorModule],
  controllers: [SaludController, TarifasController],
  providers: [{ provide: APP_FILTER, useClass: FiltroProblemas }],
})
export class AppModule {}
