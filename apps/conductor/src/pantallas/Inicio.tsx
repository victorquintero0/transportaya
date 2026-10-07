import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Chip } from '@transportaya/ui';
import { Icono } from '@transportaya/ui';
import { Anillo } from '@transportaya/ui';
import { Logo } from '@transportaya/ui';
import { Numero } from '@transportaya/ui';
import { Tarjeta } from '@transportaya/ui';
import { useAjustes } from '../estado/ajustes.ts';
import { avisar } from '@transportaya/ui';
import { useJornada } from '../estado/jornada.ts';
import { api, ErrorApi, mensajeDe } from '@transportaya/ui';
import { celebrar } from '@transportaya/ui';
import { usePerfil } from '../lib/consultas.ts';
import { duracion, pesos, pesosCorto, primerNombre, saludo } from '@transportaya/ui';
import { ding } from '@transportaya/ui';
import { racha } from '../lib/logros.ts';
import type { Ganancias, MotivoNoConectar } from '../lib/tipos.ts';
import { vibrar } from '@transportaya/ui';
import { alCambiarEnLinea } from '../servicios/motor.ts';
import { encenderGps, useUbicacion } from '../servicios/gps.ts';

export function useGanancias(periodo: 'hoy' | 'ayer' | 'semana' | 'mes') {
  return useQuery({
    queryKey: ['ganancias', periodo],
    queryFn: () => api.get<Ganancias>(`/v1/conductor/ganancias?periodo=${periodo}`),
    refetchInterval: 45_000,
  });
}

async function esperarPosicion(
  ms: number,
): Promise<{ lat: number; lng: number; precisionM: number | null } | undefined> {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const { posicion, estado } = useUbicacion.getState();
    if (posicion) return { lat: posicion.lat, lng: posicion.lng, precisionM: posicion.precisionM };
    if (estado === 'sin_permiso' || estado === 'no_disponible') return undefined;
    await new Promise((r) => setTimeout(r, 150));
  }
  return undefined;
}

export function Inicio() {
  const qc = useQueryClient();
  const { data: perfil } = usePerfil();
  const hoy = useGanancias('hoy');
  const semana = useGanancias('semana');
  const metaDia = useAjustes((s) => s.metaDia);
  const gpsEstado = useUbicacion((s) => s.estado);
  const enVivo = useJornada((s) => s.conectadoEnVivo);

  const estadoOp = perfil?.conductor.estadoOperativo ?? 'desconectado';
  const enLinea = estadoOp !== 'desconectado';

  const conectar = useMutation({
    mutationFn: async () => {
      encenderGps();
      const pos = await esperarPosicion(3500);
      if (!pos && useUbicacion.getState().estado === 'sin_permiso') {
        throw new ErrorApi(
          0,
          'SIN_PERMISO',
          'Necesitamos tu ubicación para mandarte viajes cercanos. Activa el permiso de ubicación y vuelve a intentar.',
        );
      }
      return api.post('/v1/conductor/conectar', pos ?? {});
    },
    onSuccess: async () => {
      ding();
      vibrar('exito');
      alCambiarEnLinea(true);
      await qc.invalidateQueries({ queryKey: ['perfil'] });
    },
    onError: (e) => {
      alCambiarEnLinea(false);
      avisar(mensajeDe(e), 'error');
      void qc.invalidateQueries({ queryKey: ['perfil'] });
    },
  });

  const desconectar = useMutation({
    mutationFn: () => api.post('/v1/conductor/desconectar'),
    onSuccess: async () => {
      vibrar('toque');
      alCambiarEnLinea(false);
      await qc.invalidateQueries({ queryKey: ['perfil'] });
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  const neto = hoy.data?.neto ?? 0;
  const progreso = metaDia > 0 ? neto / metaDia : 0;

  // Festejo una sola vez por día cuando se cumple la meta.
  useEffect(() => {
    if (!hoy.data || progreso < 1) return;
    const clave = `ty.meta.${hoy.data.desde}`;
    try {
      if (localStorage.getItem(clave)) return;
      localStorage.setItem(clave, '1');
    } catch {
      return;
    }
    celebrar('grande');
    vibrar('exito');
    avisar('¡Cumpliste tu meta de hoy! 🏆', 'exito');
  }, [hoy.data, progreso]);

  const motivos = perfil?.conexion.motivos ?? [];
  const bloqueado = !enLinea && perfil !== undefined && !perfil.conexion.puedeConectarse;
  const viajes = hoy.data?.viajes ?? 0;
  const diasRacha = racha(semana.data?.porDia ?? []);

  return (
    <div className="fondo-calles relative min-h-dvh overflow-hidden pb-28">
      <div
        className={`pointer-events-none absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700 ${enLinea ? 'bg-ty/25' : 'bg-ty/5'}`}
      />

      <header className="area-segura-arriba relative flex items-center gap-3 px-5">
        <Logo variante="marca" tamano={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-suave">{saludo()}</p>
          <p className="truncate text-xl font-black leading-tight">
            {primerNombre(perfil?.usuario.nombre ?? '')} 👋
          </p>
        </div>
        {perfil?.conductor.calificacionPromedio != null && (
          <Chip tono="aviso">
            <Icono nombre="estrella" tamano={14} relleno />{' '}
            {perfil.conductor.calificacionPromedio.toFixed(1)}
          </Chip>
        )}
        <Chip tono={enVivo ? 'ok' : 'malo'}>
          <Icono nombre={enVivo ? 'wifi' : 'sinwifi'} tamano={14} />
          {enVivo ? 'En vivo' : 'Sin señal'}
        </Chip>
      </header>

      <section className="relative mt-6 flex flex-col items-center px-5">
        <div className="relative grid size-72 place-items-center">
          <AnimatePresence>
            {enLinea &&
              [0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute size-44 animate-radar rounded-full border-2 border-ty"
                  style={{ animationDelay: `${i * 0.93}s` }}
                />
              ))}
          </AnimatePresence>
          <motion.button
            id="boton-conexion"
            type="button"
            aria-label={enLinea ? 'Desconectarme' : 'Conectarme'}
            aria-pressed={enLinea}
            disabled={
              conectar.isPending ||
              desconectar.isPending ||
              bloqueado ||
              estadoOp === 'en_camino' ||
              estadoOp === 'en_sitio' ||
              estadoOp === 'en_viaje'
            }
            whileTap={{ scale: 0.92 }}
            animate={enLinea ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            transition={
              enLinea
                ? { duration: 2.4, repeat: Infinity }
                : { type: 'spring', stiffness: 400, damping: 20 }
            }
            onClick={() => (enLinea ? desconectar.mutate() : conectar.mutate())}
            className={[
              'relative grid size-44 place-items-center rounded-full border-4 transition-colors duration-500 disabled:opacity-50',
              enLinea
                ? 'border-ty-claro bg-ty text-sobre-ty shadow-brillo'
                : 'border-borde bg-superficie text-texto',
            ].join(' ')}
          >
            {conectar.isPending || desconectar.isPending ? (
              <span className="size-10 animate-spin rounded-full border-4 border-current border-t-transparent" />
            ) : (
              <span className="flex flex-col items-center gap-1">
                <Icono nombre="encender" tamano={54} strokeWidth={2.6} />
                <span className="text-xl font-black">{enLinea ? 'En línea' : 'Conectarme'}</span>
              </span>
            )}
          </motion.button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={enLinea ? estadoOp : 'off'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="text-center text-lg font-bold text-suave"
            id="estado-conexion"
          >
            {!enLinea
              ? bloqueado
                ? 'No puedes conectarte todavía'
                : 'Toca para empezar a recibir viajes'
              : estadoOp === 'sin_senal'
                ? 'Perdimos tu señal. Revisa tu internet'
                : gpsEstado === 'buscando'
                  ? 'Buscando tu ubicación…'
                  : 'Buscando viajes cerca de ti…'}
          </motion.p>
        </AnimatePresence>
      </section>

      {bloqueado && (
        <section className="relative mt-5 space-y-3 px-5">
          {motivos.map((m) => (
            <Bloqueo key={m.codigo} motivo={m} />
          ))}
        </section>
      )}

      <section className="relative mt-6 space-y-4 px-5">
        <Tarjeta className="flex items-center gap-5">
          <Anillo
            valor={progreso}
            tamano={132}
            grosor={13}
            color={progreso >= 1 ? 'var(--color-sol)' : 'var(--color-ty)'}
          >
            <div className="text-center">
              <p className="text-xs font-extrabold uppercase tracking-wide text-suave">Hoy</p>
              <Numero
                valor={Math.round(neto)}
                formato={pesosCorto}
                className="text-2xl font-black"
              />
            </div>
          </Anillo>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm font-extrabold text-suave">Tu meta del día</p>
            <p className="numeros text-2xl font-black">{pesos(metaDia)}</p>
            <p className="text-sm font-bold text-ty">
              {progreso >= 1
                ? '¡Meta cumplida! 🎉'
                : neto === 0
                  ? 'Cada viaje te acerca'
                  : `Te faltan ${pesosCorto(Math.max(0, metaDia - neto))}`}
            </p>
          </div>
        </Tarjeta>

        <div className="grid grid-cols-3 gap-3">
          <Dato icono="carro" etiqueta="Viajes" valor={String(viajes)} />
          <Dato
            icono="reloj"
            etiqueta="Conectado"
            valor={hoy.data ? duracion(hoy.data.horasConectado * 3600) : '—'}
          />
          <Dato icono="efectivo" etiqueta="Efectivo" valor={pesosCorto(hoy.data?.efectivo ?? 0)} />
        </div>

        <Logros viajes={viajes} racha={diasRacha} meta={progreso >= 1} />
      </section>
    </div>
  );
}

function Dato({
  icono,
  etiqueta,
  valor,
}: {
  icono: 'carro' | 'reloj' | 'efectivo';
  etiqueta: string;
  valor: string;
}) {
  return (
    <Tarjeta className="flex flex-col items-center gap-1 px-2 py-3 text-center">
      <Icono nombre={icono} className="text-ty" tamano={22} />
      <p className="numeros text-lg font-black leading-tight">{valor}</p>
      <p className="text-xs font-bold text-suave">{etiqueta}</p>
    </Tarjeta>
  );
}

function Logros({ viajes, racha, meta }: { viajes: number; racha: number; meta: boolean }) {
  const lista = [
    { id: 'primero', icono: 'bandera', texto: 'Primer viaje', ganado: viajes >= 1 },
    { id: 'cinco', icono: 'rayo', texto: '5 viajes hoy', ganado: viajes >= 5 },
    { id: 'meta', icono: 'copa', texto: 'Meta del día', ganado: meta },
    {
      id: 'racha',
      icono: 'llama',
      texto: racha > 1 ? `Racha de ${racha} días` : 'Racha',
      ganado: racha >= 2,
    },
  ] as const;
  return (
    <div>
      <p className="mb-2 text-sm font-extrabold text-suave">Logros de hoy</p>
      <div className="grid grid-cols-4 gap-2">
        {lista.map((l, i) => (
          <motion.div
            key={l.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 text-center ${l.ganado ? 'border-ty/50 bg-ty/10' : 'border-borde bg-superficie opacity-60'}`}
            title={l.ganado ? 'Conseguido' : 'Por conseguir'}
          >
            <span
              className={`grid size-11 place-items-center rounded-full ${l.ganado ? 'bg-ty text-sobre-ty' : 'bg-superficie-2 text-suave'}`}
            >
              <Icono nombre={l.icono} tamano={22} relleno={l.ganado && l.id === 'racha'} />
            </span>
            <span className="text-[0.7rem] font-extrabold leading-tight">{l.texto}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Bloqueo({ motivo }: { motivo: MotivoNoConectar }) {
  const esDeuda = motivo.codigo === 'DEUDA_PENDIENTE';
  return (
    <Tarjeta className="border-sol/50 bg-sol/10">
      <div className="flex items-start gap-3">
        <Icono nombre="alerta" className="mt-0.5 shrink-0 text-sol" />
        <div className="flex-1">
          <p className="font-extrabold">{motivo.mensaje}</p>
          {esDeuda && motivo.deuda ? (
            <p className="numeros mt-1 text-2xl font-black text-sol">{pesos(motivo.deuda)}</p>
          ) : null}
          {motivo.documentos?.length ? (
            <p className="mt-1 text-sm text-suave">{motivo.documentos.join(', ')}</p>
          ) : null}
          <Link
            to={esDeuda ? '/ganancias' : '/perfil'}
            className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl bg-sol px-4 text-base font-extrabold text-sobre-ty"
          >
            {esDeuda ? 'Pagar mi comisión' : 'Ir a mis documentos'}
            <Icono nombre="derecha" tamano={18} />
          </Link>
        </div>
      </div>
    </Tarjeta>
  );
}
