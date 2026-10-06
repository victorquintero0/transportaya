import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { leerConfiguracion } from './config.js';
import { AdaptadorSocket } from './tiempo-real/adaptador-socket.js';

async function arrancar(): Promise<void> {
  const config = leerConfiguracion();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: config.CORS_ORIGENES, credentials: true });
  app.useWebSocketAdapter(new AdaptadorSocket(app, config.CORS_ORIGENES));
  app.enableShutdownHooks();
  await app.listen(config.PORT);
}

void arrancar();
