import { Body, Controller, Delete, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { RequiereRol } from '../auth/decoradores.js';
import { noEncontrado } from '../comun/errores.js';
import { validar } from '../comun/zod.js';
import { CONFIG, type Configuracion } from '../config.js';
import { PagosPasajeroService } from '../pasajero/pagos.service.js';
import { ConductoresSimuladosService } from './conductores.service.js';

/**
 * Atajos para probar la app del pasajero sin conductores ni bancos reales. Solo existen con SIMULADOR=true:
 * conductores de mentira que atienden los viajes, y la tokenización de tarjetas que haría Wompi.
 */
@Controller('v1/dev')
@RequiereRol('pasajero')
export class SimuladorPasajeroController {
  constructor(
    @Inject(CONFIG) private readonly config: Pick<Configuracion, 'SIMULADOR'>,
    @Inject(ConductoresSimuladosService) private readonly conductores: ConductoresSimuladosService,
    @Inject(PagosPasajeroService) private readonly pagos: PagosPasajeroService,
  ) {}

  private exigirSimulador(): void {
    if (!this.config.SIMULADOR) throw noEncontrado('NO_ENCONTRADO', 'Ruta no encontrada');
  }

  @Post('conductores-simulados')
  @HttpCode(201)
  crear(@Body() cuerpo: unknown) {
    this.exigirSimulador();
    const d = validar(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        cantidad: z.number().int().min(1).max(5).optional(),
        velocidadMs: z.number().min(3).max(50).optional(),
        cercaM: z.number().min(100).max(5000).optional(),
      }),
      cuerpo,
    );
    return this.conductores.crear({ lat: d.lat, lng: d.lng }, d);
  }

  @Delete('conductores-simulados')
  @HttpCode(200)
  async detener() {
    this.exigirSimulador();
    return { detenidos: await this.conductores.detener() };
  }

  /** Hace de Wompi: recibe la tarjeta y devuelve solo un token. */
  @Post('tarjetas/tokenizar')
  @HttpCode(200)
  tokenizar(@Body() cuerpo: unknown) {
    this.exigirSimulador();
    return this.pagos.tokenizarSimulado(
      validar(
        z.object({
          numero: z.string().min(12).max(23),
          vence: z.string().min(4).max(5),
          cvc: z.string().min(3).max(4),
        }),
        cuerpo,
      ),
    );
  }
}
