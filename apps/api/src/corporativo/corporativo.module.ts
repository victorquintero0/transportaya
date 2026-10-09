import { Module } from '@nestjs/common';
import { OperacionModule } from '../operacion/operacion.module.js';
import { EmpresasOperacionController } from './corporativo-op.controller.js';
import { CorporativoService } from './corporativo.service.js';
import { EmpresaPasajeroService } from './empresa-pasajero.service.js';
import { MiEmpresaController } from './mi-empresa.controller.js';

/** Clientes corporativos (OPE-10, PAS-60 a PAS-62): empresas, empleados, políticas, cupo y estados de cuenta. */
@Module({
  imports: [OperacionModule],
  controllers: [EmpresasOperacionController, MiEmpresaController],
  providers: [CorporativoService, EmpresaPasajeroService],
  exports: [CorporativoService, EmpresaPasajeroService],
})
export class CorporativoModule {}
