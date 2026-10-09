import { Chip, Icono, Logo, PantallaCargando } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Mapa } from '../componentes/Mapa.tsx';
import { Placa } from '../componentes/Placa.tsx';
import type { ViajeCompartido } from '../lib/tipos.ts';

const ESTADO: Record<string, { texto: string; tono: 'ok' | 'info' | 'aviso' }> = {
  buscando_conductor: { texto: 'Buscando conductor', tono: 'aviso' },
  asignado: { texto: 'El conductor va por el pasajero', tono: 'info' },
  en_sitio: { texto: 'El conductor llegó', tono: 'info' },
  en_curso: { texto: 'En viaje', tono: 'ok' },
  finalizado: { texto: 'Llegó a su destino', tono: 'ok' },
  cancelado: { texto: 'Viaje cancelado', tono: 'aviso' },
};

/** Lo que ve quien recibe el enlace de un viaje (PAS-34): sin cuenta, sin datos del pasajero. */
export function Compartido() {
  const { token = '' } = useParams();
  const { data, error } = useQuery({
    queryKey: ['compartido', token],
    queryFn: async () => {
      const r = await fetch(`/v1/compartido/${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as ViajeCompartido;
    },
    refetchInterval: 4000,
    retry: false,
  });

  if (error)
    return (
      <main className="fondo-calles grid min-h-dvh place-items-center px-8 text-center">
        <div className="max-w-sm space-y-4">
          <Logo tamano={160} className="mx-auto" />
          <h1 className="text-2xl font-black">Este enlace ya no está disponible</h1>
          <p className="text-suave">El viaje terminó o quien lo compartió dejó de compartirlo.</p>
        </div>
      </main>
    );
  if (!data) return <PantallaCargando />;

  const e = ESTADO[data.estado] ?? { texto: data.estado, tono: 'info' as const };
  const c = data.conductor;
  const enCurso = data.estado === 'en_curso';

  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <div className="relative min-h-[55dvh] flex-1">
        <Mapa
          origen={enCurso ? null : data.origen}
          destino={data.destino}
          conductor={c?.posicion ? { lat: c.posicion.lat, lng: c.posicion.lng } : null}
          ruta={
            c?.posicion ? { desde: c.posicion, hasta: enCurso ? data.destino : data.origen } : null
          }
          reservaInferior={30}
          etiquetaDestino={data.destino.zona}
        />
        <header className="area-segura-arriba absolute inset-x-0 top-0 flex items-center gap-2 px-4">
          <span className="grid size-11 place-items-center rounded-full bg-fondo/90 shadow-lg backdrop-blur">
            <Logo variante="marca" tamano={30} />
          </span>
          <span className="rounded-2xl bg-fondo/90 px-4 py-2 text-sm font-extrabold shadow-lg backdrop-blur">
            Siguiendo un viaje de TransporteYa
          </span>
        </header>
      </div>
      <section className="area-segura-abajo relative -mt-6 space-y-4 rounded-t-[2rem] border border-b-0 border-borde bg-fondo px-5 pt-6">
        <div className="flex items-center gap-3">
          <h1 className="flex-1 text-2xl font-black" id="estado-compartido">
            {e.texto}
          </h1>
          <Chip tono={e.tono}>En vivo</Chip>
        </div>
        {c && (
          <div className="flex items-center gap-4 rounded-tarjeta border border-borde bg-superficie p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ty text-xl font-black text-sobre-ty">
              {c.nombre.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-black">{c.nombre}</p>
              <p className="truncate text-sm font-bold text-suave">
                {c.vehiculo.marca} {c.vehiculo.linea} · {c.vehiculo.color}
              </p>
            </div>
            <Placa placa={c.vehiculo.placa} />
          </div>
        )}
        <div className="flex items-center gap-3 rounded-xl bg-superficie-2 px-4 py-3">
          <Icono nombre="bandera" className="text-ty" />
          <span className="flex-1 font-bold">Va hacia {data.destino.zona}</span>
          {c?.etaS != null && data.estado !== 'finalizado' && (
            <span className="numeros font-black text-ty">
              {c.etaS < 90 ? '< 1 min' : `${Math.round(c.etaS / 60)} min`}
            </span>
          )}
        </div>
        <p className="pb-2 text-center text-xs text-suave">
          Por seguridad solo mostramos el barrio de destino.{' '}
          {c?.posicion ? '' : 'Esperando la ubicación del conductor…'}
        </p>
      </section>
    </div>
  );
}
