import { Global, Module } from '@nestjs/common';
import { CONFIG, leerConfiguracion } from './config.js';

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => leerConfiguracion() }],
  exports: [CONFIG],
})
export class ConfigModule {}
