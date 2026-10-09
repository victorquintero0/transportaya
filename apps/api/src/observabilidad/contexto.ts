import { AsyncLocalStorage } from 'node:async_hooks';

/** Lo que acompaña a una solicitud mientras se atiende, para que cada línea del registro diga de cuál viene (RNF-80). */
export interface ContextoSolicitud {
  id: string;
  usuarioId?: string;
  rol?: string;
}

export const contexto = new AsyncLocalStorage<ContextoSolicitud>();

export const contextoActual = (): ContextoSolicitud | undefined => contexto.getStore();

/** Identificadores que se aceptan de afuera: cortos y sin caracteres raros, para que no ensucien los registros. */
const ID_VALIDO = /^[A-Za-z0-9._-]{8,64}$/;
export const idValido = (id: unknown): id is string => typeof id === 'string' && ID_VALIDO.test(id);
