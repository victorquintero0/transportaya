import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  resaltada?: boolean;
}

export function Tarjeta({ children, resaltada = false, className = '', ...resto }: Props) {
  return (
    <div
      {...resto}
      className={[
        'rounded-tarjeta border p-4',
        resaltada ? 'border-ty/50 bg-ty/10' : 'border-borde bg-superficie',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
