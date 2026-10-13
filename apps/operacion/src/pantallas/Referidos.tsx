import { api, numero, pesos } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
import { consulta, useEjecutar, usePermiso } from '../lib/consultas.ts';
import { fechaHora } from '../lib/fechas.ts';
import type { FichaPuntos, FilaReferido, ResumenReferidosOp } from '../lib/tipos.ts';

const ESTADOS: Record<string, { texto: string; tono: Tono }> = {
  pendiente: { texto: 'Pendiente', tono: 'aviso' },
  otorgado: { texto: 'Otorgado', tono: 'ok' },
  rechazado: { texto: 'Rechazado', tono: 'error' },
};

const TIPO_MOVIMIENTO: Record<string, string> = {
  referido_referidor: 'Premio por invitar',
  referido_invitado: 'Bienvenida',
  canje_descuento: 'Descuento en viaje',
  canje_abono: 'Abono a comisión',
  reverso: 'Puntos devueltos',
  ajuste: 'Ajuste manual',
};

/** OPE-14: el programa de referidos y puntos: cuánto cuesta, quién invita, y revisar casos sospechosos. */
export function Referidos() {
  const puedeGestionar = usePermiso('referidos.gestionar');
  const ejecutar = useEjecutar();
  const [estado, setEstado] = useState('');
  const [q, setQ] = useState('');
  const [ficha, setFicha] = useState<string | null>(null);

  const { data: resumen } = useQuery({
    queryKey: ['referidos-resumen'],
    queryFn: () => api.get<ResumenReferidosOp>('/v1/op/referidos/resumen'),
    refetchInterval: 30_000,
  });
  const { data: filas, isFetching } = useQuery({
    queryKey: ['referidos-lista', estado, q],
    queryFn: () => api.get<FilaReferido[]>(`/v1/op/referidos${consulta({ estado, q })}`),
    placeholderData: (previo) => previo,
  });

  const invalidar = ['referidos-resumen', 'referidos-lista', 'referidos-ficha'];

  return (
    <>
      <Encabezado
        titulo="Referidos y puntos"
        subtitulo="Quién invita a quién, cuántos puntos hay en circulación y lo que cuestan"
      />
      <div className="space-y-4 p-6">
        {resumen && !resumen.activo && (
          <p className="rounded-xl bg-sol/10 px-4 py-3 text-sm font-bold text-sol">
            El programa está apagado (Configuración → Referidos). No se aceptan códigos nuevos ni se
            canjean puntos.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" id="resumen-referidos">
          <Kpi
            etiqueta="Invitaciones"
            valor={
              (resumen?.referidos.pendientes ?? 0) +
              (resumen?.referidos.otorgados ?? 0) +
              (resumen?.referidos.rechazados ?? 0)
            }
            nota={`${resumen?.referidos.pendientes ?? 0} pendientes`}
            icono="usuario"
          />
          <Kpi
            etiqueta="Otorgadas"
            valor={resumen?.referidos.otorgados ?? 0}
            tono="ok"
            icono="ok"
          />
          <Kpi
            etiqueta="Puntos emitidos"
            valor={numero(resumen?.puntos.emitidos ?? 0)}
            nota={`${numero(resumen?.puntos.canjeados ?? 0)} canjeados`}
            icono="chispas"
          />
          <Kpi
            etiqueta="En circulación"
            valor={numero(resumen?.puntos.enCirculacion ?? 0)}
            nota={`Valen ${pesos(resumen?.costo.pendiente ?? 0)}`}
            tono="aviso"
            icono="billetera"
          />
          <Kpi
            etiqueta="Costo ya pagado"
            valor={pesos(resumen?.costo.realizado ?? 0)}
            nota="Descuentos y abonos"
            icono="efectivo"
          />
        </div>

        {resumen && resumen.masInvitan.length > 0 && (
          <Panel titulo="Quienes más invitan" sinRelleno>
            <Tabla
              id="tabla-mas-invitan"
              filas={resumen.masInvitan}
              clave={(f) => f.id}
              alFila={(f) => setFicha(f.id)}
              columnas={[
                { titulo: 'Persona', celda: (f) => <b>{f.nombre}</b> },
                { titulo: 'Teléfono', celda: (f) => f.telefono },
                { titulo: 'Invitados', alinear: 'der', celda: (f) => f.invitados },
                { titulo: 'Ya viajaron', alinear: 'der', celda: (f) => f.otorgados },
                { titulo: 'Puntos ganados', alinear: 'der', celda: (f) => numero(f.puntos) },
              ]}
            />
          </Panel>
        )}

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
          <Campo etiqueta="Buscar" className="w-72">
            <Entrada
              id="buscar-referidos"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, teléfono o código"
            />
          </Campo>
        </div>

        <Panel
          sinRelleno
          titulo={`${filas?.length ?? 0} invitaciones`}
          acciones={
            isFetching ? <span className="text-xs text-suave">Actualizando…</span> : undefined
          }
        >
          <Tabla
            id="tabla-referidos"
            filas={filas ?? []}
            clave={(f) => f.id}
            vacio="Aún no hay invitaciones."
            columnas={[
              { titulo: 'Fecha', celda: (f) => fechaHora(f.creadoEn) },
              {
                titulo: 'Quien invita',
                celda: (f) => (
                  <button
                    type="button"
                    className="text-left font-bold hover:underline"
                    onClick={() => setFicha(f.referidorId)}
                  >
                    {f.referidorNombre}
                    <span className="block text-xs font-normal text-suave">
                      {f.referidorTelefono}
                    </span>
                  </button>
                ),
              },
              {
                titulo: 'Invitado',
                celda: (f) => (
                  <button
                    type="button"
                    className="text-left font-bold hover:underline"
                    onClick={() => setFicha(f.invitadoId)}
                  >
                    {f.invitadoNombre}
                    <span className="block text-xs font-normal text-suave">
                      {f.rol === 'conductor' ? 'Conductor' : 'Pasajero'} · {f.invitadoTelefono}
                    </span>
                  </button>
                ),
              },
              { titulo: 'Código', celda: (f) => <code>{f.codigo}</code> },
              {
                titulo: 'Estado',
                celda: (f) => (
                  <Insignia tono={ESTADOS[f.estado]?.tono ?? 'neutro'}>
                    {ESTADOS[f.estado]?.texto ?? f.estado}
                  </Insignia>
                ),
              },
              {
                titulo: 'Puntos',
                alinear: 'der',
                celda: (f) =>
                  f.estado === 'otorgado'
                    ? `+${numero(f.puntosReferidor)} / +${numero(f.puntosInvitado)}`
                    : '—',
              },
              {
                titulo: 'Nota',
                celda: (f) => (
                  <span className="block max-w-64 truncate text-suave" title={f.motivo ?? ''}>
                    {f.motivo ?? ''}
                  </span>
                ),
              },
              {
                titulo: '',
                alinear: 'der',
                celda: (f) =>
                  puedeGestionar && f.estado !== 'rechazado' ? (
                    <span className="flex justify-end">
                      <AccionMotivo
                        id={`${f.estado === 'pendiente' ? 'rechazar' : 'revertir'}-${f.codigo}`}
                        etiqueta={f.estado === 'pendiente' ? 'Rechazar' : 'Revertir'}
                        variante="peligro"
                        titulo={
                          f.estado === 'pendiente' ? 'Rechazar invitación' : 'Revertir premio'
                        }
                        descripcion={
                          f.estado === 'pendiente'
                            ? 'La invitación deja de sumar puntos. No se puede deshacer.'
                            : 'Se descuentan los puntos entregados (el saldo puede quedar en cero). No se puede deshacer.'
                        }
                        confirmar={f.estado === 'pendiente' ? 'Rechazar' : 'Revertir'}
                        alConfirmar={(motivo) =>
                          ejecutar(
                            () =>
                              api.post(
                                `/v1/op/referidos/${f.id}/${f.estado === 'pendiente' ? 'rechazar' : 'revertir'}`,
                                { motivo },
                              ),
                            {
                              invalidar,
                              exito:
                                f.estado === 'pendiente'
                                  ? 'Invitación rechazada'
                                  : 'Premio revertido',
                            },
                          )
                        }
                      />
                    </span>
                  ) : null,
              },
            ]}
          />
        </Panel>
      </div>

      {ficha && (
        <FichaPuntosModal
          usuarioId={ficha}
          puedeGestionar={puedeGestionar}
          alCerrar={() => setFicha(null)}
        />
      )}
    </>
  );
}

function FichaPuntosModal({
  usuarioId,
  puedeGestionar,
  alCerrar,
}: {
  usuarioId: string;
  puedeGestionar: boolean;
  alCerrar: () => void;
}) {
  const ejecutar = useEjecutar();
  const [puntos, setPuntos] = useState('');
  const { data } = useQuery({
    queryKey: ['referidos-ficha', usuarioId],
    queryFn: () => api.get<FichaPuntos>(`/v1/op/referidos/personas/${usuarioId}`),
  });
  const n = Number(puntos);
  const valido = Number.isInteger(n) && n !== 0 && Math.abs(n) <= 100_000;

  return (
    <Modal
      abierto
      titulo={data ? data.persona.nombre : 'Puntos'}
      alCerrar={alCerrar}
      ancho="max-w-2xl"
    >
      {!data ? (
        <p className="text-suave">Cargando…</p>
      ) : (
        <div className="space-y-4" id="ficha-puntos">
          <div className="grid grid-cols-3 gap-3">
            <Kpi etiqueta="Saldo" valor={`${numero(data.saldo)} pts`} tono="ok" />
            <Kpi etiqueta="Vale" valor={pesos(data.saldo * data.valorPunto)} />
            <Kpi etiqueta="Su código" valor={data.codigo ?? '—'} />
          </div>
          <p className="text-sm text-suave">
            {data.persona.telefono}
            {data.invitadoPor
              ? ` · Lo invitó ${data.invitadoPor.referidor} (${data.invitadoPor.codigo})`
              : ' · Nadie lo invitó'}
            {data.invitados.length > 0 ? ` · Ha invitado a ${data.invitados.length}` : ''}
          </p>

          {puedeGestionar && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-borde p-3">
              <AccionMotivo
                id="ajustar-puntos"
                etiqueta="Ajustar puntos"
                tamano="md"
                titulo="Ajustar puntos"
                descripcion="Suma (positivo) o resta (negativo). Cuesta dinero a TransporteYa: queda en la auditoría."
                confirmar="Aplicar ajuste"
                valido={valido}
                extra={
                  <Campo etiqueta="Puntos (+ suma, − resta)">
                    <Entrada
                      id="puntos-ajuste"
                      type="number"
                      value={puntos}
                      onChange={(e) => setPuntos(e.target.value)}
                      placeholder="500 o -200"
                    />
                  </Campo>
                }
                alConfirmar={(motivo) =>
                  ejecutar(
                    () =>
                      api.post(`/v1/op/referidos/personas/${usuarioId}/ajustar`, {
                        puntos: n,
                        motivo,
                      }),
                    {
                      invalidar: ['referidos-resumen', 'referidos-lista', 'referidos-ficha'],
                      exito: 'Ajuste aplicado',
                    },
                  ).then(() => setPuntos(''))
                }
              />
            </div>
          )}

          <Tabla
            id="movimientos-ficha"
            filas={data.movimientos}
            clave={(m) => m.id}
            vacio="Sin movimientos de puntos."
            columnas={[
              { titulo: 'Fecha', celda: (m) => fechaHora(m.creadoEn) },
              { titulo: 'Tipo', celda: (m) => TIPO_MOVIMIENTO[m.tipo] ?? m.tipo },
              { titulo: 'Viaje', celda: (m) => m.viaje ?? '—' },
              {
                titulo: 'Puntos',
                alinear: 'der',
                celda: (m) => (
                  <b className={m.puntos >= 0 ? 'text-ty' : ''}>
                    {m.puntos >= 0 ? '+' : '−'}
                    {numero(Math.abs(m.puntos))}
                  </b>
                ),
              },
              {
                titulo: 'Motivo',
                celda: (m) => <span className="text-suave">{m.motivo ?? ''}</span>,
              },
            ]}
          />
          <div className="flex justify-end">
            <Boton onClick={alCerrar}>Cerrar</Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
