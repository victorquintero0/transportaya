import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { BdModule } from './bd/bd.module.js';
import { FiltroProblemas } from './comun/errores.js';
import { DineroModule } from './dinero/dinero.module.js';
import { ConductorModule } from './conductor/conductor.module.js';
import { ConfigModule } from './config.module.js';
import { OperacionModule } from './operacion/operacion.module.js';
import { ParametrosModule } from './operacion/parametros.service.js';
import { PasajeroModule } from './pasajero/pasajero.module.js';
import { SimuladorModule } from './simulador/simulador.module.js';
import { TareasService } from './tareas.service.js';
import { TiempoRealModule } from './tiempo-real/tiempo-real.module.js';
import { ViajesModule } from './viajes/viajes.module.js';
import { SaludController } from './salud.controller.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    BdModule,
    ParametrosModule,
    AuthModule,
    TiempoRealModule,
    ConductorModule,
    ViajesModule,
    DineroModule,
    PasajeroModule,
    OperacionModule,
    SimuladorModule,
  ],
  controllers: [SaludController],
  providers: [{ provide: APP_FILTER, useClass: FiltroProblemas }, TareasService],
})
export class AppModule {}
