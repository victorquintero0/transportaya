import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Boton } from '../componentes/ui/Boton.tsx';
import { Chip } from '../componentes/ui/Chip.tsx';
import { Estrellas } from '../componentes/ui/Estrellas.tsx';
import { Icono } from '../componentes/ui/Icono.tsx';
import { Numero } from '../componentes/ui/Numero.tsx';
import { Tarjeta } from '../componentes/ui/Tarjeta.tsx';
import { Teclado } from '../componentes/ui/Teclado.tsx';
import { avisar } from '../estado/avisos.ts';
import { useJornada } from '../estado/jornada.ts';
import { api, mensajeDe } from '../lib/api.ts';
import { distancia, duracion, pesos } from '../lib/formato.ts';
import { ding } from '../lib/sonido.ts';
import type { ResultadoFinalizar } from '../lib/tipos.ts';

const ETIQUETAS_BUENAS = ['Amable', 'Puntual', 'Respetuoso'];
const ETIQUETAS_MALAS = ['Demoró mucho', 'Trato irrespetuoso', 'Dejó sucio el carro'];

/** Lo que pasa justo al terminar un viaje: ver cuánto ganaste, confirmar el efectivo y calificar. */
export function Resumen({ resultado }: { resultado: ResultadoFinalizar }) {
  const cobraEfectivo = resultado.cobrarEnEfectivo > 0 && resultado.metodoPago === 'efectivo';
  const [paso, setPaso] = useState<'resumen' | 'cobro' | 'calificar'>('resumen');
  const siguiente = () => setPaso(cobraEfectivo ? 'cobro' : 'calificar');

  return (
    <div className="fondo-calles flex min-h-dvh flex-col">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={paso}
          className="flex flex-1 flex-col"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.22 }}
        >
          {paso === 'resumen' && <Ganaste resultado={resultado} alSeguir={siguiente} />}
          {paso === 'cobro' && (
            <CobroEfectivo resultado={resultado} alSeguir={() => setPaso('calificar')} />
          )}
          {paso === 'calificar' && <Calificar resultado={resultado} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Linea({
  texto,
  valor,
  fuerte = false,
  negativo = false,
}: {
  texto: string;
  valor: string;
  fuerte?: boolean;
  negativo?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${fuerte ? 'text-xl font-black' : 'text-base font-bold'}`}
    >
      <span className={fuerte ? '' : 'text-suave'}>{texto}</span>
      <span className={`numeros ${negativo ? 'text-suave' : fuerte ? 'text-ty' : ''}`}>
        {valor}
      </span>
    </div>
  );
}

function Ganaste({ resultado, alSeguir }: { resultado: ResultadoFinalizar; alSeguir: () => void }) {
  const m = resultado.mediciones.cobradas;
  return (
    <>
      <div className="area-segura-arriba flex flex-1 flex-col items-center gap-5 px-5 pt-6">
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 12 }}
          className="grid size-24 place-items-center rounded-full bg-ty text-sobre-ty shadow-brillo"
        >
          <Icono nombre="ok" tamano={52} strokeWidth={3} />
        </motion.div>
        <div className="text-center">
          <h1 className="text-3xl font-black">¡Viaje terminado!</h1>
          <p className="text-suave">Viaje {resultado.codigo}</p>
        </div>

        <div className="text-center">
          <p className="text-sm font-extrabold uppercase tracking-wide text-suave">Ganaste</p>
          <Numero
            valor={resultado.gananciaNeta}
            formato={pesos}
            duracion={1.1}
            className="block text-7xl font-black text-ty"
          />
        </div>

        <Tarjeta className="w-full max-w-md space-y-2.5">
          <Linea texto="Valor del viaje" valor={pesos(resultado.precioFinal)} />
          {resultado.cobroEspera > 0 && (
            <Linea texto="Incluye espera" valor={pesos(resultado.cobroEspera)} />
          )}
          <Linea texto="Comisión TransporteYa" valor={`− ${pesos(resultado.comision)}`} negativo />
          <div className="border-t border-borde pt-2.5">
            <Linea texto="Tu ganancia" valor={pesos(resultado.gananciaNeta)} fuerte />
          </div>
        </Tarjeta>

        <div className="flex flex-wrap justify-center gap-2">
          <Chip>
            <Icono nombre="pin" tamano={14} /> {distancia(m.distanciaM)}
          </Chip>
          <Chip>
            <Icono nombre="reloj" tamano={14} /> {duracion(m.duracionS)}
          </Chip>
          <Chip>⏸ {duracion(m.tiempoDetenidoS)} detenido</Chip>
          <Chip tono={resultado.mediciones.verificadas ? 'ok' : 'aviso'}>
            {resultado.mediciones.verificadas ? 'Medición verificada' : 'Medición ajustada'}
          </Chip>
        </div>
      </div>
      <div className="area-segura-abajo px-5 pt-3">
        <Boton id="resumen-seguir" tamano="grande" icono="derecha" alPulsar={alSeguir}>
          {resultado.cobrarEnEfectivo > 0 ? 'Cobrar al pasajero' : 'Calificar al pasajero'}
        </Boton>
      </div>
    </>
  );
}

function CobroEfectivo({
  resultado,
  alSeguir,
}: {
  resultado: ResultadoFinalizar;
  alSeguir: () => void;
}) {
  const [otro, setOtro] = useState(false);
  const [texto, setTexto] = useState('');
  const confirmar = useMutation({
    mutationFn: (monto: number) =>
      api.post(`/v1/conductor/viajes/${resultado.viajeId}/efectivo-recibido`, { monto }),
    onSuccess: () => {
      ding();
      alSeguir();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  const monto = Number(texto || 0);

  return (
    <>
      <div className="area-segura-arriba flex flex-1 flex-col items-center gap-5 px-5 pt-8 text-center">
        <span className="grid size-20 place-items-center rounded-full bg-sol/15 text-sol">
          <Icono nombre="efectivo" tamano={44} />
        </span>
        <div>
          <p className="text-sm font-extrabold uppercase tracking-wide text-suave">
            Cobra en efectivo
          </p>
          <p className="numeros text-6xl font-black text-sol" id="cobrar-efectivo">
            {pesos(resultado.cobrarEnEfectivo)}
          </p>
        </div>
        {otro ? (
          <div className="w-full max-w-xs space-y-3">
            <p className="text-lg font-bold text-suave">¿Cuánto te dio el pasajero?</p>
            <p className="numeros min-h-12 text-4xl font-black" aria-live="polite">
              {texto ? pesos(monto) : '$ 0'}
            </p>
            <Teclado
              alTecla={(c) => setTexto((t) => (t.length < 7 ? String(Number(t + c)) : t))}
              alBorrar={() => setTexto((t) => t.slice(0, -1))}
            />
            {monto > 0 && monto < resultado.cobrarEnEfectivo && (
              <p className="text-sm font-bold text-sol">
                Recibiste {pesos(resultado.cobrarEnEfectivo - monto)} menos. Quedará como deuda del
                pasajero y abriremos un caso de soporte.
              </p>
            )}
            {monto > resultado.cobrarEnEfectivo && (
              <p className="text-sm text-suave">
                Recuerda devolver el cambio: {pesos(monto - resultado.cobrarEnEfectivo)}.
              </p>
            )}
          </div>
        ) : (
          <p className="max-w-xs text-lg text-suave">
            Confirma que recibiste el valor completo del viaje.
          </p>
        )}
      </div>
      <div className="area-segura-abajo space-y-3 px-5 pt-3">
        {otro ? (
          <Boton
            id="confirmar-efectivo-otro"
            tamano="grande"
            icono="ok"
            deshabilitado={monto <= 0}
            cargando={confirmar.isPending}
            alPulsar={() => confirmar.mutate(Math.min(monto, resultado.cobrarEnEfectivo))}
          >
            Confirmar {texto ? pesos(Math.min(monto, resultado.cobrarEnEfectivo)) : ''}
          </Boton>
        ) : (
          <>
            <Boton
              id="confirmar-efectivo"
              tamano="grande"
              icono="ok"
              cargando={confirmar.isPending}
              alPulsar={() => confirmar.mutate(resultado.cobrarEnEfectivo)}
            >
              Recibí {pesos(resultado.cobrarEnEfectivo)}
            </Boton>
            <Boton variante="secundario" alPulsar={() => setOtro(true)}>
              Recibí otro valor
            </Boton>
          </>
        )}
      </div>
    </>
  );
}

function Calificar({ resultado }: { resultado: ResultadoFinalizar }) {
  const qc = useQueryClient();
  const cerrar = useJornada((s) => s.ponerResumen);
  const [estrellas, setEstrellas] = useState(5);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);

  const terminar = () => {
    cerrar(null);
    void qc.invalidateQueries({ queryKey: ['ganancias'] });
    void qc.invalidateQueries({ queryKey: ['saldo'] });
    void qc.invalidateQueries({ queryKey: ['perfil'] });
  };

  const enviar = useMutation({
    mutationFn: () =>
      api.post(`/v1/conductor/viajes/${resultado.viajeId}/calificacion`, { estrellas, etiquetas }),
    onSuccess: () => {
      ding();
      avisar('¡Gracias por calificar!', 'exito');
      terminar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  const lista = estrellas >= 4 ? ETIQUETAS_BUENAS : ETIQUETAS_MALAS;

  return (
    <>
      <div className="area-segura-arriba flex flex-1 flex-col items-center gap-6 px-5 pt-10 text-center">
        <div>
          <h1 className="text-3xl font-black">¿Cómo fue el pasajero?</h1>
          <p className="mt-1 text-suave">
            Tu opinión ayuda a mantener la comunidad segura. Es anónima.
          </p>
        </div>
        <Estrellas
          valor={estrellas}
          alCambiar={(n) => (setEstrellas(n), setEtiquetas([]))}
          tamano={48}
        />
        <div className="flex flex-wrap justify-center gap-2">
          {lista.map((e) => {
            const on = etiquetas.includes(e);
            return (
              <button
                key={e}
                type="button"
                onClick={() => setEtiquetas((a) => (on ? a.filter((x) => x !== e) : [...a, e]))}
                className={`min-h-11 rounded-full border-2 px-4 text-base font-extrabold ${on ? 'border-ty bg-ty text-sobre-ty' : 'border-borde bg-superficie'}`}
              >
                {e}
              </button>
            );
          })}
        </div>
      </div>
      <div className="area-segura-abajo space-y-2 px-5 pt-3">
        <Boton
          id="enviar-calificacion"
          tamano="grande"
          icono="ok"
          cargando={enviar.isPending}
          alPulsar={() => enviar.mutate()}
        >
          Enviar y seguir
        </Boton>
        <Boton variante="fantasma" alPulsar={terminar}>
          Omitir
        </Boton>
      </div>
    </>
  );
}
