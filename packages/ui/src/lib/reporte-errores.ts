import type { AppCliente } from './api.ts';

const MAX_POR_CARGA = 5;
const REPETIDO_MS = 10_000;

/**
 * Manda al servidor los errores que la app no manejó (RNF-80), con un tope para no inundarlo: así se enteran los
 * equipos técnicos de lo que les pasa a las personas, que si no se perdería en la consola de cada celular.
 */
export function instalarReporteErrores(app: AppCliente, version = 'dev'): void {
  let enviados = 0;
  const vistos = new Map<string, number>();

  const reportar = (mensaje: string, pila?: string) => {
    const ahora = Date.now();
    const clave = mensaje.slice(0, 120);
    if (enviados >= MAX_POR_CARGA || ahora - (vistos.get(clave) ?? 0) < REPETIDO_MS) return;
    vistos.set(clave, ahora);
    enviados += 1;
    try {
      void fetch('/v1/telemetria/errores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          app,
          version,
          mensaje: mensaje.slice(0, 500),
          pila: pila?.slice(0, 2000),
          ruta: location.pathname,
        }),
      }).catch(() => undefined);
    } catch {
      /* reportar un error nunca debe causar otro */
    }
  };

  window.addEventListener('error', (e) => reportar(e.message || 'Error', e.error?.stack));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown;
    reportar(
      r instanceof Error ? r.message : String(r ?? 'Promesa rechazada'),
      r instanceof Error ? r.stack : undefined,
    );
  });
}
