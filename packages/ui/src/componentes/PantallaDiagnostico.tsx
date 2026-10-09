import { useEffect, useState, type ReactNode } from 'react';
import {
  evaluarCapacidades,
  informeTexto,
  medirEntorno,
  type Capacidad,
} from '../lib/capacidades.ts';
import { useInstalacion } from '../lib/instalacion.ts';
import { Boton } from './Boton.tsx';
import { Icono } from './Icono.tsx';
import { Tarjeta } from './Tarjeta.tsx';

interface Props {
  /** Qué app es, para el encabezado del informe. */
  app: string;
  /** Pruebas propias de la app (por ejemplo la de GPS continuo del conductor). */
  children?: ReactNode;
}

/**
 * Qué permite este teléfono y este navegador: HTTPS, instalación, modo sin conexión, ubicación, pantalla encendida,
 * vibración y sonido. Se abre en `/diagnostico` de cada app y el informe se puede copiar y enviar.
 */
export function PantallaDiagnostico({ app, children }: Props) {
  const instalada = useInstalacion((s) => s.instalada);
  const [lista, setLista] = useState<Capacidad[] | null>(null);
  const [lectura, setLectura] = useState('');
  const [aviso, setAviso] = useState('');

  const medir = async () => setLista(evaluarCapacidades(await medirEntorno(instalada)));

  useEffect(() => {
    let vivo = true;
    void medirEntorno(instalada).then((e) => vivo && setLista(evaluarCapacidades(e)));
    return () => {
      vivo = false;
    };
  }, [instalada]);

  const probarUbicacion = () => {
    setLectura('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLectura(
          `Lat ${p.coords.latitude.toFixed(5)}, lng ${p.coords.longitude.toFixed(5)} · precisión ±${Math.round(p.coords.accuracy)} m`,
        );
        void medir();
      },
      (e) => {
        setLectura(`No se pudo: ${e.message}`);
        void medir();
      },
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  };

  const probarSonido = () => {
    const audio = new AudioContext();
    const o = audio.createOscillator();
    o.connect(audio.destination);
    o.frequency.value = 880;
    o.start();
    o.stop(audio.currentTime + 0.4);
  };

  const informe = lista ? informeTexto(app, lista, new Date()) : '';
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(informe);
      setAviso('Copiado. Pégalo en un mensaje.');
    } catch {
      setAviso('Mantén pulsado el texto de abajo para copiarlo.');
    }
  };

  return (
    <main className="mx-auto min-h-dvh max-w-lg space-y-4 px-5 pb-12 pt-6" id="diagnostico">
      <header>
        <h1 className="text-2xl font-black">Diagnóstico del teléfono</h1>
        <p className="text-suave">{app}: qué permite este teléfono y este navegador.</p>
      </header>

      <Tarjeta className="divide-y divide-borde p-0">
        {(lista ?? []).map((c) => (
          <div
            key={c.clave}
            className="flex gap-3 px-4 py-3"
            data-prueba={c.clave}
            data-ok={String(c.ok)}
          >
            <span
              className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${c.ok === true ? 'bg-ty text-sobre-ty' : c.ok === false ? 'bg-peligro text-white' : 'bg-superficie-2 text-suave'}`}
            >
              <Icono
                nombre={c.ok === true ? 'ok' : c.ok === false ? 'cerrar' : 'ayuda'}
                tamano={14}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold">{c.etiqueta}</span>
              <span className="block break-words text-sm text-suave">{c.detalle}</span>
            </span>
          </div>
        ))}
        {!lista && <p className="px-4 py-3 text-suave">Midiendo…</p>}
      </Tarjeta>

      <div className="grid grid-cols-2 gap-3">
        <Boton variante="secundario" icono="pin" alPulsar={probarUbicacion} id="probar-ubicacion">
          Probar ubicación
        </Boton>
        <Boton variante="secundario" icono="alerta" alPulsar={probarSonido} id="probar-sonido">
          Probar sonido
        </Boton>
        <Boton
          variante="secundario"
          icono="telefono"
          alPulsar={() => navigator.vibrate?.(250)}
          id="probar-vibracion"
        >
          Probar vibración
        </Boton>
        <Boton variante="secundario" icono="rayo" alPulsar={() => void medir()} id="medir-otra-vez">
          Medir otra vez
        </Boton>
      </div>
      {lectura && (
        <p className="rounded-2xl bg-superficie-2 p-3 text-sm font-bold" id="lectura-ubicacion">
          {lectura}
        </p>
      )}

      {children}

      <Tarjeta className="space-y-3">
        <span className="block font-extrabold">Informe para enviar</span>
        <textarea
          readOnly
          id="informe"
          value={informe}
          rows={8}
          className="w-full rounded-xl border border-borde bg-fondo p-3 font-mono text-xs"
        />
        <Boton icono="copiar" alPulsar={() => void copiar()} id="copiar-informe">
          Copiar informe
        </Boton>
        {aviso && <p className="text-sm text-suave">{aviso}</p>}
      </Tarjeta>
    </main>
  );
}
