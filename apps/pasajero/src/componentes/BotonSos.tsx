import { Boton, Hoja, Icono, alerta, api, avisar, mensajeDe, vibrar } from '@transportaya/ui';
import { useMutation } from '@tanstack/react-query';
import { animate } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const MANTENER_MS = 2000;

/**
 * SOS (PAS-35, HU-PAS-03): hay que mantenerlo presionado 2 segundos para que no se active por accidente. Avisa a la
 * torre de control con la ubicación y ofrece llamar al 123.
 */
export function BotonSos({ ubicacion }: { ubicacion: () => { lat: number; lng: number } | null }) {
  const [progreso, setProgreso] = useState(0);
  const [avisado, setAvisado] = useState<{ contactosAvisados: number } | null>(null);
  const animacion = useRef<ReturnType<typeof animate> | null>(null);

  const enviar = useMutation({
    mutationFn: () =>
      api.post<{ contactosAvisados: number }>('/v1/pasajero/sos', ubicacion() ?? {}),
    onSuccess: (r) => {
      alerta();
      vibrar('alerta');
      setAvisado(r);
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  const soltar = () => {
    animacion.current?.stop();
    setProgreso(0);
  };
  const presionar = () => {
    vibrar('toque');
    animacion.current?.stop();
    animacion.current = animate(0, 1, {
      duration: MANTENER_MS / 1000,
      ease: 'linear',
      onUpdate: setProgreso,
      onComplete: () => {
        setProgreso(0);
        enviar.mutate();
      },
    });
  };
  useEffect(() => () => animacion.current?.stop(), []);

  return (
    <>
      <button
        type="button"
        id="boton-sos"
        aria-label="SOS: mantén presionado 2 segundos para pedir ayuda"
        onPointerDown={presionar}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        onPointerCancel={soltar}
        onContextMenu={(e) => e.preventDefault()}
        className="relative flex min-h-16 flex-1 select-none flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl bg-peligro/15 text-peligro"
      >
        <span
          className="absolute inset-0 origin-left bg-peligro/40"
          style={{ transform: `scaleX(${progreso})` }}
        />
        <Icono nombre="alerta" tamano={24} className="relative" />
        <span className="relative text-xs font-extrabold">SOS</span>
      </button>

      <Hoja
        abierta={avisado !== null}
        alCerrar={() => setAvisado(null)}
        titulo="Pedimos ayuda por ti"
      >
        <div className="space-y-4 pb-4">
          <p className="text-lg text-suave">
            Avisamos a la torre de control con tu ubicación y los datos del viaje. Te van a
            contactar. Si estás en peligro, llama ya.
          </p>
          {avisado && avisado.contactosAvisados > 0 && (
            <p className="rounded-xl bg-ty/10 px-4 py-3 font-bold text-ty">
              También avisamos a {avisado.contactosAvisados}{' '}
              {avisado.contactosAvisados === 1 ? 'contacto de confianza' : 'contactos de confianza'}
              .
            </p>
          )}
          <a
            href="tel:123"
            className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-peligro text-xl font-black text-white"
          >
            <Icono nombre="telefono" /> Llamar al 123
          </a>
          <Boton variante="secundario" alPulsar={() => setAvisado(null)}>
            Estoy bien
          </Boton>
        </div>
      </Hoja>
    </>
  );
}
