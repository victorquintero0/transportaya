import { Boton, Tarjeta } from '@transportaya/ui';
import { useEffect, useRef, useState } from 'react';
import { resumirCobertura } from './cobertura.ts';

/** Intervalo de envío en viaje (docs/05): una ubicación cada 4 s. */
const INTERVALO_MS = 4000;

interface Estado {
  corriendo: boolean;
  inicio: number | null;
  fin: number | null;
}

/**
 * Herramienta de la Fase 0 para la prueba técnica del ADR-0003. Se instala la PWA en un celular
 * Android de gama baja o media, se pulsa "Iniciar", se conduce o camina con la pantalla encendida
 * y luego apagada, y se pulsa "Terminar" para ver cuántas ubicaciones llegaron.
 */
export function PruebaPwa() {
  const [estado, setEstado] = useState<Estado>({ corriendo: false, inicio: null, fin: null });
  const [marcas, setMarcas] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocultaciones, setOcultaciones] = useState(0);
  const [wakeLock, setWakeLock] = useState<'activo' | 'inactivo' | 'no_soportado'>('inactivo');
  const watchId = useRef<number | null>(null);
  const lock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') setOcultaciones((n) => n + 1);
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  }, []);

  async function pedirWakeLock() {
    if (!('wakeLock' in navigator)) return setWakeLock('no_soportado');
    try {
      lock.current = await navigator.wakeLock.request('screen');
      setWakeLock('activo');
      lock.current.addEventListener('release', () => setWakeLock('inactivo'));
    } catch {
      setWakeLock('inactivo');
    }
  }

  async function iniciar() {
    setError(null);
    setMarcas([]);
    setOcultaciones(0);
    if (!('geolocation' in navigator)) return setError('Este navegador no tiene geolocalización');
    await pedirWakeLock();
    watchId.current = navigator.geolocation.watchPosition(
      () => setMarcas((m) => [...m, Date.now()]),
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    setEstado({ corriendo: true, inicio: Date.now(), fin: null });
  }

  async function terminar() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    await lock.current?.release();
    setEstado((e) => ({ ...e, corriendo: false, fin: Date.now() }));
  }

  const resumen =
    estado.inicio !== null && estado.fin !== null
      ? resumirCobertura(marcas, INTERVALO_MS, estado.inicio, estado.fin)
      : null;

  return (
    <Tarjeta className="space-y-3" id="prueba-gps">
      <h2 className="text-lg font-black">Prueba de GPS continuo (ADR-0003)</h2>
      <p className="text-sm text-suave">
        Instala la app, pulsa <b>Iniciar</b>, usa el celular durante 10 minutos con la pantalla
        encendida y luego 10 con la pantalla apagada o en otra app. Pulsa <b>Terminar</b> para ver
        el resultado.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Boton
          id="iniciar-prueba"
          icono="navegar"
          alPulsar={() => void iniciar()}
          deshabilitado={estado.corriendo}
        >
          Iniciar
        </Boton>
        <Boton
          id="terminar-prueba"
          variante="secundario"
          icono="cerrar"
          alPulsar={() => void terminar()}
          deshabilitado={!estado.corriendo}
        >
          Terminar
        </Boton>
      </div>
      <ul className="space-y-1 text-sm">
        <li>Ubicaciones recibidas: {marcas.length}</li>
        <li>Veces que la app quedó oculta: {ocultaciones}</li>
        <li>Pantalla activa (Wake Lock): {wakeLock}</li>
      </ul>
      {error && (
        <p role="alert" className="text-sm font-bold text-peligro">
          Error: {error}
        </p>
      )}
      {resumen && (
        <div className="space-y-1 rounded-2xl bg-superficie-2 p-3 text-sm">
          <h3 className="font-black">Resultado</h3>
          <ul className="space-y-1">
            <li>Intervalos medidos (de 4 s): {resumen.intervalos}</li>
            <li>Intervalos con ubicación: {resumen.cubiertos}</li>
            <li>Pérdida: {(resumen.perdida * 100).toFixed(1)} %</li>
            <li>Mayor hueco: {Math.round(resumen.mayorHuecoMs / 1000)} s</li>
            <li>
              <b>
                {resumen.aceptable
                  ? 'Dentro del umbral (≤ 5 %)'
                  : 'Supera el umbral: evaluar Capacitor'}
              </b>
            </li>
          </ul>
        </div>
      )}
    </Tarjeta>
  );
}
