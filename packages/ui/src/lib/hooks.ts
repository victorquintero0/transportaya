import { useEffect, useState } from 'react';

/** La hora actual en ms, que se refresca cada `cadaMs`: para cronómetros y cuentas regresivas. */
export function useAhora(cadaMs = 1000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), cadaMs);
    return () => window.clearInterval(id);
  }, [cadaMs]);
  return ahora;
}
