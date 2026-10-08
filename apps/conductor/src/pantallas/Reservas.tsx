import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import {
  Boton,
  Chip,
  Hoja,
  Icono,
  Tarjeta,
  api,
  avisar,
  distancia,
  hora,
  mensajeDe,
  pesos,
  vibrar,
} from '@transportaya/ui';
import type { MiReserva, ReservaTablero } from '../lib/tipos.ts';

const ZONA = 'America/Bogota';
const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ZONA });

/** "Hoy · 3:45 p. m." · "Mañana · 8:10 a. m." · "vie 9 oct · 3:45 p. m." */
export function cuando(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  if (dia(d) === dia(ahora)) return `Hoy · ${hora(iso)}`;
  if (dia(d) === dia(new Date(ahora.getTime() + 86_400_000))) return `Mañana · ${hora(iso)}`;
  const corto = d
    .toLocaleDateString('es-CO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: ZONA,
    })
    .replace(/\./g, '');
  return `${corto} · ${hora(iso)}`;
}

export function useReservas() {
  return useQuery({
    queryKey: ['reservas'],
    queryFn: () =>
      api.get<{ disponibles: ReservaTablero[]; mias: MiReserva[] }>('/v1/conductor/reservas'),
    refetchInterval: 30_000,
  });
}

/** Tablero de reservas: las que puedo tomar y las que ya tomé (RN-080 a RN-085). */
export function Reservas() {
  const qc = useQueryClient();
  const { data, isPending } = useReservas();
  const [detalle, setDetalle] = useState<ReservaTablero | MiReserva | null>(null);

  const accion = useMutation({
    mutationFn: ({ id, tipo }: { id: string; tipo: 'tomar' | 'confirmar' | 'soltar' }) =>
      api.post(`/v1/conductor/reservas/${id}/${tipo}`),
    onSuccess: (_r, { tipo }) => {
      vibrar('exito');
      avisar(
        tipo === 'tomar'
          ? 'Reserva tomada. Confírmala para dejarla segura.'
          : tipo === 'confirmar'
            ? 'Reserva confirmada. El pasajero ya sabe que vas.'
            : 'Soltaste la reserva.',
        tipo === 'soltar' ? 'info' : 'exito',
      );
      setDetalle(null);
      void qc.invalidateQueries({ queryKey: ['reservas'] });
    },
    onError: (e) => {
      vibrar('alerta');
      avisar(mensajeDe(e), 'error');
      void qc.invalidateQueries({ queryKey: ['reservas'] });
    },
  });

  const mias = data?.mias ?? [];
  const disponibles = data?.disponibles ?? [];
  const miaDe = (id: string) => mias.find((m) => m.id === id) ?? null;
  const mostrada = detalle ? (miaDe(detalle.id) ?? detalle) : null;
  const esMia = mostrada ? miaDe(mostrada.id) !== null : false;
  const mi = mostrada ? miaDe(mostrada.id) : null;

  return (
    <div className="fondo-calles min-h-dvh pb-28">
      <header className="area-segura-arriba px-5">
        <h1 className="text-3xl font-black">Reservas</h1>
        <p className="text-suave">Viajes programados que puedes tomar con tiempo.</p>
      </header>

      <section className="mt-5 space-y-3 px-5" aria-label="Mis reservas">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-suave">Mis reservas</h2>
        {mias.length === 0 && !isPending && (
          <Tarjeta className="text-center text-suave" id="sin-mias">
            Aún no has tomado reservas.
          </Tarjeta>
        )}
        {mias.map((r) => (
          <FilaReserva key={r.id} r={r} mia alPulsar={() => setDetalle(r)} />
        ))}
      </section>

      <section className="mt-6 space-y-3 px-5" aria-label="Disponibles">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-suave">Disponibles</h2>
        {isPending &&
          [0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulso-suave rounded-tarjeta bg-superficie-2" />
          ))}
        {!isPending && disponibles.length === 0 && (
          <Tarjeta className="text-center text-suave" id="sin-disponibles">
            No hay reservas disponibles por ahora. Aparecen unas 24 horas antes del servicio.
          </Tarjeta>
        )}
        {disponibles.map((r) => (
          <FilaReserva key={r.id} r={r} alPulsar={() => setDetalle(r)} />
        ))}
      </section>

      <Hoja abierta={!!mostrada} alCerrar={() => setDetalle(null)} titulo="Reserva">
        {mostrada && (
          <div className="space-y-4 pb-4" data-reserva-detalle={mostrada.codigo}>
            <div className="flex items-center gap-2">
              <Icono nombre="reloj" className="text-ty" />
              <span className="text-xl font-black">{cuando(mostrada.programadoPara)}</span>
            </div>
            <Tarjeta className="space-y-2">
              <p className="text-sm font-bold text-suave">Recoges en</p>
              <p className="font-extrabold">{mostrada.recogida.direccion ?? 'Punto de recogida'}</p>
              <p className="text-sm font-bold text-suave">Va hacia</p>
              <p className="font-extrabold">
                {mostrada.destino.zona} · {distancia(mostrada.destino.distanciaViajeM)}
              </p>
            </Tarjeta>
            <div className="grid grid-cols-2 gap-3 text-center">
              <Tarjeta>
                <p className="text-xs font-bold text-suave">Precio</p>
                <p className="numeros font-black">
                  {pesos(mostrada.precioEstimado.min)} – {pesos(mostrada.precioEstimado.max)}
                </p>
              </Tarjeta>
              <Tarjeta>
                <p className="text-xs font-bold text-suave">Tu ganancia aprox.</p>
                <p className="numeros font-black text-ty">{pesos(mostrada.gananciaEstimada)}</p>
              </Tarjeta>
            </div>
            <p className="text-sm text-suave">
              {mostrada.pasajero.nombre}
              {mostrada.pasajero.calificacion !== null
                ? ` · ★ ${mostrada.pasajero.calificacion}`
                : ''}{' '}
              · {mostrada.metodoPago === 'efectivo' ? 'Paga en efectivo' : 'Pago electrónico'}
            </p>
            {!esMia && (
              <Boton
                id="tomar-reserva"
                tamano="grande"
                icono="ok"
                cargando={accion.isPending}
                alPulsar={() => accion.mutate({ id: mostrada.id, tipo: 'tomar' })}
              >
                Tomar reserva
              </Boton>
            )}
            {mi && mi.estado === 'tomada' && (
              <>
                {mi.confirmarAntesDe && (
                  <p className="rounded-xl bg-sol/10 px-4 py-3 text-sm font-bold text-sol">
                    Confírmala antes de las {hora(mi.confirmarAntesDe)} o vuelve al tablero.
                  </p>
                )}
                <Boton
                  id="confirmar-reserva"
                  tamano="grande"
                  icono="ok"
                  cargando={accion.isPending}
                  alPulsar={() => accion.mutate({ id: mi.id, tipo: 'confirmar' })}
                >
                  Confirmar que voy
                </Boton>
              </>
            )}
            {mi && mi.estado === 'confirmada' && (
              <p className="rounded-xl bg-ty/10 px-4 py-3 text-sm font-bold text-ty">
                Confirmada. Te la asignamos 30 minutos antes; ten la app en línea.
              </p>
            )}
            {mi && mi.puedeSoltar && (
              <Boton
                id="soltar-reserva"
                variante="secundario"
                cargando={accion.isPending}
                alPulsar={() => accion.mutate({ id: mi.id, tipo: 'soltar' })}
              >
                Soltar reserva
              </Boton>
            )}
          </div>
        )}
      </Hoja>
    </div>
  );
}

function FilaReserva({
  r,
  mia = false,
  alPulsar,
}: {
  r: ReservaTablero | MiReserva;
  mia?: boolean;
  alPulsar: () => void;
}) {
  const estado = mia ? (r as MiReserva).estado : null;
  return (
    <motion.button
      type="button"
      layout
      data-reserva={r.codigo}
      onClick={alPulsar}
      className="block w-full space-y-1.5 rounded-tarjeta border border-borde bg-superficie p-4 text-left"
    >
      <span className="flex items-center gap-2">
        <span className="flex-1 text-lg font-black">{cuando(r.programadoPara)}</span>
        {estado === 'tomada' && <Chip tono="aviso">Por confirmar</Chip>}
        {estado === 'confirmada' && <Chip tono="ok">Confirmada</Chip>}
        {estado === 'buscando' && <Chip tono="info">En curso de asignar</Chip>}
      </span>
      <span className="block truncate font-extrabold">
        {(r.recogida.direccion ?? 'Recogida').split(',')[0]} → {r.destino.zona}
      </span>
      <span className="flex items-center justify-between text-sm font-bold text-suave">
        <span>{distancia(r.destino.distanciaViajeM)}</span>
        <span className="numeros text-ty">≈ {pesos(r.gananciaEstimada)} para ti</span>
      </span>
    </motion.button>
  );
}
