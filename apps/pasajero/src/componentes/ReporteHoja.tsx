import { Boton, Chip, Hoja, api, avisar, ErrorApi, mensajeDe } from '@transportaya/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

type TipoTicket =
  'cobro_incorrecto' | 'objeto_perdido' | 'queja' | 'incidente_seguridad' | 'peticion';

const TIPOS: { id: TipoTicket; texto: string; ayuda: string }[] = [
  {
    id: 'cobro_incorrecto',
    texto: 'Cobro incorrecto',
    ayuda: 'El valor no coincide con lo que debía costar',
  },
  { id: 'objeto_perdido', texto: 'Objeto perdido', ayuda: 'Dejé algo en el carro' },
  { id: 'incidente_seguridad', texto: 'Me sentí inseguro', ayuda: 'Tratamos esto como prioridad' },
  { id: 'queja', texto: 'Queja del servicio', ayuda: 'El conductor, el carro o la ruta' },
  { id: 'peticion', texto: 'Otra cosa', ayuda: 'Cuéntanos y te ayudamos' },
];

/** Reportar un problema o un objeto perdido, ligado al viaje (PAS-50, PAS-51). */
export function ReporteHoja({
  viajeId,
  abierto,
  alCerrar,
}: {
  viajeId?: string;
  abierto: boolean;
  alCerrar: () => void;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoTicket | null>(null);
  const [detalle, setDetalle] = useState('');

  const enviar = useMutation({
    mutationFn: () =>
      api.post<{ respuestaEnHoras: number }>('/v1/pasajero/soporte/tickets', {
        tipo,
        ...(viajeId ? { viajeId } : {}),
        asunto: TIPOS.find((t) => t.id === tipo)!.texto,
        ...(detalle.trim() ? { detalle: detalle.trim() } : {}),
      }),
    onSuccess: async (r) => {
      avisar(
        `Recibimos tu reporte. Te respondemos en menos de ${r.respuestaEnHoras} horas.`,
        'exito',
      );
      setTipo(null);
      setDetalle('');
      await qc.invalidateQueries({ queryKey: ['tickets'] });
      alCerrar();
    },
    onError: (e) => avisar(e instanceof ErrorApi ? e.detalle : mensajeDe(e), 'error'),
  });

  return (
    <Hoja
      abierta={abierto}
      alCerrar={alCerrar}
      titulo={viajeId ? 'Reportar un problema' : '¿En qué te ayudamos?'}
    >
      <div className="space-y-3 pb-4">
        <div className="space-y-2" role="radiogroup" aria-label="Tipo de reporte">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tipo === t.id}
              data-tipo={t.id}
              onClick={() => setTipo(t.id)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 text-left ${tipo === t.id ? 'border-ty bg-ty/10' : 'border-borde bg-superficie'}`}
            >
              <span className="flex-1">
                <span className="block font-extrabold">{t.texto}</span>
                <span className="block text-sm text-suave">{t.ayuda}</span>
              </span>
              {t.id === 'incidente_seguridad' && <Chip tono="malo">Prioridad</Chip>}
            </button>
          ))}
        </div>
        {tipo && (
          <textarea
            value={detalle}
            maxLength={1000}
            rows={3}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Cuéntanos qué pasó (opcional)"
            aria-label="Detalle"
            className="w-full rounded-2xl border-2 border-borde bg-superficie p-4 font-semibold outline-none focus:border-ty"
          />
        )}
        <Boton
          id="enviar-reporte"
          tamano="grande"
          icono="ok"
          deshabilitado={!tipo}
          cargando={enviar.isPending}
          alPulsar={() => enviar.mutate()}
        >
          Enviar reporte
        </Boton>
      </div>
    </Hoja>
  );
}
