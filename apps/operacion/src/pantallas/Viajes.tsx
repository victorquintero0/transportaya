import { api, pesos } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import { Boton, Campo, Entrada, Insignia, Panel, Selector, Tabla } from '../componentes/ui.tsx';
import { consulta } from '../lib/consultas.ts';
import { CATEGORIA, ESTADO_VIAJE, METODO_PAGO, TIPO_SERVICIO } from '../lib/etiquetas.ts';
import { fechaHora } from '../lib/fechas.ts';
import type { Pagina, ViajeFila } from '../lib/tipos.ts';

const POR_PAGINA = 25;

export function EstadoViaje({ estado }: { estado: string }) {
  const e = ESTADO_VIAJE[estado] ?? { texto: estado, tono: 'neutro' as const };
  return <Insignia tono={e.tono}>{e.texto}</Insignia>;
}

export function Viajes() {
  const navegar = useNavigate();
  const [filtros, setFiltros] = useState({
    q: '',
    estado: '',
    tipoServicio: '',
    desde: '',
    hasta: '',
  });
  const [aplicados, setAplicados] = useState(filtros);
  const [pagina, setPagina] = useState(0);

  const { data, isFetching } = useQuery({
    queryKey: ['viajes', aplicados, pagina],
    queryFn: () =>
      api.get<Pagina<ViajeFila>>(
        `/v1/op/viajes${consulta({
          q: aplicados.q,
          estado: aplicados.estado,
          tipoServicio: aplicados.tipoServicio,
          desde: aplicados.desde ? `${aplicados.desde}T00:00:00-05:00` : undefined,
          hasta: aplicados.hasta ? `${aplicados.hasta}T23:59:59-05:00` : undefined,
          limite: POR_PAGINA,
          desplazar: pagina * POR_PAGINA,
        })}`,
      ),
    placeholderData: (previo) => previo,
  });
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <Encabezado
        titulo="Viajes"
        subtitulo="Busca cualquier viaje por código, pasajero, conductor o placa"
      />
      <div className="space-y-4 p-6">
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPagina(0);
            setAplicados(filtros);
          }}
        >
          <Campo etiqueta="Buscar" className="w-72">
            <Entrada
              id="buscar-viaje"
              placeholder="TY-ABC123, nombre, teléfono o placa"
              value={filtros.q}
              onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Estado" className="w-48">
            <Selector
              value={filtros.estado}
              onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
            >
              <option value="">Todos</option>
              {Object.entries(ESTADO_VIAJE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.texto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Servicio" className="w-40">
            <Selector
              value={filtros.tipoServicio}
              onChange={(e) => setFiltros({ ...filtros, tipoServicio: e.target.value })}
            >
              <option value="">Todos</option>
              {Object.entries(TIPO_SERVICIO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Desde">
            <Entrada
              type="date"
              value={filtros.desde}
              onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Hasta">
            <Entrada
              type="date"
              value={filtros.hasta}
              onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
            />
          </Campo>
          <Boton type="submit" variante="primario" icono="buscar" id="buscar">
            Buscar
          </Boton>
        </form>

        <Panel
          sinRelleno
          titulo={`${total} viajes`}
          acciones={
            isFetching ? <span className="text-xs text-suave">Actualizando…</span> : undefined
          }
        >
          <Tabla
            id="tabla-viajes"
            filas={data?.items ?? []}
            clave={(v) => v.id}
            alFila={(v) => void navegar(`/viajes/${v.id}`)}
            vacio="No hay viajes con esos filtros."
            columnas={[
              { titulo: 'Código', celda: (v) => <b>{v.codigo}</b> },
              { titulo: 'Solicitado', celda: (v) => fechaHora(v.solicitadoEn) },
              { titulo: 'Estado', celda: (v) => <EstadoViaje estado={v.estado} /> },
              { titulo: 'Pasajero', celda: (v) => v.pasajero },
              {
                titulo: 'Conductor',
                celda: (v) => (v.conductor ? `${v.conductor} · ${v.placa ?? ''}` : '—'),
              },
              {
                titulo: 'Servicio',
                celda: (v) =>
                  `${TIPO_SERVICIO[v.tipoServicio] ?? v.tipoServicio} · ${CATEGORIA[v.categoria] ?? v.categoria}`,
              },
              { titulo: 'Pago', celda: (v) => METODO_PAGO[v.metodoPago] ?? v.metodoPago },
              {
                titulo: 'Valor',
                alinear: 'der',
                celda: (v) => (
                  <span className="numeros font-bold">
                    {pesos(v.precioFinal ?? v.precio)}
                    {v.precioFinal === null && <span className="text-suave"> est.</span>}
                  </span>
                ),
              },
            ]}
          />
          <div className="flex items-center justify-between border-t border-borde px-4 py-2 text-sm text-suave">
            <span>
              Página {pagina + 1} de {paginas}
            </span>
            <div className="flex gap-2">
              <Boton
                tamano="sm"
                deshabilitado={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
                icono="izquierda"
              >
                Anterior
              </Boton>
              <Boton
                tamano="sm"
                deshabilitado={pagina + 1 >= paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Boton>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
