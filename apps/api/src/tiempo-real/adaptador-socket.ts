import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

/** Aplica a Socket.IO los mismos orígenes permitidos que a la API (CORS_ORIGENES). */
export class AdaptadorSocket extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origenes: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: Parameters<IoAdapter['createIOServer']>[1]) {
    // `options` y las opciones propias vienen de dos copias de socket.io con tipos distintos pero compatibles.
    const opciones = { ...options, cors: { origin: this.origenes, credentials: true } };
    return super.createIOServer(port, opciones as NonNullable<typeof options>);
  }
}
