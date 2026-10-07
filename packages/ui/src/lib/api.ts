import { useSesion } from '../estado/sesion.ts';

export type AppCliente = 'conductor' | 'pasajero';
let appActual: AppCliente = 'conductor';
/** Cada app dice quién es al arrancar: el servidor entrega el rol según la app con la que se inició sesión. */
export function configurarApi(o: { app: AppCliente }): void {
  appActual = o.app;
}

/** Error de la API con el código estable que devuelve el servidor (docs/10). */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    readonly detalle: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(detalle);
    this.name = 'ErrorApi';
  }
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function leer(res: Response): Promise<unknown> {
  const texto = await res.text();
  if (!texto) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

function aError(res: Response, cuerpo: unknown): ErrorApi {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  const { codigo, detail, title, ...extra } = c;
  delete extra['status'];
  delete extra['type'];
  return new ErrorApi(
    res.status,
    typeof codigo === 'string' ? codigo : 'ERROR',
    typeof detail === 'string'
      ? detail
      : typeof title === 'string'
        ? title
        : 'No pudimos completar la acción',
    extra,
  );
}

/** Un solo refresco a la vez: si varias peticiones fallan juntas, todas esperan al mismo. */
let refrescando: Promise<boolean> | null = null;

async function refrescar(): Promise<boolean> {
  refrescando ??= (async () => {
    const { refreshToken, guardar, limpiar } = useSesion.getState();
    if (!refreshToken) return false;
    try {
      const res = await fetch('/v1/auth/refrescar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        limpiar();
        return false;
      }
      guardar((await res.json()) as Tokens);
      return true;
    } catch {
      return false; // sin internet: no se cierra la sesión, solo falla esta petición
    }
  })().finally(() => {
    refrescando = null;
  });
  return refrescando;
}

async function pedir<T>(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  form?: FormData,
  reintento = true,
): Promise<T> {
  const token = useSesion.getState().accessToken;
  const res = await fetch(ruta, {
    method: metodo,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(form || cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(form ? { body: form } : cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const datos = await leer(res);
  if (res.ok) return datos as T;

  const error = aError(res, datos);
  if (
    res.status === 401 &&
    reintento &&
    token &&
    !ruta.startsWith('/v1/auth/') &&
    (await refrescar())
  ) {
    return pedir<T>(metodo, ruta, cuerpo, form, false);
  }
  throw error;
}

export const api = {
  get: <T>(ruta: string) => pedir<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown) => pedir<T>('POST', ruta, cuerpo),
  put: <T>(ruta: string, cuerpo?: unknown) => pedir<T>('PUT', ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo?: unknown) => pedir<T>('PATCH', ruta, cuerpo),
  delete: <T = void>(ruta: string) => pedir<T>('DELETE', ruta),
  postForm: <T>(ruta: string, form: FormData) => pedir<T>('POST', ruta, undefined, form),
};

export interface InicioSesion extends Tokens {
  usuario: { id: string; nombre: string; telefono: string };
  nuevo: boolean;
}

export const auth = {
  pedirCodigo: (telefono: string) =>
    api.post<{ telefono: string; expiraEn: string; simulado?: { codigo: string } }>(
      '/v1/auth/otp',
      { telefono },
    ),
  verificar: (telefono: string, codigo: string) =>
    api.post<InicioSesion>('/v1/auth/otp/verificar', {
      telefono,
      codigo,
      app: appActual,
      dispositivo: navigator.userAgent.slice(0, 120),
    }),
  salir: () => api.post('/v1/auth/salir'),
};

/** Mensaje amable para mostrar ante cualquier error. */
export function mensajeDe(error: unknown): string {
  if (error instanceof ErrorApi) return error.detalle;
  if (error instanceof TypeError) return 'No hay conexión con TransporteYa. Revisa tu internet.';
  return 'Algo salió mal. Intenta de nuevo.';
}
