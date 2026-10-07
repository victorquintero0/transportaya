interface Props {
  /** `completo` incluye el nombre; `marca` es solo el globo con el carro. */
  variante?: 'completo' | 'marca';
  tamano?: number;
  className?: string;
}

/** El logo en su versión para fondo oscuro o claro: el tema del documento decide cuál se ve (ver tema.css). */
export function Logo({ variante = 'completo', tamano = 120, className = '' }: Props) {
  if (variante === 'marca')
    return (
      <img
        src="/marca/marca-verde.png"
        alt="TransporteYa"
        width={tamano}
        style={{ height: 'auto' }}
        className={className}
        draggable={false}
      />
    );
  return (
    <>
      <img
        src="/marca/logo-oscuro.png"
        alt="TransporteYa"
        width={tamano}
        style={{ height: 'auto' }}
        className={`logo-sobre-oscuro ${className}`}
        draggable={false}
      />
      <img
        src="/marca/logo-claro.png"
        alt=""
        aria-hidden="true"
        width={tamano}
        style={{ height: 'auto' }}
        className={`logo-sobre-claro ${className}`}
        draggable={false}
      />
    </>
  );
}
