import { Chip, Icono, api, pesos } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fechaCorta } from '../lib/fechas.ts';
import type { ViajeHistorial } from '../lib/tipos.ts';

type Filtro = 'todos' | 'finalizado' | 'cancelado';

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'finalizado', texto: 'Terminados' },
  { id: 'cancelado', texto: 'Cancelados' },
];

/** Historial de viajes con filtros (PAS-44). */
export function Viajes() {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const { data, isPending } = useQuery({
    queryKey: ['historial', filtro],
    queryFn: async () =>
      (
        await api.get<{ viajes: ViajeHistorial[] }>(
          `/v1/pasajero/viajes?limite=40${filtro === 'todos' ? '' : `&estado=${filtro}`}`,
        )
      ).viajes,
  });

  return (
    <div className="fondo-calles min-h-dvh pb-28">
      <header className="area-segura-arriba px-5">
        <h1 className="text-3xl font-black">Mis viajes</h1>
      </header>
      <div className="mt-4 flex gap-2 px-5" role="tablist" aria-label="Filtrar viajes">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`min-h-11 rounded-full px-5 text-base font-extrabold ${filtro === f.id ? 'bg-ty text-sobre-ty' : 'bg-superficie-2 text-suave'}`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      <section className="mt-4 space-y-3 px-5">
        {isPending &&
          [0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulso-suave rounded-tarjeta bg-superficie-2" />
          ))}
        {data?.length === 0 && (
          <div className="grid place-items-center gap-3 py-20 text-center text-suave">
            <span className="grid size-20 place-items-center rounded-full bg-superficie-2">
              <Icono nombre="carro" tamano={40} />
            </span>
            <p className="text-xl font-black text-texto">Aún no tienes viajes</p>
            <p className="max-w-xs">
              Cuando viajes con TransporteYa, aquí vas a ver cada recorrido, su recibo y tu
              calificación.
            </p>
          </div>
        )}
        {data?.map((v, i) => {
          const terminado = v.estado === 'finalizado';
          return (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04 }}
            >
              <Link
                to={`/viajes/${v.id}`}
                data-viaje={v.codigo}
                className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-4"
              >
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-2xl ${terminado ? 'bg-ty/15 text-ty' : 'bg-superficie-2 text-suave'}`}
                >
                  <Icono nombre={terminado ? 'carro' : 'cerrar'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-black">
                    {(v.destino ?? 'Viaje').split(',')[0]}
                  </span>
                  <span className="block text-sm font-bold text-suave">{fechaCorta(v.fecha)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {v.tipoServicio === 'intermunicipal' && <Chip tono="info">Tarifa fija</Chip>}
                    {v.estado === 'sin_conductor' && <Chip tono="aviso">Sin conductor</Chip>}
                    {v.estado === 'cancelado' && (
                      <Chip>
                        {v.canceladoPor === 'conductor' ? 'Lo canceló el conductor' : 'Cancelado'}
                      </Chip>
                    )}
                    {v.calificacion !== null && (
                      <span className="flex items-center gap-0.5 text-sm font-bold text-sol">
                        <Icono nombre="estrella" tamano={14} relleno /> {v.calificacion}
                      </span>
                    )}
                  </span>
                </span>
                <span className="numeros text-right text-lg font-black">
                  {v.precioFinal ? pesos(v.precioFinal + v.propina) : '—'}
                </span>
              </Link>
            </motion.div>
          );
        })}
      </section>
    </div>
  );
}
