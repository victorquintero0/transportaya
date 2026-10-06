import { Controller, Get } from '@nestjs/common';

@Controller('v1/salud')
export class SaludController {
  @Get()
  estado(): { estado: 'ok'; servicio: string; hora: string } {
    return { estado: 'ok', servicio: 'transportaya-api', hora: new Date().toISOString() };
  }
}
