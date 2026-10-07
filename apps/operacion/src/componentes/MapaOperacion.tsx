import { Icono } from '@transportaya/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { crearProyeccion, type Punto } from '../lib/mapa.ts';

export interface MarcaConductor {
  id: string;
  nombre: string;
  estado: string;
  posicion: Punto;
  detalle?: string;
}
export interface MarcaViaje {
  id: string;
  codigo: string;
  origen: Punto;
  destino: Punto;
  semaforo: 'verde' | 'ambar' | 'rojo';
  buscando: boolean;
}

interface Props {
  conductores?: MarcaConductor[];
  viajes?: MarcaViaje[];
  seleccionado?: string | null;
  alSeleccionarViaje?: (id: string) => void;
  alSeleccionarConductor?: (id: string) => void;
  /** Recorrido de un viaje (reproducción) y hasta qué punto se ha reproducido. */
  recorrido?: Punto[];
  avance?: number;
  /** Puntos extra que deben caber en el encuadre (por ejemplo, el origen y el destino del viaje abierto). */
  extra?: Punto[];
  className?: string;
}

const COLOR_ESTADO: Record<string, string> = {
  disponible: 'var(--color-ty)',
  con_oferta: 'var(--color-sol)',
  en_camino: 'var(--color-cielo)',
  en_sitio: 'var(--color-cielo)',
  en_viaje: 'var(--color-uva)',
  sin_senal: 'var(--color-peligro)',
};
const COLOR_SEMAFORO = {
  verde: 'var(--color-ty)',
  ambar: 'var(--color-sol)',
  rojo: 'var(--color-peligro)',
} as const;

export const LEYENDA_MAPA = [
  ['Disponible', 'var(--color-ty)'],
  ['Con oferta', 'var(--color-sol)'],
  ['En camino o en sitio', 'var(--color-cielo)'],
  ['En viaje', 'var(--color-uva)'],
  ['Sin señal', 'var(--color-peligro)'],
] as const;

/**
 * Mapa esquemático de la operación: la flota, los viajes activos y los recorridos. Se puede acercar con la rueda y
 * mover arrastrando. Igual que el de las apps, dibuja la cuadrícula de la ciudad con su inclinación real; el mapa de
 * calles con OpenStreetMap llega con el ADR-0002.
 */
export function MapaOperacion({
  conductores = [],
  viajes = [],
  seleccionado = null,
  alSeleccionarViaje,
  alSeleccionarConductor,
  recorrido = [],
  avance = 1,
  extra = [],
  className = '',
}: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 800, h: 520 });
  const [vista, setVista] = useState({ k: 1, tx: 0, ty: 0 });
  const [movida, setMovida] = useState(false);
  const arrastre = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

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

  const puntos = useMemo(() => {
    const todos: Punto[] = [
      ...conductores.map((c) => c.posicion),
      ...viajes.flatMap((v) => [v.origen, v.destino]),
      ...recorrido,
      ...extra,
    ];
    return todos;
  }, [conductores, viajes, recorrido, extra]);

  // El encuadre se calcula con la lista de puntos que se muestra; solo se vuelve a ajustar si la persona no ha movido el mapa.
  const proy = useMemo(
    () => crearProyeccion(puntos, tam.w, tam.h, 60, 1200),
    [puntos, tam.w, tam.h],
  );

  const pos = (p: Punto) => ({
    x: proy.x(p) * vista.k + vista.tx,
    y: proy.y(p) * vista.k + vista.ty,
  });
  const bloque = Math.min(Math.max((90 / proy.metrosPorPixel) * vista.k, 24), 140);

  const acercar = (factor: number, cx = tam.w / 2, cy = tam.h / 2) => {
    setMovida(true);
    setVista((v) => {
      const k = Math.min(12, Math.max(0.4, v.k * factor));
      const f = k / v.k;
      return { k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f };
    });
  };

  const trazo =
    recorrido.length > 1
      ? recorrido.slice(0, Math.max(2, Math.ceil(recorrido.length * avance)))
      : [];
  const ultimo = trazo.length ? trazo[trazo.length - 1]! : null;

  return (
    <div
      ref={caja}
      className={`${className.includes('absolute') ? '' : 'relative'} cursor-grab overflow-hidden rounded-xl border border-borde bg-superficie-2 active:cursor-grabbing ${className}`}
      onWheel={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        acercar(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
      }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('[data-marca]')) return;
        arrastre.current = { x: e.clientX, y: e.clientY, tx: vista.tx, ty: vista.ty };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const a = arrastre.current;
        if (!a) return;
        setMovida(true);
        setVista((v) => ({ ...v, tx: a.tx + e.clientX - a.x, ty: a.ty + e.clientY - a.y }));
      }}
      onPointerUp={() => (arrastre.current = null)}
      role="img"
      aria-label="Mapa de la operación"
      style={{ touchAction: 'none' }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${tam.w} ${tam.h}`}
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="op-calles-a"
            width={bloque}
            height={bloque}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${vista.tx} ${vista.ty}) rotate(35)`}
          >
            <rect width={bloque} height="1.5" fill="var(--borde)" />
          </pattern>
          <pattern
            id="op-calles-b"
            width={bloque * 1.15}
            height={bloque * 1.15}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${vista.tx} ${vista.ty}) rotate(125)`}
          >
            <rect width={bloque * 1.15} height="1.5" fill="var(--borde)" />
          </pattern>
        </defs>
        <rect width={tam.w} height={tam.h} fill="var(--superficie-2)" />
        <rect width={tam.w} height={tam.h} fill="url(#op-calles-a)" />
        <rect width={tam.w} height={tam.h} fill="url(#op-calles-b)" />

        {viajes.map((v) => {
          const a = pos(v.origen);
          const b = pos(v.destino);
          const activo = v.id === seleccionado;
          return (
            <line
              key={v.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={COLOR_SEMAFORO[v.semaforo]}
              strokeWidth={activo ? 3 : 1.5}
              strokeDasharray="2 7"
              strokeLinecap="round"
              opacity={activo ? 1 : 0.55}
            />
          );
        })}

        {trazo.length > 1 && (
          <>
            <polyline
              points={trazo.map((p) => `${pos(p).x.toFixed(1)},${pos(p).y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke="var(--fondo)"
              strokeWidth="7"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.6"
            />
            <polyline
              points={trazo.map((p) => `${pos(p).x.toFixed(1)},${pos(p).y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke="var(--color-ty)"
              strokeWidth="3.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>

      {/* Viajes: el origen es un anillo del color del semáforo; los que buscan conductor laten. */}
      {viajes.map((v) => {
        const a = pos(v.origen);
        const activo = v.id === seleccionado;
        return (
          <button
            key={v.id}
            type="button"
            data-marca
            data-viaje={v.codigo}
            aria-label={`Viaje ${v.codigo}`}
            title={`Viaje ${v.codigo}`}
            onClick={() => alSeleccionarViaje?.(v.id)}
            className="marca-mapa absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
            style={{ left: a.x, top: a.y }}
          >
            {v.buscando && (
              <span
                className="absolute size-7 animate-radar rounded-full border-2"
                style={{ borderColor: COLOR_SEMAFORO[v.semaforo] }}
              />
            )}
            <span
              className="size-4 rounded-full border-[3px] bg-fondo"
              style={{
                borderColor: COLOR_SEMAFORO[v.semaforo],
                boxShadow: activo ? `0 0 0 4px ${COLOR_SEMAFORO[v.semaforo]}55` : undefined,
              }}
            />
          </button>
        );
      })}
      {viajes
        .filter((v) => v.id === seleccionado)
        .map((v) => {
          const d = pos(v.destino);
          return (
            <span
              key={`d-${v.id}`}
              className="pointer-events-none absolute grid size-7 -translate-x-1/2 -translate-y-full place-items-center rounded-full bg-texto text-fondo shadow"
              style={{ left: d.x, top: d.y }}
            >
              <Icono nombre="bandera" tamano={14} />
            </span>
          );
        })}

      {/* Flota */}
      {conductores.map((c) => {
        const p = pos(c.posicion);
        const color = COLOR_ESTADO[c.estado] ?? 'var(--suave)';
        return (
          <button
            key={c.id}
            type="button"
            data-marca
            data-conductor={c.id}
            aria-label={`${c.nombre}, ${c.estado}`}
            title={`${c.nombre}${c.detalle ? ` · ${c.detalle}` : ''}`}
            onClick={() => alSeleccionarConductor?.(c.id)}
            className="marca-mapa absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center"
            style={{ left: p.x, top: p.y }}
          >
            <span
              className="grid size-6 place-items-center rounded-full border-2 border-fondo shadow"
              style={{ background: color, color: 'var(--color-sobre-ty)' }}
            >
              <Icono nombre="carro" tamano={13} />
            </span>
          </button>
        );
      })}

      {ultimo && (
        <span
          className="pointer-events-none absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ty text-sobre-ty shadow-lg ring-2 ring-fondo"
          style={{ left: pos(ultimo).x, top: pos(ultimo).y }}
        >
          <Icono nombre="carro" tamano={15} />
        </span>
      )}

      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-borde bg-superficie shadow">
        <button
          type="button"
          aria-label="Acercar"
          onClick={() => acercar(1.4)}
          className="grid size-8 place-items-center text-suave hover:bg-superficie-2 hover:text-texto"
        >
          <Icono nombre="mas" tamano={16} />
        </button>
        <button
          type="button"
          aria-label="Alejar"
          onClick={() => acercar(1 / 1.4)}
          className="grid size-8 place-items-center border-t border-borde text-suave hover:bg-superficie-2 hover:text-texto"
        >
          <Icono nombre="menos" tamano={16} />
        </button>
        {movida && (
          <button
            type="button"
            aria-label="Ajustar a todo"
            title="Ajustar a todo"
            onClick={() => {
              setVista({ k: 1, tx: 0, ty: 0 });
              setMovida(false);
            }}
            className="grid size-8 place-items-center border-t border-borde text-suave hover:bg-superficie-2 hover:text-texto"
          >
            <Icono nombre="navegar" tamano={14} />
          </button>
        )}
      </div>
    </div>
  );
}
