import { api, pesos } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import {
  AccionMotivo,
  Boton,
  Campo,
  Entrada,
  Insignia,
  Kpi,
  Modal,
  Panel,
  Selector,
  Tabla,
  type Tono,
} from '../componentes/ui.tsx';
import { consulta, usePermiso, useEjecutar } from '../lib/consultas.ts';
import { CATEGORIA, METODO_PAGO } from '../lib/etiquetas.ts';
import { fechaHora } from '../lib/fechas.ts';

type EstadoReserva =
  'sin_conductor' | 'tomada' | 'confirmada' | 'buscando' | 'asignada' | 'en_curso' | 'cerrada';

const ESTADOS: Record<EstadoReserva, { texto: string; tono: Tono }> = {
  sin_conductor: { texto: 'Sin conductor', tono: 'neutro' },
  tomada: { texto: 'Por confirmar', tono: 'aviso' },
  confirmada: { texto: 'Confirmada', tono: 'ok' },
  buscando: { texto: 'Buscando', tono: 'aviso' },
  asignada: { texto: 'Asignada', tono: 'info' },
  en_curso: { texto: 'En curso', tono: 'ok' },
  cerrada: { texto: 'Cerrada', tono: 'neutro' },
};

interface FilaReserva {
  id: string;
  codigo: string;
  estado: string;
  estadoReserva: EstadoReserva;
  programadoPara: string;
  categoria: string;
  origen: string | null;
  destino: string | null;
  pasajero: string;
  conductor: string | null;
  precioEstimado: { min: number; max: number };
  metodoPago: string;
  confirmarAntesDe: string | null;
  despachoEn: string;
  alertaEn: string;
  enRiesgo: boolean;
  conAlerta: boolean;
}

interface Respuesta {
  items: FilaReserva[];
  resumen: {
    sinConductor: number;
    tomadas: number;
    confirmadas: number;
    buscando: number;
    enRiesgo: number;
  };
}

interface ConductorElegible {
  id: string;
  nombre: string;
  telefono: string;
  placa: string;
  categoria: string;
  estadoOperativo: string;
}

const DIAS = [
  { v: '1', t: 'Hoy y mañana' },
  { v: '3', t: 'Próximos 3 días' },
  { v: '8', t: 'Próximos 8 días' },
];

/** OPE-09: las reservas por hora, con quién las tiene y cuáles están en riesgo. */
export function Reservas() {
  const navegar = useNavigate();
  const puedeDespachar = usePermiso('viajes.despachar');
  const ejecutar = useEjecutar();
  const [estado, setEstado] = useState('');
  const [dias, setDias] = useState('8');
  const [asignando, setAsignando] = useState<FilaReserva | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['reservas', estado, dias],
    queryFn: () =>
      api.get<Respuesta>(
        `/v1/op/reservas${consulta({
          estado,
          hasta: new Date(Date.now() + Number(dias) * 86_400_000).toISOString(),
        })}`,
      ),
    refetchInterval: 20_000,
    placeholderData: (previo) => previo,
  });
  const r = data?.resumen;

  return (
    <>
      <Encabezado
        titulo="Reservas"
        subtitulo="Viajes programados: quién los tiene y cuáles están en riesgo"
      />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" id="resumen-reservas">
          <Kpi etiqueta="Sin conductor" valor={r?.sinConductor ?? 0} icono="reloj" />
          <Kpi etiqueta="Por confirmar" valor={r?.tomadas ?? 0} tono="aviso" icono="alerta" />
          <Kpi etiqueta="Confirmadas" valor={r?.confirmadas ?? 0} tono="ok" icono="ok" />
          <Kpi etiqueta="Buscando" valor={r?.buscando ?? 0} tono="aviso" icono="buscar" />
          <Kpi
            etiqueta="En riesgo"
            valor={r?.enRiesgo ?? 0}
            tono={r && r.enRiesgo > 0 ? 'error' : 'neutro'}
            nota="Faltan menos de 30 min y no hay conductor firme"
            icono="alerta"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4">
          <Campo etiqueta="Estado" className="w-52">
            <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.texto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Ventana" className="w-52">
            <Selector value={dias} onChange={(e) => setDias(e.target.value)}>
              {DIAS.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.t}
                </option>
              ))}
            </Selector>
          </Campo>
        </div>

        <Panel
          sinRelleno
          titulo={`${data?.items.length ?? 0} reservas`}
          acciones={
            isFetching ? <span className="text-xs text-suave">Actualizando…</span> : undefined
          }
        >
          <Tabla
            id="tabla-reservas"
            filas={data?.items ?? []}
            clave={(f) => f.id}
            vacio="No hay reservas en esa ventana."
            columnas={[
              { titulo: 'Hora', celda: (f) => <b>{fechaHora(f.programadoPara)}</b> },
              { titulo: 'Código', celda: (f) => f.codigo },
              {
                titulo: 'Estado',
                celda: (f) => (
                  <span className="flex flex-wrap items-center gap-1">
                    <Insignia tono={ESTADOS[f.estadoReserva].tono}>
                      {ESTADOS[f.estadoReserva].texto}
                    </Insignia>
                    {f.enRiesgo && <Insignia tono="error">En riesgo</Insignia>}
                  </span>
                ),
              },
              { titulo: 'Pasajero', celda: (f) => f.pasajero },
              { titulo: 'Conductor', celda: (f) => f.conductor ?? '—' },
              {
                titulo: 'Recorrido',
                celda: (f) => (
                  <span className="block max-w-64 truncate">
                    {(f.origen ?? '').split(',')[0]} → {(f.destino ?? '').split(',')[0]}
                  </span>
                ),
              },
              {
                titulo: 'Servicio',
                celda: (f) =>
                  `${CATEGORIA[f.categoria] ?? f.categoria} · ${METODO_PAGO[f.metodoPago] ?? f.metodoPago}`,
              },
              {
                titulo: 'Precio',
                alinear: 'der',
                celda: (f) => `${pesos(f.precioEstimado.min)} – ${pesos(f.precioEstimado.max)}`,
              },
              {
                titulo: '',
                alinear: 'der',
                celda: (f) => (
                  <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    {puedeDespachar && f.estado === 'programado' && (
                      <Boton
                        id={`asignar-${f.codigo}`}
                        tamano="sm"
                        icono="usuario"
                        onClick={() => setAsignando(f)}
                      >
                        {f.conductor ? 'Cambiar' : 'Asignar'}
                      </Boton>
                    )}
                    {puedeDespachar && f.estado === 'programado' && f.conductor && (
                      <AccionMotivo
                        id={`liberar-${f.codigo}`}
                        etiqueta="Liberar"
                        titulo={`Liberar ${f.codigo}`}
                        descripcion="La reserva vuelve al tablero y se le avisa al conductor."
                        confirmar="Liberar"
                        alConfirmar={(motivo) =>
                          ejecutar(() => api.post(`/v1/op/reservas/${f.id}/liberar`, { motivo }), {
                            invalidar: ['reservas'],
                            exito: 'Reserva liberada',
                          })
                        }
                      />
                    )}
                    <Boton tamano="sm" onClick={() => void navegar(`/viajes/${f.id}`)}>
                      Ver
                    </Boton>
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      </div>

      {asignando && <AsignarConductor reserva={asignando} alCerrar={() => setAsignando(null)} />}
    </>
  );
}

function AsignarConductor({ reserva, alCerrar }: { reserva: FilaReserva; alCerrar: () => void }) {
  const ejecutar = useEjecutar();
  const [q, setQ] = useState('');
  const [elegido, setElegido] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const { data } = useQuery({
    queryKey: ['reservas-conductores', reserva.id, q],
    queryFn: () =>
      api.get<ConductorElegible[]>(`/v1/op/reservas/${reserva.id}/conductores${consulta({ q })}`),
  });
  const ok = elegido !== '' && motivo.trim().length >= 5 && !enCurso;
  return (
    <Modal
      abierto
      titulo={`Asignar conductor a ${reserva.codigo}`}
      alCerrar={alCerrar}
      ancho="max-w-xl"
    >
      <div className="space-y-4">
        <p className="text-sm text-suave">
          {fechaHora(reserva.programadoPara)} · {(reserva.destino ?? '').split(',')[0]}. Solo
          aparecen conductores habilitados que pueden hacer este servicio sin cruzarse con otra
          reserva. Queda confirmada de una vez.
        </p>
        <Campo etiqueta="Buscar conductor">
          <Entrada
            id="buscar-conductor-reserva"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre"
          />
        </Campo>
        <ul
          className="scroll-fino max-h-64 divide-y divide-borde overflow-y-auto rounded-lg border border-borde"
          aria-label="Conductores"
        >
          {(data ?? []).length === 0 && (
            <li className="p-3 text-sm text-suave">No hay conductores que cumplan.</li>
          )}
          {(data ?? []).map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 p-3 hover:bg-superficie-2">
                <input
                  type="radio"
                  name="conductor-reserva"
                  value={c.id}
                  checked={elegido === c.id}
                  onChange={() => setElegido(c.id)}
                />
                <span className="flex-1">
                  <b>{c.nombre}</b>
                  <span className="block text-xs text-suave">
                    {c.placa} · {CATEGORIA[c.categoria] ?? c.categoria} · {c.telefono}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Campo etiqueta="Motivo (queda en la auditoría)">
          <Entrada
            id="motivo-asignar-reserva"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se asigna a mano"
          />
        </Campo>
        {error && <p className="text-sm font-bold text-peligro">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton
            id="confirmar-asignar-reserva"
            variante="primario"
            deshabilitado={!ok}
            cargando={enCurso}
            onClick={() => {
              setEnCurso(true);
              setError(null);
              ejecutar(
                () =>
                  api.post(`/v1/op/reservas/${reserva.id}/asignar`, {
                    conductorId: elegido,
                    motivo: motivo.trim(),
                  }),
                { invalidar: ['reservas'], exito: 'Conductor asignado a la reserva' },
              )
                .then(alCerrar)
                .catch((e: unknown) =>
                  setError(e instanceof Error ? e.message : 'No se pudo asignar'),
                )
                .finally(() => setEnCurso(false));
            }}
          >
            Asignar
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
