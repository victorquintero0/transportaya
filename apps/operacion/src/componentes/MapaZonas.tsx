import { BaseMapa, crearProyeccion, type ControlMapa, type Punto } from '@transportaya/ui';
import { useMemo, useRef, useState } from 'react';
import type { Zona } from '../lib/tipos.ts';

interface Props {
  zonas: Zona[];
  /** Los vértices que la persona va dibujando, en orden. */
  dibujo: Punto[];
  /** Si se puede dibujar. Quien solo mira, ve las zonas y mueve el mapa. */
  editable: boolean;
  alAgregar: (p: Punto) => void;
  className?: string;
}

const COLOR_TIPO: Record<string, string> = {
  area_servicio: 'var(--color-ty)',
  aeropuerto: 'var(--color-cielo)',
  restringida: 'var(--color-peligro)',
  punto_encuentro: 'var(--color-uva)',
};

const vertices = (z: Zona): Punto[] =>
  (z.poligono.coordinates[0] ?? []).slice(0, -1).map(([lng, lat]) => ({ lat: lat!, lng: lng! }));

/**
 * Mapa para dibujar zonas: se hace clic para poner cada vértice y se arrastra para moverse. Usa el mapa de calles
 * configurado (ADR-0009); si no carga, dibuja sobre el esquemático, que también sirve para marcar puntos.
 */
export function MapaZonas({ zonas, dibujo, editable, alAgregar, className = '' }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [real, setReal] = useState<ControlMapa | null>(null);
  const [tam, setTam] = useState({ w: 800, h: 360 });
  const arrastre = useRef<{ x: number; y: number } | null>(null);

  const todos = useMemo(() => [...zonas.flatMap(vertices), ...dibujo], [zonas, dibujo]);
  const proy = useMemo(() => crearProyeccion(todos, tam.w, tam.h, 50, 1500), [todos, tam]);
  const pos = (p: Punto) => (real ? real.proyectar(p) : { x: proy.x(p), y: proy.y(p) });

  const alSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!editable || !a || (e.target as Element).closest('[data-sin-clic]')) return;
    // Un arrastre mueve el mapa; un toque corto pone un vértice.
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 4) return;
    const r = caja.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    alAgregar(real ? real.desproyectar(x, y) : proy.invertir(x, y));
  };

  const ruta = (ps: Punto[], cerrar: boolean) =>
    ps
      .map((p, i) => {
        const q = pos(p);
        return `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      })
      .join(' ') + (cerrar ? ' Z' : '');

  return (
    <div
      ref={(el) => {
        caja.current = el;
        if (el && (el.clientWidth !== tam.w || el.clientHeight !== tam.h) && el.clientWidth > 0)
          setTam({ w: el.clientWidth, h: el.clientHeight });
      }}
      id="mapa-zonas"
      data-mapa={real ? 'real' : 'esquematico'}
      role="img"
      aria-label="Mapa de zonas"
      className={`relative overflow-hidden rounded-xl border border-borde bg-superficie-2 ${editable ? 'cursor-crosshair' : ''} ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        arrastre.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={alSoltar}
    >
      <BaseMapa puntos={todos} margen={50} minSpanM={1500} interactivo alControl={setReal} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {!real && (
          <>
            <defs>
              <pattern
                id="mz-a"
                width="70"
                height="70"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(35)"
              >
                <rect width="70" height="1.5" fill="var(--borde)" />
              </pattern>
              <pattern
                id="mz-b"
                width="80"
                height="80"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(125)"
              >
                <rect width="80" height="1.5" fill="var(--borde)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#mz-a)" />
            <rect width="100%" height="100%" fill="url(#mz-b)" />
          </>
        )}
        {zonas.map((z) => {
          const color = COLOR_TIPO[z.tipo] ?? 'var(--suave)';
          return (
            <path
              key={z.id}
              data-zona={z.nombre}
              d={ruta(vertices(z), true)}
              fill={color}
              fillOpacity={z.activa ? 0.18 : 0.06}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={z.activa ? undefined : '5 5'}
            />
          );
        })}
        {dibujo.length > 1 && (
          <path
            d={ruta(dibujo, dibujo.length > 2)}
            fill="var(--color-sol)"
            fillOpacity={0.2}
            stroke="var(--color-sol)"
            strokeWidth={2.5}
            strokeDasharray="6 4"
          />
        )}
      </svg>
      {zonas.map((z) => {
        const vs = vertices(z);
        if (vs.length === 0) return null;
        const c = pos({
          lat: vs.reduce((a, p) => a + p.lat, 0) / vs.length,
          lng: vs.reduce((a, p) => a + p.lng, 0) / vs.length,
        });
        return (
          <span
            key={z.id}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-fondo/80 px-1.5 py-0.5 text-[11px] font-extrabold"
            style={{ left: c.x, top: c.y }}
          >
            {z.nombre}
          </span>
        );
      })}
      {dibujo.map((p, i) => {
        const q = pos(p);
        return (
          <span
            key={i}
            data-vertice={i + 1}
            className="pointer-events-none absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-sol text-[10px] font-black text-black ring-2 ring-fondo"
            style={{ left: q.x, top: q.y }}
          >
            {i + 1}
          </span>
        );
      })}
      {editable && (
        <p
          data-sin-clic
          className="pointer-events-none absolute bottom-2 left-2 rounded bg-fondo/85 px-2 py-1 text-xs text-suave"
        >
          Haz clic para marcar cada vértice. Arrastra para moverte.
        </p>
      )}
    </div>
  );
}
