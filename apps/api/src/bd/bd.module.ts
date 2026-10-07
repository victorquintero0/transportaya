import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { type Conexion, crearConexion } from '@transportaya/db';
import { CONFIG, type Configuracion } from '../config.js';

/** Conexión única a PostgreSQL para toda la API. */
@Injectable()
export class BaseDeDatos implements OnModuleDestroy {
  private readonly conexion: Conexion;

  constructor(@Inject(CONFIG) config: Configuracion) {
    this.conexion = crearConexion(config.DATABASE_URL);
  }

  get db(): Conexion['db'] {
    return this.conexion.db;
  }

  get pool(): Conexion['pool'] {
    return this.conexion.pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.conexion.cerrar();
  }
}

export type Db = Conexion['db'];
/** Lo que reciben las funciones que pueden correr dentro o fuera de una transacción. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOTx = Db | Tx;

@Global()
@Module({ providers: [BaseDeDatos], exports: [BaseDeDatos] })
export class BdModule {}
