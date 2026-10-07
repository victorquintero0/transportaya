import { api, pesos, telefonoLegible } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import { Boton, Campo, Entrada, Insignia, Panel, Selector, Tabla } from '../componentes/ui.tsx';
import { consulta } from '../lib/consultas.ts';
import { fechaHora } from '../lib/fechas.ts';
import type { Pagina, PasajeroFila } from '../lib/tipos.ts';

export function Pasajeros() {
  const navegar = useNavigate();
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [conDeuda, setConDeuda] = useState(false);
  const [aplicado, setAplicado] = useState({ q: '', estado: '', conDeuda: false });
  const { data } = useQuery({
    queryKey: ['pasajeros', aplicado],
    queryFn: () =>
      api.get<Pagina<PasajeroFila>>(
        `/v1/op/pasajeros${consulta({ q: aplicado.q, estado: aplicado.estado, conDeuda: aplicado.conDeuda || undefined, limite: 100 })}`,
      ),
    placeholderData: (previo) => previo,
  });
  return (
    <>
      <Encabezado titulo="Pasajeros" subtitulo="Cuentas, deudas, calificaciones y bloqueos" />
      <div className="space-y-4 p-6">
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setAplicado({ q, estado, conDeuda });
          }}
        >
          <Campo etiqueta="Buscar" className="w-72">
            <Entrada
              id="buscar-pasajero"
              placeholder="Nombre o teléfono"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Estado" className="w-44">
            <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="activo">Activos</option>
              <option value="bloqueado">Bloqueados</option>
            </Selector>
          </Campo>
          <label className="flex h-10 items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={conDeuda}
              onChange={(e) => setConDeuda(e.target.checked)}
              className="size-4 accent-[var(--color-ty)]"
            />
            Solo con deuda
          </label>
          <Boton type="submit" variante="primario" icono="buscar">
            Buscar
          </Boton>
        </form>
        <Panel sinRelleno titulo={`${data?.total ?? 0} pasajeros`}>
          <Tabla
            id="tabla-pasajeros"
            filas={data?.items ?? []}
            clave={(p) => p.id}
            alFila={(p) => void navegar(`/pasajeros/${p.id}`)}
            columnas={[
              { titulo: 'Pasajero', celda: (p) => <b>{p.nombre}</b> },
              { titulo: 'Teléfono', celda: (p) => telefonoLegible(p.telefono) },
              {
                titulo: 'Estado',
                celda: (p) => (
                  <Insignia tono={p.estado === 'activo' ? 'ok' : 'error'}>
                    {p.estado === 'activo' ? 'Activo' : 'Bloqueado'}
                  </Insignia>
                ),
              },
              { titulo: 'Viajes', alinear: 'der', celda: (p) => p.viajes },
              {
                titulo: 'Calificación',
                alinear: 'der',
                celda: (p) => (p.calificacion ? `${p.calificacion} ★` : '—'),
              },
              {
                titulo: 'Deuda',
                alinear: 'der',
                celda: (p) =>
                  p.deuda > 0 ? (
                    <span className="font-bold text-peligro">{pesos(p.deuda)}</span>
                  ) : (
                    '—'
                  ),
              },
              { titulo: 'Registro', celda: (p) => fechaHora(p.creadoEn) },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
