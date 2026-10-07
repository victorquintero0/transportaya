import { Chip, Icono, api, pesos, vibrar } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePedido } from '../estado/pedido.ts';
import type { RutaNacional } from '../lib/tipos.ts';

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Viajes a otras ciudades con tarifa fija, desde Manizales (PAS-26, RN-090). */
export function Ciudades() {
  const navegar = useNavigate();
  const [texto, setTexto] = useState('');
  const [modalidad, setModalidad] = useState<'solo_ida' | 'ida_y_vuelta'>('solo_ida');
  const { data } = useQuery({
    queryKey: ['rutas'],
    queryFn: async () => (await api.get<{ rutas: RutaNacional[] }>('/v1/pasajero/rutas')).rutas,
    staleTime: 10 * 60_000,
  });
  const q = normalizar(texto.trim());
  const lista = (data ?? []).filter((r) => (q ? normalizar(r.destino).includes(q) : true));

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
          <div>
            <h1 className="text-xl font-black">Viaja a otra ciudad</h1>
            <p className="text-sm text-suave">Tarifa fija desde Manizales. Sin sorpresas.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-borde bg-superficie px-4 focus-within:border-ty">
          <Icono nombre="buscar" className="text-suave" tamano={22} />
          <input
            id="buscar-ciudad"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pereira, Armenia, Medellín…"
            aria-label="Buscar ciudad"
            className="min-h-14 w-full bg-transparent text-lg font-bold outline-none placeholder:font-semibold placeholder:text-borde"
          />
        </div>
        <div
          className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-superficie-2 p-1.5"
          role="tablist"
          aria-label="Tipo de viaje"
        >
          {(['solo_ida', 'ida_y_vuelta'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modalidad === m}
              onClick={() => setModalidad(m)}
              className={`min-h-11 rounded-xl text-base font-extrabold ${modalidad === m ? 'bg-ty text-sobre-ty' : 'text-suave'}`}
            >
              {m === 'solo_ida' ? 'Solo ida' : 'Ida y vuelta'}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 pb-10 pt-2">
        <ul className="divide-y divide-borde">
          {lista.map((r, i) => {
            const precio = modalidad === 'solo_ida' ? r.soloIda : r.idaYVuelta;
            return (
              <motion.li
                key={r.destino}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.02 }}
              >
                <button
                  type="button"
                  data-ciudad={r.destino}
                  disabled={precio === null}
                  onClick={() => {
                    vibrar('toque');
                    usePedido.getState().ponerRuta({ ruta: r, modalidad });
                    void navegar('/cotizar', { replace: true });
                  }}
                  className="flex min-h-16 w-full items-center gap-3 py-2 text-left disabled:opacity-40"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-superficie-2 text-suave">
                    <Icono nombre="pin" tamano={20} />
                  </span>
                  <span className="flex-1 text-lg font-extrabold">{r.destino}</span>
                  {precio === null ? (
                    <Chip>No disponible</Chip>
                  ) : (
                    <span className="numeros text-lg font-black text-ty">{pesos(precio)}</span>
                  )}
                </button>
              </motion.li>
            );
          })}
        </ul>
        {lista.length === 0 && (
          <p className="py-16 text-center text-suave">No tenemos tarifa fija a «{texto}».</p>
        )}
        <p className="mt-4 text-sm text-suave">
          Mostramos los destinos más pedidos. Si el tuyo no aparece, escríbenos desde Cuenta → Ayuda
          y lo agregamos.
        </p>
      </main>
    </div>
  );
}
