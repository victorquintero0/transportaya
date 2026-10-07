import { useState } from 'react';

export interface SerieBarras {
  nombre: string;
  color: string;
}
export interface DatoBarras {
  etiqueta: string;
  valores: number[];
}

/**
 * Barras apiladas con rejilla suave, 2 px de separación entre segmentos, leyenda siempre visible, descripción al pasar el
 * puntero (o enfocar) y vista de tabla con los mismos números: nada depende solo del color ni del puntero.
 */
export function BarrasApiladas({
  titulo,
  series,
  datos,
  alto = 220,
  cadaN = 1,
}: {
  titulo: string;
  series: SerieBarras[];
  datos: DatoBarras[];
  alto?: number;
  /** Muestra una etiqueta del eje cada N columnas. */
  cadaN?: number;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  const ancho = 720;
  const margen = { izq: 34, der: 8, arr: 10, abajo: 24 };
  const total = (d: DatoBarras) => d.valores.reduce((a, b) => a + b, 0);
  const maximo = Math.max(1, ...datos.map(total));
  const tope = maximo <= 4 ? 4 : Math.ceil(maximo / 4) * 4;
  const aY = (v: number) => margen.arr + (1 - v / tope) * (alto - margen.arr - margen.abajo);
  const paso = (ancho - margen.izq - margen.der) / Math.max(1, datos.length);
  const barra = Math.min(36, paso * 0.68);

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-extrabold">{titulo}</span>
        <span className="flex items-center gap-4 text-xs font-bold">
          {series.map((s) => (
            <span key={s.nombre} className="flex items-center gap-1.5 text-suave">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.nombre}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setTabla((t) => !t)}
            className="rounded-md border border-borde px-2 py-0.5 text-suave hover:text-texto"
          >
            {tabla ? 'Ver gráfica' : 'Ver tabla'}
          </button>
        </span>
      </figcaption>

      {tabla ? (
        <div className="scroll-fino max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-suave">
                <th className="py-1 pr-4">{titulo.split(' por ')[1] ?? 'Periodo'}</th>
                {series.map((s) => (
                  <th key={s.nombre} className="py-1 pr-4 text-right">
                    {s.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.map((d) => (
                <tr key={d.etiqueta} className="border-t border-borde/60">
                  <td className="py-1 pr-4">{d.etiqueta}</td>
                  {d.valores.map((v, i) => (
                    <td key={i} className="numeros py-1 pr-4 text-right">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full" role="img" aria-label={titulo}>
            {[0, 1, 2, 3, 4].map((i) => {
              const v = (tope / 4) * i;
              return (
                <g key={i}>
                  <line
                    x1={margen.izq}
                    x2={ancho - margen.der}
                    y1={aY(v)}
                    y2={aY(v)}
                    stroke="var(--borde)"
                    strokeWidth="1"
                    opacity={i === 0 ? 1 : 0.5}
                  />
                  <text
                    x={margen.izq - 6}
                    y={aY(v) + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="var(--suave)"
                  >
                    {Math.round(v)}
                  </text>
                </g>
              );
            })}
            {datos.map((d, i) => {
              const x = margen.izq + i * paso + (paso - barra) / 2;
              let base = 0;
              const ultimo = d.valores
                .map((v, k) => (v > 0 ? k : -1))
                .reduce((a, b) => Math.max(a, b), -1);
              return (
                <g key={d.etiqueta} opacity={activa === null || activa === i ? 1 : 0.55}>
                  {d.valores.map((v, k) => {
                    if (v <= 0) return null;
                    const y1 = aY(base + v);
                    const y0 = aY(base) - (base > 0 ? 2 : 0); // 2 px de separación entre segmentos
                    base += v;
                    const h = Math.max(1, y0 - y1);
                    const r = k === ultimo ? Math.min(4, h, barra / 2) : 0;
                    const s = series[k]!;
                    return r > 0 ? (
                      <path
                        key={k}
                        fill={s.color}
                        d={`M${x},${y1 + h} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barra - r} Q${x + barra},${y1} ${x + barra},${y1 + r} V${y1 + h} Z`}
                      />
                    ) : (
                      <rect key={k} x={x} y={y1} width={barra} height={h} fill={s.color} />
                    );
                  })}
                  {i % cadaN === 0 && (
                    <text
                      x={x + barra / 2}
                      y={alto - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fill="var(--suave)"
                    >
                      {d.etiqueta}
                    </text>
                  )}
                  <rect
                    x={margen.izq + i * paso}
                    y={margen.arr}
                    width={paso}
                    height={alto - margen.arr - margen.abajo}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${d.etiqueta}: ${series.map((s, k) => `${s.nombre} ${d.valores[k]}`).join(', ')}`}
                    onPointerEnter={() => setActiva(i)}
                    onPointerLeave={() => setActiva(null)}
                    onFocus={() => setActiva(i)}
                    onBlur={() => setActiva(null)}
                  />
                </g>
              );
            })}
          </svg>
          {activa !== null && datos[activa] && (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-lg border border-borde bg-superficie px-3 py-2 text-xs shadow-xl"
              style={{ left: `${((margen.izq + activa * paso + paso / 2) / ancho) * 100}%` }}
            >
              <div className="mb-1 font-extrabold">{datos[activa]!.etiqueta}</div>
              {series.map((s, k) => (
                <div key={s.nombre} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-suave">
                    <span className="h-0.5 w-3" style={{ background: s.color }} />
                    {s.nombre}
                  </span>
                  <b className="numeros text-sm">{datos[activa]!.valores[k]}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
