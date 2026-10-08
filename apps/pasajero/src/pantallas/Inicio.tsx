import {
  Boton,
  Icono,
  Logo,
  api,
  avisar,
  mensajeDe,
  primerNombre,
  saludo,
  vibrar,
} from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mapa } from '../componentes/Mapa.tsx';
import { usePedido } from '../estado/pedido.ts';
import { usePerfil } from '../lib/consultas.ts';
import { fechaReserva } from '../lib/fechas.ts';
import { useReservas } from './Reservas.tsx';
import { fijarOrigenDesdeGps } from '../servicios/origen.ts';
import { useUbicacion } from '../servicios/ubicacion.ts';

interface Reciente {
  direccion: string;
  lat: number;
  lng: number;
}

export function Inicio() {
  const navegar = useNavigate();
  const { data: perfil } = usePerfil();
  const proxima = useReservas().data?.[0];
  const origen = usePedido((s) => s.origen);
  const ponerDestino = usePedido((s) => s.ponerDestino);
  const estadoUbicacion = useUbicacion((s) => s.estado);
  const yo = useUbicacion((s) => s.posicion);

  const { data: recientes } = useQuery({
    queryKey: ['recientes'],
    queryFn: async () =>
      (await api.get<{ recientes: Reciente[] }>('/v1/pasajero/lugares/buscar?q=')).recientes,
    staleTime: 60_000,
  });

  // Si ya había dado el permiso antes, el navegador no vuelve a preguntar: se fija el origen sin molestarlo.
  useEffect(() => {
    if (estadoUbicacion === 'sin_pedir' && !origen && 'permissions' in navigator) {
      void navigator.permissions
        ?.query({ name: 'geolocation' })
        .then((p) => {
          if (p.state === 'granted') void fijarOrigenDesdeGps().catch(() => undefined);
        })
        .catch(() => undefined);
    }
  }, [estadoUbicacion, origen]);

  const casa = perfil?.lugares.find((l) => l.etiqueta.toLowerCase() === 'casa');
  const trabajo = perfil?.lugares.find((l) => l.etiqueta.toLowerCase() === 'trabajo');

  const irA = (l: { direccion: string; lat: number; lng: number }) => {
    vibrar('toque');
    ponerDestino({
      lat: l.lat,
      lng: l.lng,
      direccion: l.direccion,
      titulo: l.direccion.split(',')[0] ?? l.direccion,
    });
    void navegar('/cotizar');
  };

  const pedirUbicacion = async () => {
    try {
      const ok = await fijarOrigenDesdeGps();
      if (!ok) avisar('No pudimos ubicarte. Escribe dónde estás.', 'info');
      if (!ok) void navegar('/destino?campo=origen');
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col pb-24">
      <div className="relative h-[46dvh] min-h-72">
        <Mapa origen={origen} yo={yo && origen ? yo : null} reservaInferior={70} minSpanM={900} />
        <header className="area-segura-arriba absolute inset-x-0 top-0 flex items-center gap-3 px-5">
          <span className="grid size-11 place-items-center rounded-full bg-fondo/85 shadow-lg backdrop-blur">
            <Logo variante="marca" tamano={32} />
          </span>
          <div className="min-w-0 flex-1 rounded-2xl bg-fondo/85 px-4 py-2 shadow-lg backdrop-blur">
            <p className="truncate text-xs font-bold text-suave">{saludo()}</p>
            <p className="truncate text-lg font-black leading-tight">
              {primerNombre(perfil?.usuario.nombre ?? '')} 👋
            </p>
          </div>
        </header>
      </div>

      <motion.section
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24 }}
        className="relative -mt-8 flex-1 space-y-4 rounded-t-[2rem] border border-b-0 border-borde bg-fondo px-5 pb-6 pt-5 shadow-[0_-12px_40px_rgb(0_0_0/0.25)]"
      >
        {!origen ? (
          <div className="space-y-3 rounded-tarjeta border border-ty/40 bg-ty/10 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ty text-sobre-ty">
                <Icono nombre="pin" />
              </span>
              <div>
                <p className="text-lg font-black">¿Dónde te recogemos?</p>
                <p className="text-sm text-suave">
                  Usamos tu ubicación solo para saber dónde estás y mostrarte conductores cerca.
                  Puedes escribirla tú si prefieres.
                </p>
              </div>
            </div>
            <Boton
              id="usar-ubicacion"
              icono="navegar"
              cargando={estadoUbicacion === 'buscando'}
              alPulsar={() => void pedirUbicacion()}
            >
              Usar mi ubicación
            </Boton>
            <button
              type="button"
              className="min-h-11 w-full text-base font-extrabold text-ty"
              onClick={() => void navegar('/destino?campo=origen')}
            >
              Escribir mi dirección
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void navegar('/destino?campo=origen')}
              className="flex w-full items-center gap-3 text-left"
              aria-label="Cambiar punto de recogida"
            >
              <span className="grid size-8 place-items-center rounded-full bg-ty/20">
                <span className="size-3.5 rounded-full bg-ty" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-extrabold uppercase tracking-wide text-suave">
                  Te recogemos en
                </span>
                <span className="block truncate text-base font-extrabold" id="origen-actual">
                  {origen.titulo}
                </span>
              </span>
              <span className="text-sm font-extrabold text-ty">Cambiar</span>
            </button>

            <button
              id="a-donde-vas"
              type="button"
              onClick={() => {
                vibrar('toque');
                void navegar('/destino');
              }}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-superficie-2 px-4 text-left shadow-inner"
            >
              <Icono nombre="buscar" className="text-ty" />
              <span className="text-xl font-extrabold">¿A dónde vas?</span>
            </button>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { etiqueta: 'Casa', lugar: casa, icono: 'inicio' as const },
            { etiqueta: 'Trabajo', lugar: trabajo, icono: 'maletin' as const },
          ].map(({ etiqueta, lugar, icono }) => (
            <button
              key={etiqueta}
              type="button"
              disabled={!origen && !!lugar}
              onClick={() =>
                lugar ? irA(lugar) : void navegar(`/destino?campo=${etiqueta.toLowerCase()}`)
              }
              className="flex min-h-16 items-center gap-3 rounded-2xl border border-borde bg-superficie px-4 text-left disabled:opacity-50"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-ty/15 text-ty">
                <Icono nombre={icono} tamano={20} />
              </span>
              <span className="min-w-0">
                <span className="block font-extrabold">{etiqueta}</span>
                <span className="block truncate text-xs text-suave">
                  {lugar ? lugar.direccion.split(',')[0] : 'Agregar'}
                </span>
              </span>
            </button>
          ))}
        </div>

        {recientes && recientes.length > 0 && origen && (
          <div>
            <p className="mb-2 text-sm font-extrabold text-suave">Recientes</p>
            <ul className="divide-y divide-borde rounded-tarjeta border border-borde bg-superficie">
              {recientes.slice(0, 3).map((r) => (
                <li key={r.direccion}>
                  <button
                    type="button"
                    onClick={() => irA(r)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
                  >
                    <Icono nombre="reloj" className="text-suave" tamano={20} />
                    <span className="min-w-0 flex-1 truncate font-bold">{r.direccion}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          to="/reservas"
          id="mis-reservas"
          className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-4"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ty/15 text-ty">
            <Icono nombre="reloj" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-black">Mis reservas</span>
            <span className="block text-sm text-suave">
              {proxima
                ? `Próxima: ${fechaReserva(proxima.programadoPara)}`
                : 'Programa un viaje con hasta 7 días de anticipación'}
            </span>
          </span>
          <Icono nombre="derecha" className="shrink-0 text-suave" />
        </Link>

        <Link
          to="/ciudades"
          className="flex items-center gap-3 rounded-tarjeta border border-borde bg-gradient-to-r from-ty/15 to-transparent p-4"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ty text-sobre-ty">
            <Icono nombre="navegar" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-black">Viaja a otra ciudad</span>
            <span className="block text-sm text-suave">
              Pereira, Armenia, Medellín, Bogotá… con precio cerrado
            </span>
          </span>
          <Icono nombre="derecha" className="shrink-0 text-suave" />
        </Link>
      </motion.section>
    </div>
  );
}
