import { alerta, avisar, ding, tada, vibrar } from '@transportaya/ui';
import type { QueryClient } from '@tanstack/react-query';
import type { Mensaje } from '../lib/tipos.ts';
import { useSeguimiento } from '../estado/seguimiento.ts';
import { conectarEnVivo, desconectarEnVivo } from './tiempo-real.ts';

/** El chat avisa con sonido solo cuando no está abierto: así no se repite lo que la persona ya está leyendo. */
let chatAbierto = false;
export function marcarChatAbierto(abierto: boolean): void {
  chatAbierto = abierto;
  if (abierto) useSeguimiento.getState().marcarLeidos();
}

/**
 * El "motor" del pasajero: mientras hay sesión mantiene el canal en tiempo real y traduce lo que avisa el servidor
 * (conductor asignado, llegó, viaje terminado, mensajes, posición) en cambios de pantalla.
 */
export function iniciarMotor(qc: QueryClient): () => void {
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['viaje-actual'] });
    void qc.invalidateQueries({ queryKey: ['perfil'] });
  };

  conectarEnVivo({
    alCambiarConexion: (conectado) => {
      useSeguimiento.getState().ponerEnVivo(conectado);
      if (conectado) refrescar(); // al reconectar se recupera lo que pasó mientras tanto
    },
    'viaje:estado': (d) => {
      if (d.estado === 'asignado') {
        ding();
        vibrar('exito');
        avisar('¡Tu conductor va en camino!', 'exito');
      } else if (d.estado === 'en_sitio') {
        ding();
        vibrar('oferta');
        avisar('Tu conductor ya llegó 🚗', 'exito');
      } else if (d.estado === 'finalizado') {
        tada();
        vibrar('exito');
      } else if (d.estado === 'cancelado' && d.canceladoPor === 'conductor') {
        alerta();
        vibrar('alerta');
        avisar('Tu conductor canceló el viaje', 'error');
      } else if (d.estado === 'buscando_conductor' && d.reasignando) {
        alerta();
        avisar('Tu conductor no pudo llegar. Estamos buscando otro', 'info');
      } else if (d.estado === 'sin_conductor') {
        alerta();
        vibrar('alerta');
        useSeguimiento.getState().ponerSinConductor(true);
      }
      refrescar();
    },
    'viaje:ubicacion_conductor': (d) => useSeguimiento.getState().ponerPosicion(d),
    'viaje:mensaje': (m: Mensaje) => {
      useSeguimiento.getState().llegoMensaje(m, chatAbierto);
      if (m.deQuien === 'conductor' && !chatAbierto) {
        ding();
        vibrar('oferta');
        avisar(`Tu conductor: ${m.cuerpo}`, 'info');
      }
    },
  });

  const alVolverVisible = () => {
    if (document.visibilityState === 'visible') refrescar();
  };
  document.addEventListener('visibilitychange', alVolverVisible);

  return () => {
    document.removeEventListener('visibilitychange', alVolverVisible);
    desconectarEnVivo();
    useSeguimiento.getState().reiniciar();
  };
}
