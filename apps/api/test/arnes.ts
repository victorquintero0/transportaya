import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type BaseDePrueba, baseDisponible, crearBaseDePrueba } from '@transportaya/db/pruebas';
import { sembrarManizales } from '@transportaya/db/semillas';
import { AppModule } from '../src/app.module.js';
import { CONFIG, type Configuracion, leerConfiguracion } from '../src/config.js';
import { PROVEEDOR_OTP, type ProveedorOtp } from '../src/auth/proveedor-otp.js';

export { baseDisponible };

export interface Respuesta<T = unknown> {
  estado: number;
  cuerpo: T;
}

export interface ConductorListo {
  accessToken: string;
  refreshToken: string;
  usuarioId: string;
  vehiculoId: string;
}

/** PNG de 1×1 píxel: un archivo válido para los documentos de prueba. */
export const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export interface Arnes {
  url: string;
  bd: BaseDePrueba;
  config: Configuracion;
  /** Códigos OTP "enviados", por teléfono: reemplaza al celular real. */
  codigos: Map<string, string>;
  get<T = any>(ruta: string, token?: string): Promise<Respuesta<T>>;
  post<T = any>(ruta: string, cuerpo?: unknown, token?: string): Promise<Respuesta<T>>;
  put<T = any>(ruta: string, cuerpo?: unknown, token?: string): Promise<Respuesta<T>>;
  patch<T = any>(ruta: string, cuerpo?: unknown, token?: string): Promise<Respuesta<T>>;
  /** Envía un formulario con archivo (multipart). */
  postForm<T = any>(ruta: string, formulario: FormData, token?: string): Promise<Respuesta<T>>;
  /** Pide un servicio de la aplicación para probarlo directamente. */
  servicio<T>(token: Type<T> | symbol): T;
  /** Lleva a un conductor por todo el registro real, hasta quedar habilitado. */
  crearConductorHabilitado(
    telefono: string,
    opciones?: { nombre?: string },
  ): Promise<ConductorListo>;
  /** Pide el OTP, inicia sesión y devuelve los tokens. */
  iniciarSesion(
    telefono: string,
    app?: 'conductor' | 'pasajero',
  ): Promise<{ accessToken: string; refreshToken: string; usuarioId: string; nuevo: boolean }>;
  cerrar(): Promise<void>;
}

/**
 * Levanta la API de verdad (Nest + HTTP) contra una base PostgreSQL con PostGIS creada para el
 * archivo de pruebas, ya migrada y con Manizales sembrada.
 */
export async function levantarApi(extra: Partial<Record<string, string>> = {}): Promise<Arnes> {
  const bd = await crearBaseDePrueba();
  await sembrarManizales(bd);

  const config = leerConfiguracion({ NODE_ENV: 'test', DATABASE_URL: bd.url, ...extra });
  const codigos = new Map<string, string>();
  const proveedor: ProveedorOtp = {
    simulado: false,
    async enviar(telefono, codigo) {
      codigos.set(telefono, codigo);
    },
  };

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .overrideProvider(PROVEEDOR_OTP)
    .useValue(proveedor)
    .compile();
  const app: INestApplication = modulo.createNestApplication();
  await app.listen(0);
  const direccion = app.getHttpServer().address() as { port: number };
  const url = `http://127.0.0.1:${direccion.port}`;

  async function pedir<T>(
    metodo: string,
    ruta: string,
    cuerpo?: unknown,
    token?: string,
  ): Promise<Respuesta<T>> {
    const r = await fetch(url + ruta, {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    const texto = await r.text();
    return { estado: r.status, cuerpo: (texto ? JSON.parse(texto) : undefined) as T };
  }

  async function pedirForm<T>(
    ruta: string,
    formulario: FormData,
    token?: string,
  ): Promise<Respuesta<T>> {
    const r = await fetch(url + ruta, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: formulario,
    });
    const texto = await r.text();
    return { estado: r.status, cuerpo: (texto ? JSON.parse(texto) : undefined) as T };
  }

  const arnes: Arnes = {
    url,
    bd,
    config,
    codigos,
    get: (ruta, token) => pedir('GET', ruta, undefined, token),
    post: (ruta, cuerpo, token) => pedir('POST', ruta, cuerpo, token),
    put: (ruta, cuerpo, token) => pedir('PUT', ruta, cuerpo, token),
    patch: (ruta, cuerpo, token) => pedir('PATCH', ruta, cuerpo, token),
    postForm: pedirForm,
    servicio: (token) => app.get(token as never) as never,
    async iniciarSesion(telefono, app = 'conductor') {
      const otp = await pedir<{ telefono: string }>('POST', '/v1/auth/otp', { telefono });
      const normalizado = otp.cuerpo.telefono;
      const codigo = codigos.get(normalizado);
      if (!codigo) throw new Error(`No se envió código a ${normalizado}`);
      const r = await pedir<any>('POST', '/v1/auth/otp/verificar', { telefono, codigo, app });
      if (r.estado !== 200)
        throw new Error(`No se pudo iniciar sesión: ${JSON.stringify(r.cuerpo)}`);
      return {
        accessToken: r.cuerpo.accessToken,
        refreshToken: r.cuerpo.refreshToken,
        usuarioId: r.cuerpo.usuario.id,
        nuevo: r.cuerpo.nuevo,
      };
    },
    async crearConductorHabilitado(telefono, opciones = {}) {
      const s = await arnes.iniciarSesion(telefono, 'conductor');
      const token = s.accessToken;
      const ok = (r: Respuesta<any>, paso: string) => {
        if (r.estado >= 300) throw new Error(`${paso}: ${r.estado} ${JSON.stringify(r.cuerpo)}`);
        return r.cuerpo;
      };

      ok(
        await arnes.patch(
          '/v1/conductor/yo',
          { nombre: opciones.nombre ?? 'Carlos Pérez Gómez' },
          token,
        ),
        'nombre',
      );
      const catalogo = ok(await arnes.get('/v1/catalogo-vehiculos', token), 'catálogo');
      const onix = catalogo
        .flatMap((m: any) => m.lineas.map((l: any) => ({ ...l, marca: m.marca })))
        .find((l: any) => l.linea === 'Onix');
      const placa = placaPara(telefono);
      const vehiculo = ok(
        await arnes.post(
          '/v1/conductor/vehiculos',
          { placa, color: 'Blanco', modeloAnio: 2022, catalogoVehiculoId: onix.id },
          token,
        ),
        'vehículo',
      );

      const subir = async (tipo: string, extra: Record<string, string> = {}) => {
        const f = new FormData();
        f.set('tipo', tipo);
        for (const [k, v] of Object.entries(extra)) f.set(k, v);
        f.set('archivo', new Blob([PNG_MINIMO], { type: 'image/png' }), `${tipo}.png`);
        ok(await pedirForm('/v1/conductor/documentos', f, token), `documento ${tipo}`);
      };
      const lejos = `${new Date().getFullYear() + 1}-12-31`;
      for (const tipo of ['documento_identidad', 'antecedentes', 'selfie']) await subir(tipo);
      await subir('licencia_conduccion', { venceEn: lejos });
      for (const tipo of ['licencia_transito', 'fotos_vehiculo'])
        await subir(tipo, { vehiculoId: vehiculo.id });
      for (const tipo of ['soat', 'revision_tecnicomecanica', 'seguro_todo_riesgo']) {
        await subir(tipo, { vehiculoId: vehiculo.id, venceEn: lejos });
      }

      ok(
        await arnes.put(
          '/v1/conductor/cuenta-pago',
          { tipo: 'llave_bre_b', valor: telefono.replace(/\D/g, '') },
          token,
        ),
        'cuenta',
      );
      ok(await arnes.post('/v1/conductor/enviar-revision', undefined, token), 'revisión');
      ok(await arnes.post('/v1/dev/conductor/aprobar', undefined, token), 'aprobación');
      return {
        accessToken: token,
        refreshToken: s.refreshToken,
        usuarioId: s.usuarioId,
        vehiculoId: vehiculo.id,
      };
    },
    async cerrar() {
      await app.close();
      await bd.eliminar();
    },
  };
  return arnes;
}

function hash(texto: string): number {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

/** Placa válida y estable para cada teléfono de prueba (TYA123). */
function placaPara(telefono: string): string {
  const h = Math.abs(hash(telefono));
  return `TY${String.fromCharCode(65 + (h % 26))}${String(h % 1000).padStart(3, '0')}`;
}
