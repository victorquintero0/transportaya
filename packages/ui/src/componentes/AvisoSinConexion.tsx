import { AnimatePresence, motion } from 'motion/react';
import { useConexionRed } from '../lib/conexion.ts';
import { Icono } from './Icono.tsx';

/**
 * Franja arriba de la pantalla cuando el teléfono pierde internet (un túnel, la montaña), y un aviso breve al volver.
 * La app sigue abierta desde lo que guardó el service worker y se reconecta sola.
 */
export function AvisoSinConexion() {
  const enLinea = useConexionRed((s) => s.enLinea);
  const recuperada = useConexionRed((s) => s.recuperada);
  const visible = !enLinea || recuperada;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="aviso"
          id="aviso-conexion"
          role="status"
          data-conexion={enLinea ? 'recuperada' : 'perdida'}
          initial={{ y: '-100%' }}
          animate={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className={`fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 px-4 pb-2 text-sm font-extrabold ${enLinea ? 'bg-ty text-sobre-ty' : 'bg-sol text-black'}`}
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
        >
          <Icono nombre={enLinea ? 'wifi' : 'sinwifi'} tamano={16} />
          {enLinea ? 'Conexión recuperada' : 'Sin conexión: reintentando…'}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
