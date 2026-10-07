import { motion } from 'motion/react';
import { vibrar } from '../lib/vibrar.ts';

interface Props {
  activo: boolean;
  alCambiar: (v: boolean) => void;
  etiqueta: string;
  descripcion?: string;
}

export function Interruptor({ activo, alCambiar, etiqueta, descripcion }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => {
        vibrar('toque');
        alCambiar(!activo);
      }}
      className="flex min-h-14 w-full items-center gap-3 py-1 text-left"
    >
      <span className="flex-1">
        <span className="block text-lg font-extrabold leading-tight">{etiqueta}</span>
        {descripcion && <span className="block text-sm text-suave">{descripcion}</span>}
      </span>
      <span
        className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors ${activo ? 'justify-end bg-ty' : 'justify-start bg-borde'}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 32 }}
          className="size-6 rounded-full bg-white shadow"
        />
      </span>
    </button>
  );
}
