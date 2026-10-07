import { AnimatePresence, motion } from 'motion/react';
import { useAvisos } from '../estado/avisos.ts';
import { Icono } from './Icono.tsx';

export function Avisos() {
  const lista = useAvisos((s) => s.lista);
  const quitar = useAvisos((s) => s.quitar);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {lista.map((a) => (
          <motion.button
            key={a.id}
            layout
            initial={{ y: -40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -30, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            onClick={() => quitar(a.id)}
            className={[
              'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-left text-base font-bold shadow-xl',
              a.tipo === 'error'
                ? 'bg-peligro text-white'
                : a.tipo === 'exito'
                  ? 'bg-ty text-sobre-ty'
                  : 'bg-superficie-2 text-texto border border-borde',
            ].join(' ')}
          >
            <Icono
              nombre={a.tipo === 'error' ? 'alerta' : a.tipo === 'exito' ? 'ok' : 'chispas'}
              tamano={22}
            />
            <span className="flex-1">{a.texto}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
