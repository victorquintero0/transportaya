import { Icono, useAvisos } from '@transportaya/ui';

/** Avisos de escritorio: abajo a la derecha, compactos, sin tapar el título ni la barra de acciones de la pantalla. */
export function Notificaciones() {
  const lista = useAvisos((s) => s.lista);
  const quitar = useAvisos((s) => s.quitar);
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {lista.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => quitar(a.id)}
          className={[
            'pointer-events-auto flex items-start gap-3 rounded-xl border bg-superficie px-4 py-3 text-left text-sm font-bold shadow-xl',
            a.tipo === 'error'
              ? 'border-peligro/60'
              : a.tipo === 'exito'
                ? 'border-ty/60'
                : 'border-borde',
          ].join(' ')}
        >
          <span
            className={
              a.tipo === 'error' ? 'text-peligro' : a.tipo === 'exito' ? 'text-ty' : 'text-cielo'
            }
          >
            <Icono
              nombre={a.tipo === 'error' ? 'alerta' : a.tipo === 'exito' ? 'ok' : 'chispas'}
              tamano={18}
            />
          </span>
          <span className="flex-1">{a.texto}</span>
        </button>
      ))}
    </div>
  );
}
