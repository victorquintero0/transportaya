import { api, pesos } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Encabezado } from '../componentes/Layout.tsx';
import { Estados, PanelEmpresa } from '../componentes/PanelEmpresa.tsx';
import {
  AccionMotivo,
  Campo,
  Cargando,
  Entrada,
  Insignia,
  Kpi,
  Panel,
  Pestanas,
  Tabla,
} from '../componentes/ui.tsx';
import { useEjecutar, usePermiso } from '../lib/consultas.ts';
import type { EmpresaDetalleDatos, EmpresaResumen } from '../lib/tipos.ts';

type Vista = 'empresas' | 'estados';

/** OPE-10: las empresas clientes, su consumo frente al cupo y sus estados de cuenta. */
export function Empresas() {
  const navegar = useNavigate();
  const ejecutar = useEjecutar();
  const puedeGestionar = usePermiso('corporativo.gestionar');
  const [vista, setVista] = useState<Vista>('empresas');
  const { data } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => api.get<EmpresaResumen[]>('/v1/op/empresas'),
    refetchInterval: 20_000,
  });
  const vacio = { nombre: '', nit: '', contacto: '', descuento: '0', cupo: '', diaCorte: '1' };
  const [n, setN] = useState(vacio);
  const descuento = Number(n.descuento.replace(',', '.'));
  const cupo = n.cupo.trim() === '' ? null : Number(n.cupo);

  const enMora =
    data?.filter(
      (e) =>
        e.vencimientoMasAntiguo && e.vencimientoMasAntiguo < new Date().toISOString().slice(0, 10),
    ).length ?? 0;
  return (
    <>
      <Encabezado
        titulo="Empresas"
        subtitulo="Clientes corporativos: contrato, empleados, políticas, consumo y estados de cuenta"
        acciones={
          puedeGestionar && (
            <AccionMotivo
              id="nueva-empresa"
              etiqueta="Nueva empresa"
              icono="mas"
              tamano="md"
              variante="primario"
              sinMotivo
              confirmar="Crear"
              titulo="Nueva empresa cliente"
              descripcion="Queda con un centro de costo y una política sin restricciones. Después puedes pactar el contrato y crear a su administrador."
              valido={
                n.nombre.trim().length >= 2 &&
                /^[0-9][0-9.-]{5,18}$/.test(n.nit.trim()) &&
                n.contacto.trim().length >= 2 &&
                Number.isFinite(descuento) &&
                descuento >= 0 &&
                descuento <= 50 &&
                (cupo === null || (Number.isInteger(cupo) && cupo > 0))
              }
              extra={
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Razón social" className="col-span-2">
                    <Entrada
                      id="empresa-nombre"
                      value={n.nombre}
                      onChange={(e) => setN({ ...n, nombre: e.target.value })}
                    />
                  </Campo>
                  <Campo etiqueta="NIT">
                    <Entrada
                      id="empresa-nit"
                      value={n.nit}
                      onChange={(e) => setN({ ...n, nit: e.target.value })}
                      placeholder="900123456-7"
                    />
                  </Campo>
                  <Campo etiqueta="Persona de contacto">
                    <Entrada
                      id="empresa-contacto"
                      value={n.contacto}
                      onChange={(e) => setN({ ...n, contacto: e.target.value })}
                    />
                  </Campo>
                  <Campo etiqueta="Descuento (%)">
                    <Entrada
                      id="empresa-descuento"
                      inputMode="decimal"
                      value={n.descuento}
                      onChange={(e) => setN({ ...n, descuento: e.target.value })}
                    />
                  </Campo>
                  <Campo etiqueta="Cupo ($)" ayuda="Vacío = sin tope">
                    <Entrada
                      id="empresa-cupo"
                      inputMode="numeric"
                      value={n.cupo}
                      onChange={(e) => setN({ ...n, cupo: e.target.value })}
                    />
                  </Campo>
                  <Campo etiqueta="Día de corte" ayuda="1 a 28">
                    <Entrada
                      inputMode="numeric"
                      value={n.diaCorte}
                      onChange={(e) => setN({ ...n, diaCorte: e.target.value })}
                    />
                  </Campo>
                </div>
              }
              alConfirmar={() =>
                ejecutar(
                  () =>
                    api.post('/v1/op/empresas', {
                      nombre: n.nombre.trim(),
                      nit: n.nit.trim(),
                      contactoNombre: n.contacto.trim(),
                      descuentoPb: Math.round(descuento * 100),
                      cupo,
                      diaCorte: Number(n.diaCorte) || 1,
                    }),
                  { invalidar: ['empresas'], exito: 'Empresa creada' },
                ).then(() => setN(vacio))
              }
            />
          )
        }
      />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" id="kpis-empresas">
          <Kpi etiqueta="Empresas" valor={data?.length ?? 0} />
          <Kpi
            etiqueta="Empleados activos"
            valor={data?.reduce((s, e) => s + e.empleadosActivos, 0) ?? 0}
          />
          <Kpi etiqueta="Por cobrar" valor={pesos(data?.reduce((s, e) => s + e.total, 0) ?? 0)} />
          <Kpi etiqueta="En mora" valor={enMora} tono={enMora > 0 ? 'error' : 'neutro'} />
        </div>
        <Pestanas<Vista>
          activa={vista}
          alCambiar={setVista}
          items={[
            { id: 'empresas', titulo: 'Empresas' },
            { id: 'estados', titulo: 'Estados de cuenta' },
          ]}
        />
        {vista === 'empresas' && (
          <Panel sinRelleno>
            <Tabla
              id="tabla-empresas"
              filas={data ?? []}
              clave={(e) => e.id}
              alFila={(e) => void navegar(`/empresas/${e.id}`)}
              vacio="Todavía no hay empresas clientes."
              columnas={[
                { titulo: 'Empresa', celda: (e) => <b>{e.nombre}</b> },
                { titulo: 'NIT', celda: (e) => e.nit },
                {
                  titulo: 'Estado',
                  celda: (e) => (
                    <Insignia tono={e.estado === 'activa' ? 'ok' : 'error'}>
                      {e.estado === 'activa' ? 'Activa' : 'Suspendida'}
                    </Insignia>
                  ),
                },
                { titulo: 'Empleados', alinear: 'der', celda: (e) => e.empleadosActivos },
                { titulo: 'Descuento', alinear: 'der', celda: (e) => `${e.descuentoPb / 100} %` },
                {
                  titulo: 'Cupo',
                  alinear: 'der',
                  celda: (e) => (e.cupo === null ? 'Sin tope' : pesos(e.cupo)),
                },
                { titulo: 'Por pagar', alinear: 'der', celda: (e) => pesos(e.porPagar) },
                { titulo: 'Sin facturar', alinear: 'der', celda: (e) => pesos(e.sinFacturar) },
              ]}
            />
          </Panel>
        )}
        {vista === 'estados' && <Estados base={null} personal={puedeGestionar} />}
      </div>
    </>
  );
}

/** Una empresa, con todo lo suyo. */
export function EmpresaDetalle() {
  const { id = '' } = useParams();
  const { data } = useQuery({
    queryKey: ['empresa', `/v1/op/empresas/${id}`, 'detalle'],
    queryFn: () => api.get<EmpresaDetalleDatos>(`/v1/op/empresas/${id}`),
  });
  const puedeGestionar = usePermiso('corporativo.gestionar');
  if (!data)
    return (
      <>
        <Encabezado titulo="Empresa" />
        <Cargando />
      </>
    );
  return (
    <>
      <Encabezado titulo={data.nombre} subtitulo={`NIT ${data.nit}`} />
      <PanelEmpresa base={`/v1/op/empresas/${id}`} modo="personal" puedeEditar={puedeGestionar} />
    </>
  );
}
