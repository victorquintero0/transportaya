import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type BaseDePrueba, baseDisponible, crearBaseDePrueba } from '@transportaya/db/pruebas';
import { sembrarManizales } from '@transportaya/db/semillas';
import { io, type Socket } from 'socket.io-client';
import { desplazar } from '@transportaya/dominio';
import { AppModule } from '../src/app.module.js';
import { CONFIG, type Configuracion, leerConfiguracion } from '../src/config.js';
import { PROVEEDOR_OTP, type ProveedorOtp } from '../src/auth/proveedor-otp.js';
import {
  DESPACHO_POR_DEFECTO,
  PARAMETROS_DESPACHO,
  type ParametrosDespacho,
} from '../src/viajes/despacho.service.js';

export { baseDisponible };

export interface Respuesta<T = unknown> {
  estado: number;
  cuerpo: T;
}

/** Cliente de WebSocket que recuerda los eventos recibidos para poder esperarlos en las pruebas. */
export class ClienteSocket {
  readonly eventos: { evento: string; datos: any }[] = [];
  private readonly oyentes = new Set<() => void>();

  constructor(readonly socket: Socket) {
    socket.onAny((evento, datos) => {
      this.eventos.push({ evento, datos });
      for (const o of [...this.oyentes]) o();
    });
  }

  /** Espera un evento (que haya llegado ya o llegue pronto) que cumpla el filtro. */
  esperar<T = any>(evento: string, filtro: (d: T) => boolean = () => true, ms = 4000): Promise<T> {
    return new Promise((resolver, rechazar) => {
      const buscar = () => this.eventos.find((e) => e.evento === evento && filtro(e.datos));
      const hallado = buscar();
      if (hallado) return resolver(hallado.datos);
      const temporizador = setTimeout(() => {
        this.oyentes.delete(revisar);
        rechazar(
          new Error(
            `No llegó el evento "${evento}" en ${ms} ms. Llegaron: ${this.eventos.map((e) => e.evento).join(', ') || 'ninguno'}`,
          ),
        );
      }, ms);
      const revisar = () => {
        const e = buscar();
        if (!e) return;
        clearTimeout(temporizador);
        this.oyentes.delete(revisar);
        resolver(e.datos);
      };
      this.oyentes.add(revisar);
    });
  }

  /** Garantiza que NO llega un evento durante un rato. */
  async noLlega(evento: string, ms = 600): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
    if (this.eventos.some((e) => e.evento === evento))
      throw new Error(`No debía llegar el evento "${evento}"`);
  }

  cuantos(evento: string): number {
    return this.eventos.filter((e) => e.evento === evento).length;
  }

  cerrar(): void {
    this.socket.close();
  }
}

export interface ConductorEnLinea extends ConductorListo {
  socket: ClienteSocket;
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
  delete<T = any>(ruta: string, cuerpo?: unknown, token?: string): Promise<Respuesta<T>>;
  /** Envía un formulario con archivo (multipart). */
  postForm<T = any>(ruta: string, formulario: FormData, token?: string): Promise<Respuesta<T>>;
  /** Pide un servicio de la aplicación para probarlo directamente. */
  servicio<T>(token: Type<T> | symbol): T;
  /** Una posición nueva, lejos de las anteriores, para que cada prueba tenga su propia zona. */
  nuevaZona(): { lat: number; lng: number };
  /** Un viaje de mentira de principio a fin: lo pide un pasajero, el conductor lo acepta, lo hace y lo finaliza. */
  completarViaje(
    c: ConductorEnLinea,
    opciones?: {
      metodoPago?: 'efectivo' | 'tarjeta';
      distanciaM?: number;
      tiempoDetenidoS?: number;
    },
  ): Promise<{
    viajeId: string;
    precioFinal: number;
    comision: number;
    gananciaNeta: number;
    metodoPago: string;
  }>;
  /** Abre un WebSocket autenticado como ese conductor. */
  conectarSocket(token: string): Promise<ClienteSocket>;
  /** Registro completo + conectado en una posición + WebSocket abierto. */
  conductorEnLinea(
    telefono: string,
    posicion: { lat: number; lng: number },
  ): Promise<ConductorEnLinea>;
  /** Lleva a un conductor por todo el registro real, hasta quedar habilitado. */
  crearConductorHabilitado(
    telefono: string,
    opciones?: { nombre?: string; sinAprobar?: boolean; sinTerminos?: boolean },
  ): Promise<ConductorListo>;
  /** Pide el OTP, inicia sesión y devuelve los tokens. */
  iniciarSesion(
    telefono: string,
    app?: 'conductor' | 'pasajero',
  ): Promise<{ accessToken: string; refreshToken: string; usuarioId: string; nuevo: boolean }>;
  /** Entra a la App Operación con la cuenta de demostración de ese rol (con su segundo factor). */
  ingresarOperacion(
    rol: string,
  ): Promise<{ accessToken: string; refreshToken: string; usuarioId: string }>;
  cerrar(): Promise<void>;
}

/**
 * Levanta la API de verdad (Nest + HTTP) contra una base PostgreSQL con PostGIS creada para el
 * archivo de pruebas, ya migrada y con Manizales sembrada.
 */
export async function levantarApi(
  extra: Partial<Record<string, string>> = {},
  opciones: { despacho?: Partial<ParametrosDespacho> } = {},
): Promise<Arnes> {
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
    .overrideProvider(PARAMETROS_DESPACHO)
    .useValue({ ...DESPACHO_POR_DEFECTO, ...opciones.despacho })
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

  const sockets: ClienteSocket[] = [];
  const sesionesOperacion = new Map<
    string,
    { accessToken: string; refreshToken: string; usuarioId: string }
  >();
  let zonas = 0;

  const arnes: Arnes = {
    url,
    bd,
    config,
    codigos,
    get: (ruta, token) => pedir('GET', ruta, undefined, token),
    post: (ruta, cuerpo, token) => pedir('POST', ruta, cuerpo, token),
    put: (ruta, cuerpo, token) => pedir('PUT', ruta, cuerpo, token),
    patch: (ruta, cuerpo, token) => pedir('PATCH', ruta, cuerpo, token),
    delete: (ruta, cuerpo, token) => pedir('DELETE', ruta, cuerpo, token),
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
    nuevaZona() {
      zonas += 1;
      return desplazar({ lat: 5.0703, lng: -75.5138 }, 25_000 * zonas, 135);
    },
    async completarViaje(c, o = {}) {
      const creado = await pedir<any>(
        'POST',
        '/v1/dev/pasajeros/viaje',
        { metodoPago: o.metodoPago ?? 'efectivo' },
        c.accessToken,
      );
      if (creado.estado !== 201)
        throw new Error(`No se pudo crear el viaje: ${JSON.stringify(creado.cuerpo)}`);
      const oferta = await c.socket.esperar(
        'oferta:nueva',
        (d: any) => d.viajeId === creado.cuerpo.viajeId,
      );
      const acept = await pedir<any>(
        'POST',
        `/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`,
        undefined,
        c.accessToken,
      );
      const origen = desplazar(acept.cuerpo.recogida, 40, 0);
      await pedir(
        'POST',
        '/v1/conductor/ubicaciones',
        { puntos: [{ ...origen, t: Date.now(), precisionM: 5 }] },
        c.accessToken,
      );
      await pedir(
        'POST',
        `/v1/conductor/viajes/${creado.cuerpo.viajeId}/llegue`,
        {},
        c.accessToken,
      );
      await pedir(
        'POST',
        `/v1/conductor/viajes/${creado.cuerpo.viajeId}/iniciar`,
        { pin: creado.cuerpo.pin },
        c.accessToken,
      );
      const fin = await pedir<any>(
        'POST',
        `/v1/conductor/viajes/${creado.cuerpo.viajeId}/finalizar`,
        {
          distanciaM: o.distanciaM ?? 3000,
          tiempoDetenidoS: o.tiempoDetenidoS ?? 0,
          duracionS: 20,
        },
        c.accessToken,
      );
      if (fin.estado !== 200)
        throw new Error(`No se pudo finalizar: ${JSON.stringify(fin.cuerpo)}`);
      return { viajeId: creado.cuerpo.viajeId, ...fin.cuerpo };
    },
    async conectarSocket(token) {
      const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });
      const cliente = new ClienteSocket(socket);
      sockets.push(cliente);
      await cliente.esperar('listo');
      return cliente;
    },
    async conductorEnLinea(telefono, posicion) {
      const c = await arnes.crearConductorHabilitado(telefono);
      const r = await pedir<any>('POST', '/v1/conductor/conectar', posicion, c.accessToken);
      if (r.estado !== 200) throw new Error(`No se pudo conectar: ${JSON.stringify(r.cuerpo)}`);
      return { ...c, socket: await arnes.conectarSocket(c.accessToken) };
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
      const resultado = {
        accessToken: token,
        refreshToken: s.refreshToken,
        usuarioId: s.usuarioId,
        vehiculoId: vehiculo.id,
      };
      // Registro completo, pero sin aceptar la política de datos: todavía no se puede enviar a revisión.
      if (opciones.sinTerminos) return resultado;
      const politica = await arnes.get('/v1/politica-datos');
      ok(
        await arnes.post('/v1/conductor/terminos', { version: politica.cuerpo.version }, token),
        'términos',
      );
      ok(await arnes.post('/v1/conductor/enviar-revision', undefined, token), 'revisión');
      if (!opciones.sinAprobar)
        ok(await arnes.post('/v1/dev/conductor/aprobar', undefined, token), 'aprobación');
      return resultado;
    },
    async ingresarOperacion(rol) {
      // Un código TOTP solo sirve una vez: se reutiliza la sesión de ese rol dentro de la misma API.
      const guardada = sesionesOperacion.get(rol);
      if (guardada) return guardada;
      const demo = await pedir<any>('GET', '/v1/op/auth/demo');
      const cuenta = demo.cuerpo.cuentas.find((c: any) => c.rol === rol);
      if (!cuenta) throw new Error(`No hay cuenta de demostración para ${rol}`);
      const r = await pedir<any>('POST', '/v1/op/auth/ingresar', {
        email: cuenta.email,
        contrasena: demo.cuerpo.contrasena,
        codigo: cuenta.codigo,
      });
      if (r.estado !== 200)
        throw new Error(`No se pudo ingresar como ${rol}: ${JSON.stringify(r.cuerpo)}`);
      const sesion = {
        accessToken: r.cuerpo.accessToken,
        refreshToken: r.cuerpo.refreshToken,
        usuarioId: r.cuerpo.usuario.id,
      };
      sesionesOperacion.set(rol, sesion);
      return sesion;
    },
    async cerrar() {
      for (const s of sockets) s.cerrar();
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
