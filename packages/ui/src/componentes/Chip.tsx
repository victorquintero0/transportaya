import type { ReactNode } from 'react';

type Tono = 'neutro' | 'ok' | 'aviso' | 'malo' | 'info';

const TONOS: Record<Tono, string> = {
  neutro: 'bg-superficie-2 text-suave',
  ok: 'bg-ty/15 text-ty',
  aviso: 'bg-sol/15 text-sol',
  malo: 'bg-peligro/15 text-peligro',
  info: 'bg-cielo/15 text-cielo',
};

export function Chip({ children, tono = 'neutro' }: { children: ReactNode; tono?: Tono }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}
