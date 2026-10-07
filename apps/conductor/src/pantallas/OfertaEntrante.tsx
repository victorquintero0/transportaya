import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Anillo } from '@transportaya/ui';
import { Boton } from '@transportaya/ui';
import { Chip } from '@transportaya/ui';
import { Icono } from '@transportaya/ui';
import { avisar } from '@transportaya/ui';
import { api, mensajeDe } from '@transportaya/ui';
import { distancia, duracion, pesos } from '@transportaya/ui';
import { ding } from '@transportaya/ui';
import type { Oferta, ViajeActual } from '../lib/tipos.ts';
import { quitarOferta, tomarViaje } from '../servicios/motor.ts';

const NOMBRE_CATEGORIA: Record<string, string> = {
  media: 'Media',
  media_alta: 'Media Alta',
  alta: 'Alta',
};

export function OfertaEntrante({ oferta }: { oferta: Oferta }) {
  const qc = useQueryClient();
  const total = oferta.segundosParaResponder;
  const [restante, setRestante] = useState(() =>
    Math.max(0, (Date.parse(oferta.expiraEn) - Date.now()) / 1000),
  );

  useEffect(() => {
    const id = window.setInterval(
      () => setRestante(Math.max(0, (Date.parse(oferta.expiraEn) - Date.now()) / 1000)),
      100,
    );
    return () => window.clearInterval(id);
  }, [oferta.expiraEn]);

  const aceptar = useMutation({
    mutationFn: () =>
      api.post<ViajeActual | null>(`/v1/conductor/ofertas/${oferta.ofertaId}/aceptar`),
    onSuccess: (v) => {
      ding();
      tomarViaje(qc, v);
    },
    onError: (e) => {
      avisar(mensajeDe(e), 'error');
      quitarOferta();
    },
  });

  const rechazar = useMutation({
    mutationFn: () => api.post(`/v1/conductor/ofertas/${oferta.ofertaId}/rechazar`),
    onSettled: () => {
      quitarOferta();
      void qc.invalidateQueries({ queryKey: ['perfil'] });
    },
  });

  const urgente = restante <= 5;
  const ocupado = aceptar.isPending || rechazar.isPending;
  const efectivo = oferta.metodoPago === 'efectivo';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-fondo"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      role="dialog"
      aria-label="Nueva solicitud de viaje"
      data-oferta={oferta.ofertaId}
    >
      <div
        className={`pointer-events-none absolute inset-0 transition-colors duration-500 ${urgente ? 'bg-peligro/10' : 'bg-ty/10'}`}
      />
      <div className="area-segura-arriba relative flex flex-1 flex-col items-center px-5">
        <motion.p
          initial={{ scale: 0.8 }}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
          className="mt-2 text-lg font-black uppercase tracking-widest text-ty"
        >
          ¡Nuevo viaje!
        </motion.p>

        <div className="mt-3">
          <Anillo
            valor={restante / total}
            tamano={150}
            grosor={12}
            color={urgente ? 'var(--color-peligro)' : 'var(--color-ty)'}
            animado={false}
          >
            <div className="text-center">
              <p
                className={`numeros text-5xl font-black leading-none ${urgente ? 'text-peligro' : ''}`}
              >
                {Math.ceil(restante)}
              </p>
              <p className="text-xs font-extrabold uppercase text-suave">segundos</p>
            </div>
          </Anillo>
        </div>

        <div className="mt-5 text-center">
          <p className="text-sm font-extrabold uppercase tracking-wide text-suave">
            Pagan aproximadamente
          </p>
          <p className="numeros text-5xl font-black text-ty" id="oferta-precio">
            {pesos(oferta.precioEstimado.min)} <span className="text-3xl text-suave">–</span>{' '}
            {pesos(oferta.precioEstimado.max)}
          </p>
          <p className="mt-1 text-lg font-bold">
            Te quedan <span className="numeros text-ty">{pesos(oferta.gananciaEstimada)}</span>{' '}
            <span className="text-suave">aprox.</span>
          </p>
        </div>

        <div className="mt-5 w-full max-w-md space-y-3 rounded-tarjeta border border-borde bg-superficie p-4">
          <Fila
            icono="pin"
            titulo="Recogida"
            principal={oferta.recogida.direccion ?? 'Cerca de ti'}
            secundario={`${distancia(oferta.recogida.distanciaM)} · ${duracion(oferta.recogida.etaS)}`}
          />
          <div className="ml-[1.1rem] h-4 border-l-2 border-dashed border-borde" />
          <Fila
            icono="bandera"
            titulo="Destino"
            principal={oferta.destino.zona}
            secundario={`Viaje de ${distancia(oferta.destino.distanciaViajeM)}`}
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
            <Chip tono={efectivo ? 'aviso' : 'info'}>
              <Icono nombre={efectivo ? 'efectivo' : 'tarjeta'} tamano={14} />{' '}
              {efectivo ? 'Efectivo' : oferta.metodoPago === 'tarjeta' ? 'Tarjeta' : 'Pago local'}
            </Chip>
            <Chip>{NOMBRE_CATEGORIA[oferta.categoria] ?? oferta.categoria}</Chip>
            <span className="ml-auto flex items-center gap-1.5 font-bold">
              {oferta.pasajero.nombre}
              {oferta.pasajero.calificacion !== null && (
                <span className="flex items-center gap-0.5 text-sol">
                  <Icono nombre="estrella" tamano={14} relleno />
                  <span className="numeros text-sm">{oferta.pasajero.calificacion.toFixed(1)}</span>
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="area-segura-abajo relative grid grid-cols-[1fr_2fr] gap-3 px-5 pt-3">
        <Boton
          variante="secundario"
          tamano="grande"
          icono="cerrar"
          deshabilitado={ocupado}
          cargando={rechazar.isPending}
          alPulsar={() => rechazar.mutate()}
          etiqueta="Rechazar viaje"
          id="rechazar-oferta"
        >
          No
        </Boton>
        <Boton
          tamano="grande"
          icono="ok"
          deshabilitado={ocupado || restante <= 0}
          cargando={aceptar.isPending}
          alPulsar={() => aceptar.mutate()}
          etiqueta="Aceptar viaje"
          id="aceptar-oferta"
        >
          ¡Aceptar!
        </Boton>
      </div>
    </motion.div>
  );
}

function Fila({
  icono,
  titulo,
  principal,
  secundario,
}: {
  icono: 'pin' | 'bandera';
  titulo: string;
  principal: string;
  secundario: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ty/15 text-ty">
        <Icono nombre={icono} tamano={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-wide text-suave">{titulo}</p>
        <p className="truncate text-lg font-extrabold leading-tight">{principal}</p>
        <p className="text-sm font-bold text-suave">{secundario}</p>
      </div>
    </div>
  );
}
