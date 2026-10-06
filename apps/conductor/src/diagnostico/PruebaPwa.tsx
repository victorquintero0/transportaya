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

  /** Sonido de prueba: debe oírse con el volumen del teléfono (la oferta del conductor suena así). */
  function probarSonido() {
    const audio = new AudioContext();
    const oscilador = audio.createOscillator();
    oscilador.connect(audio.destination);
    oscilador.frequency.value = 880;
    oscilador.start();
    oscilador.stop(audio.currentTime + 0.4);
  }

  const resumen =
    estado.inicio !== null && estado.fin !== null
      ? resumirCobertura(marcas, INTERVALO_MS, estado.inicio, estado.fin)
      : null;

  return (
    <section>
      <h2>Prueba técnica de la PWA (ADR-0003)</h2>
      <p>
        Instala la app, pulsa <b>Iniciar</b>, usa el celular durante 10 minutos con la pantalla
        encendida y luego 10 con la pantalla apagada o en otra app. Pulsa <b>Terminar</b> para ver
        el resultado.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={iniciar} disabled={estado.corriendo}>
          Iniciar
        </button>
        <button onClick={terminar} disabled={!estado.corriendo}>
          Terminar
        </button>
        <button onClick={probarSonido}>Probar sonido</button>
      </div>
      <ul>
        <li>Ubicaciones recibidas: {marcas.length}</li>
        <li>Veces que la app quedó oculta: {ocultaciones}</li>
        <li>Pantalla activa (Wake Lock): {wakeLock}</li>
      </ul>
      {error && <p role="alert">Error: {error}</p>}
      {resumen && (
        <div>
          <h3>Resultado</h3>
          <ul>
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
    </section>
  );
}
