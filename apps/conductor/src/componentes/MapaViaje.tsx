import { BaseMapa, Icono, crearProyeccion, trazoCurvo, type ControlMapa } from '@transportaya/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUbicacion } from '../servicios/gps.ts';

interface Props {
  /** A dónde va el conductor ahora: la recogida o el destino. */
  objetivo: { lat: number; lng: number };
  etiqueta: string;
  tipo: 'recogida' | 'destino';
}

/**
 * Mapa pequeño del viaje para el conductor: su carro, hacia dónde apunta y el punto al que va. Usa el proveedor de
 * mapas configurado en la App Operación (ADR-0009) y, si no hay mapa de calles, dibuja el esquemático. La navegación
 * paso a paso la hace Waze o Google Maps (botón «Navegar»).
 */
export function MapaViaje({ objetivo, etiqueta, tipo }: Props) {
  const pos = useUbicacion((s) => s.posicion);
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 360, h: 200 });
  const [real, setReal] = useState<ControlMapa | null>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(([e]) => {
      const { width, height } = e!.contentRect;
      if (width > 0 && height > 0) setTam({ w: Math.round(width), h: Math.round(height) });
    });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  const puntos = useMemo(() => (pos ? [objetivo, pos] : [objetivo]), [objetivo, pos]);
  const proy = useMemo(
    () => crearProyeccion(puntos, tam.w, tam.h, 36, 500),
    [puntos, tam.w, tam.h],
  );
  const px = (p: { lat: number; lng: number }) =>
    real ? real.proyectar(p) : { x: proy.x(p), y: proy.y(p) };
  const o = px(objetivo);
  const c = pos ? px(pos) : null;

  return (
    <div
      ref={caja}
      className="relative h-48 w-full max-w-md overflow-hidden rounded-3xl border-2 border-borde bg-superficie-2 sm:h-56"
      role="img"
      aria-label={`Mapa hacia ${etiqueta}`}
      data-mapa={real ? 'real' : 'esquematico'}
    >
      <BaseMapa puntos={puntos} margen={36} minSpanM={500} alControl={setReal} />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${tam.w} ${tam.h}`}
        aria-hidden="true"
      >
        {!real && (
          <>
            <defs>
              <pattern
                id="mv-calles-a"
                width="46"
                height="46"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(35)"
              >
                <rect width="46" height="2" fill="var(--borde)" opacity="0.9" />
              </pattern>
              <pattern
                id="mv-calles-b"
                width="53"
                height="53"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(125)"
              >
                <rect width="53" height="2" fill="var(--borde)" opacity="0.9" />
              </pattern>
            </defs>
            <rect width={tam.w} height={tam.h} fill="url(#mv-calles-a)" />
            <rect width={tam.w} height={tam.h} fill="url(#mv-calles-b)" />
          </>
        )}
        {c && (
          <path
            d={trazoCurvo(c.x, c.y, o.x, o.y)}
            fill="none"
            stroke="var(--color-ty)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="1 9"
          />
        )}
      </svg>

      <span
        className="pointer-events-none absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-texto text-fondo shadow-lg ring-2 ring-fondo"
        style={{ left: o.x, top: o.y }}
        title={etiqueta}
      >
        <Icono nombre={tipo === 'recogida' ? 'pin' : 'bandera'} tamano={18} />
      </span>
      {c && (
        <span
          className="pointer-events-none absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-fondo shadow-brillo ring-2 ring-ty"
          style={{ left: c.x, top: c.y }}
        >
          <img src="/marca/marca-verde.png" alt="" width={24} height={20} draggable={false} />
        </span>
      )}
    </div>
  );
}
