import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { BdModule } from './bd/bd.module.js';
import { FiltroProblemas } from './comun/errores.js';
import { DineroModule } from './dinero/dinero.module.js';
import { ConductorModule } from './conductor/conductor.module.js';
import { ConfigModule } from './config.module.js';
import { SimuladorModule } from './simulador/simulador.module.js';
import { TareasService } from './tareas.service.js';
import { TiempoRealModule } from './tiempo-real/tiempo-real.module.js';
import { ViajesModule } from './viajes/viajes.module.js';
import { SaludController } from './salud.controller.js';
import { TarifasController } from './tarifas.controller.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    BdModule,
    AuthModule,
    TiempoRealModule,
    ConductorModule,
    ViajesModule,
    DineroModule,
    SimuladorModule,
  ],
  controllers: [SaludController, TarifasController],
  providers: [{ provide: APP_FILTER, useClass: FiltroProblemas }, TareasService],
})
export class AppModule {}
