import {
  Boton,
  Chip,
  Hoja,
  Icono,
  PantallaCargando,
  api,
  avisar,
  duracion,
  mensajeDe,
  pesos,
} from '@transportaya/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mapa } from '../componentes/Mapa.tsx';
import { Placa } from '../componentes/Placa.tsx';
import { ReciboHoja } from '../componentes/ReciboHoja.tsx';
import { ReporteHoja } from '../componentes/ReporteHoja.tsx';
import { usePedido } from '../estado/pedido.ts';
import { fechaCorta, fechaReserva } from '../lib/fechas.ts';
import type { Viaje } from '../lib/tipos.ts';

const ESTADOS: Record<string, { texto: string; tono: 'ok' | 'aviso' | 'malo' | 'neutro' }> = {
  finalizado: { texto: 'Terminado', tono: 'ok' },
  cancelado: { texto: 'Cancelado', tono: 'neutro' },
  sin_conductor: { texto: 'Sin conductor', tono: 'aviso' },
  programado: { texto: 'Reservado', tono: 'ok' },
};

/** Detalle de un viaje pasado: recorrido, conductor, recibo y ayuda (PAS-40, PAS-50). */
export function ViajeDetalle() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const [recibo, setRecibo] = useState(false);
  const [reporte, setReporte] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const qc = useQueryClient();
  const { data: v } = useQuery({
    queryKey: ['viaje', id],
    queryFn: () => api.get<Viaje>(`/v1/pasajero/viajes/${id}`),
  });

  const cancelar = useMutation({
    mutationFn: () => api.post<{ costo: number }>(`/v1/pasajero/viajes/${id}/cancelar`),
    onSuccess: async (r) => {
      avisar(
        r.costo > 0
          ? `Cancelaste la reserva. Se cobró ${pesos(r.costo)}.`
          : 'Cancelaste la reserva sin costo',
        'info',
      );
      setCancelando(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['viaje', id] }),
        qc.invalidateQueries({ queryKey: ['reservas'] }),
        qc.invalidateQueries({ queryKey: ['perfil'] }),
      ]);
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  if (!v) return <PantallaCargando />;
  const estado = ESTADOS[v.estado] ?? { texto: v.estado, tono: 'neutro' as const };
  const c = v.conductor;
  const reserva = v.estado === 'programado';

  return (
    <div className="flex min-h-dvh flex-col bg-fondo pb-8">
      <div className="relative h-[32dvh] min-h-52">
        <Mapa
          origen={v.origen}
          destino={v.destino}
          ruta={{ desde: v.origen, hasta: v.destino }}
          etiquetaDestino={(v.destino.direccion ?? '').split(',')[0]}
          reservaInferior={30}
          reservaSuperior={50}
        />
        <button
          type="button"
          aria-label="Volver"
          onClick={() => void navegar(-1)}
          className="area-segura-arriba absolute left-4 top-0 mt-2 grid size-11 place-items-center rounded-full bg-fondo/90 shadow-lg backdrop-blur"
        >
          <Icono nombre="izquierda" />
        </button>
      </div>

      <section className="relative -mt-6 space-y-4 rounded-t-[2rem] border border-b-0 border-borde bg-fondo px-5 pt-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-black">
              {(v.destino.direccion ?? 'Viaje').split(',')[0]}
            </h1>
            <p className="text-sm font-bold text-suave">
              {reserva && v.programadoPara
                ? fechaReserva(v.programadoPara)
                : fechaCorta(
                    v.tiempos.finalizadoEn ?? v.tiempos.canceladoEn ?? v.tiempos.solicitadoEn,
                  )}{' '}
              · {v.codigo}
            </p>
          </div>
          <Chip tono={estado.tono}>{estado.texto}</Chip>
        </div>

        {reserva && v.reserva && (
          <p
            id="estado-reserva"
            className="rounded-xl bg-ty/10 px-4 py-3 font-bold text-ty"
            data-conductor-confirmado={v.reserva.conductorConfirmado}
          >
            {v.reserva.conductorConfirmado
              ? 'Tu conductor ya confirmó esta reserva.'
              : 'Todavía no hay conductor confirmado. Si no lo hay, lo buscamos 30 minutos antes de la hora.'}
          </p>
        )}

        <div className="flex items-center justify-between rounded-tarjeta border border-borde bg-superficie p-4">
          <div>
            <p className="text-sm font-bold text-suave">
              {reserva
                ? 'Precio estimado · cerrado'
                : v.corporativo
                  ? `Cargado a ${v.corporativo.empresa}${v.corporativo.centroCosto ? ` · ${v.corporativo.centroCosto}` : ''}`
                  : v.metodoPago === 'tarjeta'
                    ? 'Pagado con tarjeta'
                    : 'Pagado en efectivo'}
            </p>
            <p className="numeros text-3xl font-black">
              {reserva
                ? `${pesos(v.precioEstimado.min)} – ${pesos(v.precioEstimado.max)}`
                : v.precioFinal
                  ? pesos(v.precioFinal + v.propina)
                  : '—'}
            </p>
          </div>
          {v.calificacion !== null && (
            <span className="flex items-center gap-1 text-lg font-black text-sol">
              <Icono nombre="estrella" relleno /> {v.calificacion}
            </span>
          )}
        </div>

        {v.corporativo && (
          <div
            id="cargo-empresa"
            className="flex items-center gap-3 rounded-tarjeta border border-ty/40 bg-ty/5 p-4"
          >
            <Icono nombre="maletin" className="shrink-0 text-ty" />
            <p className="text-sm font-bold">
              Cargado a {v.corporativo.empresa}
              {v.corporativo.centroCosto ? ` · ${v.corporativo.centroCosto}` : ''}
              {v.corporativo.motivo ? ` · ${v.corporativo.motivo}` : ''}
            </p>
          </div>
        )}

        {c && (
          <div className="flex items-center gap-4 rounded-tarjeta border border-borde bg-superficie p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ty text-xl font-black text-sobre-ty">
              {c.nombre.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-black">{c.nombre}</p>
              <p className="truncate text-sm font-bold text-suave">
                {c.vehiculo.marca} {c.vehiculo.linea}
              </p>
            </div>
            <Placa placa={c.vehiculo.placa} />
          </div>
        )}

        {v.estado === 'finalizado' && (
          <p className="text-sm font-bold text-suave">
            {v.tiempos.iniciadoEn && v.tiempos.finalizadoEn
              ? `${duracion((Date.parse(v.tiempos.finalizadoEn) - Date.parse(v.tiempos.iniciadoEn)) / 1000)} de recorrido`
              : ''}
          </p>
        )}

        <div className="space-y-2.5">
          {v.precioFinal !== null && (
            <Boton
              id="abrir-recibo"
              variante="secundario"
              icono="archivo"
              alPulsar={() => setRecibo(true)}
            >
              Ver recibo
            </Boton>
          )}
          {reserva && (
            <Boton
              id="cancelar-reserva"
              variante="peligro"
              icono="cerrar"
              alPulsar={() => setCancelando(true)}
            >
              Cancelar reserva
            </Boton>
          )}
          {v.estado === 'finalizado' && (
            <Boton
              id="pedir-de-nuevo"
              icono="rayo"
              alPulsar={() => {
                const p = usePedido.getState();
                p.ponerDestino({
                  lat: v.destino.lat,
                  lng: v.destino.lng,
                  direccion: v.destino.direccion ?? '',
                  titulo: (v.destino.direccion ?? '').split(',')[0] ?? '',
                });
                void navegar('/cotizar');
              }}
            >
              Pedir de nuevo a este destino
            </Boton>
          )}
          <Boton
            id="reportar-problema"
            variante="fantasma"
            icono="ayuda"
            alPulsar={() => setReporte(true)}
          >
            Reportar un problema
          </Boton>
        </div>
      </section>

      <Hoja
        abierta={cancelando}
        alCerrar={() => setCancelando(false)}
        titulo="¿Cancelar la reserva?"
      >
        <div className="space-y-4 pb-4">
          {v.cancelacion && v.cancelacion.costo > 0 ? (
            <p className="rounded-xl bg-sol/10 px-4 py-3 font-bold text-sol" id="costo-cancelar">
              Faltan menos de 60 minutos para tu reserva. Cancelar ahora cuesta{' '}
              {pesos(v.cancelacion.costo)}.
            </p>
          ) : (
            <p className="rounded-xl bg-ty/10 px-4 py-3 font-bold text-ty" id="costo-cancelar">
              Puedes cancelar sin costo hasta 1 hora antes de la hora de la reserva.
            </p>
          )}
          <Boton
            id="confirmar-cancelar-reserva"
            variante="peligro"
            tamano="grande"
            cargando={cancelar.isPending}
            alPulsar={() => cancelar.mutate()}
          >
            Sí, cancelar reserva
          </Boton>
          <Boton variante="secundario" alPulsar={() => setCancelando(false)}>
            No, mantener la reserva
          </Boton>
        </div>
      </Hoja>

      <ReciboHoja viajeId={v.id} abierto={recibo} alCerrar={() => setRecibo(false)} />
      <ReporteHoja viajeId={v.id} abierto={reporte} alCerrar={() => setReporte(false)} />
    </div>
  );
}
