import { motion } from 'motion/react';
import { vibrar } from '../lib/vibrar.ts';
import { Icono } from './Icono.tsx';

interface Props {
  alTecla: (t: string) => void;
  alBorrar: () => void;
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'borrar'];

/** Teclado numérico grande para el PIN y los montos: se usa con el pulgar, sin abrir el del teléfono. */
export function Teclado({ alTecla, alBorrar }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {TECLAS.map((t) =>
        t === '' ? (
          <span key="vacio" />
        ) : (
          <motion.button
            key={t}
            type="button"
            whileTap={{ scale: 0.9, backgroundColor: 'var(--color-ty)' }}
            transition={{ duration: 0.08 }}
            aria-label={t === 'borrar' ? 'Borrar' : t}
            onClick={() => {
              vibrar('toque');
              if (t === 'borrar') alBorrar();
              else alTecla(t);
            }}
            className="grid min-h-16 place-items-center rounded-2xl bg-superficie-2 text-3xl font-extrabold"
          >
            {t === 'borrar' ? <Icono nombre="borrar" tamano={28} /> : t}
          </motion.button>
        ),
      )}
    </div>
  );
}
