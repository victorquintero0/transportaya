import { Module } from '@nestjs/common';
import { ConductorModule } from '../conductor/conductor.module.js';
import { CierresService } from './cierres.service.js';
import { DineroController } from './dinero.controller.js';
import { GananciasService } from './ganancias.service.js';
import { PagosService } from './pagos.service.js';

@Module({
  imports: [ConductorModule],
  controllers: [DineroController],
  providers: [GananciasService, CierresService, PagosService],
  exports: [CierresService, PagosService, GananciasService],
})
export class DineroModule {}
