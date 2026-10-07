import { Boton, Hoja, api, avisar, mensajeDe, vibrar } from '@transportaya/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useChat } from '../estado/chat.ts';
import type { Mensaje } from '../lib/tipos.ts';

const RESPUESTAS_RAPIDAS = ['Ya voy', 'Estoy afuera', 'Llegué', '¿Dónde te recojo?'];

/** Chat con el pasajero, con respuestas rápidas para no escribir mientras se maneja (RNF-71). */
export function Chat({
  viajeId,
  abierto,
  alCerrar,
  nombre,
}: {
  viajeId: string;
  abierto: boolean;
  alCerrar: () => void;
  nombre: string;
}) {
  const mensajes = useChat((s) => s.mensajes);
  const [texto, setTexto] = useState('');
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    useChat.getState().abrir(abierto);
    if (!abierto) return;
    void api
      .get<{ mensajes: Mensaje[] }>(`/v1/conductor/viajes/${viajeId}/mensajes`)
      .then((r) => useChat.getState().ponerMensajes(viajeId, r.mensajes))
      .catch(() => undefined);
    return () => useChat.getState().abrir(false);
  }, [abierto, viajeId]);

  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: 'smooth' });
  }, [mensajes.length, abierto]);

  const enviar = useMutation({
    mutationFn: (cuerpo: string) =>
      api.post<Mensaje>(`/v1/conductor/viajes/${viajeId}/mensajes`, { cuerpo }),
    onSuccess: (m) => {
      vibrar('toque');
      useChat.getState().llego(m);
      setTexto('');
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  return (
    <Hoja abierta={abierto} alCerrar={alCerrar} titulo={`Chat con ${nombre}`}>
      <div className="flex h-[60dvh] flex-col pb-3">
        <div ref={fondo} className="flex-1 space-y-2 overflow-y-auto pb-2" aria-live="polite">
          {mensajes.length === 0 && (
            <p className="py-10 text-center text-suave">Todavía no hay mensajes.</p>
          )}
          {mensajes.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.deQuien === 'conductor' ? 'justify-end' : 'justify-start'}`}
            >
              <span
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-base font-semibold ${m.deQuien === 'conductor' ? 'rounded-br-md bg-ty text-sobre-ty' : 'rounded-bl-md bg-superficie-2'}`}
              >
                {m.cuerpo}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto py-2">
          {RESPUESTAS_RAPIDAS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => enviar.mutate(r)}
              className="min-h-12 shrink-0 rounded-full border border-borde bg-superficie px-5 text-base font-extrabold"
            >
              {r}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) enviar.mutate(texto.trim());
          }}
        >
          <input
            id="mensaje"
            value={texto}
            maxLength={500}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe un mensaje"
            aria-label="Mensaje"
            className="min-h-14 flex-1 rounded-2xl border-2 border-borde bg-superficie px-4 font-bold outline-none focus:border-ty"
          />
          <div className="w-16">
            <Boton
              type="submit"
              etiqueta="Enviar"
              icono="derecha"
              deshabilitado={!texto.trim()}
              cargando={enviar.isPending}
            >
              {''}
            </Boton>
          </div>
        </form>
      </div>
    </Hoja>
  );
}
