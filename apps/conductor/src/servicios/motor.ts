import type { QueryClient } from '@tanstack/react-query';
import { useAjustes } from '../estado/ajustes.ts';
import { avisar } from '@transportaya/ui';
import { useChat } from '../estado/chat.ts';
import { useJornada } from '../estado/jornada.ts';
import { api } from '@transportaya/ui';
import { alerta, desbloquearAudio, ding, iniciarTimbreOferta } from '@transportaya/ui';
import { mantenerPantallaEncendida } from '../lib/pantalla-activa.ts';
import type { Oferta, Perfil, ViajeActual } from '../lib/tipos.ts';
import { vibrar } from '@transportaya/ui';
import { detenerEnvio, iniciarEnvio, ponerEnViaje } from './envio-ubicaciones.ts';
import { apagarGps, encenderGps, simuladorActivo, useUbicacion } from './gps.ts';
import { conectarEnVivo, desconectarEnVivo } from './tiempo-real.ts';
import { descartarTaximetro, iniciarTaximetro } from './taximetro-vivo.ts';

/**
 * El "motor" de la jornada: mientras el conductor está en línea mantiene vivos el canal en tiempo real, el GPS,
 * el envío de posiciones y el taxímetro, y traduce los avisos del servidor en cambios de pantalla.
 */

let detenerTimbre: (() => void) | null = null;

function silenciarTimbre(): void {
  detenerTimbre?.();
  detenerTimbre = null;
}

export async function cargarPerfil(qc: QueryClient): Promise<Perfil> {
  return qc.fetchQuery({
    queryKey: ['perfil'],
    queryFn: () => api.get<Perfil>('/v1/conductor/yo'),
    staleTime: 0,
  });
}

/** Pone la oferta (si hay) y el viaje (si hay) tal como los tiene el servidor. */
export async function sincronizar(qc: QueryClient): Promise<void> {
  const [, o, v] = await Promise.all([
    cargarPerfil(qc),
    api.get<{ oferta: Oferta | null }>('/v1/conductor/oferta-actual'),
    api.get<{ viaje: ViajeActual | null }>('/v1/conductor/viaje-actual'),
  ]);
  aplicarOferta(o.oferta);
  aplicarViaje(v.viaje);
}

function aplicarOferta(o: Oferta | null): void {
  const actual = useJornada.getState().oferta;
  if (o && actual?.ofertaId !== o.ofertaId) {
    silenciarTimbre();
    detenerTimbre = iniciarTimbreOferta();
    vibrar('oferta');
  }
  if (!o) silenciarTimbre();
  useJornada.getState().ponerOferta(o);
}

function aplicarViaje(v: ViajeActual | null): void {
  const previo = useJornada.getState().viaje;
  useJornada.getState().ponerViaje(v);
  ponerEnViaje(v !== null);
  if (v?.estado === 'en_curso' && v.tiempos.iniciadoEn) {
    iniciarTaximetro(v.id, Date.parse(v.tiempos.iniciadoEn));
  } else if (previo && previo.id !== v?.id) {
    descartarTaximetro(previo.id);
  }
  dirigirGpsSimulado(v);
}

/** El GPS simulado va a la recogida y luego al destino, como lo haría el conductor. */
function dirigirGpsSimulado(v: ViajeActual | null): void {
  const sim = simuladorActivo();
  if (!sim) return;
  if (!v) sim.irA(null);
  else if (v.estado === 'asignado') sim.irA(v.recogida);
  else if (v.estado === 'en_sitio') sim.irA(null);
  else sim.irA(v.destino, true);
}

export async function refrescarViaje(qc: QueryClient): Promise<ViajeActual | null> {
  const { viaje } = await api.get<{ viaje: ViajeActual | null }>('/v1/conductor/viaje-actual');
  aplicarViaje(viaje);
  await qc.invalidateQueries({ queryKey: ['perfil'] });
  return viaje;
}

/** Cuando una acción del conductor devuelve el viaje actualizado (aceptar, llegué, iniciar). */
export function tomarViaje(qc: QueryClient, v: ViajeActual | null): void {
  silenciarTimbre();
  useJornada.getState().ponerOferta(null);
  aplicarViaje(v);
  void qc.invalidateQueries({ queryKey: ['perfil'] });
}

export function quitarOferta(): void {
  silenciarTimbre();
  useJornada.getState().ponerOferta(null);
}

/** Lo que cambia en la pantalla cuando el conductor se conecta o se desconecta. */
export function alCambiarEnLinea(enLinea: boolean): void {
  if (enLinea) {
    desbloquearAudio();
    encenderGps();
    iniciarEnvio();
    mantenerPantallaEncendida(true);
  } else {
    apagarGps();
    void detenerEnvio();
    mantenerPantallaEncendida(false);
    silenciarTimbre();
  }
}

export function reiniciarGps(): void {
  encenderGps();
}

let detenerMotor: (() => void) | null = null;

export function iniciarMotor(qc: QueryClient): () => void {
  detenerMotor?.();

  conectarEnVivo({
    alCambiarConexion: (conectado) => {
      useJornada.getState().ponerEnVivo(conectado);
      if (conectado) void sincronizar(qc).catch(() => undefined); // al reconectar se recupera lo que pasó mientras tanto
    },
    'oferta:nueva': (o) => {
      aplicarOferta(o);
      void qc.invalidateQueries({ queryKey: ['perfil'] });
    },
    'oferta:retirada': (d) => {
      const actual = useJornada.getState().oferta;
      if (actual?.ofertaId !== d.ofertaId) return;
      quitarOferta();
      if (d.motivo === 'cancelada') avisar('El pasajero canceló la solicitud', 'info');
      else if (d.motivo === 'tomada') avisar('Otro conductor tomó este viaje', 'info');
      else avisar('Se acabó el tiempo para responder', 'info');
      void qc.invalidateQueries({ queryKey: ['perfil'] });
    },
    'viaje:estado': (d) => {
      const antes = useJornada.getState().viaje;
      if (d.estado === 'cancelado' && antes?.id === d.viajeId) {
        alerta();
        vibrar('alerta');
        avisar('El pasajero canceló el viaje', 'error');
      }
      void refrescarViaje(qc);
    },
    'viaje:mensaje': (m) => {
      const abierto = useChat.getState().abierto;
      useChat.getState().llego(m);
      if (m.deQuien === 'pasajero' && !abierto) {
        ding();
        vibrar('oferta');
        avisar(`Pasajero: ${m.cuerpo}`, 'info');
      }
    },
    'conductor:estado': (d) => {
      void qc.invalidateQueries({ queryKey: ['perfil'] });
      if (d.estadoOperativo === 'desconectado') {
        alCambiarEnLinea(false);
        if (d.motivo) avisar(d.motivo, 'info');
      }
    },
  });

  const alVolverVisible = () => {
    if (document.visibilityState === 'visible') void sincronizar(qc).catch(() => undefined);
  };
  document.addEventListener('visibilitychange', alVolverVisible);

  // si cambian los ajustes del GPS simulado, se reinicia el GPS
  const quitarAjustes = useAjustes.subscribe((nuevo, previo) => {
    if (nuevo.gpsSimulado !== previo.gpsSimulado && useUbicacion.getState().estado !== 'apagado')
      encenderGps();
    if (nuevo.velocidadSimulada !== previo.velocidadSimulada)
      simuladorActivo()?.ponerMultiplicador(nuevo.velocidadSimulada);
  });

  void sincronizar(qc)
    .then(() => {
      const op = qc.getQueryData<Perfil>(['perfil'])?.conductor.estadoOperativo;
      if (op && op !== 'desconectado') alCambiarEnLinea(true);
    })
    .catch(() => undefined);

  detenerMotor = () => {
    document.removeEventListener('visibilitychange', alVolverVisible);
    quitarAjustes();
    desconectarEnVivo();
    silenciarTimbre();
    alCambiarEnLinea(false);
    useJornada.getState().reiniciar();
    detenerMotor = null;
  };
  return detenerMotor;
}
