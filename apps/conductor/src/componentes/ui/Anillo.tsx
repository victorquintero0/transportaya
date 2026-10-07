import { motion } from 'motion/react';
import type { ReactNode } from 'react';

interface Props {
  /** 0 a 1 */
  valor: number;
  tamano?: number;
  grosor?: number;
  color?: string;
  fondo?: string;
  children?: ReactNode;
  /** Anima el trazo al cambiar el valor. */
  animado?: boolean;
}

/** Anillo de progreso: la meta del día, la cuenta regresiva de una oferta. */
export function Anillo({
  valor,
  tamano = 160,
  grosor = 12,
  color = 'var(--color-ty)',
  fondo = 'var(--color-superficie-2)',
  children,
  animado = true,
}: Props) {
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, valor));
  return (
    <div className="relative grid place-items-center" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={r}
          fill="none"
          stroke={fondo}
          strokeWidth={grosor}
        />
        <motion.circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={animado ? { type: 'spring', stiffness: 60, damping: 18 } : { duration: 0 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
