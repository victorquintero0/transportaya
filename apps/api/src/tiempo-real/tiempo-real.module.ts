import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConductorModule } from '../conductor/conductor.module.js';
import { Eventos } from './eventos.service.js';
import { TiempoRealGateway } from './tiempo-real.gateway.js';

@Global()
@Module({
  imports: [AuthModule, ConductorModule],
  providers: [Eventos, TiempoRealGateway],
  exports: [Eventos],
})
export class TiempoRealModule {}
