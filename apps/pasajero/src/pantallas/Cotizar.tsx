import {
  Boton,
  Chip,
  Hoja,
  Icono,
  Tarjeta,
  api,
  avisar,
  distancia,
  duracion,
  ErrorApi,
  mensajeDe,
  pesos,
  vibrar,
} from '@transportaya/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Mapa } from '../componentes/Mapa.tsx';
import { usePedido } from '../estado/pedido.ts';
import { useSeguimiento } from '../estado/seguimiento.ts';
import { usePerfil } from '../lib/consultas.ts';
import type { Cotizacion, OpcionCotizacion, Viaje } from '../lib/tipos.ts';

function textoEta(o: OpcionCotizacion): { texto: string; tono: 'ok' | 'aviso' } {
  if (o.etaRecogidaS === null) return { texto: 'Sin conductores cerca', tono: 'aviso' };
  const min = Math.max(1, Math.round(o.etaRecogidaS / 60));
  return { texto: `Llega en ${min} min`, tono: 'ok' };
}

/** Elegir categoría y pago, con el precio claro antes de confirmar (PAS-22, PAS-23, HU-PAS-01). */
export function Cotizar() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: perfil } = usePerfil();
  const origen = usePedido((s) => s.origen);
  const destino = usePedido((s) => s.destino);
  const ruta = usePedido((s) => s.ruta);
  const metodoPago = usePedido((s) => s.metodoPago);
  const nota = usePedido((s) => s.nota);
  const [elegida, setElegida] = useState<string | null>(null);
  const [pagos, setPagos] = useState(false);

  const clave = [
    origen?.lat,
    origen?.lng,
    destino?.lat,
    destino?.lng,
    ruta?.ruta.destino,
    ruta?.modalidad,
  ];
  const cot = useQuery({
    enabled: !!origen && !!destino,
    queryKey: ['cotizacion', ...clave],
    queryFn: () =>
      api.post<Cotizacion>('/v1/pasajero/cotizaciones', {
        origen: { lat: origen!.lat, lng: origen!.lng, direccion: origen!.direccion },
        ...(ruta
          ? { ruta: { destino: ruta.ruta.destino, modalidad: ruta.modalidad } }
          : { destino: { lat: destino!.lat, lng: destino!.lng, direccion: destino!.direccion } }),
      }),
    staleTime: 4 * 60_000,
    gcTime: 60_000,
    retry: false,
  });

  const opciones = cot.data?.opciones ?? [];
  // Si el pasajero no ha elegido, se propone la primera categoría con conductores cerca; si ninguna, la primera.
  const opcion =
    opciones.find((o) => o.id === elegida) ??
    opciones.find((o) => o.conductoresCerca > 0) ??
    opciones[0] ??
    null;
  const tarjeta =
    perfil?.metodosPago.find((m) => m.predeterminado) ?? perfil?.metodosPago[0] ?? null;
  const pagaConTarjeta = metodoPago === 'tarjeta' && tarjeta !== null;

  const pedir = useMutation({
    mutationFn: () =>
      api.post<Viaje>('/v1/pasajero/viajes', {
        cotizacionId: opcion!.id,
        metodoPago: pagaConTarjeta ? 'tarjeta' : 'efectivo',
        ...(pagaConTarjeta ? { metodoPagoId: tarjeta!.id } : {}),
        ...(nota.trim() ? { nota: nota.trim() } : {}),
      }),
    onSuccess: (viaje) => {
      vibrar('exito');
      qc.setQueryData(['viaje-actual'], viaje);
      // La cotización quedó usada; el destino se conserva por si hay que reintentar.
      qc.removeQueries({ queryKey: ['cotizacion'] });
      useSeguimiento.getState().ponerSinConductor(false);
      void qc.invalidateQueries({ queryKey: ['perfil'] });
      void navegar('/', { replace: true });
    },
    onError: (e) => {
      vibrar('alerta');
      const codigo = e instanceof ErrorApi ? e.codigo : '';
      if (codigo === 'COTIZACION_VENCIDA') {
        avisar('El precio venció. Te mostramos el nuevo.', 'info');
        void qc.invalidateQueries({ queryKey: ['cotizacion'] });
      } else if (codigo === 'DEUDA_PENDIENTE') {
        avisar(mensajeDe(e), 'error');
        void navegar('/pagos');
      } else if (codigo === 'TERMINOS_PENDIENTES' || codigo === 'PERFIL_INCOMPLETO') {
        void qc.invalidateQueries({ queryKey: ['perfil'] });
      } else if (codigo === 'VIAJE_EN_CURSO') {
        void qc.invalidateQueries({ queryKey: ['viaje-actual'] });
        void navegar('/', { replace: true });
      } else avisar(mensajeDe(e), 'error');
    },
  });

  if (!origen || !destino) return <Navigate to="/" replace />;
  const error = cot.error instanceof ErrorApi ? cot.error : null;

  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <div className="relative h-[34dvh] min-h-60">
        <Mapa
          origen={origen}
          destino={destino}
          ruta={{ desde: origen, hasta: destino }}
          etiquetaDestino={destino.titulo}
          reservaInferior={36}
          reservaSuperior={56}
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

      <section className="relative -mt-6 flex flex-1 flex-col gap-3 rounded-t-[2rem] border border-b-0 border-borde bg-fondo px-5 pb-6 pt-5 shadow-[0_-12px_40px_rgb(0_0_0/0.25)]">
        <div className="flex items-center gap-3 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-extrabold">{origen.titulo}</span>
            <span className="block truncate text-suave">→ {destino.titulo}</span>
          </span>
          {cot.data && (
            <span className="shrink-0 text-right font-bold text-suave">
              {distancia(cot.data.distanciaM)}
              <br />≈ {duracion(cot.data.duracionS)}
            </span>
          )}
        </div>

        {cot.isPending && (
          <div className="space-y-3" aria-label="Calculando precios">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulso-suave rounded-tarjeta bg-superficie-2"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}

        {error && (
          <Tarjeta className="space-y-3 border-sol/50 bg-sol/10">
            <div className="flex items-start gap-3">
              <Icono nombre="alerta" className="mt-0.5 shrink-0 text-sol" />
              <p className="font-extrabold" id="error-cotizacion">
                {error.detalle}
              </p>
            </div>
            <Boton variante="secundario" alPulsar={() => void navegar(-1)}>
              Elegir otro destino
            </Boton>
          </Tarjeta>
        )}

        <ul className="space-y-2.5" aria-label="Categorías">
          <AnimatePresence initial>
            {opciones.map((o, i) => {
              const activa = o.id === opcion?.id;
              const eta = textoEta(o);
              return (
                <motion.li
                  key={o.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <button
                    type="button"
                    data-categoria={o.categoria}
                    aria-pressed={activa}
                    onClick={() => {
                      vibrar('toque');
                      setElegida(o.id);
                    }}
                    className={`flex w-full items-center gap-3 rounded-tarjeta border-2 p-3 text-left transition-colors ${activa ? 'border-ty bg-ty/10 shadow-brillo' : 'border-borde bg-superficie'}`}
                  >
                    <span
                      className={`grid size-14 shrink-0 place-items-center rounded-2xl ${activa ? 'bg-ty text-sobre-ty' : 'bg-superficie-2 text-suave'}`}
                    >
                      <Icono nombre={o.fijo ? 'navegar' : 'carro'} tamano={28} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-lg font-black">{o.nombre}</span>
                        {o.dinamica && <Chip tono="aviso">Tarifa x{o.dinamica}</Chip>}
                      </span>
                      <span
                        className={`mt-0.5 block text-sm font-bold ${eta.tono === 'ok' ? 'text-ty' : 'text-sol'}`}
                      >
                        {eta.texto}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="numeros block text-lg font-black">
                        {o.fijo
                          ? pesos(o.precio.min)
                          : `${pesos(o.precio.min)} – ${pesos(o.precio.max)}`}
                      </span>
                      <span className="block text-xs font-bold text-suave">
                        {o.fijo
                          ? 'Tarifa fija'
                          : o.recargoCategoria > 0
                            ? `incluye +${pesos(o.recargoCategoria)}`
                            : 'estimado'}
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        {opcion && !opcion.fijo && (
          <p className="text-sm text-suave">
            El valor final lo calcula el taxímetro con la distancia y el tiempo reales del viaje. Si
            cambias de ruta o te detienes, puede variar.
          </p>
        )}
        {opcion && opcion.conductoresCerca === 0 && (
          <p className="rounded-xl bg-sol/10 px-4 py-3 text-sm font-bold text-sol">
            Ahora mismo no hay conductores cerca. Puedes pedir igual: seguimos buscando por 2
            minutos.
          </p>
        )}

        {opcion && (
          <>
            <button
              type="button"
              id="elegir-pago"
              onClick={() => setPagos(true)}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-borde bg-superficie px-4 text-left"
            >
              <Icono nombre={pagaConTarjeta ? 'tarjeta' : 'efectivo'} className="text-ty" />
              <span className="flex-1 font-extrabold">
                {pagaConTarjeta
                  ? `${tarjeta!.marca ?? 'Tarjeta'} •••• ${tarjeta!.ultimos4}`
                  : 'Efectivo'}
              </span>
              <span className="text-sm font-extrabold text-ty">Cambiar</span>
            </button>
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-borde bg-superficie px-4">
              <Icono nombre="mensaje" className="text-suave" />
              <input
                value={nota}
                maxLength={140}
                onChange={(e) => usePedido.getState().ponerNota(e.target.value)}
                placeholder="Nota para el conductor (portería 2…)"
                aria-label="Nota para el conductor"
                className="min-h-12 w-full bg-transparent font-bold outline-none placeholder:font-semibold placeholder:text-borde"
              />
            </label>
          </>
        )}

        <div className="mt-auto pt-2">
          <Boton
            id="pedir-viaje"
            tamano="grande"
            icono="rayo"
            deshabilitado={!opcion}
            cargando={pedir.isPending}
            alPulsar={() => pedir.mutate()}
          >
            {opcion ? `Pedir ${opcion.fijo ? 'viaje' : opcion.nombre}` : 'Pedir viaje'}
          </Boton>
        </div>
      </section>

      <Hoja abierta={pagos} alCerrar={() => setPagos(false)} titulo="¿Cómo vas a pagar?">
        <div className="space-y-2.5 pb-4">
          <OpcionPago
            activa={metodoPago === 'efectivo' || !tarjeta}
            icono="efectivo"
            titulo="Efectivo"
            detalle="Le pagas al conductor al terminar"
            alPulsar={() => {
              usePedido.getState().ponerMetodo('efectivo');
              setPagos(false);
            }}
          />
          {perfil?.metodosPago.map((m) => (
            <OpcionPago
              key={m.id}
              activa={metodoPago === 'tarjeta' && tarjeta?.id === m.id}
              icono="tarjeta"
              titulo={`${m.marca ?? 'Tarjeta'} •••• ${m.ultimos4}`}
              detalle="Se cobra automáticamente al terminar"
              alPulsar={async () => {
                if (!m.predeterminado)
                  await api
                    .put(`/v1/pasajero/metodos-pago/${m.id}/predeterminado`)
                    .catch(() => undefined);
                void qc.invalidateQueries({ queryKey: ['perfil'] });
                usePedido.getState().ponerMetodo('tarjeta');
                setPagos(false);
              }}
            />
          ))}
          <Boton variante="secundario" icono="mas" alPulsar={() => void navegar('/pagos')}>
            Agregar tarjeta
          </Boton>
        </div>
      </Hoja>
    </div>
  );
}

function OpcionPago({
  activa,
  icono,
  titulo,
  detalle,
  alPulsar,
}: {
  activa: boolean;
  icono: 'efectivo' | 'tarjeta';
  titulo: string;
  detalle: string;
  alPulsar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={alPulsar}
      aria-pressed={activa}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 text-left ${activa ? 'border-ty bg-ty/10' : 'border-borde bg-superficie'}`}
    >
      <Icono nombre={icono} className={activa ? 'text-ty' : 'text-suave'} />
      <span className="flex-1">
        <span className="block font-extrabold">{titulo}</span>
        <span className="block text-sm text-suave">{detalle}</span>
      </span>
      {activa && <Icono nombre="ok" className="text-ty" />}
    </button>
  );
}
