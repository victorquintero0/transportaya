import { Chip, Icono, api, avisar, mensajeDe, vibrar, type NombreIcono } from '@transportaya/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePedido } from '../estado/pedido.ts';
import { usePerfil } from '../lib/consultas.ts';
import type { Lugar } from '../lib/tipos.ts';
import { fijarOrigenDesdeGps } from '../servicios/origen.ts';
import { useUbicacion } from '../servicios/ubicacion.ts';

type Campo = 'destino' | 'origen' | 'casa' | 'trabajo';

const ICONO_TIPO: Record<string, NombreIcono> = {
  barrio: 'pin',
  comercio: 'maletin',
  salud: 'escudo',
  educacion: 'usuario',
  transporte: 'carro',
  parque: 'sol',
  turismo: 'estrella',
  direccion: 'pin',
};

function useDebounce<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const id = window.setTimeout(() => setV(valor), ms);
    return () => window.clearTimeout(id);
  }, [valor, ms]);
  return v;
}

/** Búsqueda de destino (PAS-21): lugares conocidos, direcciones al estilo colombiano y recientes. */
export function BuscarDestino() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const campo = (
    ['origen', 'casa', 'trabajo'].includes(params.get('campo') ?? '')
      ? params.get('campo')
      : 'destino'
  ) as Campo;
  const { data: perfil } = usePerfil();
  const [texto, setTexto] = useState('');
  const q = useDebounce(texto.trim(), 220);
  const entrada = useRef<HTMLInputElement>(null);
  const yo = useUbicacion((s) => s.posicion);
  const origen = usePedido((s) => s.origen);
  const { ponerOrigen, ponerDestino } = usePedido.getState();

  useEffect(() => {
    entrada.current?.focus();
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['buscar', q, yo?.lat, yo?.lng],
    queryFn: () =>
      api.get<{
        resultados: Lugar[];
        recientes: { direccion: string; lat: number; lng: number }[];
      }>(
        `/v1/pasajero/lugares/buscar?q=${encodeURIComponent(q)}${yo ? `&lat=${yo.lat}&lng=${yo.lng}` : ''}`,
      ),
    staleTime: 30_000,
    placeholderData: (previo) => previo,
  });

  const guardar = useMutation({
    mutationFn: (l: Lugar) =>
      api.post('/v1/pasajero/lugares-guardados', {
        etiqueta: campo === 'casa' ? 'Casa' : 'Trabajo',
        direccion: l.direccion,
        lat: l.lat,
        lng: l.lng,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['perfil'] });
      avisar(`${campo === 'casa' ? 'Casa' : 'Trabajo'} guardado`, 'exito');
      void navegar(-1);
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  const elegir = (l: { direccion: string; lat: number; lng: number; titulo?: string }) => {
    vibrar('toque');
    const punto = {
      lat: l.lat,
      lng: l.lng,
      direccion: l.direccion,
      titulo: l.titulo ?? l.direccion.split(',')[0] ?? l.direccion,
    };
    if (campo === 'origen') {
      ponerOrigen(punto);
      void navegar(-1);
    } else if (campo === 'destino') {
      ponerDestino(punto);
      void navegar('/cotizar', { replace: true });
    } else {
      guardar.mutate({
        ...punto,
        id: '',
        subtitulo: '',
        barrio: '',
        tipo: 'direccion',
        aproximada: false,
      });
    }
  };

  const titulo = {
    destino: '¿A dónde vas?',
    origen: '¿Dónde te recogemos?',
    casa: 'Dirección de tu casa',
    trabajo: 'Dirección de tu trabajo',
  }[campo];
  const vacio = q.length < 2;
  const guardados = (perfil?.lugares ?? []).filter(
    (l) => !['casa', 'trabajo'].includes(l.etiqueta.toLowerCase()) || campo === 'destino',
  );

  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <header className="area-segura-arriba border-b border-borde px-4 pb-3">
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            aria-label="Volver"
            onClick={() => void navegar(-1)}
            className="grid size-11 place-items-center rounded-full"
          >
            <Icono nombre="izquierda" />
          </button>
          <h1 className="text-xl font-black">{titulo}</h1>
        </div>
        {campo === 'destino' && origen && (
          <p className="ml-1 mt-1 flex items-center gap-2 truncate text-sm text-suave">
            <span className="size-2.5 shrink-0 rounded-full bg-ty" /> Desde {origen.titulo}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-borde bg-superficie px-4 focus-within:border-ty">
          <Icono nombre="buscar" className="text-suave" tamano={22} />
          <input
            ref={entrada}
            id="campo-busqueda"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Lugar o dirección: Cra 23 # 62-14"
            aria-label="Buscar lugar o dirección"
            autoComplete="off"
            className="min-h-14 w-full bg-transparent text-lg font-bold outline-none placeholder:font-semibold placeholder:text-borde"
          />
          {isFetching && (
            <span className="size-5 animate-spin rounded-full border-2 border-ty border-t-transparent" />
          )}
        </div>
      </header>

      <main className="flex-1 px-4 pb-10 pt-3">
        {campo === 'origen' && vacio && (
          <button
            type="button"
            id="mi-ubicacion"
            onClick={async () => {
              const ok = await fijarOrigenDesdeGps().catch(() => false);
              if (ok) void navegar(-1);
              else avisar('No pudimos ubicarte. Escribe tu dirección.', 'info');
            }}
            className="mb-2 flex min-h-16 w-full items-center gap-3 rounded-2xl bg-ty/10 px-4 text-left"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-ty text-sobre-ty">
              <Icono nombre="navegar" tamano={20} />
            </span>
            <span className="font-extrabold">Usar mi ubicación actual</span>
          </button>
        )}

        {vacio ? (
          <div className="space-y-4">
            {guardados.length > 0 && (
              <Lista titulo="Tus lugares">
                {guardados.map((l) => (
                  <Fila
                    key={l.id}
                    icono={l.etiqueta.toLowerCase() === 'casa' ? 'inicio' : 'estrella'}
                    principal={l.etiqueta}
                    secundario={l.direccion}
                    alPulsar={() => elegir(l)}
                  />
                ))}
              </Lista>
            )}
            {campo === 'destino' && (data?.recientes.length ?? 0) > 0 && (
              <Lista titulo="Recientes">
                {data!.recientes.map((r) => (
                  <Fila
                    key={r.direccion}
                    icono="reloj"
                    principal={r.direccion.split(',')[0] ?? r.direccion}
                    secundario={r.direccion.split(',').slice(1).join(',').trim() || 'Manizales'}
                    alPulsar={() => elegir(r)}
                  />
                ))}
              </Lista>
            )}
            {campo === 'destino' && (
              <button
                type="button"
                onClick={() => void navegar('/ciudades')}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-borde bg-superficie px-4 text-left"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-ty/15 text-ty">
                  <Icono nombre="navegar" tamano={20} />
                </span>
                <span className="flex-1">
                  <span className="block font-extrabold">Viaje a otra ciudad</span>
                  <span className="block text-sm text-suave">Tarifa fija desde Manizales</span>
                </span>
                <Icono nombre="derecha" className="text-suave" />
              </button>
            )}
            <p className="px-1 text-sm text-suave">
              Escribe el nombre de un lugar, un barrio o una dirección. Por ahora las direcciones se
              ubican de forma aproximada.
            </p>
          </div>
        ) : (data?.resultados.length ?? 0) === 0 && !isFetching ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-suave">
            <Icono nombre="buscar" tamano={40} />
            <p className="text-lg font-extrabold text-texto">No encontramos «{q}»</p>
            <p className="max-w-xs">
              Prueba con el nombre del barrio, un lugar conocido o una dirección como «Cra 23 #
              62-14».
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-borde" aria-label="Resultados">
            {data?.resultados.map((r, i) => (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <button
                  type="button"
                  data-resultado={r.id}
                  onClick={() => elegir(r)}
                  className="flex min-h-16 w-full items-center gap-3 py-2 text-left"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-superficie-2 text-suave">
                    <Icono nombre={ICONO_TIPO[r.tipo] ?? 'pin'} tamano={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-extrabold">{r.titulo}</span>
                    <span className="block truncate text-sm text-suave">{r.subtitulo}</span>
                  </span>
                  {r.aproximada && <Chip tono="aviso">Aprox.</Chip>}
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Lista({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1 px-1 text-sm font-extrabold text-suave">{titulo}</p>
      <ul className="divide-y divide-borde">{children}</ul>
    </section>
  );
}

function Fila({
  icono,
  principal,
  secundario,
  alPulsar,
}: {
  icono: NombreIcono;
  principal: string;
  secundario: string;
  alPulsar: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={alPulsar}
        className="flex min-h-16 w-full items-center gap-3 py-2 text-left"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-superficie-2 text-suave">
          <Icono nombre={icono} tamano={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-extrabold">{principal}</span>
          <span className="block truncate text-sm text-suave">{secundario}</span>
        </span>
      </button>
    </li>
  );
}
