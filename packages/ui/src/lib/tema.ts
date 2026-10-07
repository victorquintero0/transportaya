import { useEffect } from 'react';

export type Tema = 'auto' | 'oscuro' | 'claro';

/** Aplica el tema elegido (o el del sistema) al documento y a la barra del navegador. */
export function useTemaDocumento(tema: Tema): void {
  useEffect(() => {
    const aplicar = () => {
      const claro =
        tema === 'claro' ||
        (tema === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
      document.documentElement.dataset['tema'] = claro ? 'claro' : 'oscuro';
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', claro ? '#f6f8f6' : '#101010');
    };
    aplicar();
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, [tema]);
}
