import { motion } from 'motion/react';
import { Icono } from './Icono.tsx';

interface Props {
  valor: number;
  alCambiar?: (n: number) => void;
  tamano?: number;
}

export function Estrellas({ valor, alCambiar, tamano = 40 }: Props) {
  return (
    <div
      className="flex justify-center gap-1.5"
      role={alCambiar ? 'radiogroup' : 'img'}
      aria-label={`${valor} de 5 estrellas`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const llena = n <= Math.round(valor);
        return (
          <motion.button
            key={n}
            type="button"
            disabled={!alCambiar}
            aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
            whileTap={{ scale: 1.3, rotate: -12 }}
            animate={llena && alCambiar ? { scale: [1, 1.25, 1] } : { scale: 1 }}
            transition={{ duration: 0.25 }}
            onClick={() => alCambiar?.(n)}
            className={llena ? 'text-sol' : 'text-borde'}
          >
            <Icono nombre="estrella" tamano={tamano} relleno={llena} strokeWidth={1.6} />
          </motion.button>
        );
      })}
    </div>
  );
}
