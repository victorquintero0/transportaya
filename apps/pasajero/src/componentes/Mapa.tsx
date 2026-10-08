import { BaseMapa, Icono, type ControlMapa } from '@transportaya/ui';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { crearProyeccion, trazoCurvo, type Punto } from '../lib/mapa.ts';

interface Props {
  origen?: Punto | null;
  destino?: Punto | null;
  /** Posición en vivo del conductor y hacia dónde apunta su carro. */
  conductor?: (Punto & { rumbo?: number | null }) | null;
  /** Dónde está la persona, si es distinto del origen. */
  yo?: Punto | null;
  /** Anillos que se expanden desde el origen: se está buscando conductor. */
  buscando?: boolean;
  /** Trazo punteado entre dos puntos (conductor → recogida, recogida → destino). */
  ruta?: { desde: Punto; hasta: Punto } | null;
  etiquetaDestino?: string;
  /** Espacio que tapa una hoja inferior, para que los puntos no queden debajo de ella. */
  reservaInferior?: number;
  /** Espacio que tapan los controles de arriba. */
  reservaSuperior?: number;
  minSpanM?: number;
  className?: string;
  children?: ReactNode;
}

const ANCHO_POR_DEFECTO = 390;
const ALTO_POR_DEFECTO = 360;
/** Rumbos de las calles y las carreras de Manizales (ver geocodificador de la API): el dibujo las respeta. */
const RUMBO_CALLES = 125;
const RUMBO_CARRERAS = 215;

/**
 * Mapa del viaje. Si la operación configuró un proveedor de mapas (ADR-0009: OpenFreeMap por defecto), se ve el mapa
 * de calles y los marcadores se proyectan encima. Mientras carga, o si no hay internet ni WebGL, se dibuja el mapa
 * esquemático: la cuadrícula de la ciudad con su inclinación real, con los puntos en la proporción correcta. En los dos
 * casos el carro del conductor se mueve igual.
 */
export function Mapa({
  origen,
  destino,
  conductor,
  yo,
  buscando = false,
  ruta,
  etiquetaDestino,
  reservaInferior = 0,
  reservaSuperior = 0,
  minSpanM = 700,
  className = '',
  children,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: ANCHO_POR_DEFECTO, h: ALTO_POR_DEFECTO });
  const [real, setReal] = useState<ControlMapa | null>(null);

  useEffect(() => {
    const el = contenedor.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(([e]) => {
      const { width, height } = e!.contentRect;
      if (width > 0 && height > 0) setTam({ w: Math.round(width), h: Math.round(height) });
    });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  // Se proyecta sobre el área libre (sin lo que tapan las hojas); luego se desplaza hacia abajo lo que tapa lo de arriba.
  const libre = Math.max(160, tam.h - reservaInferior - reservaSuperior);
  const puntos = useMemo(
    () => [origen, destino, conductor, yo, ruta?.desde, ruta?.hasta].filter((p): p is Punto => !!p),
    [origen, destino, conductor, yo, ruta],
  );
  const proy = useMemo(
    () => crearProyeccion(puntos, tam.w, libre, 56, minSpanM),
    [puntos, tam.w, libre, minSpanM],
  );

  const px = (p: Punto) =>
    real ? real.proyectar(p) : { x: proy.x(p), y: proy.y(p) + reservaSuperior };
  // Con el mapa real los puntos fijos siguen a la cámara al instante; el carro se desliza.
  const fijo = real ? { duration: 0 } : { type: 'spring' as const, stiffness: 120, damping: 20 };
  const bloque = Math.min(Math.max(80 / proy.metrosPorPixel, 22), 90);

  const o = origen ? px(origen) : null;
  const d = destino ? px(destino) : null;
  const c = conductor ? px(conductor) : null;
  const u = yo ? px(yo) : null;
  const r = ruta ? { a: px(ruta.desde), b: px(ruta.hasta) } : null;

  return (
    <div
      ref={contenedor}
      className={`absolute inset-0 overflow-hidden bg-superficie-2 ${className}`}
      role="img"
      aria-label="Mapa del viaje"
      data-mapa={real ? 'real' : 'esquematico'}
    >
      <BaseMapa
        puntos={puntos}
        reservaSuperior={reservaSuperior}
        reservaInferior={reservaInferior}
        minSpanM={minSpanM}
        alControl={setReal}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${tam.w} ${tam.h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="calles-a"
            width={bloque}
            height={bloque}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${RUMBO_CALLES - 90})`}
          >
            <rect width={bloque} height="2.5" fill="var(--borde)" opacity="0.9" />
          </pattern>
          <pattern
            id="calles-b"
            width={bloque * 1.15}
            height={bloque * 1.15}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${RUMBO_CARRERAS - 90})`}
          >
            <rect width={bloque * 1.15} height="2.5" fill="var(--borde)" opacity="0.9" />
          </pattern>
          <radialGradient id="brillo-mapa" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="var(--color-ty)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="var(--color-ty)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {!real && (
          <>
            <rect width={tam.w} height={tam.h} fill="var(--superficie-2)" />
            <rect width={tam.w} height={tam.h} fill="url(#calles-a)" />
            <rect width={tam.w} height={tam.h} fill="url(#calles-b)" />
            <rect width={tam.w} height={tam.h} fill="url(#brillo-mapa)" />
          </>
        )}

        {r && (
          <g>
            <path
              d={trazoCurvo(r.a.x, r.a.y, r.b.x, r.b.y)}
              fill="none"
              stroke="var(--fondo)"
              strokeWidth="9"
              strokeLinecap="round"
              opacity="0.55"
            />
            <path
              d={trazoCurvo(r.a.x, r.a.y, r.b.x, r.b.y)}
              fill="none"
              stroke="var(--color-ty)"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray="1 10"
              className="[animation:ruta-fluye_1.2s_linear_infinite]"
            />
          </g>
        )}
      </svg>

      {/* radar: se está buscando conductor */}
      {buscando &&
        o &&
        [0, 1, 2].map((i) => (
          <span
            key={i}
            className="pointer-events-none absolute size-40 animate-radar rounded-full border-2 border-ty"
            style={{ left: o.x - 80, top: o.y - 80, animationDelay: `${i * 0.93}s` }}
          />
        ))}

      {u && (
        <span
          className="pointer-events-none absolute grid size-6 place-items-center"
          style={{ left: u.x - 12, top: u.y - 12 }}
        >
          <span className="absolute size-6 animate-pulso-suave rounded-full bg-cielo/30" />
          <span className="size-3.5 rounded-full border-2 border-white bg-cielo shadow" />
        </span>
      )}

      {d && (
        <motion.div
          className="pointer-events-none absolute"
          initial={false}
          animate={{ left: d.x, top: d.y }}
          transition={fijo}
        >
          <div className="absolute -translate-x-1/2 -translate-y-full">
            <div className="flex flex-col items-center">
              {etiquetaDestino && (
                <span className="mb-1 max-w-52 truncate rounded-full bg-fondo/90 px-2.5 py-1 text-xs font-extrabold shadow">
                  {etiquetaDestino}
                </span>
              )}
              <span className="grid size-9 place-items-center rounded-full bg-texto text-fondo shadow-lg ring-2 ring-fondo">
                <Icono nombre="bandera" tamano={18} />
              </span>
              <span className="h-2 w-0.5 bg-texto" />
            </div>
          </div>
        </motion.div>
      )}

      {o && (
        <motion.div
          className="pointer-events-none absolute"
          initial={false}
          animate={{ left: o.x, top: o.y }}
          transition={fijo}
        >
          <span className="absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ty/25">
            <span className="size-4 rounded-full border-[3px] border-fondo bg-ty shadow-brillo" />
          </span>
        </motion.div>
      )}

      {c && (
        <motion.div
          className="pointer-events-none absolute z-10"
          initial={false}
          animate={{ left: c.x, top: c.y }}
          transition={{ type: 'spring', stiffness: 60, damping: 16 }}
        >
          <div className="absolute -translate-x-1/2 -translate-y-1/2">
            {/* flecha que apunta hacia donde va el carro; el logo se queda derecho */}
            {conductor?.rumbo != null && (
              <motion.span
                className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2"
                initial={false}
                animate={{ rotate: conductor.rumbo }}
                transition={{ type: 'spring', stiffness: 80, damping: 18 }}
              >
                <span className="absolute left-1/2 top-0 -translate-x-1/2 border-x-[7px] border-b-[11px] border-x-transparent border-b-ty" />
              </motion.span>
            )}
            <span className="relative grid size-11 place-items-center rounded-full bg-fondo shadow-brillo ring-2 ring-ty">
              <img src="/marca/marca-verde.png" alt="" width={26} height={22} draggable={false} />
            </span>
          </div>
        </motion.div>
      )}

      {children}
    </div>
  );
}
