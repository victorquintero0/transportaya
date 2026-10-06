import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { leerConfiguracion } from './config.js';

async function arrancar(): Promise<void> {
  const config = leerConfiguracion();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(config.PORT);
}

void arrancar();
