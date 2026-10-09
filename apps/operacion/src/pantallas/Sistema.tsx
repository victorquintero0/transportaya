import { api, numero } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { BarrasApiladas } from '../componentes/Grafica.tsx';
import { Encabezado } from '../componentes/Layout.tsx';
import { Cargando, Insignia, Kpi, Panel, Tabla, type Tono } from '../componentes/ui.tsx';
import { fechaHora, soloHora } from '../lib/fechas.ts';
import type { EstadoSistema, TareaSistema } from '../lib/tipos.ts';

const ESTADO: Record<EstadoSistema['estado'], { texto: string; tono: Tono }> = {
  ok: { texto: 'Todo en orden', tono: 'ok' },
  degradado: { texto: 'Con problemas', tono: 'aviso' },
  caido: { texto: 'Caído', tono: 'error' },
};

const SERIES = [
  { nombre: 'Correctas', color: 'var(--color-ty)' },
  { nombre: 'Con error del servidor', color: 'var(--color-peligro)' },
];

const cadencia = (ms: number) =>
  ms < 60_000
    ? `cada ${Math.round(ms / 1000)} s`
    : ms < 86_400_000
      ? `cada ${Math.round(ms / 60_000)} min`
      : 'cada día';

function tiempoActivo(desde: string): string {
  const m = Math.floor((Date.now() - Date.parse(desde)) / 60_000);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

const suma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** Salud técnica de la plataforma: lo primero que se mira si algo "se siente raro" (RNF-82, RNF-83). */
export function Sistema() {
  const { data: s } = useQuery({
    queryKey: ['sistema'],
    queryFn: () => api.get<EstadoSistema>('/v1/op/sistema'),
    refetchInterval: 10_000,
  });

  return (
    <>
      <Encabezado
        titulo="Sistema"
        subtitulo="Salud técnica de la plataforma. Se actualiza cada 10 segundos."
        acciones={s && <Insignia tono={ESTADO[s.estado].tono}>{ESTADO[s.estado].texto}</Insignia>}
      />
      <div className="space-y-4 p-6">
        {!s ? (
          <Cargando />
        ) : (
          <>
            {s.problemas.length > 0 && (
              <div
                role="alert"
                id="problemas-sistema"
                className="rounded-xl border border-peligro/40 bg-peligro/10 p-4 text-sm"
              >
                <b className="text-peligro">Hay que revisar:</b>
                <ul className="mt-1 list-inside list-disc">
                  {s.problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Kpi
                etiqueta="Base de datos"
                icono="inicio"
                valor={s.baseDatos.ok ? `${s.baseDatos.latenciaMs} ms` : 'Sin respuesta'}
                tono={s.baseDatos.ok ? 'ok' : 'error'}
                nota={`Conexiones: ${s.baseDatos.pool.total - s.baseDatos.pool.ociosas} en uso de ${s.baseDatos.pool.total}${s.baseDatos.pool.esperando ? ` · ${s.baseDatos.pool.esperando} esperando` : ''}`}
              />
              <Kpi
                etiqueta="Solicitudes (15 min)"
                icono="rayo"
                valor={numero(s.http.ultimos15min.solicitudes)}
                nota={`${s.http.ultimos15min.errores4xx} rechazadas · ${s.http.ultimos15min.errores5xx} con error`}
                tono={s.http.ultimos15min.errores5xx > 0 ? 'aviso' : 'neutro'}
              />
              <Kpi
                etiqueta="Tiempo de respuesta"
                icono="reloj"
                valor={
                  s.http.ultimos15min.p95Ms === null
                    ? '—'
                    : `${Math.round(s.http.ultimos15min.p95Ms)} ms`
                }
                nota={`p95 · mediana ${s.http.ultimos15min.p50Ms === null ? '—' : Math.round(s.http.ultimos15min.p50Ms)} ms`}
              />
              <Kpi
                etiqueta="Conexiones en vivo"
                icono="wifi"
                valor={numero(suma(s.tiempoReal))}
                nota={`${s.tiempoReal['conductor'] ?? 0} conductores · ${s.tiempoReal['pasajero'] ?? 0} pasajeros · ${s.tiempoReal['interno'] ?? 0} internos`}
              />
              <Kpi
                etiqueta="Errores en las apps"
                icono="alerta"
                valor={numero(s.erroresDeApps15min)}
                nota="en los últimos 15 min"
                tono={s.erroresDeApps15min > 0 ? 'aviso' : 'neutro'}
              />
            </div>

            <Panel>
              <BarrasApiladas
                titulo="Solicitudes por minuto (últimos 30 min)"
                series={SERIES}
                datos={s.http.serie.map((m) => ({
                  etiqueta: soloHora(m.minuto),
                  valores: [m.solicitudes - m.errores5xx, m.errores5xx],
                }))}
                cadaN={5}
                alto={190}
              />
            </Panel>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel titulo="Tareas programadas" sinRelleno>
                <Tabla<TareaSistema>
                  id="tabla-tareas"
                  clave={(t) => t.nombre}
                  filas={s.tareas}
                  columnas={[
                    {
                      titulo: 'Tarea',
                      celda: (t) => (
                        <span className="block">
                          <b className="text-sm">{t.descripcion}</b>
                          <code className="block text-[11px] text-suave">
                            {t.nombre} · {cadencia(t.cadaMs)}
                          </code>
                        </span>
                      ),
                    },
                    {
                      titulo: 'Último éxito',
                      celda: (t) => (t.ultimoExitoEn ? fechaHora(t.ultimoExitoEn) : 'Aún no corre'),
                    },
                    {
                      titulo: 'Estado',
                      celda: (t) =>
                        t.atrasada ? (
                          <Insignia tono="error">Atrasada</Insignia>
                        ) : t.ultimoError ? (
                          <span title={t.ultimoError}>
                            <Insignia tono="aviso">Falló la última vez</Insignia>
                          </span>
                        ) : (
                          <Insignia tono="ok">Al día</Insignia>
                        ),
                    },
                    {
                      titulo: 'Fallos',
                      alinear: 'der',
                      celda: (t) => `${t.fallos} de ${t.ejecuciones}`,
                    },
                  ]}
                />
              </Panel>

              <Panel titulo="La operación ahora">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <dt className="text-suave">Viajes en curso</dt>
                  <dd className="numeros text-right font-bold">{suma(s.negocio.viajesActivos)}</dd>
                  <dt className="text-suave">Buscando conductor</dt>
                  <dd className="numeros text-right font-bold">
                    {s.negocio.viajesActivos['buscando_conductor'] ?? 0}
                  </dd>
                  <dt className="text-suave">Conductores conectados</dt>
                  <dd className="numeros text-right font-bold">{suma(s.negocio.conductores)}</dd>
                  <dt className="text-suave">Disponibles</dt>
                  <dd className="numeros text-right font-bold">
                    {s.negocio.conductores['disponible'] ?? 0}
                  </dd>
                  <dt className="text-suave">Sin señal</dt>
                  <dd className="numeros text-right font-bold">
                    {s.negocio.conductores['sin_senal'] ?? 0}
                  </dd>
                </dl>
                <hr className="my-3 border-borde" />
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <dt className="text-suave">Versión</dt>
                  <dd className="text-right font-bold">{s.version}</dd>
                  <dt className="text-suave">Entorno</dt>
                  <dd className="text-right font-bold">
                    {s.entorno}
                    {s.simulador && ' (demostración)'}
                  </dd>
                  <dt className="text-suave">En marcha hace</dt>
                  <dd className="text-right font-bold">{tiempoActivo(s.inicioEn)}</dd>
                  <dt className="text-suave">Memoria</dt>
                  <dd className="numeros text-right font-bold">{s.memoriaMb} MB</dd>
                </dl>
              </Panel>
            </div>
          </>
        )}
      </div>
    </>
  );
}
