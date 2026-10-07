import { api } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import {
  Boton,
  Campo,
  Entrada,
  Insignia,
  Kpi,
  Panel,
  Selector,
  Tabla,
} from '../componentes/ui.tsx';
import { consulta } from '../lib/consultas.ts';
import { ESTADO_TICKET, PRIORIDAD, TIPO_TICKET } from '../lib/etiquetas.ts';
import { hace, plazo } from '../lib/fechas.ts';
import type { Pagina, Semaforo, TicketFila } from '../lib/tipos.ts';

export function InsigniaSla({ sla, vence }: { sla: Semaforo | null; vence: string | null }) {
  if (!sla || !vence) return <span className="text-suave">—</span>;
  return (
    <Insignia tono={sla === 'rojo' ? 'error' : sla === 'ambar' ? 'aviso' : 'ok'}>
      {plazo(vence)}
    </Insignia>
  );
}

export function Soporte() {
  const navegar = useNavigate();
  const [f, setF] = useState({
    q: '',
    estado: 'abiertos',
    tipo: '',
    prioridad: '',
    asignado: '',
    vencidos: false,
  });
  const [aplicado, setAplicado] = useState(f);
  const { data } = useQuery({
    queryKey: ['tickets', aplicado],
    queryFn: () =>
      api.get<
        Pagina<TicketFila> & { resumen: { abiertos: number; vencidos: number; sinAsignar: number } }
      >(
        `/v1/op/tickets${consulta({ q: aplicado.q, estado: aplicado.estado, tipo: aplicado.tipo, prioridad: aplicado.prioridad, asignado: aplicado.asignado, vencidos: aplicado.vencidos || undefined, limite: 100 })}`,
      ),
    placeholderData: (previo) => previo,
    refetchInterval: 20_000,
  });
  return (
    <>
      <Encabezado
        titulo="Soporte y PQRS"
        subtitulo="Bandeja de tickets con su tiempo de respuesta"
      />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-3 gap-3">
          <Kpi etiqueta="Abiertos" valor={data?.resumen.abiertos ?? 0} icono="mensaje" />
          <Kpi
            etiqueta="Sin asignar"
            valor={data?.resumen.sinAsignar ?? 0}
            tono={(data?.resumen.sinAsignar ?? 0) > 0 ? 'aviso' : 'neutro'}
            icono="usuario"
          />
          <Kpi
            etiqueta="Plazo vencido"
            valor={data?.resumen.vencidos ?? 0}
            tono={(data?.resumen.vencidos ?? 0) > 0 ? 'error' : 'neutro'}
            icono="reloj"
          />
        </div>
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setAplicado(f);
          }}
        >
          <Campo etiqueta="Buscar" className="w-64">
            <Entrada
              placeholder="Asunto, persona o viaje"
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Estado" className="w-44">
            <Selector value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
              <option value="abiertos">Abiertos</option>
              <option value="">Todos</option>
              {Object.entries(ESTADO_TICKET).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.texto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Tipo" className="w-44">
            <Selector value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(TIPO_TICKET).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Prioridad" className="w-36">
            <Selector
              value={f.prioridad}
              onChange={(e) => setF({ ...f, prioridad: e.target.value })}
            >
              <option value="">Todas</option>
              {Object.entries(PRIORIDAD).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.texto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Asignado" className="w-40">
            <Selector value={f.asignado} onChange={(e) => setF({ ...f, asignado: e.target.value })}>
              <option value="">Cualquiera</option>
              <option value="yo">A mí</option>
              <option value="sin">Sin asignar</option>
            </Selector>
          </Campo>
          <label className="flex h-10 items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={f.vencidos}
              onChange={(e) => setF({ ...f, vencidos: e.target.checked })}
              className="size-4 accent-[var(--color-ty)]"
            />
            Solo vencidos
          </label>
          <Boton type="submit" variante="primario" icono="buscar">
            Filtrar
          </Boton>
        </form>
        <Panel sinRelleno titulo={`${data?.total ?? 0} tickets`}>
          <Tabla
            id="tabla-tickets"
            filas={data?.items ?? []}
            clave={(t) => t.id}
            alFila={(t) => void navegar(`/soporte/${t.id}`)}
            vacio="No hay tickets con esos filtros."
            columnas={[
              { titulo: 'Plazo', celda: (t) => <InsigniaSla sla={t.sla} vence={t.venceSlaEn} /> },
              {
                titulo: 'Asunto',
                celda: (t) => (
                  <span>
                    <b>{t.asunto}</b>
                    <span className="block text-xs text-suave">
                      {t.usuario}
                      {t.codigoViaje ? ` · ${t.codigoViaje}` : ''}
                    </span>
                  </span>
                ),
              },
              { titulo: 'Tipo', celda: (t) => TIPO_TICKET[t.tipo] ?? t.tipo },
              {
                titulo: 'Prioridad',
                celda: (t) => (
                  <Insignia tono={PRIORIDAD[t.prioridad]?.tono}>
                    {PRIORIDAD[t.prioridad]?.texto}
                  </Insignia>
                ),
              },
              {
                titulo: 'Estado',
                celda: (t) => (
                  <Insignia tono={ESTADO_TICKET[t.estado]?.tono}>
                    {ESTADO_TICKET[t.estado]?.texto}
                  </Insignia>
                ),
              },
              {
                titulo: 'Asignado',
                celda: (t) => t.asignado ?? <span className="text-suave">Sin asignar</span>,
              },
              { titulo: 'Creado', celda: (t) => hace(t.creadoEn) },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
