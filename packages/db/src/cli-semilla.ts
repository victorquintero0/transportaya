import { crearConexion } from './conexion.js';
import { sembrarManizales } from './semillas.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta la variable DATABASE_URL');
  process.exit(1);
}

const conexion = crearConexion(url);
try {
  console.log(await sembrarManizales(conexion));
} finally {
  await conexion.cerrar();
}
