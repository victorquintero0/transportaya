import confetti from 'canvas-confetti';

const COLORES = ['#07D507', '#2BE82B', '#FFFFFF', '#FFD23F', '#9CFF9C'];

function reducirMovimiento(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Lluvia de confeti verde: fin de viaje, meta cumplida. */
export function celebrar(intensidad: 'normal' | 'grande' = 'normal'): void {
  if (reducirMovimiento()) return;
  const n = intensidad === 'grande' ? 160 : 90;
  void confetti({
    particleCount: n,
    spread: 80,
    startVelocity: 48,
    origin: { y: 0.65 },
    colors: COLORES,
    disableForReducedMotion: true,
  });
  if (intensidad === 'grande') {
    window.setTimeout(() => {
      void confetti({
        particleCount: 70,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.7 },
        colors: COLORES,
      });
      void confetti({
        particleCount: 70,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.7 },
        colors: COLORES,
      });
    }, 220);
  }
}
