import { motion } from 'motion/react';
import { distancia } from '../lib/formato.ts';

interface Props {
  /** Hacia dónde está el objetivo, en grados desde el norte; `null` si no hay objetivo. */
  rumbo: number | null;
  distanciaM: number | null;
  /** Hacia dónde apunta el carro del conductor, en grados; si no se sabe, apunta al norte. */
  orientacion?: number | null;
  /** Anillos que se expanden: el conductor está "buscando". */
  buscando?: boolean;
  etiquetaObjetivo?: string;
  tamano?: number;
}

/**
 * Una vista estilizada tipo radar. No es un mapa (el mapa propio llega con el ADR-0002): muestra al conductor en
 * el centro y hacia dónde queda su destino inmediato, con la distancia, que es lo que hace falta para decidir
 * y para llegar con Waze o Google Maps.
 */
export function Radar({
  rumbo,
  distanciaM,
  orientacion = null,
  buscando = false,
  etiquetaObjetivo,
  tamano = 280,
}: Props) {
  // La distancia se comprime (raíz) para que se vea tanto lo cercano como lo lejano.
  const radioMax = 100;
  const frac =
    distanciaM === null ? 0 : Math.min(1, Math.sqrt(Math.min(distanciaM, 12_000) / 12_000));
  const r = 28 + frac * (radioMax - 28);
  const ang = ((rumbo ?? 0) * Math.PI) / 180;
  const tx = 120 + Math.sin(ang) * r;
  const ty = 120 - Math.cos(ang) * r;

  return (
    <div className="relative" style={{ width: tamano, height: tamano }}>
      <svg
        viewBox="0 0 240 240"
        width={tamano}
        height={tamano}
        role="img"
        aria-label={distanciaM === null ? 'Radar' : `Destino a ${distancia(distanciaM)}`}
      >
        <defs>
          <radialGradient id="fondo-radar" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-ty)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-ty)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="barrido" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-ty)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-ty)" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r="116" fill="url(#fondo-radar)" />
        {[36, 68, 100].map((rr) => (
          <circle
            key={rr}
            cx="120"
            cy="120"
            r={rr}
            fill="none"
            stroke="var(--color-borde)"
            strokeWidth="1.5"
            strokeDasharray="3 6"
          />
        ))}
        <path d="M120 8v224M8 120h224" stroke="var(--color-borde)" strokeWidth="1" opacity="0.6" />
        <text
          x="120"
          y="20"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="var(--color-suave)"
        >
          N
        </text>

        {buscando && (
          <motion.g
            style={{ originX: '120px', originY: '120px' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'linear' }}
          >
            <path d="M120 120 L120 14 A106 106 0 0 1 214 90 Z" fill="url(#barrido)" opacity="0.8" />
          </motion.g>
        )}

        {buscando &&
          [0, 1, 2].map((i) => (
            <circle
              key={i}
              cx="120"
              cy="120"
              r="20"
              fill="none"
              stroke="var(--color-ty)"
              strokeWidth="2"
              className="animate-radar"
              style={{ transformOrigin: '120px 120px', animationDelay: `${i * 0.93}s` }}
            />
          ))}

        {rumbo !== null && distanciaM !== null && (
          <g>
            <line
              x1="120"
              y1="120"
              x2={tx}
              y2={ty}
              stroke="var(--color-ty)"
              strokeWidth="2.5"
              strokeDasharray="2 7"
              strokeLinecap="round"
            />
            <motion.g
              initial={false}
              animate={{ x: tx, y: ty }}
              transition={{ type: 'spring', stiffness: 80, damping: 16 }}
            >
              <circle
                r="15"
                fill="var(--color-ty)"
                opacity="0.25"
                className="animate-pulso-suave"
                style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
              />
              <circle r="9" fill="var(--color-ty)" stroke="var(--color-fondo)" strokeWidth="3" />
              <path d="M0 -4v8M-4 0h8" stroke="#07110a" strokeWidth="2.2" strokeLinecap="round" />
            </motion.g>
          </g>
        )}

        {/* el conductor */}
        <motion.g
          initial={false}
          animate={{ rotate: orientacion ?? 0 }}
          style={{ originX: '120px', originY: '120px' }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        >
          <circle
            cx="120"
            cy="120"
            r="14"
            fill="var(--color-fondo)"
            stroke="var(--color-ty)"
            strokeWidth="3"
          />
          <path d="M120 111 L127 128 L120 124 L113 128 Z" fill="var(--color-ty)" />
        </motion.g>
      </svg>
      {etiquetaObjetivo && distanciaM !== null && (
        <div className="absolute inset-x-0 bottom-1 flex justify-center">
          <span className="rounded-full bg-superficie-2/90 px-3 py-1 text-sm font-extrabold backdrop-blur">
            {etiquetaObjetivo} · <span className="text-ty">{distancia(distanciaM)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
