import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { z } from 'zod';
import { RequierePermiso, UsuarioActual, type UsuarioAutenticado } from '../auth/decoradores.js';
import { validar } from '../comun/zod.js';
import { motivoObligatorio, operadorDe } from './comun.js';
import { ReportesOperacionService } from './reportes-op.service.js';

interface PeticionConIp {
  ip?: string;
}
interface Respuesta {
  setHeader(n: string, v: string): void;
  end(b: string): void;
}
const rango = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  categoria: z.enum(['media', 'media_alta', 'alta']).optional(),
  zonaId: z.string().uuid().optional(),
});
const calor = rango.extend({
  tipo: z.enum(['solicitudes', 'sin_conductor']).default('solicitudes'),
});

@Controller('v1/op')
export class ReportesOperacionController {
  constructor(
    @Inject(ReportesOperacionService) private readonly reportes: ReportesOperacionService,
  ) {}

  @RequierePermiso('reportes.ver')
  @Get('reportes/tiempos')
  tiempos(@Query() q: unknown) {
    const r = validar(rango, q);
    return this.reportes.tiempos(this.reportes.rango(r.desde, r.hasta), {
      categoria: r.categoria,
      zonaId: r.zonaId,
    });
  }

  @RequierePermiso('reportes.ver')
  @Get('reportes/calor')
  calor(@Query() q: unknown) {
    const r = validar(calor, q);
    return this.reportes.calor(
      this.reportes.rango(r.desde, r.hasta),
      { categoria: r.categoria, zonaId: r.zonaId },
      r.tipo,
    );
  }

  @RequierePermiso('reportes.ver')
  @Get('reportes/viajes.csv')
  async csvViajes(
    @UsuarioActual() u: UsuarioAutenticado,
    @Query() q: unknown,
    @Req() req: PeticionConIp,
    @Res() res: Respuesta,
  ) {
    const r = validar(rango, q);
    const csv = await this.reportes.csvViajes(
      this.reportes.rango(r.desde, r.hasta),
      operadorDe(u, req.ip),
      { categoria: r.categoria, zonaId: r.zonaId },
    );
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="viajes.csv"');
    res.end(csv);
  }

  @RequierePermiso('reportes.ver')
  @Get('reportes/tiempos.csv')
  async csvTiempos(
    @UsuarioActual() u: UsuarioAutenticado,
    @Query() q: unknown,
    @Req() req: PeticionConIp,
    @Res() res: Respuesta,
  ) {
    const r = validar(rango, q);
    const csv = await this.reportes.csvTiempos(
      this.reportes.rango(r.desde, r.hasta),
      operadorDe(u, req.ip),
      { categoria: r.categoria, zonaId: r.zonaId },
    );
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="tiempos-por-dia.csv"');
    res.end(csv);
  }

  @RequierePermiso('config.ver')
  @Get('parametros')
  parametros() {
    return this.reportes.listarParametros();
  }

  @RequierePermiso('config.editar')
  @Put('parametros/:clave')
  @HttpCode(200)
  cambiar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('clave') clave: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    const d = validar(
      z.object({ valor: z.number(), motivo: z.string().trim().min(5).max(500) }),
      cuerpo,
    );
    return this.reportes.cambiarParametro(clave, d.valor, d.motivo, operadorDe(u, req.ip));
  }

  @RequierePermiso('config.editar')
  @Delete('parametros/:clave')
  @HttpCode(204)
  async restablecer(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('clave') clave: string,
    @Body() cuerpo: unknown,
    @Req() req: PeticionConIp,
  ) {
    await this.reportes.restablecerParametro(
      clave,
      validar(motivoObligatorio, cuerpo).motivo,
      operadorDe(u, req.ip),
    );
  }
}
