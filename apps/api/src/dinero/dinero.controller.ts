import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { fechaBogota } from '@transportaya/dominio';
import { z } from 'zod';
import { RequiereRol, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { solicitudInvalida } from '../comun/errores.js';
import { validar } from '../comun/zod.js';
import { GananciasService, rangoDe, type Periodo } from './ganancias.service.js';
import { PagosService } from './pagos.service.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'usa el formato AAAA-MM-DD');
const consulta = z.object({
  periodo: z.enum(['hoy', 'ayer', 'semana', 'mes']).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
});
const reporte = z.object({
  monto: z.number().int().min(1000).max(5_000_000),
  referencia: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'solo letras, números, guiones y guion bajo'),
});

@Controller('v1/conductor')
@RequiereRol('conductor')
export class DineroController {
  constructor(
    @Inject(GananciasService) private readonly ganancias: GananciasService,
    @Inject(PagosService) private readonly pagos: PagosService,
  ) {}

  @Get('ganancias')
  verGanancias(@UsuarioActual() u: UsuarioAutenticado, @Query() q: unknown) {
    const { periodo, desde, hasta } = validar(consulta, q);
    if ((desde && !hasta) || (!desde && hasta))
      throw solicitudInvalida('Indica "desde" y "hasta" juntos.');
    const rango = desde && hasta ? { desde, hasta } : rangoDe((periodo ?? 'hoy') as Periodo);
    return this.ganancias.resumen(u.id, rango.desde, rango.hasta);
  }

  @Get('saldo')
  saldo(@UsuarioActual() u: UsuarioAutenticado) {
    return this.pagos.saldo(u.id);
  }

  @Get('movimientos')
  async movimientos(
    @UsuarioActual() u: UsuarioAutenticado,
    @Query('limite') limite?: string,
    @Query('antes') antes?: string,
  ) {
    const n = Math.min(Math.max(Number(limite) || 30, 1), 100);
    const fechaAntes = antes ? new Date(antes) : undefined;
    if (fechaAntes && Number.isNaN(fechaAntes.getTime()))
      throw solicitudInvalida('"antes" no es una fecha válida.');
    return { movimientos: await this.pagos.movimientos(u.id, n, fechaAntes) };
  }

  @Get('cierres')
  async cierres(@UsuarioActual() u: UsuarioAutenticado) {
    return { cierres: await this.pagos.cierres(u.id), hoy: fechaBogota(new Date()) };
  }

  @Post('pagos-comision')
  @HttpCode(201)
  reportarPago(@UsuarioActual() u: UsuarioAutenticado, @Body() cuerpo: unknown) {
    return this.pagos.reportarPagoComision(u.id, validar(reporte, cuerpo));
  }
}
