import { api, pesos, telefonoLegible, useSesion } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import {
  AccionMotivo,
  Boton,
  Cargando,
  Dato,
  Entrada,
  Insignia,
  Modal,
  Panel,
  Tabla,
} from '../componentes/ui.tsx';
import { useEjecutar, useEjecutarConAviso, usePermiso } from '../lib/consultas.ts';
import {
  CATEGORIA,
  ESTADO_DOCUMENTO,
  ESTADO_OPERATIVO,
  etiquetaAccion,
  SEVERIDAD,
  TIPO_ALERTA,
  TIPO_DOCUMENTO,
} from '../lib/etiquetas.ts';
import { fechaCorta, fechaHora } from '../lib/fechas.ts';
import type { ConductorFicha as Ficha, DocumentoFicha } from '../lib/tipos.ts';
import { EstadoHabilitacion } from './Conductores.tsx';
import { EstadoViaje } from './Viajes.tsx';

/** Muestra el archivo del documento. Se pide con la sesión puesta, así que se descarga y se muestra desde memoria. */
function VisorDocumento({ doc, alCerrar }: { doc: DocumentoFicha | null; alCerrar: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!doc) return;
    let creada: string | null = null;
    void (async () => {
      try {
        const r = await fetch(`/v1/op/documentos/${doc.id}/archivo`, {
          headers: { authorization: `Bearer ${useSesion.getState().accessToken ?? ''}` },
        });
        if (!r.ok) throw new Error('no');
        creada = URL.createObjectURL(await r.blob());
        setUrl(creada);
      } catch {
        setError(true);
      }
    })();
    return () => {
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [doc]);
  return (
    <Modal
      abierto={!!doc}
      alCerrar={alCerrar}
      titulo={
        doc ? `${TIPO_DOCUMENTO[doc.tipo] ?? doc.tipo}${doc.placa ? ` · ${doc.placa}` : ''}` : ''
      }
      ancho="max-w-3xl"
    >
      {error ? (
        <p className="text-peligro">No se pudo abrir el archivo.</p>
      ) : url ? (
        <img src={url} alt="Documento" className="max-h-[70dvh] w-full rounded-lg object-contain" />
      ) : (
        <Cargando />
      )}
      <p className="mt-3 text-xs text-suave">
        Ver un documento queda registrado en la auditoría (Ley 1581 de 2012).
      </p>
    </Modal>
  );
}

export function ConductorFicha() {
  const { id = '' } = useParams();
  const puedeAprobar = usePermiso('conductores.aprobar');
  const puedeSuspender = usePermiso('conductores.suspender');
  const puedeBloquear = usePermiso('conductores.bloquear');
  const puedeFinanzas = usePermiso('finanzas.operar');
  const ejecutar = useEjecutar();
  const ejecutarAviso = useEjecutarConAviso();
  const [viendo, setViendo] = useState<DocumentoFicha | null>(null);
  const [vence, setVence] = useState<Record<string, string>>({});

  const { data: c } = useQuery({
    queryKey: ['conductores', id],
    queryFn: () => api.get<Ficha>(`/v1/op/conductores/${id}`),
    refetchInterval: 15_000,
  });
  if (!c) return <Cargando />;

  const refrescar = { invalidar: ['conductores', 'torre'] };
  const enRevision = c.estadoHabilitacion === 'en_revision';
  const pendientes = c.documentos.filter((d) => d.estado === 'pendiente').length;

  return (
    <>
      <Encabezado
        titulo={c.nombre}
        subtitulo={`${telefonoLegible(c.telefono)}${c.email ? ` · ${c.email}` : ''} · registrado ${fechaCorta(c.creadoEn.slice(0, 10))}`}
        acciones={
          <>
            <EstadoHabilitacion estado={c.estadoHabilitacion} />
            {c.bloqueadoPorDeuda && <Insignia tono="error">Bloqueado por deuda</Insignia>}
            {puedeAprobar && enRevision && (
              <>
                <Boton
                  id="habilitar-conductor"
                  variante="primario"
                  deshabilitado={!c.evaluacion.habilitado}
                  titulo={
                    c.evaluacion.habilitado ? undefined : 'Aprueba todos los documentos primero'
                  }
                  onClick={() =>
                    void ejecutarAviso(() => api.post(`/v1/op/conductores/${id}/habilitar`), {
                      ...refrescar,
                      exito: 'Conductor habilitado',
                    })
                  }
                >
                  Habilitar conductor
                </Boton>
                <AccionMotivo
                  etiqueta="Devolver registro"
                  variante="secundario"
                  titulo="Devolver el registro"
                  descripcion="El conductor verá que necesita correcciones y podrá volver a enviarlo."
                  alConfirmar={(motivo) =>
                    ejecutar(
                      () => api.post(`/v1/op/conductores/${id}/rechazar-registro`, { motivo }),
                      { ...refrescar, exito: 'Registro devuelto' },
                    )
                  }
                />
              </>
            )}
            {puedeSuspender && c.estadoHabilitacion === 'habilitado' && (
              <AccionMotivo
                id="suspender"
                etiqueta="Suspender"
                titulo="Suspender al conductor"
                descripcion="Queda fuera de línea y no podrá conectarse hasta que lo reactiven. Si va en un viaje, lo termina."
                alConfirmar={(motivo) =>
                  ejecutar(() => api.post(`/v1/op/conductores/${id}/suspender`, { motivo }), {
                    ...refrescar,
                    exito: 'Conductor suspendido',
                  })
                }
              />
            )}
            {puedeBloquear &&
              c.estadoHabilitacion !== 'bloqueado' &&
              c.estadoHabilitacion !== 'registro_incompleto' && (
                <AccionMotivo
                  id="bloquear"
                  etiqueta="Bloquear"
                  variante="peligro"
                  titulo="Bloquear al conductor"
                  descripcion="Cierra sus sesiones y no podrá volver a entrar hasta que cumplimiento lo levante."
                  confirmar="Bloquear"
                  alConfirmar={(motivo) =>
                    ejecutar(() => api.post(`/v1/op/conductores/${id}/bloquear`, { motivo }), {
                      ...refrescar,
                      exito: 'Conductor bloqueado',
                    })
                  }
                />
              )}
            {puedeSuspender &&
              (c.estadoHabilitacion === 'suspendido' ||
                (c.estadoHabilitacion === 'bloqueado' && puedeBloquear)) && (
                <AccionMotivo
                  id="reactivar"
                  etiqueta="Reactivar"
                  variante="primario"
                  titulo="Reactivar al conductor"
                  descripcion="Se verifica que sus documentos estén vigentes."
                  confirmar="Reactivar"
                  alConfirmar={(motivo) =>
                    ejecutar(() => api.post(`/v1/op/conductores/${id}/reactivar`, { motivo }), {
                      ...refrescar,
                      exito: 'Conductor reactivado',
                    })
                  }
                />
              )}
            {puedeFinanzas && c.bloqueadoPorDeuda && (
              <AccionMotivo
                etiqueta="Habilitar por deuda"
                titulo="Habilitar a mano"
                descripcion="Úsalo cuando ya recibiste el pago por otro canal. Queda en la auditoría."
                alConfirmar={(motivo) =>
                  ejecutar(
                    () => api.post(`/v1/op/finanzas/conductores/${id}/habilitar`, { motivo }),
                    { ...refrescar, exito: 'Conductor habilitado' },
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
            titulo={`Documentos${pendientes ? ` · ${pendientes} por revisar` : ''}`}
            sinRelleno
            id="documentos"
          >
            <Tabla
              filas={c.documentos}
              clave={(d) => d.id}
              vacio="Todavía no ha subido documentos."
              columnas={[
                {
                  titulo: 'Documento',
                  celda: (d) => (
                    <span>
                      <b>{TIPO_DOCUMENTO[d.tipo] ?? d.tipo}</b>
                      {d.placa && <span className="ml-2 text-xs text-suave">{d.placa}</span>}
                    </span>
                  ),
                },
                { titulo: 'Vence', celda: (d) => (d.venceEn ? fechaCorta(d.venceEn) : '—') },
                {
                  titulo: 'Estado',
                  celda: (d) => (
                    <span>
                      <Insignia tono={ESTADO_DOCUMENTO[d.estado]?.tono}>
                        {ESTADO_DOCUMENTO[d.estado]?.texto ?? d.estado}
                      </Insignia>
                      {d.motivoRechazo && (
                        <span className="mt-1 block text-xs text-suave">{d.motivoRechazo}</span>
                      )}
                    </span>
                  ),
                },
                {
                  titulo: '',
                  alinear: 'der',
                  celda: (d) => (
                    <div className="flex items-center justify-end gap-1.5">
                      {puedeAprobar && (
                        <Boton
                          tamano="sm"
                          icono="camara"
                          onClick={() => setViendo(d)}
                          titulo="Ver documento"
                        >
                          Ver
                        </Boton>
                      )}
                      {puedeAprobar && d.estado === 'pendiente' && (
                        <>
                          {d.venceEn === null &&
                            [
                              'licencia_conduccion',
                              'soat',
                              'revision_tecnicomecanica',
                              'seguro_todo_riesgo',
                            ].includes(d.tipo) && (
                              <Entrada
                                aria-label="Fecha de vencimiento"
                                type="date"
                                className="h-8 w-36 text-xs"
                                value={vence[d.id] ?? ''}
                                onChange={(e) => setVence({ ...vence, [d.id]: e.target.value })}
                              />
                            )}
                          <Boton
                            tamano="sm"
                            variante="primario"
                            icono="ok"
                            onClick={() =>
                              void ejecutarAviso(
                                () =>
                                  api.post(
                                    `/v1/op/documentos/${d.id}/aprobar`,
                                    vence[d.id] ? { venceEn: vence[d.id] } : {},
                                  ),
                                { ...refrescar, exito: 'Documento aprobado' },
                              )
                            }
                          >
                            Aprobar
                          </Boton>
                        </>
                      )}
                      {puedeAprobar && (d.estado === 'pendiente' || d.estado === 'aprobado') && (
                        <AccionMotivo
                          etiqueta="Rechazar"
                          variante="secundario"
                          titulo={`Rechazar ${TIPO_DOCUMENTO[d.tipo] ?? d.tipo}`}
                          descripcion="El conductor verá este motivo y podrá subir otro archivo."
                          confirmar="Rechazar documento"
                          alConfirmar={(motivo) =>
                            ejecutar(
                              () => api.post(`/v1/op/documentos/${d.id}/rechazar`, { motivo }),
                              { ...refrescar, exito: 'Documento rechazado' },
                            )
                          }
                        />
                      )}
                    </div>
                  ),
                },
              ]}
            />
            {!c.evaluacion.habilitado && (
              <div className="border-t border-borde px-4 py-3 text-sm">
                <p className="mb-1 font-bold text-suave">Requisitos para habilitar</p>
                <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                  {c.evaluacion.requisitos.map((r) => (
                    <li key={r.titulo} className="flex items-center justify-between gap-2">
                      <span>{r.titulo}</span>
                      <Insignia
                        tono={
                          r.estado === 'aprobado' || r.estado === 'por_vencer'
                            ? 'ok'
                            : r.estado === 'pendiente'
                              ? 'aviso'
                              : 'error'
                        }
                      >
                        {r.estado.replaceAll('_', ' ')}
                      </Insignia>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel titulo="Vehículos" sinRelleno>
            <Tabla
              filas={c.vehiculos}
              clave={(v) => v.id}
              columnas={[
                { titulo: 'Placa', celda: (v) => <b>{v.placa}</b> },
                {
                  titulo: 'Vehículo',
                  celda: (v) => `${v.marca} ${v.linea} ${v.modeloAnio} · ${v.color}`,
                },
                {
                  titulo: 'Categoría',
                  celda: (v) => (
                    <span>
                      {CATEGORIA[v.categoria]}
                      {v.fueraDeCatalogo && <Insignia tono="aviso">Fuera del catálogo</Insignia>}
                    </span>
                  ),
                },
                {
                  titulo: 'Relación',
                  celda: (v) => (v.relacion === 'propietario' ? 'Propietario' : 'Autorizado'),
                },
              ]}
            />
          </Panel>

          <Panel titulo="Últimos viajes" sinRelleno>
            <Tabla
              filas={c.viajes}
              clave={(v) => v.id}
              vacio="Aún no tiene viajes."
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
                {
                  titulo: 'Valor',
                  alinear: 'der',
                  celda: (v) => (v.precioFinal === null ? '—' : pesos(v.precioFinal)),
                },
              ]}
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel titulo="Resumen">
            <dl>
              <Dato etiqueta="Ahora">
                {c.estadoHabilitacion === 'habilitado'
                  ? ESTADO_OPERATIVO[c.estadoOperativo]?.texto
                  : '—'}
              </Dato>
              <Dato etiqueta="Calificación">
                {c.calificacion
                  ? `${c.calificacion} ★ (${c.calificaciones})`
                  : 'Sin calificaciones'}
              </Dato>
              <Dato etiqueta="Viajes finalizados">{c.resumen.viajesFinalizados}</Dato>
              <Dato etiqueta="Cancelaciones propias">{c.resumen.cancelacionesPropias}</Dato>
              <Dato etiqueta="Horas en línea (30 d)">{c.resumen.horasConectadoUlt30d}</Dato>
              <Dato etiqueta="Atiende categoría inferior">
                {c.aceptaCategoriaInferior ? 'Sí' : 'No'}
              </Dato>
              <Dato etiqueta="Viajes intermunicipales">{c.aceptaIntermunicipal ? 'Sí' : 'No'}</Dato>
            </dl>
          </Panel>
          <Panel
            titulo="Saldo y pagos"
            acciones={
              puedeFinanzas ? (
                <Link
                  className="text-xs font-bold text-ty hover:underline"
                  to={`/finanzas?pestana=libro&conductor=${c.id}`}
                >
                  Libro de movimientos
                </Link>
              ) : undefined
            }
          >
            <dl>
              <Dato etiqueta={c.saldo >= 0 ? 'TransporteYa le debe' : 'Debe su comisión'}>
                <span className={c.saldo < 0 ? 'text-peligro' : ''}>
                  {pesos(Math.abs(c.saldo))}
                </span>
              </Dato>
              <Dato etiqueta="Cuenta de pago">
                {c.cuentaPago
                  ? `${c.cuentaPago.tipo === 'llave_bre_b' ? 'Llave Bre-B' : (c.cuentaPago.banco ?? 'Cuenta')} ${c.cuentaPago.valor}`
                  : 'Sin registrar'}
              </Dato>
            </dl>
          </Panel>
          {c.alertas.length > 0 && (
            <Panel titulo="Alertas recientes">
              <ul className="space-y-1.5 text-sm">
                {c.alertas.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span>
                      {TIPO_ALERTA[a.tipo] ?? a.tipo}{' '}
                      <span className="text-xs text-suave">{fechaHora(a.creadaEn)}</span>
                    </span>
                    <Insignia tono={SEVERIDAD[a.severidad]?.tono}>{a.estado}</Insignia>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel titulo="Historial de decisiones">
            {c.historial.length === 0 ? (
              <p className="text-sm text-suave">Sin decisiones registradas.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {c.historial.map((h, i) => (
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
      <VisorDocumento key={viendo?.id ?? 'ninguno'} doc={viendo} alCerrar={() => setViendo(null)} />
    </>
  );
}
