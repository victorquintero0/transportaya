import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { toque } from '../../lib/sonido.ts';
import { vibrar } from '../../lib/vibrar.ts';
import { Icono, type NombreIcono } from './Icono.tsx';

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'oscuro';

interface Props {
  children: ReactNode;
  alPulsar?: () => void;
  variante?: Variante;
  tamano?: 'normal' | 'grande';
  icono?: NombreIcono;
  cargando?: boolean;
  deshabilitado?: boolean;
  bloque?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  etiqueta?: string;
  id?: string;
}

const ESTILOS: Record<Variante, string> = {
  primario: 'bg-ty text-sobre-ty shadow-brillo',
  secundario: 'bg-superficie-2 text-texto border border-borde',
  oscuro: 'bg-texto text-fondo',
  peligro: 'bg-peligro text-white',
  fantasma: 'bg-transparent text-ty',
};

/** Botón grande (≥ 56 px, RNF-71) con respuesta táctil: se hunde, vibra y suena suave. */
export function Boton({
  children,
  alPulsar,
  variante = 'primario',
  tamano = 'normal',
  icono,
  cargando = false,
  deshabilitado = false,
  bloque = true,
  type = 'button',
  className = '',
  etiqueta,
  id,
}: Props) {
  const inactivo = deshabilitado || cargando;
  return (
    <motion.button
      id={id}
      type={type}
      aria-label={etiqueta}
      disabled={inactivo}
      whileTap={inactivo ? undefined : { scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      onClick={() => {
        if (inactivo) return;
        vibrar('toque');
        toque();
        alPulsar?.();
      }}
      className={[
        'relative inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold tracking-tight',
        'transition-opacity disabled:opacity-45',
        tamano === 'grande' ? 'min-h-16 px-6 text-xl' : 'min-h-14 px-5 text-lg',
        bloque ? 'w-full' : '',
        ESTILOS[variante],
        className,
      ].join(' ')}
    >
      {cargando ? (
        <span className="size-6 animate-spin rounded-full border-[3px] border-current border-t-transparent" />
      ) : (
        <>
          {icono && <Icono nombre={icono} tamano={tamano === 'grande' ? 26 : 22} />}
          {children}
        </>
      )}
    </motion.button>
  );
}
