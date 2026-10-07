import { api, telefonoLegible } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import {
  Boton,
  Campo,
  Entrada,
  Insignia,
  Panel,
  Pestanas,
  Selector,
  Tabla,
} from '../componentes/ui.tsx';
import { consulta } from '../lib/consultas.ts';
import { CATEGORIA, ESTADO_OPERATIVO, HABILITACION, TIPO_DOCUMENTO } from '../lib/etiquetas.ts';
import { fechaCorta, hace } from '../lib/fechas.ts';
import type { ConductorFila, Pagina, VencimientoFila } from '../lib/tipos.ts';

export function EstadoHabilitacion({ estado }: { estado: string }) {
  const e = HABILITACION[estado] ?? { texto: estado, tono: 'neutro' as const };
  return <Insignia tono={e.tono}>{e.texto}</Insignia>;
}

export function Conductores() {
  const navegar = useNavigate();
  const [pestana, setPestana] = useState<'cola' | 'todos' | 'vencimientos'>('cola');
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [aplicado, setAplicado] = useState({ q: '', estado: '' });

  const filtroEstado = pestana === 'cola' ? 'en_revision' : aplicado.estado;
  const { data } = useQuery({
    queryKey: ['conductores', pestana, aplicado],
    enabled: pestana !== 'vencimientos',
    queryFn: () =>
      api.get<Pagina<ConductorFila> & { enRevision: number }>(
        `/v1/op/conductores${consulta({ q: aplicado.q, estado: filtroEstado, limite: 100 })}`,
      ),
    placeholderData: (previo) => previo,
  });
  const { data: cola } = useQuery({
    queryKey: ['conductores', 'conteo'],
    queryFn: () =>
      api.get<Pagina<ConductorFila> & { enRevision: number }>('/v1/op/conductores?limite=1'),
  });
  const { data: venc } = useQuery({
    queryKey: ['conductores', 'vencimientos'],
    enabled: pestana === 'vencimientos',
    queryFn: () =>
      api.get<{ ventanaDias: number; items: VencimientoFila[] }>('/v1/op/vencimientos'),
  });

  return (
    <>
      <Encabezado
        titulo="Conductores y vehículos"
        subtitulo="Registro, documentos, estado y vencimientos"
      />
      <div className="space-y-4 p-6">
        <Pestanas
          activa={pestana}
          alCambiar={setPestana}
          items={[
            { id: 'cola', titulo: 'Por revisar', aviso: cola?.enRevision },
            { id: 'todos', titulo: 'Todos' },
            { id: 'vencimientos', titulo: 'Vencimientos' },
          ]}
        />

        {pestana === 'todos' && (
          <form
            className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4"
            onSubmit={(e) => {
              e.preventDefault();
              setAplicado({ q, estado });
            }}
          >
            <Campo etiqueta="Buscar" className="w-72">
              <Entrada
                id="buscar-conductor"
                placeholder="Nombre, teléfono o placa"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Estado" className="w-52">
              <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(HABILITACION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.texto}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Boton type="submit" variante="primario" icono="buscar">
              Buscar
            </Boton>
          </form>
        )}

        {pestana !== 'vencimientos' ? (
          <Panel
            sinRelleno
            titulo={
              pestana === 'cola'
                ? 'Solicitudes en revisión, de la más antigua a la más reciente'
                : `${data?.total ?? 0} conductores`
            }
          >
            <Tabla
              id="tabla-conductores"
              filas={data?.items ?? []}
              clave={(c) => c.id}
              alFila={(c) => void navegar(`/conductores/${c.id}`)}
              vacio={
                pestana === 'cola'
                  ? 'No hay registros por revisar. ¡Al día!'
                  : 'No hay conductores con esos filtros.'
              }
              columnas={[
                {
                  titulo: 'Conductor',
                  celda: (c) => (
                    <span>
                      <b>{c.nombre}</b>
                      <span className="block text-xs text-suave">
                        {telefonoLegible(c.telefono)}
                      </span>
                    </span>
                  ),
                },
                {
                  titulo: 'Vehículo',
                  celda: (c) =>
                    c.placa ? `${c.placa} · ${CATEGORIA[c.categoria ?? ''] ?? ''}` : '—',
                },
                {
                  titulo: 'Habilitación',
                  celda: (c) => <EstadoHabilitacion estado={c.estadoHabilitacion} />,
                },
                {
                  titulo: 'Ahora',
                  celda: (c) =>
                    c.estadoHabilitacion === 'habilitado' ? (
                      <Insignia tono={ESTADO_OPERATIVO[c.estadoOperativo]?.tono}>
                        {ESTADO_OPERATIVO[c.estadoOperativo]?.texto}
                      </Insignia>
                    ) : (
                      '—'
                    ),
                },
                {
                  titulo: 'Documentos',
                  celda: (c) =>
                    c.documentosPendientes > 0 ? (
                      <Insignia tono="aviso">{c.documentosPendientes} por revisar</Insignia>
                    ) : (
                      '—'
                    ),
                },
                {
                  titulo: 'Deuda',
                  celda: (c) =>
                    c.bloqueadoPorDeuda ? (
                      <Insignia tono="error">Bloqueado por deuda</Insignia>
                    ) : (
                      '—'
                    ),
                },
                {
                  titulo: pestana === 'cola' ? 'Esperando' : 'Registro',
                  celda: (c) => hace(pestana === 'cola' ? c.actualizadoEn : c.creadoEn),
                },
              ]}
            />
          </Panel>
        ) : (
          <Panel
            sinRelleno
            titulo={`Documentos vencidos o que vencen en los próximos ${venc?.ventanaDias ?? 30} días`}
          >
            <Tabla
              id="tabla-vencimientos"
              filas={venc?.items ?? []}
              clave={(v) => v.id}
              alFila={(v) => void navegar(`/conductores/${v.conductorId}`)}
              vacio="Ningún documento vence pronto."
              columnas={[
                {
                  titulo: 'Conductor',
                  celda: (v) => (
                    <span>
                      <b>{v.conductor}</b>
                      <span className="block text-xs text-suave">
                        {v.telefono ? telefonoLegible(v.telefono) : ''}
                      </span>
                    </span>
                  ),
                },
                {
                  titulo: 'Documento',
                  celda: (v) =>
                    `${TIPO_DOCUMENTO[v.tipo] ?? v.tipo}${v.placa ? ` · ${v.placa}` : ''}`,
                },
                { titulo: 'Vence', celda: (v) => (v.venceEn ? fechaCorta(v.venceEn) : '—') },
                {
                  titulo: 'Falta',
                  celda: (v) =>
                    v.diasRestantes === null ? (
                      '—'
                    ) : (
                      <Insignia
                        tono={
                          v.diasRestantes < 0 ? 'error' : v.diasRestantes <= 7 ? 'aviso' : 'info'
                        }
                      >
                        {v.diasRestantes < 0
                          ? `Vencido hace ${-v.diasRestantes} d`
                          : `${v.diasRestantes} d`}
                      </Insignia>
                    ),
                },
              ]}
            />
          </Panel>
        )}
      </div>
    </>
  );
}
