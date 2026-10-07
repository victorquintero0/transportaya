import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

interface Props {
  abierta: boolean;
  alCerrar?: () => void;
  titulo?: string;
  children: ReactNode;
}

/** Hoja que sube desde abajo: se puede arrastrar hacia abajo para cerrarla. */
export function Hoja({ abierta, alCerrar, titulo, children }: Props) {
  return (
    <AnimatePresence>
      {abierta && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={alCerrar}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className="area-segura-abajo relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-b-0 border-borde bg-superficie px-5 pt-3 shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            drag={alCerrar ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) alCerrar?.();
            }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-borde" />
            {titulo && <h2 className="mb-3 text-xl font-extrabold">{titulo}</h2>}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
