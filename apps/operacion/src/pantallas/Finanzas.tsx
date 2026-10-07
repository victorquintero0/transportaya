import { api, pesos, telefonoLegible } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import {
  AccionMotivo,
  Boton,
  Campo,
  Entrada,
  Insignia,
  Kpi,
  Panel,
  Pestanas,
  Selector,
  Tabla,
  Vacio,
} from '../componentes/ui.tsx';
import { consulta, useEjecutar, useEjecutarConAviso, usePermiso } from '../lib/consultas.ts';
import { TIPO_MOVIMIENTO } from '../lib/etiquetas.ts';
import { fechaCorta, fechaHora, hoyBogota } from '../lib/fechas.ts';
import type {
  AjusteFila,
  CierreFila,
  Cobranza,
  Libro,
  Pagina,
  PagoConductor,
  ResumenFinanzas,
} from '../lib/tipos.ts';

type Pestana = 'cierre' | 'cobranza' | 'pagos' | 'ajustes' | 'libro';

const ESTADO_CIERRE: Record<string, string> = {
  abierto: 'Acumulando',
  por_pagar: 'Por pagar',
  por_cobrar: 'Por cobrar',
  pagado: 'Pagado',
  cobrado: 'Cobrado',
  sin_movimiento: 'Sin movimiento',
};

function Saldo({ valor }: { valor: number }) {
  return (
    <span
      className={`numeros font-bold ${valor < 0 ? 'text-peligro' : valor > 0 ? 'text-ty' : ''}`}
    >
      {pesos(valor)}
    </span>
  );
}

function Cierre() {
  const ejecutar = useEjecutar();
  const puedeOperar = usePermiso('finanzas.operar');
  const [dia, setDia] = useState('');
  const { data } = useQuery({
    queryKey: ['finanzas', 'cierres', dia],
    queryFn: () =>
      api.get<{
        dia: string | null;
        total: number;
        totales: { aFavor: number; aCargo: number };
        items: CierreFila[];
      }>(`/v1/op/finanzas/cierres${consulta({ dia, limite: 200 })}`),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Día del cierre">
          <Entrada
            type="date"
            value={dia || data?.dia || ''}
            onChange={(e) => setDia(e.target.value)}
            max={hoyBogota()}
          />
        </Campo>
        {puedeOperar && (
          <AccionMotivo
            id="ejecutar-cierre"
            etiqueta="Ejecutar cierre de hoy"
            tamano="md"
            sinMotivo
            titulo="Ejecutar el cierre diario"
            descripcion={
              <>
                Calcula el saldo neto de cada conductor con movimientos de hoy (
                {fechaCorta(hoyBogota())}). Normalmente corre solo a las 00:00; úsalo si ese proceso
                falló. No se repite para quien ya tiene su cierre.
              </>
            }
            confirmar="Ejecutar cierre"
            alConfirmar={() =>
              ejecutar(() => api.post('/v1/op/finanzas/cierres/ejecutar', { dia: hoyBogota() }), {
                invalidar: ['finanzas'],
                exito: 'Cierre ejecutado',
              })
            }
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Kpi
          etiqueta="A favor de conductores"
          valor={pesos(data?.totales.aFavor ?? 0)}
          tono="ok"
          nota="Lo que TransporteYa les paga"
        />
        <Kpi
          etiqueta="A cargo de conductores"
          valor={pesos(data?.totales.aCargo ?? 0)}
          tono="error"
          nota="Comisiones por cobrar"
        />
      </div>
      <Panel
        sinRelleno
        titulo={
          data?.dia ? `Cierre del ${fechaCorta(data.dia)} · ${data.total} conductores` : 'Cierres'
        }
      >
        <Tabla
          id="tabla-cierres"
          filas={data?.items ?? []}
          clave={(c) => c.id}
          vacio="Todavía no hay cierres. Se generan a las 00:00."
          columnas={[
            {
              titulo: 'Conductor',
              celda: (c) => (
                <Link
                  className="font-bold text-ty hover:underline"
                  to={`/conductores/${c.conductorId}`}
                >
                  {c.conductor}
                </Link>
              ),
            },
            {
              titulo: 'Saldo inicial',
              alinear: 'der',
              celda: (c) => <Saldo valor={c.saldoInicial} />,
            },
            { titulo: 'Neto del día', alinear: 'der', celda: (c) => <Saldo valor={c.netoDia} /> },
            { titulo: 'Saldo final', alinear: 'der', celda: (c) => <Saldo valor={c.saldoFinal} /> },
            {
              titulo: 'Estado',
              celda: (c) => (
                <Insignia
                  tono={
                    c.estado === 'por_cobrar'
                      ? 'error'
                      : c.estado === 'por_pagar'
                        ? 'aviso'
                        : c.estado === 'pagado' || c.estado === 'cobrado'
                          ? 'ok'
                          : 'neutro'
                  }
                >
                  {ESTADO_CIERRE[c.estado] ?? c.estado}
                </Insignia>
              ),
            },
            {
              titulo: 'Habilitación',
              celda: (c) =>
                c.bloqueado ? <Insignia tono="error">Bloqueado por deuda</Insignia> : '—',
            },
            {
              titulo: '',
              alinear: 'der',
              celda: (c) => (
                <Link
                  className="text-xs font-bold text-suave hover:text-ty"
                  to={`/finanzas?pestana=libro&conductor=${c.conductorId}`}
                >
                  Libro
                </Link>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function CobranzaVista() {
  const ejecutar = useEjecutar();
  const ejecutarAviso = useEjecutarConAviso();
  const puedeOperar = usePermiso('finanzas.operar');
  const { data } = useQuery({
    queryKey: ['finanzas', 'cobranza'],
    queryFn: () => api.get<Cobranza>('/v1/op/finanzas/cobranza'),
    refetchInterval: 20_000,
  });
  const refrescar = { invalidar: ['finanzas', 'conductores'] };
  return (
    <div className="space-y-4">
      <Panel sinRelleno titulo="Pagos de comisión por conciliar">
        <Tabla
          id="tabla-pagos-comision"
          filas={data?.pagosPorConciliar ?? []}
          clave={(p) => p.id}
          vacio="No hay pagos esperando conciliación."
          columnas={[
            {
              titulo: 'Conductor',
              celda: (p) => (
                <Link
                  className="font-bold text-ty hover:underline"
                  to={`/conductores/${p.conductorId}`}
                >
                  {p.conductor}
                </Link>
              ),
            },
            { titulo: 'Referencia', celda: (p) => <code className="text-xs">{p.referencia}</code> },
            {
              titulo: 'Canal',
              celda: (p) => (p.canal === 'llave_bre_b' ? 'Llave Bre-B' : p.canal),
            },
            {
              titulo: 'Monto',
              alinear: 'der',
              celda: (p) => <b className="numeros">{pesos(p.monto)}</b>,
            },
            { titulo: 'Saldo hoy', alinear: 'der', celda: (p) => <Saldo valor={p.saldo} /> },
            { titulo: 'Reportado', celda: (p) => fechaHora(p.creadoEn) },
            {
              titulo: '',
              alinear: 'der',
              celda: (p) =>
                puedeOperar && (
                  <div className="flex justify-end gap-1.5">
                    <Boton
                      tamano="sm"
                      variante="primario"
                      icono="ok"
                      onClick={() =>
                        void ejecutarAviso(
                          () => api.post(`/v1/op/finanzas/pagos-comision/${p.id}/conciliar`),
                          { ...refrescar, exito: 'Pago conciliado' },
                        )
                      }
                    >
                      Conciliar
                    </Boton>
                    <AccionMotivo
                      etiqueta="Rechazar"
                      titulo="Rechazar el pago"
                      descripcion="Úsalo si la transferencia no aparece en el extracto del banco."
                      confirmar="Rechazar"
                      alConfirmar={(motivo) =>
                        ejecutar(
                          () =>
                            api.post(`/v1/op/finanzas/pagos-comision/${p.id}/rechazar`, { motivo }),
                          { ...refrescar, exito: 'Pago rechazado' },
                        )
                      }
                    />
                  </div>
                ),
            },
          ]}
        />
      </Panel>
      <Panel sinRelleno titulo="Conductores bloqueados por deuda de comisión">
        <Tabla
          id="tabla-bloqueados"
          filas={data?.bloqueados ?? []}
          clave={(b) => b.id}
          vacio="Ningún conductor está bloqueado por deuda."
          columnas={[
            {
              titulo: 'Conductor',
              celda: (b) => (
                <Link className="font-bold text-ty hover:underline" to={`/conductores/${b.id}`}>
                  {b.nombre}
                </Link>
              ),
            },
            { titulo: 'Teléfono', celda: (b) => telefonoLegible(b.telefono) },
            {
              titulo: 'Debe',
              alinear: 'der',
              celda: (b) => <b className="numeros text-peligro">{pesos(b.deuda)}</b>,
            },
            { titulo: 'Desde', celda: (b) => (b.desde ? fechaCorta(b.desde) : '—') },
            {
              titulo: '',
              alinear: 'der',
              celda: (b) =>
                puedeOperar && (
                  <AccionMotivo
                    etiqueta="Habilitar a mano"
                    titulo={`Habilitar a ${b.nombre}`}
                    descripcion="Úsalo cuando ya recibiste el pago por otro canal. El saldo sigue como está; queda en la auditoría."
                    confirmar="Habilitar"
                    alConfirmar={(motivo) =>
                      ejecutar(
                        () => api.post(`/v1/op/finanzas/conductores/${b.id}/habilitar`, { motivo }),
                        { ...refrescar, exito: 'Conductor habilitado' },
                      )
                    }
                  />
                ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function PagosVista() {
  const ejecutar = useEjecutar();
  const ejecutarAviso = useEjecutarConAviso();
  const puedeOperar = usePermiso('finanzas.operar');
  const { data } = useQuery({
    queryKey: ['finanzas', 'pagos'],
    queryFn: () => api.get<PagoConductor[]>('/v1/op/finanzas/pagos-conductor'),
    refetchInterval: 20_000,
  });
  const refrescar = { invalidar: ['finanzas'] };
  return (
    <Panel sinRelleno titulo="Pagos a conductores (saldo a favor del cierre)">
      <Tabla
        id="tabla-pagos-conductor"
        filas={data ?? []}
        clave={(p) => p.id}
        vacio="No hay pagos pendientes. Se generan con el cierre diario cuando el saldo supera el mínimo."
        columnas={[
          {
            titulo: 'Conductor',
            celda: (p) => (
              <Link
                className="font-bold text-ty hover:underline"
                to={`/conductores/${p.conductorId}`}
              >
                {p.conductor}
              </Link>
            ),
          },
          { titulo: 'Cierre', celda: (p) => fechaCorta(p.dia) },
          {
            titulo: 'Cuenta',
            celda: (p) =>
              `${p.tipoCuenta === 'llave_bre_b' ? 'Llave Bre-B' : (p.banco ?? 'Cuenta')} ${p.cuenta}`,
          },
          {
            titulo: 'Monto',
            alinear: 'der',
            celda: (p) => <b className="numeros">{pesos(p.monto)}</b>,
          },
          {
            titulo: 'Estado',
            celda: (p) => (
              <Insignia tono={p.estado === 'enviada' ? 'info' : 'aviso'}>
                {p.estado === 'enviada' ? 'Enviado, falta confirmar' : 'Por enviar'}
              </Insignia>
            ),
          },
          {
            titulo: '',
            alinear: 'der',
            celda: (p) =>
              puedeOperar && (
                <div className="flex justify-end gap-1.5">
                  {p.estado === 'pendiente' && (
                    <Boton
                      tamano="sm"
                      onClick={() =>
                        void ejecutarAviso(
                          () => api.post(`/v1/op/finanzas/pagos-conductor/${p.id}/enviar`),
                          { ...refrescar, exito: 'Marcado como enviado' },
                        )
                      }
                    >
                      Marcar enviado
                    </Boton>
                  )}
                  <Boton
                    tamano="sm"
                    variante="primario"
                    icono="ok"
                    onClick={() =>
                      void ejecutarAviso(
                        () => api.post(`/v1/op/finanzas/pagos-conductor/${p.id}/confirmar`),
                        { ...refrescar, exito: 'Pago confirmado' },
                      )
                    }
                  >
                    Confirmar
                  </Boton>
                  <AccionMotivo
                    etiqueta="Rechazar"
                    titulo="Rechazar el pago"
                    confirmar="Rechazar"
                    alConfirmar={(motivo) =>
                      ejecutar(
                        () =>
                          api.post(`/v1/op/finanzas/pagos-conductor/${p.id}/rechazar`, { motivo }),
                        { ...refrescar, exito: 'Pago rechazado' },
                      )
                    }
                  />
                </div>
              ),
          },
        ]}
      />
    </Panel>
  );
}

function AjustesVista() {
  const ejecutar = useEjecutar();
  const puedeProponer = usePermiso('finanzas.proponer_ajuste');
  const puedeAprobar = usePermiso('finanzas.aprobar_ajuste');
  const { data: yo } = useQuery({
    queryKey: ['yo'],
    queryFn: () => api.get<{ id: string }>('/v1/op/yo'),
  });
  const [estado, setEstado] = useState('pendiente');
  const [nuevo, setNuevo] = useState({ conductorId: '', monto: '' });
  const { data } = useQuery({
    queryKey: ['finanzas', 'ajustes', estado],
    queryFn: () => api.get<AjusteFila[]>(`/v1/op/finanzas/ajustes${consulta({ estado })}`),
  });
  const { data: conductores } = useQuery({
    queryKey: ['conductores', 'lista-ajustes'],
    enabled: puedeProponer,
    queryFn: () =>
      api.get<Pagina<{ id: string; nombre: string; placa: string | null }>>(
        '/v1/op/conductores?estado=habilitado&limite=200',
      ),
  });
  const refrescar = { invalidar: ['finanzas'] };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Campo etiqueta="Estado" className="w-48">
          <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="pendiente">Pendientes</option>
            <option value="aprobado">Aprobados</option>
            <option value="rechazado">Rechazados</option>
            <option value="">Todos</option>
          </Selector>
        </Campo>
        {puedeProponer && (
          <AccionMotivo
            id="proponer-ajuste"
            etiqueta="Proponer ajuste"
            icono="mas"
            tamano="md"
            variante="primario"
            titulo="Proponer un ajuste de saldo"
            descripcion="Un ajuste corrige el libro del conductor. Otra persona de supervisión debe aprobarlo: quien lo propone no puede aprobarlo."
            minimo={10}
            valido={
              !!nuevo.conductorId &&
              Number(nuevo.monto) !== 0 &&
              Number.isInteger(Number(nuevo.monto))
            }
            extra={
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Conductor">
                  <Selector
                    id="ajuste-conductor"
                    value={nuevo.conductorId}
                    onChange={(e) => setNuevo({ ...nuevo, conductorId: e.target.value })}
                  >
                    <option value="">Elige…</option>
                    {(conductores?.items ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} · {c.placa}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo
                  etiqueta="Monto (COP)"
                  ayuda="Positivo: a favor del conductor. Negativo: a su cargo."
                >
                  <Entrada
                    id="ajuste-monto"
                    type="number"
                    value={nuevo.monto}
                    onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })}
                  />
                </Campo>
              </div>
            }
            confirmar="Proponer"
            alConfirmar={(motivo) =>
              ejecutar(
                () =>
                  api.post('/v1/op/finanzas/ajustes', {
                    conductorId: nuevo.conductorId,
                    monto: Number(nuevo.monto),
                    motivo,
                  }),
                { ...refrescar, exito: 'Ajuste propuesto' },
              )
            }
          />
        )}
      </div>
      <Panel sinRelleno>
        <Tabla
          id="tabla-ajustes"
          filas={data ?? []}
          clave={(a) => a.id}
          vacio="No hay ajustes con ese estado."
          columnas={[
            {
              titulo: 'Conductor',
              celda: (a) => (
                <Link
                  className="font-bold text-ty hover:underline"
                  to={`/conductores/${a.conductorId}`}
                >
                  {a.conductor}
                </Link>
              ),
            },
            { titulo: 'Monto', alinear: 'der', celda: (a) => <Saldo valor={a.monto} /> },
            {
              titulo: 'Motivo',
              celda: (a) => <span className="block max-w-sm text-xs">{a.motivo}</span>,
            },
            { titulo: 'Propuso', celda: (a) => a.propuestoPor },
            {
              titulo: 'Estado',
              celda: (a) => (
                <span>
                  <Insignia
                    tono={
                      a.estado === 'aprobado' ? 'ok' : a.estado === 'rechazado' ? 'error' : 'aviso'
                    }
                  >
                    {a.estado}
                  </Insignia>
                  {a.resueltoPor && (
                    <span className="mt-1 block text-xs text-suave">
                      {a.resueltoPor}
                      {a.motivoResolucion ? `: ${a.motivoResolucion}` : ''}
                    </span>
                  )}
                </span>
              ),
            },
            { titulo: 'Fecha', celda: (a) => fechaHora(a.creadoEn) },
            {
              titulo: '',
              alinear: 'der',
              celda: (a) =>
                puedeAprobar &&
                a.estado === 'pendiente' && (
                  <div className="flex justify-end gap-1.5">
                    {a.propuestoPorId === yo?.id ? (
                      <span className="text-xs text-suave">
                        Lo propusiste tú: debe aprobarlo otra persona
                      </span>
                    ) : (
                      <>
                        <AccionMotivo
                          etiqueta="Aprobar"
                          variante="primario"
                          icono="ok"
                          sinMotivo
                          titulo="Aprobar el ajuste"
                          descripcion={
                            <>
                              Se escribe en el libro de <b>{a.conductor}</b>:{' '}
                              <b>{pesos(a.monto)}</b>. No se puede deshacer.
                            </>
                          }
                          confirmar="Aprobar"
                          alConfirmar={() =>
                            ejecutar(() => api.post(`/v1/op/finanzas/ajustes/${a.id}/aprobar`), {
                              ...refrescar,
                              exito: 'Ajuste aprobado',
                            })
                          }
                        />
                        <AccionMotivo
                          etiqueta="Rechazar"
                          titulo="Rechazar el ajuste"
                          confirmar="Rechazar"
                          alConfirmar={(motivo) =>
                            ejecutar(
                              () =>
                                api.post(`/v1/op/finanzas/ajustes/${a.id}/rechazar`, { motivo }),
                              { ...refrescar, exito: 'Ajuste rechazado' },
                            )
                          }
                        />
                      </>
                    )}
                  </div>
                ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function LibroVista({ conductorId }: { conductorId: string }) {
  const { data } = useQuery({
    queryKey: ['finanzas', 'libro', conductorId],
    enabled: !!conductorId,
    queryFn: () =>
      api.get<Libro>(`/v1/op/finanzas/conductores/${conductorId}/movimientos?limite=100`),
  });
  const [, setParams] = useSearchParams();
  const { data: conductores } = useQuery({
    queryKey: ['conductores', 'lista-libro'],
    queryFn: () =>
      api.get<Pagina<{ id: string; nombre: string; placa: string | null }>>(
        '/v1/op/conductores?estado=habilitado&limite=200',
      ),
  });
  return (
    <div className="space-y-4">
      <Campo etiqueta="Conductor" className="w-96">
        <Selector
          id="libro-conductor"
          value={conductorId}
          onChange={(e) => setParams({ pestana: 'libro', conductor: e.target.value })}
        >
          <option value="">Elige un conductor…</option>
          {(conductores?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {c.placa}
            </option>
          ))}
        </Selector>
      </Campo>
      {!conductorId ? (
        <Vacio texto="Elige un conductor para ver su libro de movimientos." icono="billetera" />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Kpi
              etiqueta={data.saldo >= 0 ? 'TransporteYa le debe' : 'Debe su comisión'}
              valor={pesos(Math.abs(data.saldo))}
              tono={data.saldo < 0 ? 'error' : 'ok'}
            />
            <Kpi
              etiqueta="Habilitación"
              valor={data.bloqueadoPorDeuda ? 'Bloqueado por deuda' : 'Al día'}
              tono={data.bloqueadoPorDeuda ? 'error' : 'ok'}
            />
          </div>
          <Panel sinRelleno titulo={`Libro de movimientos de ${data.conductor}`}>
            <Tabla
              id="tabla-libro"
              filas={data.movimientos}
              clave={(m) => m.id}
              vacio="Sin movimientos."
              columnas={[
                { titulo: 'Fecha', celda: (m) => fechaHora(m.creadoEn) },
                { titulo: 'Movimiento', celda: (m) => TIPO_MOVIMIENTO[m.tipo] ?? m.tipo },
                { titulo: 'Viaje', celda: (m) => m.viaje ?? '—' },
                {
                  titulo: 'Detalle',
                  celda: (m) => <span className="text-xs text-suave">{m.motivo ?? ''}</span>,
                },
                { titulo: 'Monto', alinear: 'der', celda: (m) => <Saldo valor={m.monto} /> },
                { titulo: 'Saldo', alinear: 'der', celda: (m) => <Saldo valor={m.saldoDespues} /> },
              ]}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

export function Finanzas() {
  const [params, setParams] = useSearchParams();
  const pestana = (params.get('pestana') as Pestana | null) ?? 'cierre';
  const conductorId = params.get('conductor') ?? '';
  const { data: resumen } = useQuery({
    queryKey: ['finanzas', 'resumen'],
    queryFn: () => api.get<ResumenFinanzas>('/v1/op/finanzas/resumen'),
    refetchInterval: 20_000,
  });
  return (
    <>
      <Encabezado
        titulo="Finanzas"
        subtitulo="Cierre diario, cobranza de comisiones, pagos a conductores y ajustes"
      />
      <div className="space-y-4 p-6">
        <Pestanas
          activa={pestana}
          alCambiar={(p) =>
            setParams({ pestana: p, ...(conductorId ? { conductor: conductorId } : {}) })
          }
          items={[
            { id: 'cierre', titulo: 'Cierre diario' },
            {
              id: 'cobranza',
              titulo: 'Cobranza',
              aviso:
                (resumen?.comisionesPorConciliar ?? 0) +
                  (resumen?.conductoresBloqueadosPorDeuda ?? 0) || undefined,
            },
            {
              id: 'pagos',
              titulo: 'Pagos a conductores',
              aviso: resumen?.pagosAConductoresPendientes || undefined,
            },
            { id: 'ajustes', titulo: 'Ajustes', aviso: resumen?.ajustesPendientes || undefined },
            { id: 'libro', titulo: 'Libro de movimientos' },
          ]}
        />
        {pestana === 'cierre' && <Cierre />}
        {pestana === 'cobranza' && <CobranzaVista />}
        {pestana === 'pagos' && <PagosVista />}
        {pestana === 'ajustes' && <AjustesVista />}
        {pestana === 'libro' && <LibroVista conductorId={conductorId} />}
      </div>
    </>
  );
}
