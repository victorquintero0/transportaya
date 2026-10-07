import { api, pesos, telefonoLegible } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import { AccionMotivo, Cargando, Dato, Insignia, Panel, Tabla } from '../componentes/ui.tsx';
import { useEjecutar, usePermiso } from '../lib/consultas.ts';
import { ESTADO_TICKET, etiquetaAccion, TIPO_TICKET } from '../lib/etiquetas.ts';
import { fechaHora } from '../lib/fechas.ts';
import type { PasajeroFicha as Ficha } from '../lib/tipos.ts';
import { EstadoViaje } from './Viajes.tsx';

export function PasajeroFicha() {
  const { id = '' } = useParams();
  const puedeBloquear = usePermiso('pasajeros.bloquear');
  const ejecutar = useEjecutar();
  const { data: p } = useQuery({
    queryKey: ['pasajeros', id],
    queryFn: () => api.get<Ficha>(`/v1/op/pasajeros/${id}`),
  });
  if (!p) return <Cargando />;
  const refrescar = { invalidar: ['pasajeros'] };
  return (
    <>
      <Encabezado
        titulo={p.nombre}
        subtitulo={`${telefonoLegible(p.telefono)}${p.email ? ` · ${p.email}` : ''}`}
        acciones={
          <>
            <Insignia tono={p.estado === 'activo' ? 'ok' : 'error'}>
              {p.estado === 'activo' ? 'Activo' : 'Bloqueado'}
            </Insignia>
            {puedeBloquear && p.estado === 'activo' && (
              <AccionMotivo
                id="bloquear-pasajero"
                etiqueta="Bloquear"
                variante="peligro"
                titulo="Bloquear al pasajero"
                descripcion="Cierra sus sesiones y no podrá pedir viajes. Si tiene un viaje en curso, primero termínalo o cancélalo."
                confirmar="Bloquear"
                alConfirmar={(motivo) =>
                  ejecutar(() => api.post(`/v1/op/pasajeros/${id}/bloquear`, { motivo }), {
                    ...refrescar,
                    exito: 'Pasajero bloqueado',
                  })
                }
              />
            )}
            {puedeBloquear && p.estado === 'bloqueado' && (
              <AccionMotivo
                id="desbloquear-pasajero"
                etiqueta="Desbloquear"
                variante="primario"
                titulo="Desbloquear al pasajero"
                confirmar="Desbloquear"
                alConfirmar={(motivo) =>
                  ejecutar(() => api.post(`/v1/op/pasajeros/${id}/desbloquear`, { motivo }), {
                    ...refrescar,
                    exito: 'Pasajero desbloqueado',
                  })
                }
              />
            )}
          </>
        }
      />
      <div className="grid gap-4 p-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Panel titulo="Últimos viajes" sinRelleno>
            <Tabla
              filas={p.viajes}
              clave={(v) => v.id}
              vacio="Aún no ha pedido viajes."
              columnas={[
                {
                  titulo: 'Código',
                  celda: (v) => (
                    <Link className="font-bold text-ty hover:underline" to={`/viajes/${v.id}`}>
                      {v.codigo}
                    </Link>
                  ),
                },
                { titulo: 'Fecha', celda: (v) => fechaHora(v.solicitadoEn) },
                { titulo: 'Estado', celda: (v) => <EstadoViaje estado={v.estado} /> },
                { titulo: 'Cancelado por', celda: (v) => v.canceladoPor ?? '—' },
                {
                  titulo: 'Valor',
                  alinear: 'der',
                  celda: (v) => (v.precioFinal === null ? '—' : pesos(v.precioFinal)),
                },
              ]}
            />
          </Panel>
          <Panel titulo="Tickets" sinRelleno>
            <Tabla
              filas={p.tickets}
              clave={(t) => t.id}
              vacio="No ha reportado nada."
              columnas={[
                {
                  titulo: 'Asunto',
                  celda: (t) => (
                    <Link className="font-bold text-ty hover:underline" to={`/soporte/${t.id}`}>
                      {t.asunto}
                    </Link>
                  ),
                },
                { titulo: 'Tipo', celda: (t) => TIPO_TICKET[t.tipo] ?? t.tipo },
                {
                  titulo: 'Estado',
                  celda: (t) => (
                    <Insignia tono={ESTADO_TICKET[t.estado]?.tono}>
                      {ESTADO_TICKET[t.estado]?.texto}
                    </Insignia>
                  ),
                },
                { titulo: 'Fecha', celda: (t) => fechaHora(t.creadoEn) },
              ]}
            />
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel titulo="Resumen">
            <dl>
              <Dato etiqueta="Calificación">
                {p.calificacion
                  ? `${p.calificacion} ★ (${p.calificaciones})`
                  : 'Sin calificaciones'}
              </Dato>
              <Dato etiqueta="Viajes finalizados">{p.resumen.viajesFinalizados}</Dato>
              <Dato etiqueta="Cancelaciones propias">{p.resumen.cancelacionesPropias}</Dato>
              <Dato etiqueta="Cancelaciones (30 d)">{p.resumen.cancelacionesUlt30d}</Dato>
              <Dato etiqueta="Deuda pendiente">
                {p.deuda > 0 ? <span className="text-peligro">{pesos(p.deuda)}</span> : 'Sin deuda'}
              </Dato>
              <Dato etiqueta="Aceptó términos">
                {p.aceptoTerminosEn ? fechaHora(p.aceptoTerminosEn) : 'Pendiente'}
              </Dato>
            </dl>
          </Panel>
          <Panel titulo="Historial de decisiones">
            {p.historial.length === 0 ? (
              <p className="text-sm text-suave">Sin decisiones registradas.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {p.historial.map((h, i) => (
                  <li key={i}>
                    <b>{etiquetaAccion(h.accion)}</b>{' '}
                    <span className="text-xs text-suave">
                      {h.quien} · {fechaHora(h.ocurridoEn)}
                    </span>
                    {h.motivo && <p className="text-xs text-suave">{h.motivo}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
