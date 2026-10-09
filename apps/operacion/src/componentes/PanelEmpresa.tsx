import { api, pesos, telefonoLegible } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState, type ComponentProps } from 'react';
import { consulta, useEjecutar } from '../lib/consultas.ts';
import { CATEGORIA, TIPO_SERVICIO } from '../lib/etiquetas.ts';
import { fechaHora } from '../lib/fechas.ts';
import type {
  AdministradorEmpresa,
  CentroCostoEmpresa,
  EmpleadoEmpresa,
  EmpresaDetalleDatos,
  EstadoCuentaDetalle,
  EstadoCuentaFila,
  PoliticaEmpresa,
  ViajeEmpresa,
} from '../lib/tipos.ts';
import {
  AccionMotivo as AccionMotivoBase,
  Boton,
  Campo,
  Cargando,
  Dato,
  Entrada,
  Insignia,
  Kpi,
  Modal,
  Panel,
  Pestanas,
  Selector,
  Tabla,
  type Tono,
} from './ui.tsx';
import { EstadoViaje } from '../pantallas/Viajes.tsx';

/**
 * Todo lo de una empresa cliente. Lo usan las dos pantallas: «Empresas» (personal de TransporteYa, que además pacta el
 * contrato, suspende y registra pagos) y «Mi empresa» (el administrador de la empresa, que solo ve la suya).
 */
export type ModoEmpresa = 'personal' | 'portal';

/** ¿Quien mira puede cambiar cosas? El personal de soporte solo consulta las empresas. */
const Edicion = createContext(true);
const usePuedeEditar = () => useContext(Edicion);

/** Las acciones que cambian datos desaparecen cuando quien mira solo puede consultar. */
function AccionMotivo(props: ComponentProps<typeof AccionMotivoBase>) {
  return usePuedeEditar() ? <AccionMotivoBase {...props} /> : null;
}
function BotonEdicion(props: ComponentProps<typeof Boton>) {
  return usePuedeEditar() ? <Boton {...props} /> : null;
}

type Pestana = 'resumen' | 'empleados' | 'centros' | 'politicas' | 'viajes' | 'estados' | 'admins';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const TONO_CUENTA: Record<string, Tono> = {
  emitido: 'info',
  vencido: 'error',
  pagado: 'ok',
  anulado: 'neutro',
};
export const TEXTO_CUENTA: Record<string, string> = {
  emitido: 'Por pagar',
  vencido: 'Vencido',
  pagado: 'Pagado',
  anulado: 'Anulado',
};

const aHora = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const deHora = (texto: string) => {
  const [h, m] = texto.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const porcentaje = (pb: number) => `${(pb / 100).toLocaleString('es-CO')} %`;

function resumenPolitica(p: PoliticaEmpresa): string {
  const partes: string[] = [];
  partes.push(p.dias.length === 0 ? 'Todos los días' : p.dias.map((d) => DIAS[d - 1]).join(', '));
  partes.push(
    p.desdeMin === 0 && p.hastaMin === 1440
      ? 'a cualquier hora'
      : `${aHora(p.desdeMin)} a ${aHora(p.hastaMin % 1440)}`,
  );
  if (p.montoMaximo !== null) partes.push(`hasta ${pesos(p.montoMaximo)} por viaje`);
  if (p.categorias.length) partes.push(p.categorias.map((c) => CATEGORIA[c] ?? c).join(' / '));
  if (p.tiposServicio.length)
    partes.push(p.tiposServicio.map((c) => TIPO_SERVICIO[c] ?? c).join(' / '));
  if (p.motivoObligatorio) partes.push('pide motivo');
  return partes.join(' · ');
}

export function PanelEmpresa({
  base,
  modo,
  puedeEditar = true,
}: {
  base: string;
  modo: ModoEmpresa;
  puedeEditar?: boolean;
}) {
  const personal = modo === 'personal';
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const { data: e, refetch } = useQuery({
    queryKey: ['empresa', base, 'detalle'],
    queryFn: () => api.get<EmpresaDetalleDatos>(base),
    refetchInterval: 20_000,
  });
  if (!e) return <Cargando />;
  return (
    <Edicion.Provider value={puedeEditar}>
      <div className="space-y-4 p-6">
        <Pestanas<Pestana>
          activa={pestana}
          alCambiar={(p) => {
            setPestana(p);
            // El consumo y lo que falta por facturar cambian con cada viaje: al abrir una pestaña se pide al día, sin esperar el ciclo de 20 s
            void refetch();
          }}
          items={[
            { id: 'resumen', titulo: 'Resumen' },
            { id: 'empleados', titulo: 'Empleados' },
            { id: 'centros', titulo: 'Centros de costo' },
            { id: 'politicas', titulo: 'Políticas' },
            { id: 'viajes', titulo: 'Viajes' },
            { id: 'estados', titulo: 'Estados de cuenta' },
            ...(personal ? [{ id: 'admins' as const, titulo: 'Administradores' }] : []),
          ]}
        />
        {pestana === 'resumen' && <Resumen e={e} base={base} personal={personal} />}
        {pestana === 'empleados' && <Empleados base={base} />}
        {pestana === 'centros' && <Centros base={base} />}
        {pestana === 'politicas' && <Politicas base={base} />}
        {pestana === 'viajes' && <Viajes base={base} />}
        {pestana === 'estados' && <Estados base={base} personal={personal} />}
        {pestana === 'admins' && personal && <Administradores base={base} />}
      </div>
    </Edicion.Provider>
  );
}

// ───────────────────────────────────────────────────────────── resumen y contrato

function Resumen({
  e,
  base,
  personal,
}: {
  e: EmpresaDetalleDatos;
  base: string;
  personal: boolean;
}) {
  const ejecutar = useEjecutar();
  const usado = e.cupo ? Math.min(100, Math.round((e.total / e.cupo) * 100)) : 0;
  return (
    <div className="space-y-4" id="resumen-empresa">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Estado"
          valor={e.estado === 'activa' ? 'Activa' : 'Suspendida'}
          tono={e.estado === 'activa' ? 'ok' : 'error'}
          nota={e.motivoSuspension ?? undefined}
        />
        <Kpi
          etiqueta="Cupo de crédito"
          valor={e.cupo === null ? 'Sin tope' : pesos(e.cupo)}
          nota={e.disponible !== null ? `Disponible ${pesos(e.disponible)}` : undefined}
        />
        <Kpi
          etiqueta="Por pagar"
          valor={pesos(e.porPagar)}
          tono={e.enMora ? 'error' : 'neutro'}
          nota={e.enMora ? 'Hay un estado de cuenta vencido' : undefined}
        />
        <Kpi
          etiqueta="Sin facturar"
          valor={pesos(e.sinFacturar)}
          nota={`Ciclo ${e.cicloVigente.desde} a ${e.cicloVigente.hasta}`}
        />
      </div>

      {e.cupo !== null && (
        <Panel titulo="Consumo frente al cupo">
          <div
            className="h-3 overflow-hidden rounded-full bg-fondo"
            role="progressbar"
            aria-valuenow={usado}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full ${usado >= 90 ? 'bg-peligro' : usado >= 70 ? 'bg-sol' : 'bg-ty'}`}
              style={{ width: `${usado}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-suave">
            {pesos(e.total)} de {pesos(e.cupo)} ({usado} %): estados de cuenta por pagar más lo
            hecho o reservado sin facturar.
          </p>
        </Panel>
      )}

      <Panel
        titulo="Contrato"
        acciones={
          personal && (
            <>
              <EditarContrato e={e} base={base} />
              {e.estado === 'activa' ? (
                <AccionMotivo
                  id="suspender-empresa"
                  etiqueta="Suspender"
                  variante="peligro"
                  titulo={`Suspender ${e.nombre}`}
                  descripcion="Sus empleados no podrán cargar viajes a la empresa (siguen viajando como personas)."
                  confirmar="Suspender"
                  alConfirmar={(motivo) =>
                    ejecutar(() => api.post(`${base}/suspender`, { motivo }), {
                      invalidar: ['empresa', 'empresas'],
                      exito: 'Empresa suspendida',
                    })
                  }
                />
              ) : (
                <AccionMotivo
                  id="reactivar-empresa"
                  etiqueta="Reactivar"
                  variante="primario"
                  titulo={`Reactivar ${e.nombre}`}
                  confirmar="Reactivar"
                  alConfirmar={(motivo) =>
                    ejecutar(() => api.post(`${base}/reactivar`, { motivo }), {
                      invalidar: ['empresa', 'empresas'],
                      exito: 'Empresa reactivada',
                    })
                  }
                />
              )}
            </>
          )
        }
      >
        <dl className="grid gap-x-8 md:grid-cols-2">
          <div>
            <Dato etiqueta="NIT">{e.nit}</Dato>
            <Dato etiqueta="Contacto">{e.contactoNombre}</Dato>
            <Dato etiqueta="Teléfono">
              {e.contactoTelefono ? telefonoLegible(e.contactoTelefono) : '—'}
            </Dato>
            <Dato etiqueta="Correo">{e.contactoEmail ?? '—'}</Dato>
          </div>
          <div>
            <Dato etiqueta="Descuento pactado">{porcentaje(e.descuentoPb)}</Dato>
            <Dato etiqueta="Tarifa dinámica">{e.aplicaDinamica ? 'Se cobra' : 'No se cobra'}</Dato>
            <Dato etiqueta="Día de corte">{`El ${e.diaCorte} de cada mes`}</Dato>
            <Dato etiqueta="Plazo de pago">{`${e.diasPago} días`}</Dato>
            <Dato etiqueta="Empleados activos">{e.empleadosActivos}</Dato>
          </div>
        </dl>
      </Panel>
    </div>
  );
}

function EditarContrato({ e, base }: { e: EmpresaDetalleDatos; base: string }) {
  const ejecutar = useEjecutar();
  const inicial = {
    nombre: e.nombre,
    contactoNombre: e.contactoNombre,
    contactoTelefono: e.contactoTelefono ?? '',
    contactoEmail: e.contactoEmail ?? '',
    descuento: String(e.descuentoPb / 100),
    cupo: e.cupo === null ? '' : String(e.cupo),
    diaCorte: String(e.diaCorte),
    diasPago: String(e.diasPago),
    aplicaDinamica: e.aplicaDinamica,
  };
  const [f, setF] = useState(inicial);
  const descuento = Number(f.descuento.replace(',', '.'));
  const cupo = f.cupo.trim() === '' ? null : Number(f.cupo);
  const valido =
    f.nombre.trim().length >= 2 &&
    f.contactoNombre.trim().length >= 2 &&
    Number.isFinite(descuento) &&
    descuento >= 0 &&
    descuento <= 50 &&
    (cupo === null || (Number.isInteger(cupo) && cupo > 0)) &&
    Number(f.diaCorte) >= 1 &&
    Number(f.diaCorte) <= 28 &&
    Number(f.diasPago) >= 0 &&
    Number(f.diasPago) <= 90;
  return (
    <AccionMotivo
      id="editar-contrato"
      etiqueta="Editar contrato"
      icono="editar"
      titulo="Contrato de la empresa"
      valido={valido}
      extra={
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Nombre" className="col-span-2">
            <Entrada value={f.nombre} onChange={(ev) => setF({ ...f, nombre: ev.target.value })} />
          </Campo>
          <Campo etiqueta="Contacto">
            <Entrada
              value={f.contactoNombre}
              onChange={(ev) => setF({ ...f, contactoNombre: ev.target.value })}
            />
          </Campo>
          <Campo etiqueta="Teléfono del contacto">
            <Entrada
              value={f.contactoTelefono}
              onChange={(ev) => setF({ ...f, contactoTelefono: ev.target.value })}
            />
          </Campo>
          <Campo etiqueta="Correo del contacto" className="col-span-2">
            <Entrada
              value={f.contactoEmail}
              onChange={(ev) => setF({ ...f, contactoEmail: ev.target.value })}
            />
          </Campo>
          <Campo
            etiqueta="Descuento (%)"
            ayuda="Hasta 50. Lo absorbe TransporteYa: el conductor cobra completo."
          >
            <Entrada
              id="contrato-descuento"
              inputMode="decimal"
              value={f.descuento}
              onChange={(ev) => setF({ ...f, descuento: ev.target.value })}
            />
          </Campo>
          <Campo etiqueta="Cupo de crédito ($)" ayuda="Vacío = sin tope">
            <Entrada
              id="contrato-cupo"
              inputMode="numeric"
              value={f.cupo}
              onChange={(ev) => setF({ ...f, cupo: ev.target.value })}
            />
          </Campo>
          <Campo etiqueta="Día de corte" ayuda="1 a 28">
            <Entrada
              inputMode="numeric"
              value={f.diaCorte}
              onChange={(ev) => setF({ ...f, diaCorte: ev.target.value })}
            />
          </Campo>
          <Campo etiqueta="Plazo de pago (días)">
            <Entrada
              inputMode="numeric"
              value={f.diasPago}
              onChange={(ev) => setF({ ...f, diasPago: ev.target.value })}
            />
          </Campo>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.aplicaDinamica}
              onChange={(ev) => setF({ ...f, aplicaDinamica: ev.target.checked })}
            />
            Cobrar la tarifa dinámica a esta empresa
          </label>
        </div>
      }
      alConfirmar={(motivo) =>
        ejecutar(
          () =>
            api.patch(`${base}/contrato`, {
              nombre: f.nombre.trim(),
              contactoNombre: f.contactoNombre.trim(),
              contactoTelefono: f.contactoTelefono.trim() || null,
              contactoEmail: f.contactoEmail.trim() || null,
              descuentoPb: Math.round(descuento * 100),
              cupo,
              diaCorte: Number(f.diaCorte),
              diasPago: Number(f.diasPago),
              aplicaDinamica: f.aplicaDinamica,
              motivo,
            }),
          { invalidar: ['empresa', 'empresas'], exito: 'Contrato actualizado' },
        )
      }
    />
  );
}

// ───────────────────────────────────────────────────────────── empleados

function Empleados({ base }: { base: string }) {
  const ejecutar = useEjecutar();
  const { data } = useQuery({
    queryKey: ['empresa', base, 'empleados'],
    queryFn: () => api.get<EmpleadoEmpresa[]>(`${base}/empleados`),
  });
  const { data: centros } = useQuery({
    queryKey: ['empresa', base, 'centros'],
    queryFn: () => api.get<CentroCostoEmpresa[]>(`${base}/centros`),
  });
  const { data: politicas } = useQuery({
    queryKey: ['empresa', base, 'politicas'],
    queryFn: () => api.get<PoliticaEmpresa[]>(`${base}/politicas`),
  });
  const vacio = { nombre: '', telefono: '', centroCostoId: '', politicaId: '' };
  const [n, setN] = useState(vacio);
  const [cambio, setCambio] = useState<EmpleadoEmpresa | null>(null);
  const [nuevo, setNuevo] = useState({ centroCostoId: '', politicaId: '' });
  return (
    <>
      <Panel
        sinRelleno
        titulo={`${data?.length ?? 0} empleados e invitaciones`}
        acciones={
          <AccionMotivo
            id="invitar-empleado"
            etiqueta="Invitar empleado"
            icono="mas"
            tamano="md"
            variante="primario"
            sinMotivo
            confirmar="Enviar invitación"
            titulo="Invitar a un empleado"
            descripcion="La persona ve la invitación en su app TransporteYa (con este celular) y la acepta. Desde ahí puede cargar viajes a la empresa."
            valido={n.nombre.trim().length >= 2 && n.telefono.trim().length >= 7}
            extra={
              <div className="space-y-3">
                <Campo etiqueta="Nombre">
                  <Entrada
                    id="invitar-nombre"
                    value={n.nombre}
                    onChange={(e) => setN({ ...n, nombre: e.target.value })}
                  />
                </Campo>
                <Campo etiqueta="Celular">
                  <Entrada
                    id="invitar-telefono"
                    value={n.telefono}
                    onChange={(e) => setN({ ...n, telefono: e.target.value })}
                    placeholder="300 123 4567"
                  />
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Centro de costo">
                    <Selector
                      value={n.centroCostoId}
                      onChange={(e) => setN({ ...n, centroCostoId: e.target.value })}
                    >
                      <option value="">El primero</option>
                      {centros
                        ?.filter((c) => c.activo)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codigo} · {c.nombre}
                          </option>
                        ))}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Política">
                    <Selector
                      value={n.politicaId}
                      onChange={(e) => setN({ ...n, politicaId: e.target.value })}
                    >
                      <option value="">La primera</option>
                      {politicas
                        ?.filter((p) => p.activa)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                    </Selector>
                  </Campo>
                </div>
              </div>
            }
            alConfirmar={() =>
              ejecutar(
                () =>
                  api.post(`${base}/empleados`, {
                    nombre: n.nombre.trim(),
                    telefono: n.telefono.trim(),
                    ...(n.centroCostoId ? { centroCostoId: n.centroCostoId } : {}),
                    ...(n.politicaId ? { politicaId: n.politicaId } : {}),
                  }),
                { invalidar: ['empresa'], exito: 'Invitación enviada' },
              ).then(() => setN(vacio))
            }
          />
        }
      >
        <Tabla
          id="tabla-empleados"
          filas={data ?? []}
          clave={(f) => f.id}
          vacio="Todavía no hay empleados. Invita al primero."
          columnas={[
            { titulo: 'Nombre', celda: (f) => <b>{f.nombre}</b> },
            { titulo: 'Celular', celda: (f) => telefonoLegible(f.telefono) },
            {
              titulo: 'Estado',
              celda: (f) => (
                <Insignia tono={f.estado === 'activo' ? 'ok' : 'aviso'}>
                  {f.estado === 'activo' ? 'Activo' : 'Invitado'}
                </Insignia>
              ),
            },
            { titulo: 'Centro de costo', celda: (f) => f.centroCosto ?? '—' },
            { titulo: 'Política', celda: (f) => f.politica ?? '—' },
            { titulo: 'Viajes', alinear: 'der', celda: (f) => f.viajes },
            {
              titulo: '',
              alinear: 'der',
              celda: (f) => (
                <span className="flex justify-end gap-2">
                  <BotonEdicion
                    tamano="sm"
                    id={`cambiar-${f.telefono}`}
                    onClick={() => {
                      setCambio(f);
                      setNuevo({
                        centroCostoId: f.centroCostoId ?? '',
                        politicaId: f.politicaId ?? '',
                      });
                    }}
                  >
                    Cambiar
                  </BotonEdicion>
                  <AccionMotivo
                    etiqueta="Retirar"
                    variante="peligro"
                    sinMotivo
                    confirmar="Retirar"
                    titulo={`Retirar a ${f.nombre}`}
                    descripcion="Deja de poder cargar viajes a la empresa. Los viajes que ya hizo siguen en sus estados de cuenta."
                    alConfirmar={() =>
                      ejecutar(() => api.delete(`${base}/empleados/${f.id}`), {
                        invalidar: ['empresa'],
                        exito: 'Empleado retirado',
                      })
                    }
                  />
                </span>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        abierto={!!cambio}
        titulo={`Cambiar a ${cambio?.nombre ?? ''}`}
        alCerrar={() => setCambio(null)}
      >
        <div className="space-y-3">
          <Campo etiqueta="Centro de costo">
            <Selector
              value={nuevo.centroCostoId}
              onChange={(e) => setNuevo({ ...nuevo, centroCostoId: e.target.value })}
            >
              {centros
                ?.filter((c) => c.activo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} · {c.nombre}
                  </option>
                ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Política">
            <Selector
              value={nuevo.politicaId}
              onChange={(e) => setNuevo({ ...nuevo, politicaId: e.target.value })}
            >
              {politicas
                ?.filter((p) => p.activa)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </Selector>
          </Campo>
          <div className="flex justify-end gap-2">
            <Boton onClick={() => setCambio(null)}>Cancelar</Boton>
            <Boton
              variante="primario"
              id="guardar-cambio-empleado"
              onClick={() =>
                void ejecutar(
                  () =>
                    api.patch(`${base}/empleados/${cambio?.id}`, {
                      ...(nuevo.centroCostoId ? { centroCostoId: nuevo.centroCostoId } : {}),
                      ...(nuevo.politicaId ? { politicaId: nuevo.politicaId } : {}),
                    }),
                  { invalidar: ['empresa'], exito: 'Empleado actualizado' },
                ).then(() => setCambio(null))
              }
            >
              Guardar
            </Boton>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ───────────────────────────────────────────────────────────── centros de costo

function Centros({ base }: { base: string }) {
  const ejecutar = useEjecutar();
  const { data } = useQuery({
    queryKey: ['empresa', base, 'centros'],
    queryFn: () => api.get<CentroCostoEmpresa[]>(`${base}/centros`),
  });
  const [n, setN] = useState({ codigo: '', nombre: '' });
  return (
    <Panel
      sinRelleno
      titulo="Centros de costo"
      acciones={
        <AccionMotivo
          id="nuevo-centro"
          etiqueta="Nuevo centro"
          icono="mas"
          tamano="md"
          variante="primario"
          sinMotivo
          confirmar="Crear"
          titulo="Nuevo centro de costo"
          descripcion="Cada viaje corporativo se carga a un centro de costo, y el estado de cuenta se detalla por centro."
          valido={/^[A-Za-z0-9_-]{2,20}$/.test(n.codigo.trim()) && n.nombre.trim().length >= 2}
          extra={
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Código">
                <Entrada
                  id="centro-codigo"
                  value={n.codigo}
                  onChange={(e) => setN({ ...n, codigo: e.target.value })}
                  placeholder="VENTAS"
                />
              </Campo>
              <Campo etiqueta="Nombre">
                <Entrada
                  id="centro-nombre"
                  value={n.nombre}
                  onChange={(e) => setN({ ...n, nombre: e.target.value })}
                  placeholder="Área de ventas"
                />
              </Campo>
            </div>
          }
          alConfirmar={() =>
            ejecutar(
              () =>
                api.post(`${base}/centros`, { codigo: n.codigo.trim(), nombre: n.nombre.trim() }),
              {
                invalidar: ['empresa'],
                exito: 'Centro de costo creado',
              },
            ).then(() => setN({ codigo: '', nombre: '' }))
          }
        />
      }
    >
      <Tabla
        id="tabla-centros"
        filas={data ?? []}
        clave={(c) => c.id}
        columnas={[
          { titulo: 'Código', celda: (c) => <b>{c.codigo}</b> },
          { titulo: 'Nombre', celda: (c) => c.nombre },
          { titulo: 'Empleados', alinear: 'der', celda: (c) => c.empleados },
          {
            titulo: 'Estado',
            celda: (c) => (
              <Insignia tono={c.activo ? 'ok' : 'neutro'}>
                {c.activo ? 'Activo' : 'Inactivo'}
              </Insignia>
            ),
          },
          {
            titulo: '',
            alinear: 'der',
            celda: (c) => (
              <BotonEdicion
                tamano="sm"
                onClick={() =>
                  void ejecutar(() => api.patch(`${base}/centros/${c.id}`, { activo: !c.activo }), {
                    invalidar: ['empresa'],
                    exito: c.activo ? 'Centro desactivado' : 'Centro activado',
                  }).catch(() => undefined)
                }
              >
                {c.activo ? 'Desactivar' : 'Activar'}
              </BotonEdicion>
            ),
          },
        ]}
      />
    </Panel>
  );
}

// ───────────────────────────────────────────────────────────── políticas

interface FormPolitica {
  nombre: string;
  dias: number[];
  desde: string;
  hasta: string;
  monto: string;
  categorias: string[];
  servicios: string[];
  motivo: boolean;
}

const POLITICA_VACIA: FormPolitica = {
  nombre: '',
  dias: [],
  desde: '00:00',
  hasta: '23:59',
  monto: '',
  categorias: [],
  servicios: [],
  motivo: false,
};

function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
}

function FormularioPolitica({ base, existente }: { base: string; existente?: PoliticaEmpresa }) {
  const ejecutar = useEjecutar();
  const inicial: FormPolitica = existente
    ? {
        nombre: existente.nombre,
        dias: existente.dias,
        desde: aHora(existente.desdeMin),
        hasta: existente.hastaMin >= 1440 ? '23:59' : aHora(existente.hastaMin),
        monto: existente.montoMaximo === null ? '' : String(existente.montoMaximo),
        categorias: existente.categorias,
        servicios: existente.tiposServicio,
        motivo: existente.motivoObligatorio,
      }
    : POLITICA_VACIA;
  const [f, setF] = useState(inicial);
  const monto = f.monto.trim() === '' ? null : Number(f.monto);
  const desdeMin = deHora(f.desde);
  const hastaMin = f.hasta === '23:59' ? 1440 : Math.max(1, deHora(f.hasta));
  const valido =
    f.nombre.trim().length >= 2 && (monto === null || (Number.isInteger(monto) && monto > 0));
  return (
    <AccionMotivo
      id={existente ? `editar-politica-${existente.nombre}` : 'nueva-politica'}
      etiqueta={existente ? 'Editar' : 'Nueva política'}
      icono={existente ? undefined : 'mas'}
      tamano={existente ? 'sm' : 'md'}
      variante={existente ? 'secundario' : 'primario'}
      sinMotivo
      confirmar="Guardar"
      titulo={existente ? `Política «${existente.nombre}»` : 'Nueva política de uso'}
      descripcion="Si un viaje no cumple la política, no se puede cargar a la empresa y la persona ve el motivo antes de confirmar."
      valido={valido}
      extra={
        <div className="space-y-3">
          <Campo etiqueta="Nombre">
            <Entrada
              id="politica-nombre"
              value={f.nombre}
              onChange={(e) => setF({ ...f, nombre: e.target.value })}
            />
          </Campo>
          <fieldset>
            <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-suave">
              Días permitidos (ninguno = todos)
            </legend>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d, i) => (
                <label key={d} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={f.dias.includes(i + 1)}
                    onChange={() => setF({ ...f, dias: alternar(f.dias, i + 1) })}
                  />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-3 gap-3">
            <Campo etiqueta="Desde">
              <Entrada
                type="time"
                value={f.desde}
                onChange={(e) => setF({ ...f, desde: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Hasta">
              <Entrada
                type="time"
                value={f.hasta}
                onChange={(e) => setF({ ...f, hasta: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Tope por viaje ($)" ayuda="Vacío = sin tope">
              <Entrada
                id="politica-monto"
                inputMode="numeric"
                value={f.monto}
                onChange={(e) => setF({ ...f, monto: e.target.value })}
              />
            </Campo>
          </div>
          <fieldset>
            <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-suave">
              Categorías permitidas (ninguna = todas)
            </legend>
            <div className="flex flex-wrap gap-3">
              {Object.entries(CATEGORIA).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={f.categorias.includes(k)}
                    onChange={() => setF({ ...f, categorias: alternar(f.categorias, k) })}
                  />
                  {v}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-suave">
              Servicios permitidos (ninguno = todos)
            </legend>
            <div className="flex flex-wrap gap-3">
              {Object.entries(TIPO_SERVICIO).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={f.servicios.includes(k)}
                    onChange={() => setF({ ...f, servicios: alternar(f.servicios, k) })}
                  />
                  {v}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input
              id="politica-motivo"
              type="checkbox"
              checked={f.motivo}
              onChange={(e) => setF({ ...f, motivo: e.target.checked })}
            />
            Exigir el motivo del viaje
          </label>
        </div>
      }
      alConfirmar={() => {
        const cuerpo = {
          nombre: f.nombre.trim(),
          dias: f.dias,
          desdeMin,
          hastaMin,
          montoMaximo: monto,
          categorias: f.categorias,
          tiposServicio: f.servicios,
          motivoObligatorio: f.motivo,
        };
        return ejecutar(
          () =>
            existente
              ? api.put(`${base}/politicas/${existente.id}`, cuerpo)
              : api.post(`${base}/politicas`, cuerpo),
          { invalidar: ['empresa'], exito: existente ? 'Política actualizada' : 'Política creada' },
        ).then(() => {
          if (!existente) setF(POLITICA_VACIA);
        });
      }}
    />
  );
}

function Politicas({ base }: { base: string }) {
  const { data } = useQuery({
    queryKey: ['empresa', base, 'politicas'],
    queryFn: () => api.get<PoliticaEmpresa[]>(`${base}/politicas`),
  });
  return (
    <Panel sinRelleno titulo="Políticas de uso" acciones={<FormularioPolitica base={base} />}>
      <Tabla
        id="tabla-politicas"
        filas={data ?? []}
        clave={(p) => p.id}
        columnas={[
          { titulo: 'Nombre', celda: (p) => <b>{p.nombre}</b> },
          {
            titulo: 'Reglas',
            celda: (p) => <span className="text-suave">{resumenPolitica(p)}</span>,
          },
          { titulo: 'Empleados', alinear: 'der', celda: (p) => p.empleados },
          {
            titulo: '',
            alinear: 'der',
            celda: (p) => <FormularioPolitica base={base} existente={p} />,
          },
        ]}
      />
    </Panel>
  );
}

// ───────────────────────────────────────────────────────────── viajes

function Viajes({ base }: { base: string }) {
  const [centro, setCentro] = useState('');
  const { data: centros } = useQuery({
    queryKey: ['empresa', base, 'centros'],
    queryFn: () => api.get<CentroCostoEmpresa[]>(`${base}/centros`),
  });
  const { data } = useQuery({
    queryKey: ['empresa', base, 'viajes', centro],
    queryFn: () =>
      api.get<{ total: number; items: ViajeEmpresa[] }>(
        `${base}/viajes${consulta({ centroCostoId: centro, limite: 100 })}`,
      ),
  });
  return (
    <Panel
      sinRelleno
      titulo={`${data?.total ?? 0} viajes`}
      acciones={
        <Selector
          aria-label="Centro de costo"
          value={centro}
          onChange={(e) => setCentro(e.target.value)}
          className="!w-56"
        >
          <option value="">Todos los centros</option>
          {centros?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} · {c.nombre}
            </option>
          ))}
        </Selector>
      }
    >
      <Tabla
        id="tabla-viajes-empresa"
        filas={data?.items ?? []}
        clave={(v) => v.id}
        vacio="Todavía no hay viajes cargados a la empresa."
        columnas={[
          { titulo: 'Fecha', celda: (v) => fechaHora(v.programadoPara ?? v.solicitadoEn) },
          { titulo: 'Código', celda: (v) => <b>{v.codigo}</b> },
          { titulo: 'Estado', celda: (v) => <EstadoViaje estado={v.estado} /> },
          { titulo: 'Empleado', celda: (v) => v.empleado ?? '—' },
          { titulo: 'Centro', celda: (v) => v.centroCosto ?? '—' },
          { titulo: 'Motivo', celda: (v) => v.motivo ?? '—' },
          {
            titulo: 'Valor',
            alinear: 'der',
            celda: (v) => (v.precioFinal ? pesos(v.precioFinal - v.descuento) : '—'),
          },
          {
            titulo: 'Facturado',
            alinear: 'centro',
            celda: (v) => (v.estadoCuentaId ? 'Sí' : 'No'),
          },
        ]}
      />
    </Panel>
  );
}

// ───────────────────────────────────────────────────────────── estados de cuenta

export function Estados({ base, personal }: { base: string | null; personal: boolean }) {
  const ejecutar = useEjecutar();
  const [abierto, setAbierto] = useState<EstadoCuentaFila | null>(null);
  const ruta = base ? `${base}/estados-cuenta` : '/v1/op/empresas/estados-cuenta';
  const { data } = useQuery({
    queryKey: ['empresa', base ?? 'todas', 'estados'],
    queryFn: () => api.get<EstadoCuentaFila[]>(ruta),
    refetchInterval: 20_000,
  });
  const [ayer] = useState(() =>
    new Date(Date.now() - 5 * 3_600_000 - 86_400_000).toISOString().slice(0, 10),
  );
  const [hasta, setHasta] = useState(ayer);
  return (
    <>
      <Panel
        sinRelleno
        titulo={`${data?.length ?? 0} estados de cuenta`}
        acciones={
          personal && base ? (
            <AccionMotivo
              id="generar-estado"
              etiqueta="Generar estado de cuenta"
              icono="archivo"
              tamano="md"
              titulo="Generar el estado de cuenta"
              descripcion="Junta los viajes cobrables que terminaron hasta esa fecha y todavía no están en ningún estado de cuenta. El trabajo automático lo hace solo el día de corte."
              confirmar="Generar"
              valido={/^\d{4}-\d{2}-\d{2}$/.test(hasta)}
              extra={
                <Campo etiqueta="Incluir hasta el día">
                  <Entrada
                    type="date"
                    id="estado-hasta"
                    value={hasta}
                    max={ayer}
                    onChange={(e) => setHasta(e.target.value)}
                  />
                </Campo>
              }
              alConfirmar={(motivo) =>
                ejecutar(() => api.post(`${base}/estados-cuenta/generar`, { hasta, motivo }), {
                  invalidar: ['empresa', 'empresas'],
                  exito: 'Estado de cuenta generado',
                })
              }
            />
          ) : undefined
        }
      >
        <Tabla
          id="tabla-estados"
          filas={data ?? []}
          clave={(s) => s.id}
          alFila={(s) => setAbierto(s)}
          vacio="Todavía no hay estados de cuenta."
          columnas={[
            { titulo: 'Código', celda: (s) => <b>{s.codigo}</b> },
            ...(base ? [] : [{ titulo: 'Empresa', celda: (s: EstadoCuentaFila) => s.empresa }]),
            { titulo: 'Periodo', celda: (s) => `${s.periodoDesde} a ${s.periodoHasta}` },
            { titulo: 'Viajes', alinear: 'der' as const, celda: (s) => s.viajes },
            { titulo: 'Descuento', alinear: 'der' as const, celda: (s) => pesos(s.descuento) },
            { titulo: 'Total', alinear: 'der' as const, celda: (s) => <b>{pesos(s.total)}</b> },
            { titulo: 'Vence', celda: (s) => s.venceEn },
            {
              titulo: 'Estado',
              celda: (s) => (
                <Insignia tono={TONO_CUENTA[s.estado] ?? 'neutro'}>
                  {TEXTO_CUENTA[s.estado]}
                  {s.estado === 'vencido' ? ` · ${s.diasDeMora} d` : ''}
                </Insignia>
              ),
            },
          ]}
        />
      </Panel>
      {abierto && (
        <DetalleEstado resumen={abierto} personal={personal} alCerrar={() => setAbierto(null)} />
      )}
    </>
  );
}

function DetalleEstado({
  resumen,
  personal,
  alCerrar,
}: {
  resumen: EstadoCuentaFila;
  personal: boolean;
  alCerrar: () => void;
}) {
  const ejecutar = useEjecutar();
  const [referencia, setReferencia] = useState('');
  const base = personal ? `/v1/op/empresas/${resumen.empresaId}` : '/v1/op/mi-empresa';
  const { data } = useQuery({
    queryKey: ['empresa', base, 'estado', resumen.id],
    queryFn: () => api.get<EstadoCuentaDetalle>(`${base}/estados-cuenta/${resumen.id}`),
  });
  const e = data ?? { ...resumen, porEmpleado: [], porCentroCosto: [], viajesDetalle: [] };
  const abierto = e.estado === 'emitido' || e.estado === 'vencido';
  return (
    <Modal abierto titulo={`Estado de cuenta ${e.codigo}`} alCerrar={alCerrar} ancho="max-w-4xl">
      <div className="space-y-4" id="detalle-estado-cuenta">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi etiqueta="Subtotal" valor={pesos(e.subtotal)} />
          <Kpi etiqueta="Descuento" valor={pesos(e.descuento)} />
          <Kpi
            etiqueta="Total a pagar"
            valor={pesos(e.total)}
            tono={e.estado === 'vencido' ? 'error' : 'neutro'}
          />
          <Kpi
            etiqueta="Estado"
            valor={TEXTO_CUENTA[e.estado]}
            tono={TONO_CUENTA[e.estado]}
            nota={e.estado === 'pagado' ? `Ref. ${e.referenciaPago ?? ''}` : `Vence ${e.venceEn}`}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel titulo="Por empleado" sinRelleno>
            <Tabla
              filas={e.porEmpleado}
              clave={(g) => g.nombre}
              columnas={[
                { titulo: 'Empleado', celda: (g) => g.nombre },
                { titulo: 'Viajes', alinear: 'der', celda: (g) => g.viajes },
                { titulo: 'Total', alinear: 'der', celda: (g) => pesos(g.total) },
              ]}
            />
          </Panel>
          <Panel titulo="Por centro de costo" sinRelleno>
            <Tabla
              filas={e.porCentroCosto}
              clave={(g) => g.nombre}
              columnas={[
                { titulo: 'Centro', celda: (g) => g.nombre },
                { titulo: 'Viajes', alinear: 'der', celda: (g) => g.viajes },
                { titulo: 'Total', alinear: 'der', celda: (g) => pesos(g.total) },
              ]}
            />
          </Panel>
        </div>
        <Panel titulo="Viajes incluidos" sinRelleno>
          <Tabla
            filas={e.viajesDetalle}
            clave={(v) => v.id}
            columnas={[
              { titulo: 'Fecha', celda: (v) => fechaHora(v.fecha) },
              { titulo: 'Código', celda: (v) => v.codigo },
              { titulo: 'Empleado', celda: (v) => v.empleado },
              { titulo: 'Centro', celda: (v) => v.centroCosto },
              { titulo: 'Motivo', celda: (v) => v.motivo ?? '—' },
              { titulo: 'Valor', alinear: 'der', celda: (v) => pesos(v.valor) },
              { titulo: 'Descuento', alinear: 'der', celda: (v) => pesos(v.descuento) },
            ]}
          />
        </Panel>
        {personal && abierto && (
          <div className="flex flex-wrap items-end justify-end gap-3 border-t border-borde pt-3">
            <AccionMotivo
              id="anular-estado"
              etiqueta="Anular"
              variante="peligro"
              tamano="md"
              titulo={`Anular ${e.codigo}`}
              descripcion="Los viajes vuelven a quedar sin facturar y entran en el siguiente estado de cuenta."
              confirmar="Anular"
              alConfirmar={(motivo) =>
                ejecutar(
                  () => api.post(`/v1/op/empresas/estados-cuenta/${e.id}/anular`, { motivo }),
                  {
                    invalidar: ['empresa', 'empresas'],
                    exito: 'Estado de cuenta anulado',
                  },
                ).then(alCerrar)
              }
            />
            <AccionMotivo
              id="registrar-pago"
              etiqueta="Registrar pago"
              variante="primario"
              tamano="md"
              titulo={`Registrar el pago de ${e.codigo}`}
              descripcion={`Confirma que la empresa pagó ${pesos(e.total)}. Si estaba suspendida por mora, su perfil corporativo vuelve a funcionar.`}
              confirmar="Registrar pago"
              valido={referencia.trim().length >= 3}
              extra={
                <Campo etiqueta="Referencia del pago">
                  <Entrada
                    id="pago-referencia"
                    value={referencia}
                    onChange={(ev) => setReferencia(ev.target.value)}
                    placeholder="Número de transferencia o consignación"
                  />
                </Campo>
              }
              alConfirmar={(motivo) =>
                ejecutar(
                  () =>
                    api.post(`/v1/op/empresas/estados-cuenta/${e.id}/pago`, {
                      referencia: referencia.trim(),
                      motivo,
                    }),
                  { invalidar: ['empresa', 'empresas'], exito: 'Pago registrado' },
                ).then(alCerrar)
              }
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────── administradores (solo personal)

function Administradores({ base }: { base: string }) {
  const ejecutar = useEjecutar();
  const { data } = useQuery({
    queryKey: ['empresa', base, 'admins'],
    queryFn: () => api.get<AdministradorEmpresa[]>(`${base}/administradores`),
  });
  const [n, setN] = useState({ nombre: '', telefono: '', email: '' });
  const [secreto, setSecreto] = useState<{ para: string; contrasena: string } | null>(null);
  return (
    <>
      <Panel
        sinRelleno
        titulo="Administradores de la empresa"
        acciones={
          <AccionMotivo
            id="nuevo-administrador"
            etiqueta="Nuevo administrador"
            icono="mas"
            tamano="md"
            variante="primario"
            sinMotivo
            confirmar="Crear"
            titulo="Nuevo administrador corporativo"
            descripcion="Entra a la App Operación con un acceso limitado a su empresa. Se genera una contraseña temporal que se muestra una sola vez; configura su segundo factor la primera vez que entra."
            valido={
              n.nombre.trim().length >= 3 && n.email.includes('@') && n.telefono.trim().length >= 7
            }
            extra={
              <div className="space-y-3">
                <Campo etiqueta="Nombre completo">
                  <Entrada
                    id="admin-nombre"
                    value={n.nombre}
                    onChange={(e) => setN({ ...n, nombre: e.target.value })}
                  />
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Correo">
                    <Entrada
                      id="admin-email"
                      type="email"
                      value={n.email}
                      onChange={(e) => setN({ ...n, email: e.target.value })}
                    />
                  </Campo>
                  <Campo etiqueta="Celular">
                    <Entrada
                      id="admin-telefono"
                      value={n.telefono}
                      onChange={(e) => setN({ ...n, telefono: e.target.value })}
                    />
                  </Campo>
                </div>
              </div>
            }
            alConfirmar={async () => {
              const r = await ejecutar(
                () =>
                  api.post<{ contrasenaTemporal: string }>(`${base}/administradores`, {
                    nombre: n.nombre.trim(),
                    telefono: n.telefono.trim(),
                    email: n.email.trim(),
                  }),
                { invalidar: ['empresa'], exito: 'Administrador creado' },
              );
              setSecreto({ para: n.nombre.trim(), contrasena: r.contrasenaTemporal });
              setN({ nombre: '', telefono: '', email: '' });
            }}
          />
        }
      >
        <Tabla
          filas={data ?? []}
          clave={(a) => a.id}
          vacio="Esta empresa todavía no tiene administradores."
          columnas={[
            { titulo: 'Nombre', celda: (a) => <b>{a.nombre}</b> },
            { titulo: 'Correo', celda: (a) => a.email },
            { titulo: 'Celular', celda: (a) => telefonoLegible(a.telefono) },
            {
              titulo: 'Estado',
              celda: (a) => (
                <Insignia tono={a.activo ? 'ok' : 'neutro'}>
                  {a.activo ? 'Activo' : 'Desactivado'}
                </Insignia>
              ),
            },
            {
              titulo: '',
              alinear: 'der',
              celda: (a) => (
                <span className="flex justify-end gap-2">
                  <AccionMotivo
                    etiqueta="Restablecer contraseña"
                    titulo={`Restablecer la contraseña de ${a.nombre}`}
                    descripcion="Se genera una contraseña temporal y se cierran sus sesiones."
                    alConfirmar={async (motivo) => {
                      const r = await ejecutar(
                        () =>
                          api.post<{ contrasenaTemporal: string }>(
                            `${base}/administradores/${a.id}/restablecer`,
                            { motivo },
                          ),
                        {},
                      );
                      setSecreto({ para: a.nombre, contrasena: r.contrasenaTemporal });
                    }}
                  />
                  <AccionMotivo
                    etiqueta={a.activo ? 'Desactivar' : 'Activar'}
                    variante={a.activo ? 'peligro' : 'secundario'}
                    titulo={`${a.activo ? 'Desactivar' : 'Activar'} a ${a.nombre}`}
                    alConfirmar={(motivo) =>
                      ejecutar(
                        () =>
                          api.patch(`${base}/administradores/${a.id}`, {
                            activo: !a.activo,
                            motivo,
                          }),
                        { invalidar: ['empresa'], exito: 'Cuenta actualizada' },
                      )
                    }
                  />
                </span>
              ),
            },
          ]}
        />
      </Panel>
      <Modal abierto={!!secreto} titulo="Contraseña temporal" alCerrar={() => setSecreto(null)}>
        {secreto && (
          <div className="space-y-3">
            <p className="text-sm text-suave">
              Entrégasela a <b>{secreto.para}</b> por un canal seguro. No se vuelve a mostrar.
            </p>
            <code
              id="contrasena-temporal"
              className="block rounded-lg bg-fondo px-4 py-3 text-center text-lg font-extrabold tracking-wider"
            >
              {secreto.contrasena}
            </code>
            <div className="flex justify-end">
              <Boton variante="primario" onClick={() => setSecreto(null)}>
                Listo
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
