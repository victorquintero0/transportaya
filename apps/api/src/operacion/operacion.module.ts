import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConductorModule } from '../conductor/conductor.module.js';
import { DineroModule } from '../dinero/dinero.module.js';
import { ViajesModule } from '../viajes/viajes.module.js';
import { AuthOperacionController } from './auth-op.controller.js';
import { AuthOperacionService } from './auth-op.service.js';
import { CatalogosOperacionController } from './catalogos-op.controller.js';
import { CatalogosOperacionService } from './catalogos-op.service.js';
import { ConductoresOperacionService } from './conductores-op.service.js';
import { ReservasOperacionController } from './reservas-op.controller.js';
import { PasajerosOperacionService } from './pasajeros-op.service.js';
import { PersonasOperacionController } from './personas-op.controller.js';
import { TarifasOperacionController } from './tarifas-op.controller.js';
import { TarifasOperacionService } from './tarifas-op.service.js';
import { FinanzasOperacionController } from './finanzas-op.controller.js';
import { FinanzasOperacionService } from './finanzas-op.service.js';
import { SoporteOperacionController } from './soporte-op.controller.js';
import { SoporteOperacionService } from './soporte-op.service.js';
import { ReportesOperacionController } from './reportes-op.controller.js';
import { ReportesOperacionService } from './reportes-op.service.js';
import { MapaConfigService } from './mapa-config.service.js';
import { MapaController } from './mapa.controller.js';
import { EmpleadosService } from './empleados.service.js';
import { TorreOperacionController } from './torre-op.controller.js';
import { TorreService } from './torre.service.js';
import { ViajesOperacionService } from './viajes-op.service.js';
import { UsuariosOperacionController } from './usuarios-op.controller.js';

@Module({
  imports: [AuthModule, ConductorModule, ViajesModule, DineroModule],
  controllers: [
    CatalogosOperacionController,
    ReservasOperacionController,
    AuthOperacionController,
    UsuariosOperacionController,
    TorreOperacionController,
    PersonasOperacionController,
    TarifasOperacionController,
    FinanzasOperacionController,
    SoporteOperacionController,
    ReportesOperacionController,
    MapaController,
  ],
  providers: [
    CatalogosOperacionService,
    AuthOperacionService,
    EmpleadosService,
    TorreService,
    ViajesOperacionService,
    ConductoresOperacionService,
    PasajerosOperacionService,
    TarifasOperacionService,
    FinanzasOperacionService,
    SoporteOperacionService,
    ReportesOperacionService,
    MapaConfigService,
  ],
  exports: [EmpleadosService, AuthOperacionService],
})
export class OperacionModule {}
