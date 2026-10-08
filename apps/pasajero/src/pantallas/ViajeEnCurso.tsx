import {
  Anillo,
  Boton,
  Estrellas,
  Hoja,
  Icono,
  Numero,
  Chip,
  api,
  avisar,
  celebrar,
  distancia,
  ding,
  mensajeDe,
  pesos,
  reloj,
  useAhora,
  vibrar,
} from '@transportaya/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chat } from '../componentes/Chat.tsx';
import { ReciboHoja } from '../componentes/ReciboHoja.tsx';
import { BotonSos } from '../componentes/BotonSos.tsx';
import { Mapa } from '../componentes/Mapa.tsx';
import { Placa } from '../componentes/Placa.tsx';
import { useSeguimiento } from '../estado/seguimiento.ts';
import type { Viaje } from '../lib/tipos.ts';
import { useUbicacion } from '../servicios/ubicacion.ts';

/** Elige qué mostrar según el estado del viaje: buscando, conductor en camino, en viaje o resumen. */
export function ViajeEnCurso({ viaje, alCerrar }: { viaje: Viaje; alCerrar: () => void }) {
  if (viaje.estado === 'buscando_conductor') return <Buscando viaje={viaje} />;
  if (viaje.estado === 'finalizado') return <Resumen viaje={viaje} alCerrar={alCerrar} />;
  return <Seguimiento viaje={viaje} />;
}

/* ------------------------------------------------------------------ buscando conductor */

const FRASES = [
  'Buscando conductores cerca de ti…',
  'Avisando al más cercano…',
  'Esperando que acepte…',
  'Un momento, ya casi…',
];

function useCancelar(viaje: Viaje) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ costo: number }>(`/v1/pasajero/viajes/${viaje.id}/cancelar`),
    onSuccess: async (r) => {
      vibrar('toque');
      avisar(
        r.costo > 0
          ? `Cancelaste el viaje. Se cobró ${pesos(r.costo)}.`
          : 'Cancelaste el viaje sin costo',
        'info',
      );
      qc.setQueryData(['viaje-actual'], null);
      await qc.invalidateQueries({ queryKey: ['perfil'] });
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
}

function Buscando({ viaje }: { viaje: Viaje }) {
  const ahora = useAhora(500);
  const cancelar = useCancelar(viaje);
  const total = viaje.busqueda
    ? Date.parse(viaje.busqueda.expiraEn) - Date.parse(viaje.busqueda.desde)
    : 120_000;
  const restante = viaje.busqueda ? Math.max(0, Date.parse(viaje.busqueda.expiraEn) - ahora) : 0;
  const frase =
    FRASES[Math.floor((ahora - Date.parse(viaje.tiempos.solicitadoEn)) / 6000) % FRASES.length] ??
    FRASES[0]!;

  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <div className="relative min-h-[48dvh] flex-1">
        <Mapa
          origen={viaje.origen}
          destino={viaje.destino}
          buscando
          ruta={{ desde: viaje.origen, hasta: viaje.destino }}
          etiquetaDestino={(viaje.destino.direccion ?? '').split(',')[0]}
          reservaInferior={30}
        />
      </div>
      <motion.section
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        className="area-segura-abajo relative -mt-6 space-y-4 rounded-t-[2rem] border border-b-0 border-borde bg-fondo px-5 pt-6 shadow-[0_-12px_40px_rgb(0_0_0/0.25)]"
      >
        <div className="flex items-center gap-4">
          <Anillo valor={restante / total} tamano={72} grosor={7} animado={false}>
            <Icono nombre="carro" className="text-ty" />
          </Anillo>
          <div className="flex-1">
            <h1 className="text-2xl font-black" id="estado-busqueda">
              Buscando tu conductor
            </h1>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={frase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="text-suave"
              >
                {frase}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <ResumenDelPedido viaje={viaje} />
        <Boton
          id="cancelar-busqueda"
          variante="secundario"
          icono="cerrar"
          cargando={cancelar.isPending}
          alPulsar={() => cancelar.mutate()}
        >
          Cancelar
        </Boton>
      </motion.section>
    </div>
  );
}

function ResumenDelPedido({ viaje }: { viaje: Viaje }) {
  return (
    <div className="space-y-2 rounded-tarjeta border border-borde bg-superficie p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-3 shrink-0 rounded-full bg-ty" />
        <p className="font-bold">{(viaje.origen.direccion ?? '').split(',')[0]}</p>
      </div>
      <div className="flex items-start gap-3">
        <Icono nombre="bandera" tamano={14} className="mt-1.5 shrink-0" />
        <p className="font-bold">{(viaje.destino.direccion ?? '').split(',')[0]}</p>
      </div>
      <div className="flex items-center justify-between border-t border-borde pt-2 text-sm font-bold text-suave">
        <span className="flex items-center gap-1.5">
          <Icono
            nombre={
              viaje.metodoPago === 'corporativo'
                ? 'maletin'
                : viaje.metodoPago === 'tarjeta'
                  ? 'tarjeta'
                  : 'efectivo'
            }
            tamano={16}
          />
          {viaje.metodoPago === 'corporativo'
            ? 'Empresa'
            : viaje.metodoPago === 'tarjeta'
              ? 'Tarjeta'
              : 'Efectivo'}
        </span>
        <span className="numeros text-texto">
          {viaje.precioEstimado.min === viaje.precioEstimado.max
            ? pesos(viaje.precioEstimado.min)
            : `${pesos(viaje.precioEstimado.min)} – ${pesos(viaje.precioEstimado.max)}`}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ conductor en camino y viaje */

function minutos(etaS: number | null): string {
  if (etaS === null) return '—';
  return etaS < 90 ? 'menos de 1 min' : `${Math.round(etaS / 60)} min`;
}

function Seguimiento({ viaje }: { viaje: Viaje }) {
  const qc = useQueryClient();
  const vivo = useSeguimiento();
  const yo = useUbicacion((s) => s.posicion);
  const [chat, setChat] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [compartiendo, setCompartiendo] = useState<{ url: string } | null>(null);
  const cancelar = useCancelar(viaje);
  const c = viaje.conductor;
  const enCurso = viaje.estado === 'en_curso';
  const enSitio = viaje.estado === 'en_sitio';

  // La posición en vivo manda; la del servidor al abrir la app llena el primer instante.
  const pos =
    vivo.viajeId === viaje.id && vivo.posicion
      ? vivo.posicion
      : c?.posicion
        ? { ...c.posicion, rumbo: null }
        : null;
  const etaS = vivo.viajeId === viaje.id && vivo.etaS !== null ? vivo.etaS : (c?.etaS ?? null);
  const distM =
    vivo.viajeId === viaje.id && vivo.distanciaM !== null
      ? vivo.distanciaM
      : (c?.distanciaM ?? null);

  const compartir = useMutation({
    mutationFn: () => api.post<{ ruta: string }>(`/v1/pasajero/viajes/${viaje.id}/compartir`),
    onSuccess: async (r) => {
      const url = `${window.location.origin}${r.ruta}`;
      await qc.invalidateQueries({ queryKey: ['viaje-actual'] });
      if (navigator.share) {
        await navigator
          .share({
            title: 'Sigue mi viaje en TransporteYa',
            text: `Voy en un TransporteYa. Sigue mi viaje en vivo:`,
            url,
          })
          .catch(() => undefined);
      }
      setCompartiendo({ url });
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  const dejar = useMutation({
    mutationFn: () => api.delete(`/v1/pasajero/viajes/${viaje.id}/compartir`),
    onSuccess: async () => {
      setCompartiendo(null);
      avisar('Dejaste de compartir el viaje', 'info');
      await qc.invalidateQueries({ queryKey: ['viaje-actual'] });
    },
  });

  const titulo = enSitio
    ? '¡Tu conductor llegó!'
    : enCurso
      ? `Llegas en ${minutos(etaS)}`
      : `Llega en ${minutos(etaS)}`;
  const detalle = enSitio
    ? 'Dile tu PIN para empezar el viaje'
    : enCurso
      ? distM !== null
        ? `A ${distancia(distM)} de tu destino`
        : 'Rumbo a tu destino'
      : distM !== null
        ? `A ${distancia(distM)} de ti`
        : 'En camino hacia ti';

  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <div className="relative min-h-[42dvh] flex-1">
        <Mapa
          origen={enCurso ? null : viaje.origen}
          destino={viaje.destino}
          conductor={pos}
          yo={!enCurso && yo ? yo : null}
          ruta={
            pos
              ? { desde: pos, hasta: enCurso ? viaje.destino : viaje.origen }
              : { desde: viaje.origen, hasta: viaje.destino }
          }
          etiquetaDestino={enCurso ? (viaje.destino.direccion ?? '').split(',')[0] : undefined}
          reservaInferior={40}
          minSpanM={600}
        />
        {!vivo.conectadoEnVivo && (
          <span className="area-segura-arriba absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-sol px-4 py-1.5 text-sm font-extrabold text-sobre-ty shadow-lg">
            Reconectando…
          </span>
        )}
      </div>

      <motion.section
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        className="area-segura-abajo relative -mt-6 space-y-4 rounded-t-[2rem] border border-b-0 border-borde bg-fondo px-5 pt-6 shadow-[0_-12px_40px_rgb(0_0_0/0.25)]"
      >
        <div>
          <h1 className="text-3xl font-black" id="titulo-seguimiento">
            {enSitio ? <span className="texto-marca">{titulo}</span> : titulo}
          </h1>
          <p className="text-lg text-suave">{detalle}</p>
        </div>

        {!enCurso && viaje.pin && (
          <div className="rounded-tarjeta border-2 border-dashed border-ty/60 bg-ty/10 p-4">
            <p className="text-sm font-extrabold uppercase tracking-wide text-suave">
              Tu PIN de viaje
            </p>
            <div
              className="mt-2 flex gap-2.5"
              aria-label={`Tu PIN es ${viaje.pin.split('').join(' ')}`}
              id="pin-viaje"
            >
              {viaje.pin.split('').map((d, i) => (
                <motion.span
                  key={i}
                  initial={{ rotateX: 90, opacity: 0 }}
                  animate={{ rotateX: 0, opacity: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className="numeros grid h-16 flex-1 place-items-center rounded-2xl bg-fondo text-4xl font-black text-ty shadow"
                >
                  {d}
                </motion.span>
              ))}
            </div>
            <p className="mt-2 text-sm text-suave">
              Solo díselo a tu conductor cuando estés dentro del carro.
            </p>
          </div>
        )}

        {c && (
          <div
            className="flex items-center gap-4 rounded-tarjeta border border-borde bg-superficie p-4"
            id="tarjeta-conductor"
          >
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-ty text-2xl font-black text-sobre-ty">
              {c.nombre.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-lg font-black">
                {c.nombre}
                {c.calificacion !== null && (
                  <span className="flex items-center gap-0.5 text-sm text-sol">
                    <Icono nombre="estrella" tamano={14} relleno />
                    <span className="numeros">{c.calificacion.toFixed(1)}</span>
                  </span>
                )}
              </p>
              <p className="truncate text-sm font-bold text-suave">
                {c.vehiculo.marca} {c.vehiculo.linea} · {c.vehiculo.color}
              </p>
            </div>
            <Placa placa={c.vehiculo.placa} />
          </div>
        )}

        <div className="flex gap-2.5">
          <Accion
            icono="mensaje"
            etiqueta="Chat"
            alPulsar={() => setChat(true)}
            insignia={vivo.noLeidos}
            id="abrir-chat"
          />
          <Accion
            icono="compartir"
            etiqueta={viaje.compartido ? 'Compartido' : 'Compartir'}
            alPulsar={() => (viaje.compartido ? setCompartiendo({ url: '' }) : compartir.mutate())}
            id="compartir-viaje"
            activo={viaje.compartido}
          />
          <BotonSos
            ubicacion={() =>
              pos ? { lat: pos.lat, lng: pos.lng } : yo ? { lat: yo.lat, lng: yo.lng } : null
            }
          />
          {!enCurso && (
            <Accion
              icono="cerrar"
              etiqueta="Cancelar"
              alPulsar={() => setCancelando(true)}
              id="cancelar-viaje"
            />
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl bg-superficie-2 px-4 py-3 text-sm font-bold">
          <span className="flex items-center gap-2 text-suave">
            <Icono
              nombre={
                viaje.metodoPago === 'corporativo'
                  ? 'maletin'
                  : viaje.metodoPago === 'tarjeta'
                    ? 'tarjeta'
                    : 'efectivo'
              }
              tamano={18}
            />
            {viaje.metodoPago === 'corporativo'
              ? `Lo paga ${viaje.corporativo?.empresa ?? 'tu empresa'}`
              : viaje.metodoPago === 'tarjeta'
                ? 'Pagas con tarjeta'
                : 'Pagas en efectivo'}
          </span>
          <span className="numeros text-texto">
            {viaje.precioEstimado.min === viaje.precioEstimado.max
              ? pesos(viaje.precioEstimado.min)
              : `${pesos(viaje.precioEstimado.min)} – ${pesos(viaje.precioEstimado.max)}`}
          </span>
        </div>
      </motion.section>

      {c && (
        <Chat
          viajeId={viaje.id}
          abierto={chat}
          alCerrar={() => setChat(false)}
          nombreConductor={c.nombre}
        />
      )}

      <Hoja abierta={cancelando} alCerrar={() => setCancelando(false)} titulo="¿Cancelar el viaje?">
        <div className="space-y-4 pb-4">
          {viaje.cancelacion?.gratis ? (
            <p className="rounded-xl bg-ty/10 px-4 py-3 font-bold text-ty" id="costo-cancelar">
              Cancelar ahora no tiene costo.
              {viaje.cancelacion.segundosGratisRestantes
                ? ` Te quedan ${reloj(viaje.cancelacion.segundosGratisRestantes)} para cancelar gratis.`
                : ''}
            </p>
          ) : (
            <p className="rounded-xl bg-sol/10 px-4 py-3 font-bold text-sol" id="costo-cancelar">
              Tu conductor ya está en camino. Cancelar ahora cuesta{' '}
              {pesos(viaje.cancelacion?.costo ?? 0)}.
            </p>
          )}
          <Boton
            id="confirmar-cancelar"
            variante="peligro"
            tamano="grande"
            cargando={cancelar.isPending}
            alPulsar={() => cancelar.mutate(undefined, { onSuccess: () => setCancelando(false) })}
          >
            Sí, cancelar
          </Boton>
          <Boton variante="secundario" alPulsar={() => setCancelando(false)}>
            No, seguir con el viaje
          </Boton>
        </div>
      </Hoja>

      <Hoja
        abierta={compartiendo !== null}
        alCerrar={() => setCompartiendo(null)}
        titulo="Comparte tu viaje"
      >
        <div className="space-y-4 pb-4">
          <p className="text-lg text-suave">
            Quien reciba el enlace verá dónde vas, tu conductor y su placa, sin necesidad de tener
            la app. Se apaga solo cuando el viaje termina.
          </p>
          {compartiendo?.url && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(compartiendo.url).catch(() => undefined);
                avisar('Enlace copiado', 'exito');
              }}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ty/60 bg-ty/10 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1 truncate font-bold" id="enlace-compartido">
                {compartiendo.url}
              </span>
              <Chip tono="ok">
                <Icono nombre="copiar" tamano={14} /> Copiar
              </Chip>
            </button>
          )}
          <Boton variante="secundario" cargando={dejar.isPending} alPulsar={() => dejar.mutate()}>
            Dejar de compartir
          </Boton>
        </div>
      </Hoja>
    </div>
  );
}

function Accion({
  icono,
  etiqueta,
  alPulsar,
  insignia = 0,
  id,
  activo = false,
}: {
  icono: 'mensaje' | 'compartir' | 'cerrar';
  etiqueta: string;
  alPulsar: () => void;
  insignia?: number;
  id: string;
  activo?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={() => {
        vibrar('toque');
        alPulsar();
      }}
      className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-2xl ${activo ? 'bg-ty/20 text-ty' : 'bg-superficie-2'}`}
    >
      <Icono nombre={icono} tamano={24} />
      <span className="text-xs font-extrabold">{etiqueta}</span>
      {insignia > 0 && (
        <span className="absolute right-3 top-2 grid size-5 place-items-center rounded-full bg-peligro text-xs font-black text-white">
          {insignia}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ resumen */

const ETIQUETAS_BUENAS = ['Amable', 'Buen manejo', 'Carro limpio', 'Puntual'];
const ETIQUETAS_MALAS = ['Manejo brusco', 'Carro sucio', 'Llegó tarde', 'Ruta larga'];
const PROPINAS = [1000, 2000, 5000];

function Resumen({ viaje, alCerrar }: { viaje: Viaje; alCerrar: () => void }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [estrellas, setEstrellas] = useState(0);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [propina, setPropina] = useState<number | null>(null);
  const [recibo, setRecibo] = useState(false);

  useEffect(() => {
    celebrar('grande');
    ding();
  }, []);

  const enviar = useMutation({
    mutationFn: async () => {
      if (estrellas > 0)
        await api.post(`/v1/pasajero/viajes/${viaje.id}/calificacion`, { estrellas, etiquetas });
      if (propina && viaje.puedeDarPropina)
        await api.post(`/v1/pasajero/viajes/${viaje.id}/propina`, { monto: propina });
    },
    onSuccess: async () => {
      avisar(
        propina
          ? '¡Gracias! Tu conductor recibirá la propina completa.'
          : '¡Gracias por calificar!',
        'exito',
      );
      await qc.invalidateQueries({ queryKey: ['viaje-actual'] });
      alCerrar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  const lista = estrellas >= 4 || estrellas === 0 ? ETIQUETAS_BUENAS : ETIQUETAS_MALAS;
  const yaCalifico = viaje.calificacion !== null || !viaje.puedeCalificar;
  const pagaEfectivo = viaje.metodoPago === 'efectivo';

  return (
    <div className="fondo-calles flex min-h-dvh flex-col">
      <div className="area-segura-arriba flex flex-1 flex-col items-center gap-5 overflow-y-auto px-5 pb-4 pt-8">
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 12 }}
          className="grid size-20 place-items-center rounded-full bg-ty text-sobre-ty shadow-brillo"
        >
          <Icono nombre="ok" tamano={44} strokeWidth={3} />
        </motion.span>
        <div className="text-center">
          <h1 className="text-3xl font-black" id="titulo-resumen">
            ¡Llegaste!
          </h1>
          <p className="text-suave">{(viaje.destino.direccion ?? '').split(',')[0]}</p>
        </div>

        <div className="text-center">
          <p className="text-sm font-extrabold uppercase tracking-wide text-suave">
            {pagaEfectivo ? 'Pagas al conductor' : 'Te cobramos'}
          </p>
          <Numero
            valor={viaje.precioFinal ?? 0}
            formato={pesos}
            duracion={1}
            className="block text-6xl font-black text-ty"
          />
          <p className="mt-1 text-sm font-bold text-suave">
            {pagaEfectivo
              ? 'en efectivo'
              : viaje.estadoPago === 'pagado'
                ? 'con tu tarjeta · pagado'
                : viaje.estadoPago === 'fallido'
                  ? 'con tu tarjeta · el banco la rechazó'
                  : 'con tu tarjeta · pendiente'}
          </p>
          <button
            type="button"
            id="ver-recibo"
            onClick={() => setRecibo(true)}
            className="mt-1 min-h-11 text-base font-extrabold text-ty underline-offset-4 hover:underline"
          >
            Ver recibo
          </button>
        </div>

        {viaje.estadoPago === 'fallido' && (
          <p className="w-full max-w-md rounded-xl bg-peligro/15 px-4 py-3 font-bold text-peligro">
            Tu banco rechazó el cobro. Paga con otra tarjeta desde Cuenta → Pagos para pedir otro
            viaje.
          </p>
        )}

        {!yaCalifico && (
          <div className="w-full max-w-md space-y-4 rounded-tarjeta border border-borde bg-superficie p-5 text-center">
            <p className="text-xl font-black">
              ¿Cómo estuvo {viaje.conductor?.nombre ?? 'tu conductor'}?
            </p>
            <Estrellas
              valor={estrellas}
              alCambiar={(n) => (setEstrellas(n), setEtiquetas([]))}
              tamano={44}
            />
            <AnimatePresence>
              {estrellas > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap justify-center gap-2 overflow-hidden"
                >
                  {lista.map((e) => {
                    const on = etiquetas.includes(e);
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() =>
                          setEtiquetas((a) => (on ? a.filter((x) => x !== e) : [...a, e]))
                        }
                        className={`min-h-11 rounded-full border-2 px-4 text-base font-extrabold ${on ? 'border-ty bg-ty text-sobre-ty' : 'border-borde bg-superficie'}`}
                      >
                        {e}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {viaje.puedeDarPropina && (
          <div className="w-full max-w-md space-y-3 rounded-tarjeta border border-borde bg-superficie p-5 text-center">
            <p className="text-lg font-black">
              ¿Una propina para {viaje.conductor?.nombre ?? 'tu conductor'}?
            </p>
            <p className="-mt-2 text-sm text-suave">Va completa para el conductor, sin comisión.</p>
            <div className="grid grid-cols-4 gap-2">
              {[...PROPINAS, 0].map((p) => (
                <button
                  key={p}
                  type="button"
                  data-propina={p}
                  onClick={() => setPropina(p === 0 ? null : p)}
                  className={`min-h-12 rounded-xl border-2 text-sm font-extrabold ${(propina ?? 0) === p ? 'border-ty bg-ty text-sobre-ty' : 'border-borde bg-superficie-2'}`}
                >
                  {p === 0 ? 'No' : pesos(p)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="area-segura-abajo space-y-2 px-5 pt-3">
        <Boton
          id="enviar-resumen"
          tamano="grande"
          icono="ok"
          cargando={enviar.isPending}
          alPulsar={() => (estrellas > 0 || propina ? enviar.mutate() : alCerrar())}
        >
          {estrellas > 0 || propina ? 'Enviar y terminar' : 'Listo'}
        </Boton>
        {!yaCalifico && estrellas === 0 && (
          <p className="pb-1 text-center text-sm text-suave">
            Tu calificación ayuda a que los viajes sean más seguros.
          </p>
        )}
      </div>

      <ReciboHoja
        viajeId={viaje.id}
        abierto={recibo}
        alCerrar={() => setRecibo(false)}
        alReportar={() => void navegar(`/viajes/${viaje.id}`)}
      />
    </div>
  );
}
