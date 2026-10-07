import { api, avisar, mensajeDe, pesos, telefonoLegible } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import {
  AccionMotivo,
  Boton,
  Campo,
  Cargando,
  Dato,
  Entrada,
  AreaTexto,
  Insignia,
  Panel,
  Selector,
} from '../componentes/ui.tsx';
import { useEjecutar, useEjecutarConAviso, usePermiso } from '../lib/consultas.ts';
import { ESTADO_TICKET, PRIORIDAD, TIPO_TICKET } from '../lib/etiquetas.ts';
import { fechaHora } from '../lib/fechas.ts';
import type { TicketDetalleDatos } from '../lib/tipos.ts';
import { InsigniaSla } from './Soporte.tsx';

export function TicketDetalle() {
  const { id = '' } = useParams();
  const puedeGestionar = usePermiso('tickets.gestionar');
  const puedeReembolsar = usePermiso('reembolsos.crear');
  const ejecutar = useEjecutar();
  const ejecutarAviso = useEjecutarConAviso();
  const [texto, setTexto] = useState('');
  const [interno, setInterno] = useState(false);
  const [monto, setMonto] = useState('');

  const { data: t } = useQuery({
    queryKey: ['tickets', id],
    queryFn: () => api.get<TicketDetalleDatos>(`/v1/op/tickets/${id}`),
    refetchInterval: 15_000,
  });
  const { data: yo } = useQuery({
    queryKey: ['yo'],
    queryFn: () => api.get<{ id: string }>('/v1/op/yo'),
  });
  const { data: agentes } = useQuery({
    queryKey: ['agentes'],
    enabled: puedeGestionar,
    queryFn: () => api.get<{ id: string; nombre: string }[]>('/v1/op/agentes'),
  });
  if (!t) return <Cargando />;

  const cerrado = t.estado === 'cerrado';
  const refrescar = { invalidar: ['tickets'] };
  const cambiar = (cambio: Record<string, unknown>, exito: string) =>
    void ejecutarAviso(() => api.patch(`/v1/op/tickets/${id}`, cambio), { ...refrescar, exito });

  return (
    <>
      <Encabezado
        titulo={t.asunto}
        subtitulo={`${TIPO_TICKET[t.tipo] ?? t.tipo} · creado ${fechaHora(t.creadoEn)}`}
        acciones={
          <>
            <InsigniaSla sla={t.sla} vence={t.venceSlaEn} />
            <Insignia tono={ESTADO_TICKET[t.estado]?.tono}>
              {ESTADO_TICKET[t.estado]?.texto}
            </Insignia>
            {puedeGestionar && !cerrado && t.estado !== 'resuelto' && (
              <Boton
                id="resolver"
                variante="primario"
                icono="ok"
                onClick={() => cambiar({ estado: 'resuelto' }, 'Ticket resuelto')}
              >
                Marcar resuelto
              </Boton>
            )}
            {puedeGestionar && t.estado === 'resuelto' && (
              <Boton onClick={() => cambiar({ estado: 'cerrado' }, 'Ticket cerrado')}>
                Cerrar ticket
              </Boton>
            )}
          </>
        }
      />
      <div className="grid gap-4 p-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Panel titulo="Conversación" id="conversacion">
            <ul className="space-y-3">
              {t.mensajes.map((m) => (
                <li
                  key={m.id}
                  className={`max-w-[85%] rounded-xl border px-4 py-2.5 text-sm ${m.interno ? 'border-sol/40 bg-sol/10' : m.esEmpleado ? 'ml-auto border-ty/40 bg-ty/10' : 'border-borde bg-superficie-2'}`}
                >
                  <div className="mb-0.5 flex items-center gap-2 text-xs text-suave">
                    <b className="text-texto">{m.autor}</b>
                    {fechaHora(m.creadoEn)}
                    {m.interno && <Insignia tono="aviso">Nota interna</Insignia>}
                  </div>
                  <p className="whitespace-pre-wrap">{m.cuerpo}</p>
                </li>
              ))}
              {t.mensajes.length === 0 && (
                <li className="text-sm text-suave">Sin mensajes todavía.</li>
              )}
            </ul>
            {puedeGestionar && !cerrado && (
              <form
                className="mt-4 space-y-2 border-t border-borde pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!texto.trim()) return;
                  ejecutar(
                    () =>
                      api.post(`/v1/op/tickets/${id}/mensajes`, { cuerpo: texto.trim(), interno }),
                    { ...refrescar, exito: interno ? 'Nota guardada' : 'Respuesta enviada' },
                  )
                    .then(() => setTexto(''))
                    .catch((err: unknown) => avisar(mensajeDe(err), 'error'));
                }}
              >
                <AreaTexto
                  id="respuesta"
                  placeholder={
                    interno
                      ? 'Nota interna: solo la ve el equipo'
                      : 'Escribe la respuesta para la persona'
                  }
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={2000}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={interno}
                      onChange={(e) => setInterno(e.target.checked)}
                      className="size-4 accent-[var(--color-ty)]"
                    />
                    Nota interna
                  </label>
                  <Boton
                    id="enviar-respuesta"
                    type="submit"
                    variante="primario"
                    deshabilitado={!texto.trim()}
                  >
                    {interno ? 'Guardar nota' : 'Enviar respuesta'}
                  </Boton>
                </div>
              </form>
            )}
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel titulo="Persona">
            <dl>
              <Dato etiqueta="Nombre">
                {t.usuario.tipo === 'pasajero' ? (
                  <Link className="text-ty hover:underline" to={`/pasajeros/${t.usuario.id}`}>
                    {t.usuario.nombre}
                  </Link>
                ) : t.usuario.tipo === 'conductor' ? (
                  <Link className="text-ty hover:underline" to={`/conductores/${t.usuario.id}`}>
                    {t.usuario.nombre}
                  </Link>
                ) : (
                  t.usuario.nombre
                )}
              </Dato>
              <Dato etiqueta="Tipo">{t.usuario.tipo}</Dato>
              <Dato etiqueta="Teléfono">{telefonoLegible(t.usuario.telefono)}</Dato>
              {t.viaje && (
                <Dato etiqueta="Viaje">
                  <Link className="text-ty hover:underline" to={`/viajes/${t.viaje.id}`}>
                    {t.viaje.codigo}
                  </Link>
                </Dato>
              )}
            </dl>
          </Panel>
          {puedeGestionar && !cerrado && (
            <Panel titulo="Gestión">
              <div className="space-y-3">
                <Campo etiqueta="Asignado a">
                  <Selector
                    value={t.asignadoA ?? ''}
                    onChange={(e) =>
                      cambiar({ asignadoA: e.target.value || null }, 'Asignación actualizada')
                    }
                  >
                    <option value="">Sin asignar</option>
                    {(agentes ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                        {a.id === yo?.id ? ' (yo)' : ''}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Prioridad">
                  <Selector
                    value={t.prioridad}
                    onChange={(e) =>
                      cambiar({ prioridad: e.target.value }, 'Prioridad actualizada')
                    }
                  >
                    {Object.entries(PRIORIDAD).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.texto}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Estado">
                  <Selector
                    value={t.estado}
                    onChange={(e) => cambiar({ estado: e.target.value }, 'Estado actualizado')}
                  >
                    {Object.entries(ESTADO_TICKET).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.texto}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </div>
            </Panel>
          )}
          {puedeReembolsar && t.reembolsable && !cerrado && (
            <Panel titulo="Reembolso">
              <dl>
                <Dato etiqueta="Cobrado">{pesos(t.reembolsable.monto)}</Dato>
                <Dato etiqueta="Ya reembolsado">{pesos(t.reembolsable.reembolsado)}</Dato>
                <Dato etiqueta="Disponible">
                  {pesos(t.reembolsable.monto - t.reembolsable.reembolsado)}
                </Dato>
              </dl>
              <div className="mt-3">
                <AccionMotivo
                  id="reembolsar"
                  etiqueta="Hacer un reembolso"
                  tamano="md"
                  titulo="Reembolsar al pasajero"
                  descripcion="Se devuelve a la tarjeta con la que pagó. Soporte tiene un límite por reembolso; por encima de él lo hace finanzas."
                  confirmar="Reembolsar"
                  valido={
                    Number(monto) > 0 &&
                    Number(monto) <= t.reembolsable.monto - t.reembolsable.reembolsado
                  }
                  extra={
                    <Campo etiqueta="Monto (COP)">
                      <Entrada
                        id="monto-reembolso"
                        type="number"
                        min={1}
                        value={monto}
                        onChange={(e) => setMonto(e.target.value)}
                      />
                    </Campo>
                  }
                  alConfirmar={(motivo) =>
                    ejecutar(
                      () =>
                        api.post(`/v1/op/tickets/${id}/reembolso`, {
                          monto: Number(monto),
                          motivo,
                        }),
                      { ...refrescar, exito: 'Reembolso registrado' },
                    )
                  }
                />
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
