import { create } from 'zustand';

interface Estado {
  enLinea: boolean;
  /** Se acaba de recuperar la conexión: se avisa un momento. */
  recuperada: boolean;
}

export const useConexionRed = create<Estado>(() => ({
  enLinea: typeof navigator === 'undefined' ? true : navigator.onLine,
  recuperada: false,
}));

let aviso: ReturnType<typeof setTimeout> | undefined;

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    clearTimeout(aviso);
    useConexionRed.setState({ enLinea: false, recuperada: false });
  });
  window.addEventListener('online', () => {
    useConexionRed.setState({ enLinea: true, recuperada: true });
    clearTimeout(aviso);
    aviso = setTimeout(() => useConexionRed.setState({ recuperada: false }), 2500);
  });
}
