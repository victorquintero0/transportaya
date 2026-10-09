import { useState } from 'react';
import { instalarApp, plataformaActual, useInstalacion } from '../lib/instalacion.ts';
import { Boton } from './Boton.tsx';
import { Hoja } from './Hoja.tsx';
import { Icono } from './Icono.tsx';
import { Tarjeta } from './Tarjeta.tsx';

interface Props {
  /** Nombre que lleva el ícono en la pantalla de inicio. */
  nombre?: string;
}

const PASOS_IPHONE = [
  'Abre esta página en Safari (no dentro de otra app).',
  'Toca el botón Compartir, el cuadrado con la flecha hacia arriba.',
  'Baja y toca «Añadir a pantalla de inicio».',
  'Toca «Añadir». Abre la app desde el nuevo ícono.',
];

/**
 * Invita a instalar la app en el teléfono. En Android abre el cuadro de instalación del navegador; en iPhone explica los
 * pasos (Safari no permite instalar con un botón); si ya está instalada, lo dice.
 */
export function InstalarApp({ nombre = 'TransporteYa' }: Props) {
  const instalada = useInstalacion((s) => s.instalada);
  const evento = useInstalacion((s) => s.evento);
  const [pasos, setPasos] = useState(false);
  const plataforma = plataformaActual(instalada);

  if (plataforma === 'instalada')
    return (
      <Tarjeta id="app-instalada" className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-ty/15 text-ty">
          <Icono nombre="ok" tamano={20} />
        </span>
        <span className="flex-1">
          <span className="block font-extrabold">{nombre} está instalada</span>
          <span className="block text-sm text-suave">
            Se abre a pantalla completa desde tu inicio.
          </span>
        </span>
      </Tarjeta>
    );

  return (
    <>
      <Tarjeta id="instalar-app" className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ty/15 text-ty">
            <Icono nombre="descargar" tamano={20} />
          </span>
          <span className="flex-1">
            <span className="block font-extrabold">Instala {nombre} en tu teléfono</span>
            <span className="block text-sm text-suave">
              Se abre más rápido, a pantalla completa y desde un ícono en tu inicio.
            </span>
          </span>
        </div>
        {evento ? (
          <Boton id="instalar" icono="descargar" alPulsar={() => void instalarApp()}>
            Instalar
          </Boton>
        ) : plataforma === 'ios' ? (
          <Boton
            id="como-instalar"
            variante="secundario"
            icono="compartir"
            alPulsar={() => setPasos(true)}
          >
            Cómo instalar en iPhone
          </Boton>
        ) : (
          <p className="text-sm text-suave">
            En el menú del navegador (⋮) elige «Instalar app» o «Añadir a pantalla de inicio». Si no
            aparece, la página debe abrirse con HTTPS.
          </p>
        )}
      </Tarjeta>
      <Hoja abierta={pasos} alCerrar={() => setPasos(false)} titulo="Instalar en iPhone">
        <ol className="space-y-3 pb-4" id="pasos-iphone">
          {PASOS_IPHONE.map((p, i) => (
            <li key={p} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ty font-extrabold text-sobre-ty">
                {i + 1}
              </span>
              <span className="pt-0.5">{p}</span>
            </li>
          ))}
          <li className="pt-1 text-sm text-suave">
            Las notificaciones en iPhone solo funcionan con la app instalada (iOS 16.4 o superior).
          </li>
        </ol>
        <Boton variante="secundario" alPulsar={() => setPasos(false)}>
          Entendido
        </Boton>
      </Hoja>
    </>
  );
}
