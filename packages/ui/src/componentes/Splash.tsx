import { useEffect, useState } from 'react';
import { MarcaAnimada } from './MarcaAnimada.tsx';

const CLAVE = 'ty.splash-visto';
const DESVANECER_MS = 320;

/**
 * La pantalla de arranque se ve una vez por sesión del navegador (cada vez que se abre la app instalada) y no en
 * las pruebas automáticas, que correrían más lento. Con `?splash` en la dirección se fuerza, para verla o probarla.
 */
function debeMostrar(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('splash')) return true;
  if (navigator.webdriver) return false;
  try {
    return sessionStorage.getItem(CLAVE) !== '1';
  } catch {
    return true;
  }
}

/**
 * Pantalla de arranque: el carro llega a toda velocidad, se arma el logo y el carro sale disparado. Se puede saltar
 * tocando o con cualquier tecla. Va encima de la app, que mientras tanto ya está cargando por debajo.
 */
export function Splash() {
  const [visible, setVisible] = useState(debeMostrar);
  const [saliendo, setSaliendo] = useState(false);
  const [ancho] = useState(() =>
    typeof window === 'undefined' ? 300 : Math.min(340, Math.round(window.innerWidth * 0.72)),
  );

  useEffect(() => {
    if (!visible) return;
    try {
      sessionStorage.setItem(CLAVE, '1');
    } catch {
      // sin almacenamiento: se vuelve a ver en la próxima carga, no pasa nada
    }
  }, [visible]);

  useEffect(() => {
    if (!saliendo) return;
    const t = setTimeout(() => setVisible(false), DESVANECER_MS);
    return () => clearTimeout(t);
  }, [saliendo]);

  useEffect(() => {
    if (!visible) return;
    const saltar = () => setSaliendo(true);
    window.addEventListener('keydown', saltar);
    return () => window.removeEventListener('keydown', saltar);
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      data-splash
      role="status"
      aria-label="Abriendo TransporteYa"
      onPointerDown={() => setSaliendo(true)}
      className="fixed inset-0 z-[200] grid place-items-center overflow-hidden bg-fondo transition-opacity ease-out"
      style={{
        opacity: saliendo ? 0 : 1,
        pointerEvents: saliendo ? 'none' : 'auto',
        transitionDuration: `${DESVANECER_MS}ms`,
      }}
    >
      <MarcaAnimada modo="entrada" ancho={ancho} alTerminar={() => setSaliendo(true)} />
    </div>
  );
}
