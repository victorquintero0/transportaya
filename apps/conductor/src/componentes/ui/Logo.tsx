import { useAjustes } from '../../estado/ajustes.ts';

interface Props {
  /** `completo` incluye el nombre; `marca` es solo el globo con el carro. */
  variante?: 'completo' | 'marca';
  tamano?: number;
  className?: string;
}

export function esTemaClaro(tema: string): boolean {
  if (tema === 'claro') return true;
  if (tema === 'oscuro') return false;
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
  );
}

export function Logo({ variante = 'completo', tamano = 120, className = '' }: Props) {
  const tema = useAjustes((s) => s.tema);
  const claro = esTemaClaro(tema);
  const src =
    variante === 'marca'
      ? '/marca/marca-verde.png'
      : claro
        ? '/marca/logo-claro.png'
        : '/marca/logo-oscuro.png';
  return (
    <img
      src={src}
      alt="TransporteYa"
      width={tamano}
      style={{ height: 'auto' }}
      className={className}
      draggable={false}
    />
  );
}
