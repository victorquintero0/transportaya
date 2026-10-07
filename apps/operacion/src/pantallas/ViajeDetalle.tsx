import { api, distancia, duracion, Icono, pesos, telefonoLegible } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import { MapaOperacion } from '../componentes/MapaOperacion.tsx';
import {
  AccionMotivo,
  Boton,
  Campo,
  Cargando,
  Dato,
  Entrada,
  Insignia,
  Panel,
  Selector,
  Tabla,
} from '../componentes/ui.tsx';
import { useEjecutar, usePermiso } from '../lib/consultas.ts';
import {
  CATEGORIA,
  EVENTO_VIAJE,
  METODO_PAGO,
  SEVERIDAD,
  TIPO_ALERTA,
  TIPO_SERVICIO,
  TIPO_TICKET,
} from '../lib/etiquetas.ts';
import { fechaHora, soloHora } from '../lib/fechas.ts';
import type { PuntoRecorrido, Torre, ViajeDetalleDatos } from '../lib/tipos.ts';
import { EstadoViaje } from './Viajes.tsx';

function resumenEvento(tipo: string, d: Record<string, unknown>): string | null {
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : null);
  const t = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null);
  if (tipo === 'oferta_enviada' && n('etaS') !== null)
    return `llega en ${duracion(n('etaS')!)} · a ${distancia(n('distanciaM') ?? 0)}`;
  if (tipo === 'asignado' && d['manual']) return 'Despacho manual';
  if (tipo === 'cancelado') return t('motivo');
  if (tipo === 'reasignado_por_operacion') return t('motivo');
  if (tipo === 'finalizado' && n('precioFinal') !== null) return `${pesos(n('precioFinal')!)}`;
  if (tipo === 'precio_ajustado')
    return `${pesos(n('anterior') ?? 0)} → ${pesos(n('nuevo') ?? 0)} · ${t('motivo') ?? ''}`;
  if (tipo === 'mensaje') return t('cuerpo');
  return null;
}

export function ViajeDetalle() {
  const { id = '' } = useParams();
  const puedeDespachar = usePermiso('viajes.despachar');
  const puedeAjustar = usePermiso('viajes.ajustar_tarifa');
  const puedeTicket = usePermiso('tickets.gestionar');
  const ejecutar = useEjecutar();
  const [avance, setAvance] = useState(1);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [reasignarA, setReasignarA] = useState('');
  const [ticket, setTicket] = useState({ tipo: 'queja', asunto: '' });

  const { data: d, isLoading } = useQuery({
    queryKey: ['viaje', id],
    queryFn: () => api.get<ViajeDetalleDatos>(`/v1/op/viajes/${id}`),
    refetchInterval: 10_000,
  });
  const { data: recorrido } = useQuery({
    queryKey: ['viaje', id, 'recorrido'],
    queryFn: () => api.get<PuntoRecorrido[]>(`/v1/op/viajes/${id}/recorrido`),
    enabled: !!d,
  });
  const { data: torre } = useQuery({
    enabled: !!d?.acciones.reasignar && puedeDespachar,
    queryKey: ['torre'],
    queryFn: () => api.get<Torre>('/v1/op/torre'),
  });

  useEffect(() => {
    if (!reproduciendo) return;
    const t = setInterval(() => {
      setAvance((a) => {
        if (a >= 1) {
          setReproduciendo(false);
          return 1;
        }
        return Math.min(1, a + 0.02);
      });
    }, 60);
    return () => clearInterval(t);
  }, [reproduciendo]);

  const puntosRecorrido = useMemo(
    () => (recorrido ?? []).map((p) => ({ lat: p.lat, lng: p.lng })),
    [recorrido],
  );
  const extra = useMemo(() => (d ? [d.viaje.origen, d.viaje.destino] : []), [d]);

  if (isLoading || !d) return <Cargando />;
  const v = d.viaje;
  const conductoresLibres = (torre?.flota ?? []).filter(
    (c) => c.estado === 'disponible' && c.id !== d.conductor?.id,
  );
  const puntoActual =
    recorrido && recorrido.length
      ? recorrido[Math.min(recorrido.length - 1, Math.floor(avance * recorrido.length))]
      : null;

  return (
    <>
      <Encabezado
        titulo={`Viaje ${v.codigo}`}
        subtitulo={`${TIPO_SERVICIO[v.tipoServicio] ?? v.tipoServicio} · ${CATEGORIA[v.categoria] ?? v.categoria} · pedido ${fechaHora(v.solicitadoEn)}`}
        acciones={
          <>
            <EstadoViaje estado={v.estado} />
            {puedeDespachar && d.acciones.reasignar && (
              <AccionMotivo
                id="reasignar"
                etiqueta="Reasignar"
                titulo="Reasignar el viaje"
                descripcion="El conductor actual queda libre y el pasajero lo ve como una nueva búsqueda."
                confirmar="Reasignar"
                extra={
                  <Campo
                    etiqueta="Nuevo conductor"
                    ayuda="Si no eliges, el sistema busca uno automáticamente."
                  >
                    <Selector value={reasignarA} onChange={(e) => setReasignarA(e.target.value)}>
                      <option value="">Buscar automáticamente</option>
                      {conductoresLibres.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} · {c.placa}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                }
                alConfirmar={(motivo) =>
                  ejecutar(
                    () =>
                      api.post(`/v1/op/viajes/${id}/reasignar`, {
                        motivo,
                        ...(reasignarA ? { conductorId: reasignarA } : {}),
                      }),
                    {
                      invalidar: ['viaje', 'torre'],
                      exito: 'Viaje reasignado',
                    },
                  )
                }
              />
            )}
            {puedeDespachar && d.acciones.cancelar && (
              <AccionMotivo
                id="cancelar-viaje"
                etiqueta="Cancelar viaje"
                variante="peligro"
                titulo="Cancelar el viaje"
                descripcion="Se avisa al pasajero y al conductor. No se le cobra nada al pasajero."
                confirmar="Cancelar el viaje"
                alConfirmar={(motivo) =>
                  ejecutar(() => api.post(`/v1/op/viajes/${id}/cancelar`, { motivo }), {
                    invalidar: ['viaje', 'torre', 'viajes'],
                    exito: 'Viaje cancelado',
                  })
                }
              />
            )}
            {puedeAjustar && d.acciones.ajustarPrecio && (
              <AccionMotivo
                id="ajustar-precio"
                etiqueta="Ajustar precio"
                titulo="Ajustar el precio del viaje"
                descripcion={
                  <>
                    Precio actual: <b>{pesos(v.precioFinal ?? 0)}</b>. La comisión se recalcula y la
                    diferencia del conductor queda como un ajuste de saldo que otra persona debe
                    aprobar.
                    {v.metodoPago !== 'efectivo' &&
                      ' Con tarjeta ya cobrada solo se puede bajar el precio (se reembolsa la diferencia).'}
                  </>
                }
                minimo={10}
                valido={Number(nuevoPrecio) > 0 && Number(nuevoPrecio) !== v.precioFinal}
                extra={
                  <Campo etiqueta="Precio final nuevo (COP)">
                    <Entrada
                      id="precio-nuevo"
                      type="number"
                      min={1}
                      value={nuevoPrecio}
                      onChange={(e) => setNuevoPrecio(e.target.value)}
                    />
                  </Campo>
                }
                confirmar="Ajustar precio"
                alConfirmar={(motivo) =>
                  ejecutar(
                    () =>
                      api.post(`/v1/op/viajes/${id}/ajustar-precio`, {
                        precioFinal: Number(nuevoPrecio),
                        motivo,
                      }),
                    { invalidar: ['viaje', 'viajes', 'finanzas'], exito: 'Precio ajustado' },
                  )
                }
              />
            )}
            {puedeTicket && (
              <AccionMotivo
                etiqueta="Crear ticket"
                icono="mas"
                titulo="Crear un ticket sobre este viaje"
                etiquetaMotivo="Detalle"
                valido={ticket.asunto.trim().length >= 5}
                extra={
                  <div className="grid grid-cols-2 gap-3">
                    <Campo etiqueta="Tipo">
                      <Selector
                        value={ticket.tipo}
                        onChange={(e) => setTicket({ ...ticket, tipo: e.target.value })}
                      >
                        {Object.entries(TIPO_TICKET).map(([k, t]) => (
                          <option key={k} value={k}>
                            {t}
                          </option>
                        ))}
                      </Selector>
                    </Campo>
                    <Campo etiqueta="Asunto">
                      <Entrada
                        value={ticket.asunto}
                        onChange={(e) => setTicket({ ...ticket, asunto: e.target.value })}
                        maxLength={200}
                      />
                    </Campo>
                  </div>
                }
                alConfirmar={(detalle) =>
                  ejecutar(
                    () =>
                      api.post('/v1/op/tickets', {
                        usuarioId: d.pasajero.id,
                        viajeId: id,
                        tipo: ticket.tipo,
                        asunto: ticket.asunto,
                        detalle,
                      }),
                    { invalidar: ['viaje', 'tickets'], exito: 'Ticket creado' },
                  )
                }
              />
            )}
          </>
        }
      />

      <div className="grid gap-4 p-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <Panel
            titulo="Recorrido"
            sinRelleno
            acciones={
              recorrido && recorrido.length > 1 ? (
                <>
                  <Boton
                    tamano="sm"
                    icono={reproduciendo ? 'menos' : 'navegar'}
                    onClick={() => {
                      if (avance >= 1) setAvance(0);
                      setReproduciendo((r) => !r);
                    }}
                  >
                    {reproduciendo ? 'Pausar' : 'Reproducir'}
                  </Boton>
                </>
              ) : undefined
            }
          >
            <div className="relative h-80">
              <MapaOperacion
                className="absolute inset-0 rounded-none border-0"
                viajes={[
                  {
                    id: v.id,
                    codigo: v.codigo,
                    origen: v.origen,
                    destino: v.destino,
                    semaforo: 'verde',
                    buscando: false,
                  },
                ]}
                seleccionado={v.id}
                recorrido={puntosRecorrido}
                avance={avance}
                extra={extra}
              />
            </div>
            <div className="flex items-center gap-3 border-t border-borde px-4 py-2 text-sm">
              {recorrido && recorrido.length > 1 ? (
                <>
                  <input
                    aria-label="Avance del recorrido"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={avance}
                    onChange={(e) => {
                      setReproduciendo(false);
                      setAvance(Number(e.target.value));
                    }}
                    className="flex-1 accent-[var(--color-ty)]"
                  />
                  <span className="numeros w-40 text-right text-xs text-suave">
                    {puntoActual
                      ? `${soloHora(puntoActual.t)} · ${puntoActual.velocidadKmh ?? 0} km/h`
                      : ''}
                  </span>
                </>
              ) : (
                <span className="text-suave">
                  Este viaje no tiene posiciones registradas del conductor.
                </span>
              )}
            </div>
          </Panel>

          <Panel titulo="Línea de tiempo" id="linea-de-tiempo">
            <ol className="relative space-y-3 border-l border-borde pl-6">
              {d.eventos.map((e) => {
                const info = EVENTO_VIAJE[e.tipo] ?? {
                  texto: e.tipo.replaceAll('_', ' '),
                  icono: 'carro' as const,
                };
                const extraTexto = resumenEvento(e.tipo, e.datos);
                return (
                  <li key={e.id} className="relative" data-evento={e.tipo}>
                    <span className="absolute -left-[2.15rem] grid size-6 place-items-center rounded-full border border-borde bg-superficie-2 text-suave">
                      <Icono nombre={info.icono} tamano={12} />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                      <b>{info.texto}</b>
                      <span className="numeros text-xs text-suave">{fechaHora(e.ocurridoEn)}</span>
                      <span className="text-xs text-suave">
                        {e.actorTipo === 'operacion'
                          ? `Operación${e.actorNombre ? ` · ${e.actorNombre}` : ''}`
                          : e.actorTipo === 'sistema'
                            ? 'Sistema'
                            : e.actorTipo === 'conductor'
                              ? 'Conductor'
                              : 'Pasajero'}
                      </span>
                    </div>
                    {extraTexto && <p className="text-xs text-suave">{extraTexto}</p>}
                  </li>
                );
              })}
            </ol>
          </Panel>

          {d.ofertas.length > 0 && (
            <Panel titulo="Ofertas a conductores" sinRelleno>
              <Tabla
                filas={d.ofertas}
                clave={(o) => o.id}
                columnas={[
                  { titulo: 'Ronda', celda: (o) => o.ronda },
                  {
                    titulo: 'Conductor',
                    celda: (o) => (
                      <Link
                        className="font-bold text-ty hover:underline"
                        to={`/conductores/${o.conductorId}`}
                      >
                        {o.conductor}
                      </Link>
                    ),
                  },
                  {
                    titulo: 'Llegada',
                    celda: (o) =>
                      o.etaRecogidaS
                        ? `${duracion(o.etaRecogidaS)} · ${distancia(o.distanciaRecogidaM ?? 0)}`
                        : '—',
                  },
                  { titulo: 'Ofrecida', celda: (o) => soloHora(o.ofrecidaEn) },
                  {
                    titulo: 'Respuesta',
                    celda: (o) =>
                      o.respondidaEn
                        ? `${Math.max(0, Math.round((new Date(o.respondidaEn).getTime() - new Date(o.ofrecidaEn).getTime()) / 1000))} s`
                        : '—',
                  },
                  {
                    titulo: 'Resultado',
                    celda: (o) => (
                      <Insignia
                        tono={
                          o.resultado === 'aceptada'
                            ? 'ok'
                            : o.resultado === 'pendiente'
                              ? 'info'
                              : 'neutro'
                        }
                      >
                        {o.resultado}
                      </Insignia>
                    ),
                  },
                ]}
              />
            </Panel>
          )}

          {d.mensajes.length > 0 && (
            <Panel titulo="Chat del viaje">
              <ul className="space-y-1.5 text-sm">
                {d.mensajes.map((m) => (
                  <li key={m.id}>
                    <b>{m.autor}</b>{' '}
                    <span className="text-xs text-suave">{soloHora(m.creadoEn)}</span>
                    <p>{m.cuerpo}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel titulo="Personas">
            <dl>
              <Dato etiqueta="Pasajero">
                <Link className="text-ty hover:underline" to={`/pasajeros/${d.pasajero.id}`}>
                  {d.pasajero.nombre}
                </Link>
              </Dato>
              <Dato etiqueta="Teléfono">{telefonoLegible(d.pasajero.telefono)}</Dato>
              {d.pasajero.deuda > 0 && <Dato etiqueta="Debe">{pesos(d.pasajero.deuda)}</Dato>}
              <hr className="my-2 border-borde" />
              {d.conductor ? (
                <>
                  <Dato etiqueta="Conductor">
                    <Link className="text-ty hover:underline" to={`/conductores/${d.conductor.id}`}>
                      {d.conductor.nombre}
                    </Link>
                  </Dato>
                  <Dato etiqueta="Teléfono">{telefonoLegible(d.conductor.telefono)}</Dato>
                  <Dato etiqueta="Vehículo">
                    {d.conductor.vehiculo} · {d.conductor.placa}
                  </Dato>
                </>
              ) : (
                <p className="text-sm text-suave">Sin conductor asignado.</p>
              )}
            </dl>
          </Panel>

          <Panel titulo="Ruta">
            <dl>
              <Dato etiqueta="Recogida">{v.origenDireccion ?? '—'}</Dato>
              <Dato etiqueta="Destino">{v.destinoDireccion ?? '—'}</Dato>
              {v.notaConductor && <Dato etiqueta="Nota">{v.notaConductor}</Dato>}
              {v.distanciaRealM !== null && (
                <Dato etiqueta="Distancia">{distancia(v.distanciaRealM)}</Dato>
              )}
              {v.duracionS !== null && <Dato etiqueta="Duración">{duracion(v.duracionS)}</Dato>}
              {v.tiempoDetenidoS ? (
                <Dato etiqueta="Tiempo detenido">{duracion(v.tiempoDetenidoS)}</Dato>
              ) : null}
            </dl>
          </Panel>

          <Panel titulo="Dinero">
            <dl>
              <Dato etiqueta="Estimado">
                {pesos(v.precioEstimado.min)} – {pesos(v.precioEstimado.max)}
              </Dato>
              {v.multiplicadorDinamico > 1 && (
                <Dato etiqueta="Dinámica">×{v.multiplicadorDinamico}</Dato>
              )}
              {v.totalCarrera !== null && <Dato etiqueta="Carrera">{pesos(v.totalCarrera)}</Dato>}
              {v.cobroEspera > 0 && <Dato etiqueta="Espera">{pesos(v.cobroEspera)}</Dato>}
              {v.propina > 0 && <Dato etiqueta="Propina">{pesos(v.propina)}</Dato>}
              {v.precioFinal !== null && (
                <Dato etiqueta="Total cobrado">
                  <span id="precio-final">{pesos(v.precioFinal)}</span>
                </Dato>
              )}
              {v.comision !== null && (
                <Dato etiqueta={`Comisión (${(v.comisionPb ?? 0) / 100} %)`}>
                  {pesos(v.comision)}
                </Dato>
              )}
              <Dato etiqueta="Pago">
                {METODO_PAGO[v.metodoPago] ?? v.metodoPago} · {v.estadoPago.replaceAll('_', ' ')}
              </Dato>
              {d.reembolsos.map((r) => (
                <Dato key={r.id} etiqueta="Reembolso">
                  {pesos(r.monto)}
                </Dato>
              ))}
              {d.ajustesDeSaldo.map((a) => (
                <Dato key={a.id} etiqueta={`Ajuste de saldo (${a.estado})`}>
                  {pesos(a.monto)}
                </Dato>
              ))}
            </dl>
            {v.canceladoPor && (
              <p className="mt-2 rounded-lg bg-peligro/10 p-2 text-sm">
                Cancelado por <b>{v.canceladoPor}</b>
                {v.motivoCancelacion ? `: ${v.motivoCancelacion}` : ''}
              </p>
            )}
          </Panel>

          {(d.alertas.length > 0 || d.tickets.length > 0) && (
            <Panel titulo="Alertas y tickets">
              <ul className="space-y-2 text-sm">
                {d.alertas.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span>{TIPO_ALERTA[a.tipo] ?? a.tipo}</span>
                    <Insignia tono={SEVERIDAD[a.severidad]?.tono ?? 'neutro'}>{a.estado}</Insignia>
                  </li>
                ))}
                {d.tickets.map((t) => (
                  <li key={t.id}>
                    <Link className="font-bold text-ty hover:underline" to={`/soporte/${t.id}`}>
                      {t.asunto}
                    </Link>
                    <span className="ml-2 text-xs text-suave">
                      {TIPO_TICKET[t.tipo]} · {t.estado}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
