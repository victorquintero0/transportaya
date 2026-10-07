import { api, distancia, duracion, porcentaje } from '@transportaya/ui';
import { distanciaMetros } from '@transportaya/dominio';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import { LEYENDA_MAPA, MapaOperacion } from '../componentes/MapaOperacion.tsx';
import { AccionMotivo, Boton, Insignia, Kpi, Pestanas, Panel, Vacio } from '../componentes/ui.tsx';
import { useEjecutar, useEjecutarConAviso, usePermiso } from '../lib/consultas.ts';
import { ESTADO_OPERATIVO, ESTADO_VIAJE, SEVERIDAD, TIPO_ALERTA } from '../lib/etiquetas.ts';
import { hace } from '../lib/fechas.ts';
import type { Alerta, Torre as TorreDatos, ViajeActivo } from '../lib/tipos.ts';

const COLOR_SEMAFORO = { verde: 'bg-ty', ambar: 'bg-sol', rojo: 'bg-peligro' } as const;

export function PuntoSemaforo({ valor }: { valor: 'verde' | 'ambar' | 'rojo' }) {
  const texto = { verde: 'En tiempo', ambar: 'Demorado', rojo: 'Atrasado' }[valor];
  return (
    <span
      role="img"
      aria-label={texto}
      title={texto}
      className={`inline-block size-3 rounded-full ${COLOR_SEMAFORO[valor]} ${valor === 'rojo' ? 'parpadeo' : ''}`}
    />
  );
}

function FilaAlerta({ a }: { a: Alerta }) {
  const puedeOperar = usePermiso('torre.operar');
  const ejecutar = useEjecutarConAviso();
  const confirmar = useEjecutar();
  const sev = SEVERIDAD[a.severidad]!;
  return (
    <li
      data-alerta={a.tipo}
      className={`rounded-lg border p-3 ${a.severidad === 'critica' ? 'border-peligro/60 bg-peligro/10' : 'border-borde bg-superficie-2'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Insignia tono={sev.tono}>{sev.texto}</Insignia>
            <b className="text-sm">{TIPO_ALERTA[a.tipo] ?? a.tipo}</b>
          </div>
          <p className="mt-1 text-xs text-suave">
            {a.conductor ?? 'Sin conductor'}
            {a.codigoViaje && (
              <>
                {' · '}
                <Link className="font-bold text-ty underline" to={`/viajes/${a.viajeId}`}>
                  {a.codigoViaje}
                </Link>
              </>
            )}
            {' · '}
            {hace(a.creadaEn)}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-suave">
          {a.estado === 'tomada' ? `La atiende ${a.tomadaPorNombre ?? 'alguien'}` : 'Sin atender'}
        </span>
        {puedeOperar && (
          <div className="flex gap-1.5">
            {a.estado === 'abierta' && (
              <Boton
                tamano="sm"
                variante="primario"
                onClick={() =>
                  void ejecutar(() => api.post(`/v1/op/alertas/${a.id}/tomar`), {
                    invalidar: ['torre'],
                  })
                }
              >
                Tomar
              </Boton>
            )}
            <AccionMotivo
              etiqueta="Cerrar"
              titulo={`Cerrar alerta: ${TIPO_ALERTA[a.tipo] ?? a.tipo}`}
              descripcion="Cuenta qué pasó y qué se hizo. Esta nota queda en el historial de la alerta."
              etiquetaMotivo="Nota de cierre"
              confirmar="Cerrar alerta"
              alConfirmar={(nota) =>
                confirmar(() => api.post(`/v1/op/alertas/${a.id}/cerrar`, { nota }), {
                  invalidar: ['torre'],
                  exito: 'Alerta cerrada',
                })
              }
            />
          </div>
        )}
      </div>
    </li>
  );
}

function FilaViaje({
  v,
  activo,
  alElegir,
}: {
  v: ViajeActivo;
  activo: boolean;
  alElegir: () => void;
}) {
  const est = ESTADO_VIAJE[v.estado] ?? { texto: v.estado, tono: 'neutro' as const };
  return (
    <li>
      <button
        type="button"
        data-viaje-activo={v.codigo}
        onClick={alElegir}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${activo ? 'border-ty bg-ty/10' : 'border-borde bg-superficie-2 hover:border-suave'}`}
      >
        <PuntoSemaforo valor={v.semaforo} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <b>{v.codigo}</b>
            <Insignia tono={est.tono}>{est.texto}</Insignia>
          </span>
          <span className="block truncate text-xs text-suave">
            {v.pasajero}
            {v.conductor ? ` → ${v.conductor}` : ''}
          </span>
        </span>
        <span className="numeros text-xs font-bold text-suave">{duracion(v.segundosEnEstado)}</span>
      </button>
    </li>
  );
}

export function Torre() {
  const navegar = useNavigate();
  const puedeDespachar = usePermiso('viajes.despachar');
  const ejecutar = useEjecutarConAviso();
  const [pestana, setPestana] = useState<'alertas' | 'activos' | 'sin'>('alertas');
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['torre'],
    queryFn: () => api.get<TorreDatos>('/v1/op/torre'),
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const viaje = data?.viajesActivos.find((v) => v.id === seleccion) ?? null;

  const marcasConductores = useMemo(
    () =>
      (data?.flota ?? [])
        .filter((c) => c.posicion)
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          estado: c.estado,
          posicion: { lat: c.posicion!.lat, lng: c.posicion!.lng },
          detalle: `${ESTADO_OPERATIVO[c.estado]?.texto ?? c.estado}${c.placa ? ` · ${c.placa}` : ''}`,
        })),
    [data?.flota],
  );
  const marcasViajes = useMemo(
    () =>
      (data?.viajesActivos ?? []).map((v) => ({
        id: v.id,
        codigo: v.codigo,
        origen: v.origen,
        destino: v.destino,
        semaforo: v.semaforo,
        buscando: v.estado === 'buscando_conductor',
      })),
    [data?.viajesActivos],
  );

  // Para despachar: los conductores disponibles, del más cercano al más lejano a la recogida.
  const candidatos = useMemo(() => {
    if (!viaje || viaje.estado !== 'buscando_conductor') return [];
    return (data?.flota ?? [])
      .filter((c) => c.estado === 'disponible' && c.posicion)
      .map((c) => ({ ...c, distanciaM: distanciaMetros(c.posicion!, viaje.origen) }))
      .sort((a, b) => a.distanciaM - b.distanciaM)
      .slice(0, 8);
  }, [data?.flota, viaje]);

  if (isLoading || !data) return <div className="p-8 text-suave">Cargando la torre…</div>;
  const k = data.kpis;

  return (
    <>
      <Encabezado
        titulo="Torre de control"
        subtitulo="La operación en vivo: flota, viajes activos y alertas"
      />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5" id="kpis">
          <Kpi
            etiqueta="Conductores en línea"
            valor={k.conductoresEnLinea}
            icono="carro"
            tono="ok"
            nota={`${k.conductoresDisponibles} disponibles · ${k.conductoresOcupados} ocupados`}
          />
          <Kpi
            etiqueta="Viajes activos"
            valor={k.viajesActivos}
            icono="navegar"
            tono="info"
            nota={`${k.solicitudesUltimaHora} solicitudes en la última hora`}
          />
          <Kpi
            etiqueta="Asignación media"
            valor={k.asignacionMediaS === null ? '—' : duracion(k.asignacionMediaS)}
            icono="reloj"
            nota="Última hora"
          />
          <Kpi
            etiqueta="Cancelaciones 24 h"
            valor={porcentaje(k.tasaCancelacion)}
            icono="cerrar"
            tono={k.tasaCancelacion > 0.25 ? 'aviso' : 'neutro'}
          />
          <Kpi
            etiqueta="Demanda insatisfecha"
            valor={k.demandaInsatisfechaUltimaHora}
            icono="alerta"
            tono={k.demandaInsatisfechaUltimaHora > 0 ? 'error' : 'neutro'}
            nota="Sin conductor, última hora"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_26rem]">
          <div className="space-y-3">
            <div className="relative h-[34rem]">
              <MapaOperacion
                className="absolute inset-0"
                conductores={marcasConductores}
                viajes={marcasViajes}
                seleccionado={seleccion}
                alSeleccionarViaje={(id) => {
                  setSeleccion(id);
                  setPestana('activos');
                }}
                alSeleccionarConductor={(id) => {
                  const v = data.viajesActivos.find((x) => x.conductorId === id);
                  if (v) setSeleccion(v.id);
                }}
              />
              <ul className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-superficie/90 px-3 py-2 text-xs font-bold backdrop-blur">
                {LEYENDA_MAPA.map(([texto, color]) => (
                  <li key={texto} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: color }} />
                    {texto}
                  </li>
                ))}
              </ul>
              {marcasConductores.length === 0 && marcasViajes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-suave">
                  No hay conductores en línea ni viajes en este momento.
                </div>
              )}
            </div>

            {viaje && (
              <Panel
                id="detalle-seleccion"
                titulo={`Viaje ${viaje.codigo}`}
                acciones={
                  <Boton
                    tamano="sm"
                    onClick={() => void navegar(`/viajes/${viaje.id}`)}
                    icono="externo"
                  >
                    Abrir detalle
                  </Boton>
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-suave">Recogida:</span>{' '}
                      {viaje.origenDireccion ?? 'Sin dirección'}
                    </p>
                    <p>
                      <span className="text-suave">Destino:</span>{' '}
                      {viaje.destinoDireccion ?? 'Sin dirección'}
                    </p>
                    <p>
                      <span className="text-suave">Pasajero:</span> {viaje.pasajero} ·{' '}
                      {viaje.metodoPago === 'efectivo' ? 'efectivo' : 'tarjeta'}
                    </p>
                    {viaje.conductor && (
                      <p>
                        <span className="text-suave">Conductor:</span> {viaje.conductor}{' '}
                        {viaje.placa && `· ${viaje.placa}`}
                      </p>
                    )}
                  </div>
                  {viaje.estado === 'buscando_conductor' && puedeDespachar && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-suave">
                        Despacho manual
                      </p>
                      {candidatos.length === 0 ? (
                        <p className="text-sm text-suave">
                          No hay conductores disponibles con posición reciente.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {candidatos.map((c) => (
                            <li
                              key={c.id}
                              className="flex items-center justify-between gap-2 rounded-lg bg-superficie-2 px-3 py-1.5 text-sm"
                            >
                              <span>
                                <b>{c.nombre}</b>
                                <span className="ml-2 text-xs text-suave">
                                  {c.placa} · {distancia(c.distanciaM)}
                                </span>
                              </span>
                              <Boton
                                tamano="sm"
                                variante="primario"
                                onClick={() =>
                                  void ejecutar(
                                    () =>
                                      api.post(`/v1/op/viajes/${viaje.id}/despachar`, {
                                        conductorId: c.id,
                                      }),
                                    {
                                      invalidar: ['torre'],
                                      exito: `Viaje asignado a ${c.nombre}`,
                                    },
                                  )
                                }
                              >
                                Despachar
                              </Boton>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </div>

          <Panel sinRelleno className="flex max-h-[44rem] flex-col self-start">
            <Pestanas
              activa={pestana}
              alCambiar={setPestana}
              items={[
                { id: 'alertas', titulo: 'Alertas', aviso: data.alertas.length },
                { id: 'activos', titulo: 'Viajes', aviso: undefined },
                { id: 'sin', titulo: 'Sin asignar', aviso: data.sinAsignar.length },
              ]}
            />
            <div className="scroll-fino min-h-0 flex-1 overflow-y-auto p-3">
              {pestana === 'alertas' &&
                (data.alertas.length === 0 ? (
                  <Vacio texto="Sin alertas abiertas. Todo en orden." icono="escudo" />
                ) : (
                  <ul className="space-y-2" id="lista-alertas">
                    {data.alertas.map((a) => (
                      <FilaAlerta key={a.id} a={a} />
                    ))}
                  </ul>
                ))}
              {pestana === 'activos' &&
                (data.viajesActivos.length === 0 ? (
                  <Vacio texto="No hay viajes activos." icono="carro" />
                ) : (
                  <ul className="space-y-1.5" id="lista-viajes-activos">
                    {data.viajesActivos.map((v) => (
                      <FilaViaje
                        key={v.id}
                        v={v}
                        activo={v.id === seleccion}
                        alElegir={() => setSeleccion(v.id)}
                      />
                    ))}
                  </ul>
                ))}
              {pestana === 'sin' &&
                (data.sinAsignar.length === 0 ? (
                  <Vacio texto="Todas las solicitudes tienen conductor." icono="ok" />
                ) : (
                  <ul className="space-y-1.5" id="lista-sin-asignar">
                    {data.sinAsignar.map((v) => (
                      <FilaViaje
                        key={v.id}
                        v={v}
                        activo={v.id === seleccion}
                        alElegir={() => setSeleccion(v.id)}
                      />
                    ))}
                  </ul>
                ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
