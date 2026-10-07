import { api } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Encabezado } from '../componentes/Layout.tsx';
import { Boton, Campo, Entrada, Panel, Selector, Tabla } from '../componentes/ui.tsx';
import { consulta } from '../lib/consultas.ts';
import { ACCION_AUDITORIA, etiquetaAccion } from '../lib/etiquetas.ts';
import { fechaHora } from '../lib/fechas.ts';
import type { FilaAuditoria, Pagina } from '../lib/tipos.ts';

const POR_PAGINA = 40;

function Cambio({ antes, despues }: { antes: unknown; despues: unknown }) {
  if (antes == null && despues == null) return <span className="text-suave">—</span>;
  const texto = (v: unknown) => (v == null ? '' : JSON.stringify(v));
  return (
    <span className="block max-w-md text-xs">
      {antes != null && (
        <span className="block text-suave">
          Antes: <code>{texto(antes)}</code>
        </span>
      )}
      {despues != null && (
        <span className="block">
          Después: <code>{texto(despues)}</code>
        </span>
      )}
    </span>
  );
}

export function Auditoria() {
  const [f, setF] = useState({ accion: '', desde: '', hasta: '' });
  const [aplicado, setAplicado] = useState(f);
  const [pagina, setPagina] = useState(0);
  const { data } = useQuery({
    queryKey: ['auditoria', aplicado, pagina],
    queryFn: () =>
      api.get<Pagina<FilaAuditoria>>(
        `/v1/op/auditoria${consulta({ accion: aplicado.accion, desde: aplicado.desde ? `${aplicado.desde}T00:00:00-05:00` : undefined, hasta: aplicado.hasta ? `${aplicado.hasta}T23:59:59-05:00` : undefined, limite: POR_PAGINA, desplazar: pagina * POR_PAGINA })}`,
      ),
    placeholderData: (p) => p,
  });
  const paginas = Math.max(1, Math.ceil((data?.total ?? 0) / POR_PAGINA));
  const grupos = [...new Set(Object.keys(ACCION_AUDITORIA).map((a) => a.split('.')[0]!))];
  return (
    <>
      <Encabezado
        titulo="Auditoría"
        subtitulo="Quién hizo qué, cuándo, con qué valores y por qué. El registro no se puede modificar."
      />
      <div className="space-y-4 p-6">
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPagina(0);
            setAplicado(f);
          }}
        >
          <Campo etiqueta="Tipo de acción" className="w-60">
            <Selector value={f.accion} onChange={(e) => setF({ ...f, accion: e.target.value })}>
              <option value="">Todas</option>
              {grupos.map((g) => (
                <option key={g} value={`${g}.`}>
                  {g.replaceAll('_', ' ')}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Desde">
            <Entrada
              type="date"
              value={f.desde}
              onChange={(e) => setF({ ...f, desde: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Hasta">
            <Entrada
              type="date"
              value={f.hasta}
              onChange={(e) => setF({ ...f, hasta: e.target.value })}
            />
          </Campo>
          <Boton type="submit" variante="primario" icono="buscar">
            Filtrar
          </Boton>
        </form>
        <Panel sinRelleno titulo={`${data?.total ?? 0} registros`}>
          <Tabla
            id="tabla-auditoria"
            filas={data?.items ?? []}
            clave={(a) => a.id}
            vacio="No hay registros con esos filtros."
            columnas={[
              {
                titulo: 'Cuándo',
                celda: (a) => <span className="whitespace-nowrap">{fechaHora(a.ocurridoEn)}</span>,
              },
              { titulo: 'Quién', celda: (a) => <b>{a.quien}</b> },
              {
                titulo: 'Qué hizo',
                celda: (a) => (
                  <span>
                    {etiquetaAccion(a.accion)}
                    <code className="block text-[11px] text-suave">{a.accion}</code>
                  </span>
                ),
              },
              { titulo: 'Valores', celda: (a) => <Cambio antes={a.antes} despues={a.despues} /> },
              {
                titulo: 'Motivo',
                celda: (a) => <span className="block max-w-xs text-xs">{a.motivo ?? '—'}</span>,
              },
              {
                titulo: 'IP',
                celda: (a) => <span className="text-xs text-suave">{a.ip ?? '—'}</span>,
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
