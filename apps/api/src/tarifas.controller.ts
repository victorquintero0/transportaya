import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Publico } from './auth/decoradores.js';
import { calcularTarifaUrbana, type DesgloseTarifa } from '@transportaya/dominio';
import { z } from 'zod';

const entero = z.number().int().nonnegative();

const recargo = z.discriminatedUnion('tipo', [
  z.object({ nombre: z.string(), tipo: z.literal('fijo'), valor: entero }),
  z.object({ nombre: z.string(), tipo: z.literal('porcentaje'), puntosBasicos: entero }),
]);

const solicitud = z.object({
  parametros: z.object({ base: entero, valorKm: entero, valorMinuto: entero, minima: entero }),
  distanciaM: z.number().nonnegative(),
  tiempoCobrableS: z.number().nonnegative(),
  multiplicadorDinamico: z.number().min(1).optional(),
  recargos: z.array(recargo).optional(),
  peajes: entero.optional(),
  cobroEspera: entero.optional(),
  propina: entero.optional(),
});

/**
 * Simulador de tarifa (OPE-06). Usa la misma lógica de `@transportaya/dominio` que la
 * cotización, para que la operación vea exactamente el precio que calculará el sistema.
 */
@Controller('v1/tarifas')
export class TarifasController {
  // Pública mientras no existan los usuarios internos (OPE-11): solo calcula, no lee ni escribe datos.
  @Publico()
  @Post('simular')
  simular(@Body() cuerpo: unknown): DesgloseTarifa {
    const r = solicitud.safeParse(cuerpo);
    if (!r.success) {
      throw new BadRequestException({ codigo: 'SOLICITUD_INVALIDA', errores: r.error.issues });
    }
    return calcularTarifaUrbana(r.data);
  }
}
