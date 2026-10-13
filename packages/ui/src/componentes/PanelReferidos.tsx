import { motion } from 'motion/react';
import { useState } from 'react';
import { numero, pesos } from '../lib/formato.ts';
import {
  mensajeInvitacion,
  NOMBRE_TIPO_PUNTOS,
  type EstadoReferido,
  type MovimientoPuntos,
  type ResumenReferidos,
} from '../lib/referidos.ts';
import { avisar } from '../estado/avisos.ts';
import { Boton } from './Boton.tsx';
import { Chip } from './Chip.tsx';
import { Icono } from './Icono.tsx';
import { Numero } from './Numero.tsx';
import { Tarjeta } from './Tarjeta.tsx';

interface Props {
  rol: 'pasajero' | 'conductor';
  resumen: ResumenReferidos;
  movimientos: MovimientoPuntos[];
  /** Escribir el código de quien invitó. Debe lanzar si el servidor lo rechaza. */
  alUsarCodigo: (codigo: string) => Promise<void>;
  /** Solo conductores: pagar la comisión con puntos. */
  alAbonar?: () => Promise<void>;
}

const ESTADO: Record<EstadoReferido, { texto: string; tono: 'ok' | 'aviso' | 'malo' | 'neutro' }> =
  {
    pendiente: { texto: 'Falta su primer viaje', tono: 'aviso' },
    otorgado: { texto: 'Ya ganaste', tono: 'ok' },
    rechazado: { texto: 'No aplicó', tono: 'malo' },
    revertido: { texto: 'Anulado', tono: 'neutro' },
  };

function diaCorto(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  });
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * El programa de puntos por referidos, igual para pasajeros y conductores (RN-120 a RN-129): tu código para invitar,
 * tus puntos y lo que valen, quién se ha unido y el historial. Los datos y las acciones llegan por props.
 */
export function PanelReferidos({ rol, resumen: r, movimientos, alUsarCodigo, alAbonar }: Props) {
  const [escrito, setEscrito] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [abonando, setAbonando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const porInvitado =
    rol === 'pasajero' ? r.recompensas.invitarPasajero : r.recompensas.invitarConductor;
  const bienvenida = r.recompensas.bienvenidaPasajero;
  const mensaje = mensajeInvitacion(r.codigo, bienvenida, window.location.origin);

  const invitar = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'TransporteYa', text: mensaje });
        return;
      } catch {
        // la persona cerró el menú de compartir: no es un error
        return;
      }
    }
    avisar((await copiar(mensaje)) ? 'Mensaje copiado, pégalo donde quieras' : r.codigo, 'info');
  };

  const enviarCodigo = async () => {
    setError(null);
    setEnviando(true);
    try {
      await alUsarCodigo(escrito);
      setEscrito('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos usar ese código');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4" data-referidos={rol}>
      {!r.activo && (
        <p
          className="rounded-xl bg-sol/10 px-4 py-3 text-sm font-bold text-sol"
          id="referidos-inactivo"
        >
          El programa de puntos está en pausa. Tus puntos se conservan.
        </p>
      )}

      <Tarjeta resaltada className="space-y-1 text-center">
        <p className="text-sm font-extrabold text-suave">Tus puntos</p>
        <p className="text-5xl font-black text-ty" id="puntos-saldo">
          <Numero valor={r.saldo} formato={(n) => numero(Math.round(n))} />
        </p>
        <p className="text-sm font-bold text-suave">
          Valen {pesos(r.valorSaldo)} · cada punto es {pesos(r.valorPunto)}
        </p>
      </Tarjeta>

      {rol === 'conductor' && alAbonar && (
        <Tarjeta className="space-y-3" id="abonar-comision">
          <div className="flex items-start gap-3">
            <Icono nombre="billetera" className="mt-0.5 shrink-0 text-ty" />
            <div className="flex-1">
              <p className="font-extrabold">Paga tu comisión con puntos</p>
              {r.deuda && r.deuda > 0 ? (
                <p className="text-sm text-suave">
                  Debes {pesos(r.deuda)}.{' '}
                  {r.abono
                    ? `Puedes pagar ${pesos(r.abono.monto)} con ${numero(r.abono.puntos)} puntos.`
                    : `Necesitas al menos ${numero(r.minAbonoPuntos)} puntos para abonar.`}
                </p>
              ) : (
                <p className="text-sm text-suave">
                  Cuando tengas comisión pendiente podrás pagarla con tus puntos.
                </p>
              )}
            </div>
          </div>
          {r.abono && (
            <Boton
              id="abonar"
              icono="ok"
              cargando={abonando}
              alPulsar={async () => {
                setAbonando(true);
                try {
                  await alAbonar();
                } finally {
                  setAbonando(false);
                }
              }}
            >
              Abonar {pesos(r.abono.monto)}
            </Boton>
          )}
        </Tarjeta>
      )}

      <Tarjeta className="space-y-3">
        <div className="flex items-center gap-2">
          <Icono nombre="chispas" className="text-ty" />
          <h2 className="text-lg font-black">Invita y gana</h2>
        </div>
        <p className="text-sm text-suave">
          Compártelo con quien quieras. Cuando termine su primer viaje (desde{' '}
          {pesos(r.recompensas.viajeMinimo)}) ganas {numero(porInvitado)} puntos y tu invitado
          recibe {numero(bienvenida)}.
        </p>
        <button
          type="button"
          id="mi-codigo"
          aria-label={`Copiar mi código ${r.codigo}`}
          onClick={async () => {
            avisar((await copiar(r.codigo)) ? 'Código copiado' : r.codigo, 'info');
          }}
          className="flex min-h-16 w-full items-center justify-between rounded-2xl border-2 border-dashed border-ty/60 bg-ty/5 px-5"
        >
          <span className="numeros text-3xl font-black tracking-widest">{r.codigo}</span>
          <Icono nombre="copiar" className="text-ty" />
        </button>
        <Boton id="invitar" icono="compartir" alPulsar={() => void invitar()}>
          Invitar
        </Boton>
      </Tarjeta>

      {r.usoCodigo ? (
        <Tarjeta className="flex items-center gap-3" id="uso-codigo">
          <Icono nombre="ok" className="shrink-0 text-ty" />
          <p className="flex-1 text-sm">
            Te invitó <b>{r.usoCodigo.referidor}</b> con el código {r.usoCodigo.codigo}.{' '}
            {r.usoCodigo.estado === 'otorgado'
              ? `Ganaste ${numero(r.usoCodigo.puntos)} puntos de bienvenida.`
              : r.usoCodigo.estado === 'pendiente'
                ? `Termina tu primer viaje y ganas ${numero(bienvenida)} puntos.`
                : 'Este código ya no suma puntos.'}
          </p>
        </Tarjeta>
      ) : (
        r.puedeUsarCodigo && (
          <Tarjeta className="space-y-3" id="tengo-codigo">
            <h2 className="text-lg font-black">¿Alguien te invitó?</h2>
            <p className="text-sm text-suave">
              Escribe su código y ganas {numero(bienvenida)} puntos con tu primer viaje. Tienes{' '}
              {r.ventanaDias} días desde que te registraste.
            </p>
            <input
              id="codigo-invitacion"
              value={escrito}
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label="Código de quien te invitó"
              placeholder="ANA-7K3Q"
              onChange={(e) => {
                setEscrito(e.target.value.toUpperCase());
                setError(null);
              }}
              className="numeros min-h-14 w-full rounded-xl border border-borde bg-fondo px-4 text-xl font-black tracking-widest outline-none placeholder:font-semibold placeholder:text-borde"
            />
            {error && (
              <p className="text-sm font-bold text-peligro" id="error-codigo" role="alert">
                {error}
              </p>
            )}
            <Boton
              id="usar-codigo"
              variante="secundario"
              deshabilitado={escrito.trim().length < 4}
              cargando={enviando}
              alPulsar={() => void enviarCodigo()}
            >
              Usar código
            </Boton>
          </Tarjeta>
        )
      )}

      {r.invitados.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-black">
            Tus invitados{' '}
            <span className="text-sm font-bold text-suave">
              · {r.totales.otorgados} de {r.totales.invitados} ya viajaron
            </span>
          </h2>
          <ul className="space-y-2" id="invitados">
            {r.invitados.map((i) => {
              const e = ESTADO[i.estado];
              return (
                <li
                  key={i.id}
                  className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">{i.nombre}</span>
                    <span className="block text-sm text-suave">
                      {i.rol === 'conductor' ? 'Conductor' : 'Pasajero'} · {diaCorto(i.creadoEn)}
                    </span>
                  </span>
                  <span className="text-right">
                    <Chip tono={e.tono}>{e.texto}</Chip>
                    {i.puntos > 0 && (
                      <span className="numeros mt-1 block text-sm font-black text-ty">
                        +{numero(i.puntos)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-black">Movimientos</h2>
        {movimientos.length === 0 ? (
          <p className="rounded-tarjeta border border-borde bg-superficie p-5 text-center text-suave">
            Aquí verás los puntos que ganas y usas.
          </p>
        ) : (
          <ul className="space-y-2" id="movimientos-puntos">
            {movimientos.map((m, i) => (
              <motion.li
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
                className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">
                    {NOMBRE_TIPO_PUNTOS[m.tipo] ?? m.tipo}
                  </span>
                  <span className="block truncate text-sm text-suave">
                    {diaCorto(m.creadoEn)}
                    {m.viaje ? ` · ${m.viaje}` : ''}
                  </span>
                </span>
                <span className="text-right">
                  <span
                    className={`numeros block font-black ${m.puntos >= 0 ? 'text-ty' : 'text-texto'}`}
                  >
                    {m.puntos >= 0 ? '+' : '−'}
                    {numero(Math.abs(m.puntos))}
                  </span>
                  <span className="numeros block text-xs font-bold text-suave">
                    {pesos(Math.abs(m.valor))}
                  </span>
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
