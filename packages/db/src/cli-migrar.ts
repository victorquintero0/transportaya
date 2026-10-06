import { crearConexion } from './conexion.js';
import { migrarBaseDeDatos } from './migrar.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta la variable DATABASE_URL');
  process.exit(1);
}

const conexion = crearConexion(url);
try {
  await migrarBaseDeDatos(conexion);
  console.log('Migraciones aplicadas');
} finally {
  await conexion.cerrar();
}
