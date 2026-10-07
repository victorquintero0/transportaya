import { animate } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  valor: number;
  formato: (n: number) => string;
  className?: string;
  duracion?: number;
}

/** Un número que "rueda" hasta su nuevo valor en vez de saltar. */
export function Numero({ valor, formato, className = '', duracion = 0.7 }: Props) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);

  useEffect(() => {
    const control = animate(desde.current, valor, {
      duration: duracion,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        desde.current = v;
        setMostrado(v);
      },
    });
    return () => control.stop();
  }, [valor, duracion]);

  return <span className={`numeros ${className}`}>{formato(mostrado)}</span>;
}
