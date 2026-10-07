// Prepara una base de datos limpia (migraciones + semilla de Manizales) y levanta la API contra ella.
// Playwright lo usa como `webServer`. El PostgreSQL con PostGIS debe estar disponible (igual que para las pruebas de la API).
import { spawn } from 'node:child_process';
import pg from 'pg';
import { crearConexion, migrarBaseDeDatos } from '@transportaya/db';
import { sembrarManizales } from '@transportaya/db/semillas';

const admin =
  process.env.TEST_DATABASE_URL ?? 'postgres://transportaya:transportaya@localhost:5432/postgres';
const nombre = 'ty_e2e';
const puerto = process.env.E2E_API_PUERTO ?? '3100';

const cliente = new pg.Client({ connectionString: admin });
await cliente.connect();
await cliente.query(`drop database if exists ${nombre} with (force)`);
await cliente.query(`create database ${nombre}`);
await cliente.end();

const url = new URL(admin);
url.pathname = `/${nombre}`;
const conexion = crearConexion(url.toString());
await migrarBaseDeDatos(conexion);
await sembrarManizales(conexion);
await conexion.cerrar();

const api = spawn('pnpm', ['--filter', '@transportaya/api', 'exec', 'tsx', 'src/main.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: url.toString(),
    PORT: puerto,
    NODE_ENV: 'development',
    SIMULADOR: 'true',
    ALMACENAMIENTO_DIR: '.almacenamiento-e2e',
    CORS_ORIGENES: 'http://localhost:5182',
  },
});
const cerrar = () => api.kill('SIGTERM');
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
api.on('exit', (codigo) => process.exit(codigo ?? 0));
