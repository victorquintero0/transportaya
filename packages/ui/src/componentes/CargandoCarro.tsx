import { LOGO } from '../marca/geometria.ts';

interface Props {
  /** Ancho del dibujo en píxeles. */
  tamano?: number;
  /** Texto debajo del carro. */
  texto?: string;
  className?: string;
}

/**
 * Indicador de carga con el carro de la marca: va saltando sobre la ruta, con las ruedas girando y las líneas de
 * velocidad. Reemplaza al círculo giratorio donde se espera una pantalla completa.
 */
export function CargandoCarro({ tamano = 160, texto, className = '' }: Props) {
  const { ruedas, radioRueda, radioArco, lineas } = LOGO;
  return (
    <div
      role="status"
      aria-label={texto ?? 'Cargando'}
      className={`inline-flex flex-col items-center gap-3 ${className}`}
    >
      <svg viewBox="0 120 600 270" width={tamano} className="overflow-visible" aria-hidden="true">
        <line
          className="carga-ruta"
          x1="60"
          y1="360"
          x2="580"
          y2="360"
          stroke="var(--borde)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray="34 30"
        />
        {lineas.map((l, i) => (
          <rect
            key={i}
            className="carga-linea"
            style={{ animationDelay: `${i * 0.12}s` }}
            x={l.x + 10}
            y={l.y - 20}
            width={l.w * 0.6}
            height={l.h}
            rx={l.h / 2}
            fill="var(--color-ty)"
            opacity="0.85"
          />
        ))}
        <g className="carga-carro">
          <path d={LOGO.carroEntero} fill="var(--color-ty)" />
          {ruedas.map((r, i) => (
            <circle key={`a${i}`} cx={r.cx} cy={r.cy} r={radioArco} fill="var(--fondo)" />
          ))}
          {ruedas.map((r, i) => (
            <g key={`r${i}`} className="carga-rueda">
              <circle cx={r.cx} cy={r.cy} r={radioRueda} fill="var(--color-ty)" />
              <circle cx={r.cx} cy={r.cy - 14} r={5} fill="var(--fondo)" />
            </g>
          ))}
        </g>
      </svg>
      {texto && <span className="text-sm text-suave">{texto}</span>}
    </div>
  );
}

/** La carga de una pantalla completa. */
export function PantallaCargando({ texto }: { texto?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center">
      <CargandoCarro {...(texto ? { texto } : {})} />
    </main>
  );
}
