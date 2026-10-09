import { Chip, Icono, api, pesos } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { fechaReserva } from '../lib/fechas.ts';
import type { Reserva } from '../lib/tipos.ts';

export const ESTADO_RESERVA: Record<
  Reserva['estadoReserva'],
  { texto: string; tono: 'ok' | 'aviso' | 'info' | 'neutro' }
> = {
  sin_conductor: { texto: 'Buscaremos conductor', tono: 'neutro' },
  tomada: { texto: 'Conductor por confirmar', tono: 'info' },
  confirmada: { texto: 'Conductor confirmado', tono: 'ok' },
  buscando: { texto: 'Buscando conductor', tono: 'aviso' },
  asignada: { texto: 'Conductor en camino', tono: 'ok' },
  en_curso: { texto: 'En curso', tono: 'ok' },
  cerrada: { texto: 'Cerrada', tono: 'neutro' },
};

export function useReservas() {
  return useQuery({
    queryKey: ['reservas'],
    queryFn: async () => (await api.get<{ reservas: Reserva[] }>('/v1/pasajero/reservas')).reservas,
    refetchInterval: 30_000,
  });
}

/** Mis reservas: los viajes que dejé programados para más tarde (RN-080 a RN-085). */
export function Reservas() {
  const navegar = useNavigate();
  const { data, isPending } = useReservas();
  return (
    <div className="fondo-calles min-h-dvh pb-28">
      <header className="area-segura-arriba flex items-center gap-3 px-5">
        <button
          type="button"
          aria-label="Volver"
          onClick={() => void navegar(-1)}
          className="grid size-11 place-items-center rounded-full bg-superficie-2"
        >
          <Icono nombre="izquierda" />
        </button>
        <h1 className="text-3xl font-black">Mis reservas</h1>
      </header>

      <section className="mt-4 space-y-3 px-5">
        {isPending &&
          [0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulso-suave rounded-tarjeta bg-superficie-2" />
          ))}
        {data?.length === 0 && (
          <div className="grid place-items-center gap-3 py-20 text-center text-suave">
            <span className="grid size-20 place-items-center rounded-full bg-superficie-2">
              <Icono nombre="reloj" tamano={40} />
            </span>
            <p className="text-xl font-black text-texto">No tienes reservas</p>
            <p className="max-w-xs">
              Elige un destino y, en «¿Cuándo?», programa tu viaje con hasta 7 días de anticipación.
              El precio queda cerrado.
            </p>
          </div>
        )}
        {data?.map((r, i) => {
          const e = ESTADO_RESERVA[r.estadoReserva];
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04 }}
            >
              <Link
                to={`/viajes/${r.id}`}
                data-reserva={r.codigo}
                className="block space-y-2 rounded-tarjeta border border-borde bg-superficie p-4"
              >
                <span className="flex items-center gap-2">
                  <Icono nombre="reloj" className="text-ty" />
                  <span className="flex-1 text-lg font-black">
                    {fechaReserva(r.programadoPara)}
                  </span>
                  <Chip tono={e.tono}>{e.texto}</Chip>
                </span>
                <span className="block truncate font-extrabold">
                  {(r.destino.direccion ?? 'Destino').split(',')[0]}
                </span>
                <span className="flex items-center justify-between text-sm font-bold text-suave">
                  <span className="truncate">Desde {(r.origen.direccion ?? '').split(',')[0]}</span>
                  <span className="numeros shrink-0 text-texto">
                    {pesos(r.precioEstimado.min)} – {pesos(r.precioEstimado.max)}
                  </span>
                </span>
              </Link>
            </motion.div>
          );
        })}
      </section>
    </div>
  );
}
