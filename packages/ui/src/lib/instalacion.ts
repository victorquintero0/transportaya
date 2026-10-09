import { create } from 'zustand';

/** Cómo se puede instalar la app en este dispositivo. */
export type Plataforma = 'instalada' | 'android' | 'ios' | 'otra';

/**
 * Decide la plataforma a partir del agente de usuario y de si la app ya abre a pantalla completa. En iPadOS reciente
 * Safari se presenta como un Mac, por eso se mira también el número de puntos táctiles.
 */
export function detectarPlataforma(
  agente: string,
  instalada: boolean,
  puntosTactiles = 0,
): Plataforma {
  if (instalada) return 'instalada';
  if (/iPhone|iPad|iPod/i.test(agente) || (/Macintosh/i.test(agente) && puntosTactiles > 1))
    return 'ios';
  if (/Android/i.test(agente)) return 'android';
  return 'otra';
}

/** Evento que Chrome entrega cuando la app se puede instalar; guardarlo permite ofrecer la instalación con un botón. */
interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Estado {
  evento: EventoInstalacion | null;
  instalada: boolean;
}

const estaInstalada = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const useInstalacion = create<Estado>(() => ({ evento: null, instalada: estaInstalada() }));

// El evento llega una sola vez, apenas carga la página: se escucha desde que se importa este módulo, no desde que se
// dibuja la pantalla que lo usa.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstalacion.setState({ evento: e as EventoInstalacion });
  });
  window.addEventListener('appinstalled', () =>
    useInstalacion.setState({ evento: null, instalada: true }),
  );
}

/** Abre el cuadro de instalación del navegador. Devuelve si la persona aceptó. */
export async function instalarApp(): Promise<boolean> {
  const { evento } = useInstalacion.getState();
  if (!evento) return false;
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  // El evento solo sirve una vez
  useInstalacion.setState({ evento: null });
  return outcome === 'accepted';
}

export function plataformaActual(instalada: boolean): Plataforma {
  return detectarPlataforma(navigator.userAgent, instalada, navigator.maxTouchPoints);
}
