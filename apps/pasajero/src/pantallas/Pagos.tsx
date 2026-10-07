import {
  Boton,
  Chip,
  Hoja,
  Icono,
  Tarjeta,
  api,
  avisar,
  ding,
  ErrorApi,
  mensajeDe,
  pesos,
  vibrar,
} from '@transportaya/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePerfil, useSimulador } from '../lib/consultas.ts';
import type { MetodoDePago } from '../lib/tipos.ts';

const ENTRADA =
  'min-h-14 w-full rounded-2xl border-2 border-borde bg-superficie px-4 text-lg font-bold outline-none placeholder:font-semibold placeholder:text-borde focus:border-ty';

function formatearNumero(v: string): string {
  return v
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}
function formatearVence(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** Tarjetas del pasajero y pago de la deuda (PAS-10, PAS-11, PAS-13). */
export function Pagos() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: perfil } = usePerfil();
  const simulador = useSimulador();
  const [agregando, setAgregando] = useState(false);
  const [numero, setNumero] = useState('');
  const [vence, setVence] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refrescar = () => qc.invalidateQueries({ queryKey: ['perfil'] });

  const agregar = useMutation({
    mutationFn: async () => {
      // Con Wompi real la tarjeta se tokeniza en el formulario de la pasarela y aquí solo llega el token (RNF-44).
      // En modo demostración, un servicio de prueba hace de Wompi.
      const t = await api.post<{ token: string; marca: string; ultimos4: string }>(
        '/v1/dev/tarjetas/tokenizar',
        { numero, vence, cvc },
      );
      return api.post('/v1/pasajero/metodos-pago', {
        token: t.token,
        marca: t.marca,
        ultimos4: t.ultimos4,
      });
    },
    onSuccess: async () => {
      ding();
      vibrar('exito');
      setAgregando(false);
      setNumero('');
      setVence('');
      setCvc('');
      setError(null);
      avisar('Tarjeta agregada', 'exito');
      await refrescar();
    },
    onError: (e) => setError(e instanceof ErrorApi ? e.detalle : mensajeDe(e)),
  });

  const predeterminada = useMutation({
    mutationFn: (id: string) => api.put(`/v1/pasajero/metodos-pago/${id}/predeterminado`),
    onSuccess: refrescar,
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  const quitar = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/pasajero/metodos-pago/${id}`),
    onSuccess: async () => {
      avisar('Tarjeta eliminada', 'info');
      await refrescar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  const pagarDeuda = useMutation({
    mutationFn: (metodoPagoId: string) =>
      api.post<{ pagado: number }>('/v1/pasajero/deuda/pagar', { metodoPagoId }),
    onSuccess: async (r) => {
      ding();
      vibrar('exito');
      avisar(`Pagaste ${pesos(r.pagado)}. Ya puedes pedir viajes.`, 'exito');
      await refrescar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  const metodos = perfil?.metodosPago ?? [];
  const deuda = perfil?.deuda ?? 0;
  const listo = numero.replace(/\s/g, '').length >= 13 && vence.length === 5 && cvc.length >= 3;

  return (
    <div className="flex min-h-dvh flex-col bg-fondo pb-10">
      <header className="area-segura-arriba flex items-center gap-2 border-b border-borde px-4 pb-3">
        <button
          type="button"
          aria-label="Volver"
          onClick={() => void navegar(-1)}
          className="mt-1 grid size-11 place-items-center rounded-full"
        >
          <Icono nombre="izquierda" />
        </button>
        <h1 className="mt-1 text-xl font-black">Pagos</h1>
      </header>

      <main className="space-y-4 px-5 pt-4">
        {deuda > 0 && (
          <Tarjeta className="space-y-3 border-sol/60 bg-sol/10" id="tarjeta-deuda">
            <div className="flex items-start gap-3">
              <Icono nombre="alerta" className="mt-0.5 shrink-0 text-sol" />
              <div>
                <p className="text-xl font-black text-sol" id="deuda">
                  Tienes {pesos(deuda)} pendientes
                </p>
                <p className="text-sm text-suave">
                  Un cobro no pudo completarse. Págalo con una tarjeta para volver a pedir viajes.
                </p>
              </div>
            </div>
            {metodos.length > 0 ? (
              <Boton
                id="pagar-deuda"
                icono="rayo"
                cargando={pagarDeuda.isPending}
                alPulsar={() =>
                  pagarDeuda.mutate((metodos.find((m) => m.predeterminado) ?? metodos[0]!).id)
                }
              >
                Pagar con {(metodos.find((m) => m.predeterminado) ?? metodos[0]!).marca} ••••{' '}
                {(metodos.find((m) => m.predeterminado) ?? metodos[0]!).ultimos4}
              </Boton>
            ) : (
              <p className="font-bold text-sol">Agrega una tarjeta para poder pagarlo.</p>
            )}
          </Tarjeta>
        )}

        <Tarjeta className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-ty/15 text-ty">
            <Icono nombre="efectivo" />
          </span>
          <div className="flex-1">
            <p className="text-lg font-black">Efectivo</p>
            <p className="text-sm text-suave">Le pagas al conductor al terminar</p>
          </div>
          {metodos.length === 0 && <Chip tono="ok">Por defecto</Chip>}
        </Tarjeta>

        {metodos.map((m) => (
          <TarjetaGuardada
            key={m.id}
            m={m}
            alElegir={() => predeterminada.mutate(m.id)}
            alQuitar={() => quitar.mutate(m.id)}
          />
        ))}

        <Boton
          id="agregar-tarjeta"
          variante="secundario"
          icono="mas"
          alPulsar={() => setAgregando(true)}
        >
          Agregar tarjeta
        </Boton>
        <p className="text-sm text-suave">
          Nunca guardamos el número de tu tarjeta: la pasarela de pagos nos entrega una clave que
          solo sirve para cobrarte lo de tus viajes.
        </p>
      </main>

      <Hoja abierta={agregando} alCerrar={() => setAgregando(false)} titulo="Agregar tarjeta">
        <form
          className="space-y-3 pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (listo) agregar.mutate();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-extrabold text-suave">
              Número de la tarjeta
            </span>
            <input
              id="tarjeta-numero"
              className={`${ENTRADA} numeros`}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              value={numero}
              onChange={(e) => setNumero(formatearNumero(e.target.value))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-extrabold text-suave">Vence (MM/AA)</span>
              <input
                id="tarjeta-vence"
                className={`${ENTRADA} numeros`}
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="08/29"
                value={vence}
                onChange={(e) => setVence(formatearVence(e.target.value))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-extrabold text-suave">Código (CVC)</span>
              <input
                id="tarjeta-cvc"
                className={`${ENTRADA} numeros`}
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </label>
          </div>
          {error && (
            <p className="rounded-xl bg-peligro/15 px-4 py-3 font-bold text-peligro">{error}</p>
          )}
          {simulador && (
            <div className="space-y-2 rounded-2xl border border-dashed border-sol/60 bg-sol/10 p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-sol">
                Modo demostración
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-fondo px-4 text-sm font-extrabold"
                  onClick={() => (
                    setNumero('4242 4242 4242 4242'),
                    setVence('12/30'),
                    setCvc('123')
                  )}
                >
                  Tarjeta que funciona
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-fondo px-4 text-sm font-extrabold"
                  onClick={() => (
                    setNumero('4000 0000 0000 0002'),
                    setVence('12/30'),
                    setCvc('123')
                  )}
                >
                  Tarjeta que el banco rechaza
                </button>
              </div>
            </div>
          )}
          <Boton
            id="guardar-tarjeta"
            type="submit"
            tamano="grande"
            icono="candado"
            deshabilitado={!listo}
            cargando={agregar.isPending}
          >
            Guardar tarjeta
          </Boton>
        </form>
      </Hoja>
    </div>
  );
}

function TarjetaGuardada({
  m,
  alElegir,
  alQuitar,
}: {
  m: MetodoDePago;
  alElegir: () => void;
  alQuitar: () => void;
}) {
  return (
    <Tarjeta className="flex items-center gap-3" data-tarjeta={m.ultimos4}>
      <button
        type="button"
        onClick={alElegir}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
        aria-label={`Usar ${m.marca} terminada en ${m.ultimos4}`}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-superficie-2 text-suave">
          <Icono nombre="tarjeta" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-black">
            {m.marca} •••• {m.ultimos4}
          </span>
          {m.predeterminado ? (
            <Chip tono="ok">Predeterminada</Chip>
          ) : (
            <span className="text-sm text-suave">Toca para usarla</span>
          )}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Eliminar tarjeta terminada en ${m.ultimos4}`}
        onClick={alQuitar}
        className="grid size-11 place-items-center rounded-xl text-suave"
      >
        <Icono nombre="basura" tamano={22} />
      </button>
    </Tarjeta>
  );
}
