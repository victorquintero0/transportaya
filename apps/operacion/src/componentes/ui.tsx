import { Icono, mensajeDe as mensajeError, type NombreIcono } from '@transportaya/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type Tono = 'neutro' | 'ok' | 'aviso' | 'error' | 'info' | 'uva';

const TONOS: Record<Tono, string> = {
  neutro: 'bg-superficie-2 text-suave border-borde',
  ok: 'bg-ty/15 text-ty border-ty/30',
  aviso: 'bg-sol/15 text-sol border-sol/30',
  error: 'bg-peligro/15 text-peligro border-peligro/30',
  info: 'bg-cielo/15 text-cielo border-cielo/30',
  uva: 'bg-uva/15 text-uva border-uva/30',
};

export function Insignia({
  tono = 'neutro',
  children,
  icono,
}: {
  tono?: Tono;
  children: ReactNode;
  icono?: NombreIcono;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${TONOS[tono]}`}
    >
      {icono && <Icono nombre={icono} tamano={12} />}
      {children}
    </span>
  );
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-ty text-sobre-ty hover:brightness-110',
  secundario: 'bg-superficie-2 text-texto border border-borde hover:border-suave',
  peligro: 'bg-peligro text-white hover:brightness-110',
  fantasma: 'bg-transparent text-suave hover:bg-superficie-2 hover:text-texto',
};

interface PropsBoton {
  children?: ReactNode;
  onClick?: () => void;
  variante?: Variante;
  tamano?: 'sm' | 'md';
  icono?: NombreIcono;
  cargando?: boolean;
  deshabilitado?: boolean;
  type?: 'button' | 'submit';
  titulo?: string;
  id?: string;
  className?: string;
}

export function Boton({
  children,
  onClick,
  variante = 'secundario',
  tamano = 'md',
  icono,
  cargando = false,
  deshabilitado = false,
  type = 'button',
  titulo,
  id,
  className = '',
}: PropsBoton) {
  return (
    <button
      id={id}
      type={type}
      title={titulo}
      aria-label={titulo && !children ? titulo : undefined}
      disabled={deshabilitado || cargando}
      onClick={onClick}
      className={[
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-bold transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ty',
        'disabled:cursor-not-allowed disabled:opacity-45',
        tamano === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-10 px-4 text-sm',
        VARIANTES[variante],
        className,
      ].join(' ')}
    >
      {cargando ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icono && <Icono nombre={icono} tamano={tamano === 'sm' ? 14 : 16} />
      )}
      {children}
    </button>
  );
}

export function Panel({
  titulo,
  acciones,
  children,
  className = '',
  sinRelleno = false,
  id,
}: {
  titulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  sinRelleno?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-xl border border-borde bg-superficie ${className}`}>
      {(titulo || acciones) && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-borde px-4 py-2">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-suave">{titulo}</h2>
          <div className="flex items-center gap-2">{acciones}</div>
        </header>
      )}
      <div className={sinRelleno ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export function Kpi({
  etiqueta,
  valor,
  nota,
  tono = 'neutro',
  icono,
}: {
  etiqueta: string;
  valor: ReactNode;
  nota?: ReactNode;
  tono?: Tono;
  icono?: NombreIcono;
}) {
  const color =
    tono === 'error'
      ? 'text-peligro'
      : tono === 'aviso'
        ? 'text-sol'
        : tono === 'ok'
          ? 'text-ty'
          : tono === 'info'
            ? 'text-cielo'
            : 'text-texto';
  return (
    <div className="rounded-xl border border-borde bg-superficie px-4 py-3">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-suave">
        {etiqueta}
        {icono && <Icono nombre={icono} tamano={14} />}
      </div>
      <div className={`numeros mt-1 text-2xl font-extrabold ${color}`}>{valor}</div>
      {nota && <div className="mt-0.5 text-xs text-suave">{nota}</div>}
    </div>
  );
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <dt className="text-suave">{etiqueta}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

export const claseEntrada =
  'h-10 w-full rounded-lg border border-borde bg-fondo px-3 text-sm text-texto placeholder:text-suave/70 focus:border-ty focus:outline-none focus:ring-2 focus:ring-ty/30 disabled:opacity-50';

export function Campo({
  etiqueta,
  ayuda,
  children,
  className = '',
}: {
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-suave">
        {etiqueta}
      </span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-suave">{ayuda}</span>}
    </label>
  );
}

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${claseEntrada} ${props.className ?? ''}`} />;
}

export function Selector(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${claseEntrada} ${props.className ?? ''}`} />;
}

export function AreaTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      {...props}
      className={`${claseEntrada} h-auto resize-y py-2 ${props.className ?? ''}`}
    />
  );
}

export function Pestanas<T extends string>({
  items,
  activa,
  alCambiar,
}: {
  items: { id: T; titulo: string; aviso?: number }[];
  activa: T;
  alCambiar: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-borde">
      {items.map((p) => (
        <button
          key={p.id}
          role="tab"
          type="button"
          aria-selected={activa === p.id}
          onClick={() => alCambiar(p.id)}
          className={[
            '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold transition',
            activa === p.id
              ? 'border-ty text-texto'
              : 'border-transparent text-suave hover:text-texto',
          ].join(' ')}
        >
          {p.titulo}
          {!!p.aviso && (
            <span className="rounded-full bg-peligro px-1.5 py-0.5 text-[11px] font-extrabold text-white">
              {p.aviso}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Vacio({ texto, icono = 'chispas' }: { texto: string; icono?: NombreIcono }) {
  return (
    <div className="grid place-items-center gap-2 py-10 text-center text-suave">
      <Icono nombre={icono} tamano={28} />
      <p className="max-w-sm text-sm">{texto}</p>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="grid place-items-center gap-3 py-12 text-suave" role="status">
      <span className="size-8 animate-spin rounded-full border-4 border-ty border-t-transparent" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

export interface Columna<T> {
  titulo: string;
  celda: (f: T) => ReactNode;
  alinear?: 'izq' | 'der' | 'centro';
  ancho?: string;
}

export function Tabla<T>({
  columnas,
  filas,
  clave,
  alFila,
  vacio = 'No hay resultados.',
  id,
}: {
  columnas: Columna<T>[];
  filas: T[];
  clave: (f: T) => string;
  alFila?: (f: T) => void;
  vacio?: string;
  id?: string;
}) {
  if (filas.length === 0) return <Vacio texto={vacio} icono="buscar" />;
  const alinear = (a?: 'izq' | 'der' | 'centro') =>
    a === 'der' ? 'text-right' : a === 'centro' ? 'text-center' : 'text-left';
  return (
    <div className="scroll-fino overflow-x-auto">
      <table id={id} className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-borde text-xs uppercase tracking-wide text-suave">
            {columnas.map((c) => (
              <th
                key={c.titulo}
                scope="col"
                style={c.ancho ? { width: c.ancho } : undefined}
                className={`whitespace-nowrap px-3 py-2 font-bold ${alinear(c.alinear)}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={clave(f)}
              onClick={alFila ? () => alFila(f) : undefined}
              className={`border-b border-borde/60 last:border-0 ${alFila ? 'cursor-pointer hover:bg-superficie-2' : ''}`}
            >
              {columnas.map((c) => (
                <td key={c.titulo} className={`px-3 py-2.5 align-middle ${alinear(c.alinear)}`}>
                  {c.celda(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({
  abierto,
  titulo,
  alCerrar,
  children,
  ancho = 'max-w-lg',
}: {
  abierto: boolean;
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  ancho?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    document.addEventListener('keydown', alTecla);
    const campo = caja.current?.querySelector<HTMLElement>('input, textarea, select');
    campo?.focus();
    return () => document.removeEventListener('keydown', alTecla);
  }, [abierto, alCerrar]);
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`scroll-fino max-h-[90dvh] w-full overflow-y-auto rounded-2xl border border-borde bg-superficie p-5 shadow-2xl ${ancho}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-extrabold">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-suave hover:bg-superficie-2 hover:text-texto"
          >
            <Icono nombre="cerrar" tamano={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Una acción sensible: pide el motivo antes de ejecutarla (queda en la auditoría, RNF-48).
 * `extra` permite pedir otros datos en el mismo cuadro; `valido` los valida.
 */
export function AccionMotivo({
  etiqueta,
  titulo,
  descripcion,
  confirmar = 'Confirmar',
  variante = 'secundario',
  icono,
  tamano = 'sm',
  minimo = 5,
  extra,
  valido = true,
  alConfirmar,
  deshabilitado,
  id,
  sinMotivo = false,
  etiquetaMotivo = 'Motivo',
}: {
  etiqueta: string;
  titulo: string;
  descripcion?: ReactNode;
  confirmar?: string;
  variante?: Variante;
  icono?: NombreIcono;
  tamano?: 'sm' | 'md';
  minimo?: number;
  extra?: ReactNode;
  valido?: boolean;
  alConfirmar: (motivo: string) => Promise<unknown>;
  deshabilitado?: boolean;
  id?: string;
  sinMotivo?: boolean;
  etiquetaMotivo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const cerrar = () => {
    setAbierto(false);
    setMotivo('');
    setError(null);
  };
  const ok = valido && (sinMotivo || motivo.trim().length >= minimo);
  return (
    <>
      <Boton
        id={id}
        variante={variante}
        tamano={tamano}
        icono={icono}
        deshabilitado={deshabilitado}
        onClick={() => setAbierto(true)}
      >
        {etiqueta}
      </Boton>
      <Modal abierto={abierto} titulo={titulo} alCerrar={cerrar}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok || enCurso) return;
            setEnCurso(true);
            setError(null);
            alConfirmar(motivo.trim())
              .then(cerrar)
              .catch((err: unknown) => setError(mensajeError(err)))
              .finally(() => setEnCurso(false));
          }}
        >
          {descripcion && <div className="text-sm text-suave">{descripcion}</div>}
          {extra}
          {!sinMotivo && (
            <Campo
              etiqueta={etiquetaMotivo}
              ayuda={`Mínimo ${minimo} caracteres. Queda en la auditoría.`}
            >
              <AreaTexto
                name="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
              />
            </Campo>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-peligro/15 px-3 py-2 text-sm font-semibold text-peligro"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              variante={variante === 'secundario' ? 'primario' : variante}
              deshabilitado={!ok}
              cargando={enCurso}
            >
              {confirmar}
            </Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
