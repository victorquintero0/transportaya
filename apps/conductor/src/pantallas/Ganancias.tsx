import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Boton } from '../componentes/ui/Boton.tsx';
import { Chip } from '../componentes/ui/Chip.tsx';
import { Hoja } from '../componentes/ui/Hoja.tsx';
import { Icono, type NombreIcono } from '../componentes/ui/Icono.tsx';
import { Numero } from '../componentes/ui/Numero.tsx';
import { Tarjeta } from '../componentes/ui/Tarjeta.tsx';
import { avisar } from '../estado/avisos.ts';
import { api, mensajeDe } from '../lib/api.ts';
import { celebrar } from '../lib/confeti.ts';
import { useSimulador } from '../lib/consultas.ts';
import {
  diaCorto,
  diaLargo,
  distancia,
  duracion,
  hora,
  pesos,
  pesosCorto,
} from '../lib/formato.ts';
import type { Cierre, Movimiento, Saldo } from '../lib/tipos.ts';
import { ding } from '../lib/sonido.ts';
import { useGanancias } from './Inicio.tsx';

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes';
const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: 'hoy', texto: 'Hoy' },
  { id: 'ayer', texto: 'Ayer' },
  { id: 'semana', texto: 'Semana' },
  { id: 'mes', texto: 'Mes' },
];

export function Ganancias() {
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const g = useGanancias(periodo);
  const d = g.data;
  const maximo = Math.max(1, ...(d?.porDia.map((x) => x.neto) ?? [0]));

  return (
    <div className="fondo-calles min-h-dvh pb-28">
      <header className="area-segura-arriba px-5">
        <h1 className="text-3xl font-black">Mis ganancias</h1>
      </header>

      <div className="mt-4 flex gap-2 px-5" role="tablist" aria-label="Periodo">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={periodo === p.id}
            onClick={() => setPeriodo(p.id)}
            className="relative min-h-11 flex-1 rounded-full text-base font-extrabold"
          >
            {periodo === p.id && (
              <motion.span
                layoutId="periodo"
                className="absolute inset-0 rounded-full bg-ty"
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              />
            )}
            <span className={`relative ${periodo === p.id ? 'text-sobre-ty' : 'text-suave'}`}>
              {p.texto}
            </span>
          </button>
        ))}
      </div>

      <section className="mt-5 space-y-4 px-5">
        <Tarjeta resaltada className="text-center">
          <p className="text-sm font-extrabold uppercase tracking-wide text-suave">Ganaste</p>
          <Numero
            valor={d?.neto ?? 0}
            formato={pesos}
            className="block text-6xl font-black text-ty"
          />
          <p className="mt-1 text-suave">
            en <b className="text-texto">{d?.viajes ?? 0}</b> {d?.viajes === 1 ? 'viaje' : 'viajes'}
            {d && d.promedioPorViaje > 0 ? ` · ${pesosCorto(d.promedioPorViaje)} por viaje` : ''}
          </p>
        </Tarjeta>

        {d && d.porDia.length > 1 && (
          <Tarjeta>
            <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Ganancias por día">
              {d.porDia.map((x, i) => (
                <div
                  key={x.dia}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                >
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{
                      height: `${Math.max(x.neto > 0 ? 6 : 2, (x.neto / maximo) * 100)}%`,
                    }}
                    transition={{ delay: i * 0.03, type: 'spring', stiffness: 120, damping: 16 }}
                    className={`w-full rounded-t-lg ${x.neto > 0 ? 'bg-ty' : 'bg-borde'}`}
                    title={`${diaLargo(x.dia)}: ${pesos(x.neto)}`}
                  />
                  {d.porDia.length <= 8 && (
                    <span className="text-[0.65rem] font-bold text-suave">
                      {diaCorto(x.dia).slice(0, 3)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Tarjeta>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Dato titulo="Cobrado en viajes" valor={pesos(d?.bruto ?? 0)} />
          <Dato titulo="Comisión" valor={`− ${pesos(d?.comision ?? 0)}`} />
          <Dato titulo="En efectivo" valor={pesos(d?.efectivo ?? 0)} />
          <Dato titulo="Por la app" valor={pesos(d?.electronico ?? 0)} />
          <Dato titulo="Recorrido" valor={distancia(d?.distanciaM ?? 0)} />
          <Dato titulo="Conectado" valor={duracion((d?.horasConectado ?? 0) * 3600)} />
        </div>

        <CuentaConTransporteYa />
        <Movimientos />
      </section>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Tarjeta className="px-4 py-3">
      <p className="text-sm font-bold text-suave">{titulo}</p>
      <p className="numeros text-xl font-black">{valor}</p>
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------ saldo y comisión */

export function useSaldo() {
  return useQuery({
    queryKey: ['saldo'],
    queryFn: () => api.get<Saldo>('/v1/conductor/saldo'),
    refetchInterval: 30_000,
  });
}

function CuentaConTransporteYa() {
  const { data: s } = useSaldo();
  const [abierta, setAbierta] = useState(false);
  if (!s) return null;
  const debe = s.deuda > 0;

  return (
    <>
      <Tarjeta resaltada={!debe && s.aFavor > 0} className={debe ? 'border-sol/60 bg-sol/10' : ''}>
        <div className="flex items-start gap-3">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-xl ${debe ? 'bg-sol/20 text-sol' : 'bg-ty/15 text-ty'}`}
          >
            <Icono nombre={debe ? 'alerta' : 'billetera'} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-extrabold uppercase tracking-wide text-suave">
              Tu cuenta con TransporteYa
            </p>
            {debe ? (
              <>
                <p className="numeros text-3xl font-black text-sol" id="deuda-valor">
                  Debes {pesos(s.deuda)}
                </p>
                <p className="mt-1 text-suave">
                  Es la comisión de tus viajes en efectivo.{' '}
                  {s.bloqueadoPorDeuda
                    ? 'Págala para volver a conectarte.'
                    : 'Págala antes de que termine el día siguiente para no quedar bloqueado.'}
                </p>
              </>
            ) : s.aFavor > 0 ? (
              <>
                <p className="numeros text-3xl font-black text-ty">Te debemos {pesos(s.aFavor)}</p>
                <p className="mt-1 text-suave">
                  Te lo consignamos a tu cuenta con el próximo cierre.
                </p>
              </>
            ) : (
              <p className="text-2xl font-black text-ty">Estás al día ✓</p>
            )}
            {s.ultimoCierre && (
              <p className="mt-2 text-sm text-suave">
                Último cierre: {diaLargo(s.ultimoCierre.dia)}
              </p>
            )}
          </div>
        </div>
        {s.pagosEnRevision.map((p) => (
          <div
            key={p.id}
            className="mt-3 flex items-center gap-2 rounded-xl bg-superficie-2 px-3 py-2"
          >
            <Chip tono="info">Revisando</Chip>
            <span className="numeros flex-1 font-bold">{pesos(p.monto)}</span>
            <span className="text-xs text-suave">{p.referencia}</span>
          </div>
        ))}
        {debe && (
          <div className="mt-4">
            <Boton
              id="pagar-comision"
              tamano="grande"
              icono="rayo"
              alPulsar={() => setAbierta(true)}
            >
              Pagar mi comisión
            </Boton>
          </div>
        )}
      </Tarjeta>
      <HojaPago abierta={abierta} alCerrar={() => setAbierta(false)} saldo={s} />
    </>
  );
}

function HojaPago({
  abierta,
  alCerrar,
  saldo,
}: {
  abierta: boolean;
  alCerrar: () => void;
  saldo: Saldo;
}) {
  const qc = useQueryClient();
  const simulador = useSimulador();
  const [referencia, setReferencia] = useState('');
  const [copiado, setCopiado] = useState(false);
  const llave = saldo.datosPago.llave;

  const refrescar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['saldo'] }),
      qc.invalidateQueries({ queryKey: ['perfil'] }),
      qc.invalidateQueries({ queryKey: ['movimientos'] }),
    ]);
  };

  const reportar = useMutation({
    mutationFn: () =>
      api.post('/v1/conductor/pagos-comision', {
        monto: saldo.deuda,
        referencia: referencia.trim(),
      }),
    onSuccess: async () => {
      ding();
      avisar('Recibimos tu aviso. Lo revisamos y te habilitamos.', 'exito');
      alCerrar();
      await refrescar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  const simular = useMutation({
    mutationFn: () => api.post('/v1/dev/pagos-comision/simular', {}),
    onSuccess: async () => {
      ding();
      celebrar('grande');
      avisar('¡Pago recibido! Ya estás al día.', 'exito');
      alCerrar();
      await refrescar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Paga tu comisión">
      <div className="space-y-4 pb-4">
        <ol className="space-y-3 text-lg">
          <li className="flex gap-3">
            <Paso n={1} />
            <span>
              Abre tu app del banco y paga <b className="numeros text-sol">{pesos(saldo.deuda)}</b>{' '}
              por Bre-B a esta llave:
            </span>
          </li>
        </ol>
        <button
          type="button"
          id="copiar-llave"
          disabled={!llave}
          onClick={() => {
            if (!llave) return;
            void navigator.clipboard?.writeText(llave).catch(() => undefined);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ty/60 bg-ty/10 px-4 py-4 text-left"
        >
          <span className="flex-1">
            <span className="block text-xs font-extrabold uppercase tracking-wide text-suave">
              Llave Bre-B · {saldo.datosPago.titular}
            </span>
            <span className="numeros block text-2xl font-black">
              {llave ?? 'Aún no disponible'}
            </span>
          </span>
          <Chip tono={copiado ? 'ok' : 'neutro'}>
            <Icono nombre={copiado ? 'ok' : 'copiar'} tamano={14} />{' '}
            {copiado ? 'Copiada' : 'Copiar'}
          </Chip>
        </button>
        <div className="flex gap-3 text-lg">
          <Paso n={2} />
          <span>Pega aquí el número de comprobante que te da el banco:</span>
        </div>
        <input
          className="min-h-14 w-full rounded-2xl border-2 border-borde bg-superficie px-4 text-lg font-bold outline-none focus:border-ty"
          value={referencia}
          placeholder="Comprobante o referencia"
          onChange={(e) => setReferencia(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
          aria-label="Comprobante"
        />
        <Boton
          id="reportar-pago"
          tamano="grande"
          icono="ok"
          deshabilitado={referencia.trim().length < 4}
          cargando={reportar.isPending}
          alPulsar={() => reportar.mutate()}
        >
          Ya pagué
        </Boton>
        {simulador && (
          <div className="rounded-2xl border border-dashed border-sol/60 bg-sol/10 p-3">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-sol">
              Modo demostración
            </p>
            <Boton
              id="simular-pago"
              variante="secundario"
              icono="chispas"
              cargando={simular.isPending}
              alPulsar={() => simular.mutate()}
            >
              Simular que pagué por Bre-B
            </Boton>
          </div>
        )}
      </div>
    </Hoja>
  );
}

function Paso({ n }: { n: number }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ty text-base font-black text-sobre-ty">
      {n}
    </span>
  );
}

/* ------------------------------------------------------------------ movimientos */

const ICONO_MOVIMIENTO: Record<string, { icono: NombreIcono; texto: string }> = {
  ingreso_viaje_electronico: { icono: 'tarjeta', texto: 'Viaje pagado en la app' },
  comision_viaje_efectivo: { icono: 'efectivo', texto: 'Comisión de viaje en efectivo' },
  peaje: { icono: 'carro', texto: 'Peaje' },
  propina: { icono: 'estrella', texto: 'Propina' },
  cancelacion: { icono: 'cerrar', texto: 'Cancelación' },
  pago_comision: { icono: 'ok', texto: 'Pago de comisión' },
  pago_liquidacion: { icono: 'billetera', texto: 'Pago de TransporteYa' },
  ajuste: { icono: 'chispas', texto: 'Ajuste' },
};

function Movimientos() {
  const { data } = useQuery({
    queryKey: ['movimientos'],
    queryFn: () => api.get<{ movimientos: Movimiento[] }>('/v1/conductor/movimientos?limite=30'),
  });
  const { data: cierres } = useQuery({
    queryKey: ['cierres'],
    queryFn: () => api.get<{ cierres: Cierre[] }>('/v1/conductor/cierres'),
  });
  const lista = data?.movimientos ?? [];

  return (
    <div className="space-y-3">
      {cierres && cierres.cierres.length > 0 && (
        <>
          <h2 className="text-xl font-black">Cierres diarios</h2>
          <Tarjeta className="space-y-2">
            {cierres.cierres.slice(0, 4).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3">
                <span className="font-bold">{diaLargo(c.dia)}</span>
                <span
                  className={`numeros font-black ${c.resultado === 'a_cargo' ? 'text-sol' : 'text-ty'}`}
                >
                  {c.resultado === 'a_cargo'
                    ? `Debías ${pesos(-c.saldoFinal)}`
                    : c.resultado === 'a_favor'
                      ? `Te debíamos ${pesos(c.saldoFinal)}`
                      : 'Al día'}
                </span>
              </div>
            ))}
          </Tarjeta>
        </>
      )}
      <h2 className="text-xl font-black">Movimientos</h2>
      {lista.length === 0 ? (
        <Tarjeta className="py-8 text-center text-suave">
          Aquí verás cada viaje y cada pago.
        </Tarjeta>
      ) : (
        <Tarjeta className="divide-y divide-borde p-0">
          {lista.map((m) => {
            const info = ICONO_MOVIMIENTO[m.tipo] ?? { icono: 'chispas' as const, texto: m.tipo };
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl ${m.monto >= 0 ? 'bg-ty/15 text-ty' : 'bg-sol/15 text-sol'}`}
                >
                  <Icono nombre={info.icono} tamano={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold leading-tight">{info.texto}</p>
                  <p className="text-xs text-suave">
                    {m.viaje ? `${m.viaje} · ` : ''}
                    {hora(m.creadoEn)}
                  </p>
                </div>
                <span className={`numeros font-black ${m.monto >= 0 ? 'text-ty' : 'text-sol'}`}>
                  {m.monto >= 0 ? '+' : '−'} {pesos(Math.abs(m.monto))}
                </span>
              </div>
            );
          })}
        </Tarjeta>
      )}
    </div>
  );
}
