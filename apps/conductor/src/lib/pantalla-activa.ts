/** Mantiene la pantalla encendida mientras el conductor está en línea (no todos los navegadores lo permiten). */
let candado: WakeLockSentinel | null = null;
let quiere = false;

async function pedir(): Promise<void> {
  try {
    candado = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    candado = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (quiere && document.visibilityState === 'visible') void pedir();
});

export function mantenerPantallaEncendida(activar: boolean): void {
  quiere = activar;
  if (activar) void pedir();
  else {
    void candado?.release().catch(() => undefined);
    candado = null;
  }
}
