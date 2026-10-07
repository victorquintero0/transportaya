import {
  distanciaMetros,
  estaEnRadio,
  rumboGrados,
  puedeCancelarPorPasajeroAusente,
} from '@transportaya/dominio';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Radar } from '../componentes/Radar.tsx';
import { Boton } from '@transportaya/ui';
import { Chip } from '@transportaya/ui';
import { Hoja } from '@transportaya/ui';
import { Icono } from '@transportaya/ui';
import { Numero } from '@transportaya/ui';
import { Tarjeta } from '@transportaya/ui';
import { Teclado } from '@transportaya/ui';
import { avisar } from '@transportaya/ui';
import { useDemo } from '../estado/demo.ts';
import { useJornada } from '../estado/jornada.ts';
import { api, ErrorApi, mensajeDe } from '@transportaya/ui';
import { distancia, duracion, pesos, reloj } from '@transportaya/ui';
import { useAhora } from '@transportaya/ui';
import { enlaceGoogleMaps, enlaceWaze } from '../lib/navegacion.ts';
import { alerta, ding, tada } from '@transportaya/ui';
import { tarifaEnVivo } from '../lib/tarifa-viva.ts';
import type { ResultadoFinalizar, ViajeActual } from '../lib/tipos.ts';
import { vibrar } from '@transportaya/ui';
import { celebrar } from '@transportaya/ui';
import { useUbicacion } from '../servicios/gps.ts';
import { tomarViaje, refrescarViaje } from '../servicios/motor.ts';
import { descartarTaximetro, useTaximetro } from '../servicios/taximetro-vivo.ts';

const RADIO_LLEGADA_M = 150;

export function PantallaViaje({ viaje }: { viaje: ViajeActual }) {
  return (
    <div className="fondo-calles flex min-h-dvh flex-col">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={viaje.estado}
          className="flex flex-1 flex-col"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.25 }}
        >
          {viaje.estado === 'asignado' && <EnCamino viaje={viaje} />}
          {viaje.estado === 'en_sitio' && <EnSitio viaje={viaje} />}
          {viaje.estado === 'en_curso' && <EnViaje viaje={viaje} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ piezas comunes */

function Cabecera({ viaje, etapa }: { viaje: ViajeActual; etapa: string }) {
  return (
    <header className="area-segura-arriba flex items-center gap-3 px-5 pb-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-wide text-ty">{etapa}</p>
        <p className="truncate text-xl font-black leading-tight">{viaje.pasajero.nombre}</p>
      </div>
      {viaje.pasajero.calificacion !== null && (
        <Chip tono="aviso">
          <Icono nombre="estrella" tamano={14} relleno /> {viaje.pasajero.calificacion.toFixed(1)}
        </Chip>
      )}
      <Chip tono={viaje.metodoPago === 'efectivo' ? 'aviso' : 'info'}>
        <Icono nombre={viaje.metodoPago === 'efectivo' ? 'efectivo' : 'tarjeta'} tamano={14} />
        {viaje.metodoPago === 'efectivo' ? 'Efectivo' : 'Tarjeta'}
      </Chip>
      <BotonSos />
    </header>
  );
}

function BotonSos() {
  const [abierta, setAbierta] = useState(false);
  const enviar = useMutation({
    mutationFn: () => {
      const p = useUbicacion.getState().posicion;
      return api.post('/v1/conductor/sos', p ? { lat: p.lat, lng: p.lng } : {});
    },
    onSuccess: () => {
      alerta();
      vibrar('alerta');
      avisar('Avisamos a la torre de control. Te van a contactar.', 'exito');
      setAbierta(false);
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  return (
    <>
      <button
        type="button"
        aria-label="Emergencia SOS"
        id="boton-sos"
        onClick={() => setAbierta(true)}
        className="grid size-12 place-items-center rounded-full bg-peligro text-sm font-black text-white shadow-lg"
      >
        SOS
      </button>
      <Hoja abierta={abierta} alCerrar={() => setAbierta(false)} titulo="¿Necesitas ayuda?">
        <p className="mb-4 text-lg text-suave">
          Enviamos tu ubicación y los datos del viaje a la torre de control, que atiende las 24
          horas. En una emergencia grave, llama también al 123.
        </p>
        <div className="space-y-3 pb-3">
          <Boton
            variante="peligro"
            tamano="grande"
            cargando={enviar.isPending}
            alPulsar={() => enviar.mutate()}
          >
            Pedir ayuda ahora
          </Boton>
          <Boton variante="secundario" alPulsar={() => setAbierta(false)}>
            Fue sin querer
          </Boton>
        </div>
      </Hoja>
    </>
  );
}

function Navegar({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <a
        href={enlaceWaze(lat, lng)}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-borde bg-superficie-2 text-base font-extrabold"
      >
        <Icono nombre="navegar" tamano={20} /> Waze
      </a>
      <a
        href={enlaceGoogleMaps(lat, lng)}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-borde bg-superficie-2 text-base font-extrabold"
      >
        <Icono nombre="externo" tamano={20} /> Google Maps
      </a>
    </div>
  );
}

function useRumbo(destino: { lat: number; lng: number }) {
  const pos = useUbicacion((s) => s.posicion);
  if (!pos) return { rumbo: null, distanciaM: null, orientacion: null, pos: null } as const;
  return {
    rumbo: rumboGrados(pos, destino),
    distanciaM: Math.round(distanciaMetros(pos, destino)),
    orientacion: pos.rumbo,
    pos,
  } as const;
}

function CancelarViaje({ viaje, enSitio }: { viaje: ViajeActual; enSitio: boolean }) {
  const qc = useQueryClient();
  const [abierta, setAbierta] = useState(false);
  const cancelar = useMutation({
    mutationFn: (motivo: 'pasajero_ausente' | 'emergencia' | 'problema_vehiculo' | 'otro') =>
      api.post(`/v1/conductor/viajes/${viaje.id}/cancelar`, { motivo }),
    onSuccess: async () => {
      setAbierta(false);
      descartarTaximetro(viaje.id);
      avisar('Cancelaste el viaje', 'info');
      await refrescarViaje(qc);
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  const ahora = useAhora(1000);
  const esperaS = viaje.tiempos.enSitioEn
    ? (ahora - Date.parse(viaje.tiempos.enSitioEn)) / 1000
    : 0;
  const ausente = enSitio && puedeCancelarPorPasajeroAusente(esperaS);

  return (
    <>
      <button
        type="button"
        id="cancelar-viaje"
        onClick={() => setAbierta(true)}
        className="min-h-12 w-full text-base font-extrabold text-suave"
      >
        Cancelar viaje
      </button>
      <Hoja abierta={abierta} alCerrar={() => setAbierta(false)} titulo="¿Por qué cancelas?">
        <div className="space-y-3 pb-3">
          {enSitio && (
            <Boton
              variante="secundario"
              icono="reloj"
              deshabilitado={!ausente}
              alPulsar={() => cancelar.mutate('pasajero_ausente')}
            >
              {ausente
                ? 'El pasajero no aparece'
                : `El pasajero no aparece (en ${reloj(300 - esperaS)})`}
            </Boton>
          )}
          <Boton
            variante="secundario"
            icono="carro"
            alPulsar={() => cancelar.mutate('problema_vehiculo')}
          >
            Problema con mi vehículo
          </Boton>
          <Boton
            variante="secundario"
            icono="alerta"
            alPulsar={() => cancelar.mutate('emergencia')}
          >
            Tuve una emergencia
          </Boton>
          <Boton variante="secundario" icono="mensaje" alPulsar={() => cancelar.mutate('otro')}>
            Otro motivo
          </Boton>
          <Boton variante="fantasma" alPulsar={() => setAbierta(false)}>
            Mejor sigo con el viaje
          </Boton>
        </div>
      </Hoja>
    </>
  );
}

/* ------------------------------------------------------------------ 1. en camino a recoger */

function EnCamino({ viaje }: { viaje: ViajeActual }) {
  const qc = useQueryClient();
  const { rumbo, distanciaM, orientacion, pos } = useRumbo(viaje.recogida);
  const cerca = pos !== null && estaEnRadio(pos, viaje.recogida, RADIO_LLEGADA_M);

  const llegue = useMutation({
    mutationFn: () =>
      api.post<ViajeActual | null>(
        `/v1/conductor/viajes/${viaje.id}/llegue`,
        pos ? { lat: pos.lat, lng: pos.lng } : {},
      ),
    onSuccess: (v) => {
      ding();
      vibrar('exito');
      tomarViaje(qc, v);
    },
    onError: (e) => avisar(e instanceof ErrorApi ? e.detalle : mensajeDe(e), 'error'),
  });

  return (
    <>
      <Cabecera viaje={viaje} etapa="Rumbo al pasajero" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5">
        <Radar
          rumbo={rumbo}
          distanciaM={distanciaM}
          orientacion={orientacion}
          etiquetaObjetivo="Recogida"
        />
        <p className="text-center text-xl font-extrabold">
          {viaje.recogida.direccion ?? 'Recoge al pasajero'}
        </p>
        {viaje.nota && (
          <Tarjeta className="flex w-full max-w-md items-start gap-2 py-3">
            <Icono nombre="mensaje" className="mt-0.5 shrink-0 text-ty" tamano={20} />
            <p className="font-bold">{viaje.nota}</p>
          </Tarjeta>
        )}
      </div>
      <div className="area-segura-abajo space-y-3 px-5 pt-2">
        <Navegar lat={viaje.recogida.lat} lng={viaje.recogida.lng} />
        <Boton
          id="boton-llegue"
          tamano="grande"
          icono="pin"
          deshabilitado={!cerca}
          cargando={llegue.isPending}
          alPulsar={() => llegue.mutate()}
        >
          {cerca
            ? 'Ya llegué'
            : distanciaM === null
              ? 'Buscando tu ubicación…'
              : `Acércate · faltan ${distancia(Math.max(0, distanciaM - RADIO_LLEGADA_M))}`}
        </Boton>
        <CancelarViaje viaje={viaje} enSitio={false} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 2. esperando al pasajero */

function EnSitio({ viaje }: { viaje: ViajeActual }) {
  const qc = useQueryClient();
  const ahora = useAhora(1000);
  const [pin, setPin] = useState('');
  const pinDemo = useDemo((s) => s.pines[viaje.id]);
  const t = viaje.tarifa;
  const gratisS = (t?.esperaMinutosGratis ?? 3) * 60;
  const esperaS = viaje.tiempos.enSitioEn
    ? Math.max(0, (ahora - Date.parse(viaje.tiempos.enSitioEn)) / 1000)
    : 0;
  const excedido = esperaS > gratisS;
  const cobro = t ? Math.ceil(Math.max(0, esperaS - gratisS) / 60) * t.esperaMinuto : 0;

  const iniciar = useMutation({
    mutationFn: () =>
      api.post<ViajeActual | null>(
        `/v1/conductor/viajes/${viaje.id}/iniciar`,
        viaje.pinRequerido ? { pin } : {},
      ),
    onSuccess: (v) => {
      ding();
      vibrar('exito');
      tomarViaje(qc, v);
    },
    onError: (e) => {
      vibrar('alerta');
      setPin('');
      avisar(mensajeDe(e), 'error');
    },
  });

  const faltaPin = viaje.pinRequerido && pin.length !== 4;

  return (
    <>
      <Cabecera viaje={viaje} etapa="Ya llegaste" />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5">
        <motion.div
          animate={excedido ? { scale: [1, 1.03, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.6 }}
          className={`rounded-tarjeta border-2 px-8 py-5 text-center ${excedido ? 'border-sol bg-sol/10' : 'border-ty/50 bg-ty/10'}`}
        >
          <p className="text-sm font-extrabold uppercase tracking-wide text-suave">
            Esperando al pasajero
          </p>
          <p className="numeros text-6xl font-black" id="reloj-espera">
            {reloj(esperaS)}
          </p>
          <p className={`text-base font-bold ${excedido ? 'text-sol' : 'text-ty'}`}>
            {excedido
              ? `Espera cobrada: ${pesos(cobro)}`
              : `Gratis por ${reloj(Math.max(0, gratisS - esperaS))} más`}
          </p>
        </motion.div>

        {viaje.pinRequerido && (
          <div className="w-full max-w-xs space-y-3">
            {pinDemo && (
              <button
                type="button"
                id="pin-demo"
                onClick={() => setPin(pinDemo)}
                className="w-full rounded-2xl border border-dashed border-sol/60 bg-sol/10 px-4 py-2 text-sm font-bold text-sol"
              >
                Modo demostración: el PIN del pasajero es{' '}
                <span className="numeros text-lg font-black">{pinDemo}</span> · toca para usarlo
              </button>
            )}
            <p className="text-center text-lg font-extrabold">Pídele su PIN de 4 dígitos</p>
            <div
              className="flex justify-center gap-3"
              aria-label={`PIN: ${pin.length} de 4 dígitos`}
            >
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={pin[i] ? { scale: [1.2, 1] } : {}}
                  className={`numeros grid size-14 place-items-center rounded-2xl border-2 text-3xl font-black ${i === pin.length ? 'border-ty' : 'border-borde'} bg-superficie`}
                >
                  {pin[i] ? '•' : ''}
                </motion.div>
              ))}
            </div>
            <Teclado
              alTecla={(c) => setPin((p) => (p.length < 4 ? p + c : p))}
              alBorrar={() => setPin((p) => p.slice(0, -1))}
            />
          </div>
        )}
      </div>
      <div className="area-segura-abajo space-y-3 px-5 pt-2">
        <Boton
          id="boton-iniciar"
          tamano="grande"
          icono="rayo"
          deshabilitado={faltaPin}
          cargando={iniciar.isPending}
          alPulsar={() => iniciar.mutate()}
        >
          Iniciar viaje
        </Boton>
        <CancelarViaje viaje={viaje} enSitio />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 3. viaje en curso: el taxímetro */

function EnViaje({ viaje }: { viaje: ViajeActual }) {
  const qc = useQueryClient();
  const medicion = useTaximetro((s) => s.resumen);
  const ahora = useAhora(1000);
  const velocidad = useUbicacion((s) => s.posicion?.velocidadKmh ?? null);
  const { rumbo, distanciaM, orientacion } = useRumbo(viaje.destino);
  const [confirmando, setConfirmando] = useState(false);
  const jornada = useJornada.getState();

  const { total, fija } = tarifaEnVivo(viaje, medicion);
  const inicio = viaje.tiempos.iniciadoEn ? Date.parse(viaje.tiempos.iniciadoEn) : ahora;
  const detenido = velocidad !== null && velocidad < 3;

  const finalizar = useMutation({
    mutationFn: () => {
      const m = useTaximetro.getState().resumen;
      return api.post<ResultadoFinalizar>(`/v1/conductor/viajes/${viaje.id}/finalizar`, {
        distanciaM: m.distanciaM,
        tiempoDetenidoS: m.tiempoDetenidoS,
        duracionS: Math.max(m.duracionS, Math.round((Date.now() - inicio) / 1000)),
      });
    },
    onSuccess: async (r) => {
      descartarTaximetro(viaje.id);
      tada();
      vibrar('exito');
      celebrar('grande');
      jornada.ponerResumen(r);
      setConfirmando(false);
      await refrescarViaje(qc);
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  return (
    <>
      <Cabecera
        viaje={viaje}
        etapa={fija ? `Ruta fija a ${viaje.rutaFija?.destino ?? ''}` : 'En viaje'}
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
        <div className="text-center">
          <p className="text-sm font-extrabold uppercase tracking-wide text-suave">
            {fija ? 'Tarifa acordada' : 'Taxímetro'}
          </p>
          <Numero
            valor={total}
            formato={pesos}
            duracion={0.4}
            className="block text-7xl font-black text-ty drop-shadow-[0_0_28px_rgb(7_213_7/0.45)]"
          />
          {!fija && (
            <p className="text-sm text-suave">Se calcula con el GPS y se confirma al terminar</p>
          )}
        </div>

        <div className="grid w-full max-w-md grid-cols-3 gap-3">
          <Medida
            id="medida-distancia"
            etiqueta="Distancia"
            valor={distancia(medicion.distanciaM)}
          />
          <Medida id="medida-duracion" etiqueta="Duración" valor={reloj((ahora - inicio) / 1000)} />
          <Medida
            id="medida-detenido"
            etiqueta={detenido ? 'Detenido ⏸' : 'Detenido'}
            valor={duracion(medicion.tiempoDetenidoS)}
            resaltada={detenido}
          />
        </div>

        <Radar
          rumbo={rumbo}
          distanciaM={distanciaM}
          orientacion={orientacion}
          etiquetaObjetivo={viaje.destino.direccion ?? 'Destino'}
          tamano={210}
        />
      </div>
      <div className="area-segura-abajo space-y-3 px-5 pt-2">
        <Navegar lat={viaje.destino.lat} lng={viaje.destino.lng} />
        <Boton
          id="boton-finalizar"
          tamano="grande"
          icono="bandera"
          alPulsar={() => setConfirmando(true)}
        >
          Finalizar viaje
        </Boton>
      </div>

      <Hoja
        abierta={confirmando}
        alCerrar={() => setConfirmando(false)}
        titulo="¿Llegaste al destino?"
      >
        <p className="mb-4 text-lg text-suave">
          Vamos a cerrar el taxímetro y calcular el valor final del viaje.
        </p>
        <div className="space-y-3 pb-3">
          <Boton
            id="confirmar-finalizar"
            tamano="grande"
            icono="ok"
            cargando={finalizar.isPending}
            alPulsar={() => finalizar.mutate()}
          >
            Sí, finalizar
          </Boton>
          <Boton variante="secundario" alPulsar={() => setConfirmando(false)}>
            Todavía no
          </Boton>
        </div>
      </Hoja>
    </>
  );
}

function Medida({
  id,
  etiqueta,
  valor,
  resaltada = false,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  resaltada?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-2 py-3 text-center ${resaltada ? 'border-sol bg-sol/10' : 'border-borde bg-superficie'}`}
    >
      <p id={id} className="numeros text-xl font-black leading-tight">
        {valor}
      </p>
      <p className="text-xs font-bold text-suave">{etiqueta}</p>
    </div>
  );
}
