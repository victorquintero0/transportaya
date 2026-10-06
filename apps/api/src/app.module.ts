import { Module } from '@nestjs/common';
import { SaludController } from './salud.controller.js';
import { TarifasController } from './tarifas.controller.js';

@Module({ controllers: [SaludController, TarifasController] })
export class AppModule {}
