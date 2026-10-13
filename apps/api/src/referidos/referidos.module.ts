import { Module } from '@nestjs/common';
import { DineroModule } from '../dinero/dinero.module.js';
import { ReferidosOperacionController } from './referidos-op.controller.js';
import { ReferidosOpService } from './referidos-op.service.js';
import { ReferidosController } from './referidos.controller.js';
import { ReferidosService } from './referidos.service.js';

@Module({
  imports: [DineroModule],
  controllers: [ReferidosController, ReferidosOperacionController],
  providers: [ReferidosService, ReferidosOpService],
  exports: [ReferidosService],
})
export class ReferidosModule {}
