import type { ReactNode } from 'react';

/**
 * Hace que cada pantalla aparezca con un desvanecido corto al navegar. Solo cambia la opacidad, a propósito: un
 * movimiento (transform) volvería relativos al contenedor los elementos fijos de la pantalla mientras dura. La animación
 * no deja efecto al terminar (`backwards`): una opacidad animada "para siempre" encierra las hojas inferiores de la
 * pantalla en su propio apilamiento y la barra de pestañas, que está fuera, quedaría por encima de ellas.
 */
export function EntradaPagina({ clave, children }: { clave: string; children: ReactNode }) {
  return (
    <div key={clave} className="animate-entrada">
      {children}
    </div>
  );
}
