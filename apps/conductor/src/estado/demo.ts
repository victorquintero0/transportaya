import { create } from 'zustand';

/**
 * Solo en modo demostración: el PIN del pasajero de mentira. En la vida real el pasajero lo ve en su app y se lo
 * dice al conductor; aquí se guarda para poder completar la prueba sin otro teléfono.
 */
interface Demo {
  pines: Record<string, string>;
  guardarPin: (viajeId: string, pin: string) => void;
}

export const useDemo = create<Demo>((set) => ({
  pines: {},
  guardarPin: (viajeId, pin) => set((s) => ({ pines: { ...s.pines, [viajeId]: pin } })),
}));
