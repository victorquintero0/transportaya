import { api } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
} from '../componentes/ui.tsx';
import { consulta, useEjecutar, usePermiso } from '../lib/consultas.ts';
import { CATEGORIA, HABILITACION } from '../lib/etiquetas.ts';
import { fechaHora } from '../lib/fechas.ts';
import type { EntradaCatalogo, Pagina, VehiculoFueraDeCatalogo } from '../lib/tipos.ts';

type Pestana = 'catalogo' | 'fuera';
type Categoria = EntradaCatalogo['categoria'];
interface Lista extends Pagina<EntradaCatalogo> {
  porCategoria: Record<string, number>;
}
const CATEGORIAS: Categoria[] = ['media', 'media_alta', 'alta'];

const anios = (c: EntradaCatalogo) =>
  c.anioHasta === null ? `${c.anioDesde} en adelante` : `${c.anioDesde} – ${c.anioHasta}`;

function FormularioNuevo() {
  const ejecutar = useEjecutar();
  const vacio = { marca: '', linea: '', categoria: 'media' as Categoria, desde: '2015', hasta: '' };
  const [f, setF] = useState(vacio);
  const desde = Number(f.desde);
  const hasta = f.hasta === '' ? null : Number(f.hasta);
  const valido =
    f.marca.trim().length > 0 &&
    f.linea.trim().length > 0 &&
    Number.isInteger(desde) &&
    desde >= 1950 &&
    (hasta === null || (Number.isInteger(hasta) && hasta >= desde));
  return (
    <AccionMotivo
      id="nuevo-vehiculo-catalogo"
      etiqueta="Agregar al catálogo"
      icono="mas"
      tamano="md"
      variante="primario"
      titulo="Agregar un vehículo al catálogo"
      valido={valido}
      descripcion="Los conductores lo podrán elegir al registrar su vehículo. La categoría decide cuánto suma a la carrera."
      extra={
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Marca">
            <Entrada value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} />
          </Campo>
          <Campo etiqueta="Línea">
            <Entrada value={f.linea} onChange={(e) => setF({ ...f, linea: e.target.value })} />
          </Campo>
          <Campo etiqueta="Categoría">
            <Selector
              value={f.categoria}
              onChange={(e) => setF({ ...f, categoria: e.target.value as Categoria })}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA[c]}
                </option>
              ))}
            </Selector>
          </Campo>
          <span />
          <Campo etiqueta="Modelo desde">
            <Entrada
              inputMode="numeric"
              value={f.desde}
              onChange={(e) => setF({ ...f, desde: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Modelo hasta" ayuda="Vacío si todavía se fabrica">
            <Entrada
              inputMode="numeric"
              value={f.hasta}
              onChange={(e) => setF({ ...f, hasta: e.target.value })}
            />
          </Campo>
        </div>
      }
      alConfirmar={(motivo) =>
        ejecutar(
          () =>
            api.post('/v1/op/catalogo-vehiculos', {
              marca: f.marca.trim(),
              linea: f.linea.trim(),
              categoria: f.categoria,
              anioDesde: desde,
              anioHasta: hasta,
              motivo,
            }),
          { invalidar: ['catalogo'], exito: 'Vehículo agregado al catálogo' },
        ).then(() => setF(vacio))
      }
    />
  );
}

function Editar({ c }: { c: EntradaCatalogo }) {
  const ejecutar = useEjecutar();
  const [categoria, setCategoria] = useState<Categoria>(c.categoria);
  const [aplicar, setAplicar] = useState(false);
  const cambia = categoria !== c.categoria;
  return (
    <AccionMotivo
      etiqueta="Categoría"
      titulo={`${c.marca} ${c.linea}`}
      valido={cambia}
      descripcion={
        <>
          Hoy es <b>{CATEGORIA[c.categoria]}</b>. El cambio rige para los vehículos que se registren
          desde ahora.
        </>
      }
      extra={
        <div className="space-y-3">
          <Campo etiqueta="Categoría nueva">
            <Selector value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
              {CATEGORIAS.map((x) => (
                <option key={x} value={x}>
                  {CATEGORIA[x]}
                </option>
              ))}
            </Selector>
          </Campo>
          {c.vehiculos > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--color-ty)]"
                checked={aplicar}
                onChange={(e) => setAplicar(e.target.checked)}
              />
              <span>
                Aplicarlo también a los <b>{c.vehiculos}</b> vehículos ya registrados con esta
                entrada. Cambia lo que suman a la carrera desde su próximo viaje.
              </span>
            </label>
          )}
        </div>
      }
      alConfirmar={(motivo) =>
        ejecutar(
          () =>
            api.patch(`/v1/op/catalogo-vehiculos/${c.id}`, {
              categoria,
              aplicarAVehiculos: aplicar,
              motivo,
            }),
          { invalidar: ['catalogo'], exito: 'Categoría actualizada' },
        )
      }
    />
  );
}

function Catalogo() {
  const puedeEditar = usePermiso('catalogo.editar');
  const ejecutar = useEjecutar();
  const [f, setF] = useState({ q: '', categoria: '' });
  const [aplicado, setAplicado] = useState(f);
  const { data } = useQuery({
    queryKey: ['catalogo', aplicado],
    queryFn: () =>
      api.get<Lista>(
        `/v1/op/catalogo-vehiculos${consulta({ q: aplicado.q, categoria: aplicado.categoria, limite: 100 })}`,
      ),
    placeholderData: (p) => p,
  });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {CATEGORIAS.map((c) => (
          <Kpi
            key={c}
            etiqueta={CATEGORIA[c] ?? c}
            valor={data?.porCategoria[c] ?? 0}
            nota="entradas activas"
          />
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setAplicado(f);
          }}
        >
          <Campo etiqueta="Buscar">
            <Entrada
              value={f.q}
              placeholder="Marca o línea"
              onChange={(e) => setF({ ...f, q: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Categoría">
            <Selector
              value={f.categoria}
              onChange={(e) => setF({ ...f, categoria: e.target.value })}
            >
              <option value="">Todas</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA[c]}
                </option>
              ))}
            </Selector>
          </Campo>
          <Boton type="submit" variante="primario">
            Buscar
          </Boton>
        </form>
        {puedeEditar && (
          <div className="ml-auto">
            <FormularioNuevo />
          </div>
        )}
      </div>
      <Panel sinRelleno titulo={`${data?.total ?? 0} vehículos`}>
        <Tabla<EntradaCatalogo>
          id="tabla-catalogo"
          filas={data?.items ?? []}
          clave={(c) => c.id}
          vacio="No hay vehículos con ese filtro."
          columnas={[
            {
              titulo: 'Vehículo',
              celda: (c) => (
                <span className="block">
                  <b>
                    {c.marca} {c.linea}
                  </b>
                  <span className="block text-xs text-suave">{c.carroceria ?? ''}</span>
                </span>
              ),
            },
            { titulo: 'Modelos', celda: anios },
            {
              titulo: 'Categoría',
              celda: (c) => <Insignia tono="info">{CATEGORIA[c.categoria]}</Insignia>,
            },
            { titulo: 'Registrados', alinear: 'der', celda: (c) => c.vehiculos },
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
              celda: (c) =>
                puedeEditar && (
                  <div className="flex justify-end gap-1.5">
                    <Editar c={c} />
                    <AccionMotivo
                      etiqueta={c.activo ? 'Desactivar' : 'Activar'}
                      titulo={`${c.activo ? 'Desactivar' : 'Activar'} ${c.marca} ${c.linea}`}
                      descripcion={
                        c.activo
                          ? 'Deja de ofrecerse al registrar vehículos. Los ya registrados no cambian.'
                          : 'Vuelve a ofrecerse al registrar vehículos.'
                      }
                      alConfirmar={(motivo) =>
                        ejecutar(
                          () =>
                            api.patch(`/v1/op/catalogo-vehiculos/${c.id}`, {
                              activo: !c.activo,
                              motivo,
                            }),
                          {
                            invalidar: ['catalogo'],
                            exito: 'Catálogo actualizado',
                          },
                        )
                      }
                    />
                  </div>
                ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function Resolver({ v }: { v: VehiculoFueraDeCatalogo }) {
  const ejecutar = useEjecutar();
  const [accion, setAccion] = useState<'agregar' | 'asignar'>('agregar');
  const [categoria, setCategoria] = useState<Categoria>('media');
  const [catalogoId, setCatalogoId] = useState('');
  const { data } = useQuery({
    queryKey: ['catalogo', 'para-asignar'],
    queryFn: () =>
      api.get<Lista>(`/v1/op/catalogo-vehiculos${consulta({ activo: true, limite: 200 })}`),
    staleTime: 60_000,
  });
  const validos = (data?.items ?? []).filter(
    (c) => v.modeloAnio >= c.anioDesde && (c.anioHasta === null || v.modeloAnio <= c.anioHasta),
  );
  return (
    <AccionMotivo
      etiqueta="Resolver"
      variante="primario"
      titulo={`${v.marca} ${v.linea} · ${v.placa}`}
      valido={accion === 'agregar' || catalogoId !== ''}
      descripcion={
        <>
          El conductor lo escribió a mano:{' '}
          <b>
            {v.marca} {v.linea} {v.modeloAnio}
          </b>
          . Mientras no se resuelva, su categoría queda en{' '}
          <b>{CATEGORIA[v.categoria as Categoria] ?? v.categoria}</b>.
        </>
      }
      extra={
        <div className="space-y-3">
          <fieldset className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="accion"
                className="accent-[var(--color-ty)]"
                checked={accion === 'agregar'}
                onChange={() => setAccion('agregar')}
              />
              Es un modelo que falta: agregarlo al catálogo
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="accion"
                className="accent-[var(--color-ty)]"
                checked={accion === 'asignar'}
                onChange={() => setAccion('asignar')}
              />
              Ya está en el catálogo con otro nombre: asignarlo
            </label>
          </fieldset>
          {accion === 'agregar' ? (
            <Campo etiqueta="Categoría">
              <Selector
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as Categoria)}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA[c]}
                  </option>
                ))}
              </Selector>
            </Campo>
          ) : (
            <Campo
              etiqueta="Vehículo del catálogo"
              ayuda={`Solo los que cubren el modelo ${v.modeloAnio}`}
            >
              <Selector value={catalogoId} onChange={(e) => setCatalogoId(e.target.value)}>
                <option value="">Elige uno…</option>
                {validos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.marca} {c.linea} · {CATEGORIA[c.categoria]}
                  </option>
                ))}
              </Selector>
            </Campo>
          )}
        </div>
      }
      alConfirmar={(motivo) =>
        ejecutar(
          () =>
            api.post(
              `/v1/op/vehiculos/${v.id}/revisar`,
              accion === 'agregar'
                ? { accion, categoria, motivo }
                : { accion, catalogoVehiculoId: catalogoId, motivo },
            ),
          { invalidar: ['catalogo', 'fuera-de-catalogo'], exito: 'Vehículo resuelto' },
        )
      }
    />
  );
}

function FueraDeCatalogo() {
  const puedeEditar = usePermiso('catalogo.editar');
  const { data } = useQuery({
    queryKey: ['fuera-de-catalogo'],
    queryFn: () =>
      api.get<Pagina<VehiculoFueraDeCatalogo>>('/v1/op/vehiculos-fuera-de-catalogo?limite=100'),
    refetchInterval: 30_000,
  });
  return (
    <Panel sinRelleno titulo={`${data?.total ?? 0} por revisar`}>
      <Tabla<VehiculoFueraDeCatalogo>
        id="tabla-fuera-de-catalogo"
        filas={data?.items ?? []}
        clave={(v) => v.id}
        vacio="No hay vehículos por revisar."
        columnas={[
          {
            titulo: 'Vehículo',
            celda: (v) => (
              <span className="block">
                <b>
                  {v.marca} {v.linea} {v.modeloAnio}
                </b>
                <span className="block text-xs text-suave">
                  {v.placa} · {v.color}
                </span>
              </span>
            ),
          },
          {
            titulo: 'Conductor',
            celda: (v) =>
              v.conductor ? (
                <span className="block">
                  <Link
                    to={`/conductores/${v.conductor.id}`}
                    className="font-bold text-ty hover:underline"
                  >
                    {v.conductor.nombre}
                  </Link>
                  {v.conductor.habilitacion && (
                    <span className="block text-xs text-suave">
                      {HABILITACION[v.conductor.habilitacion]?.texto ?? v.conductor.habilitacion}
                    </span>
                  )}
                </span>
              ) : (
                '—'
              ),
          },
          { titulo: 'Registrado', celda: (v) => fechaHora(v.creadoEn) },
          {
            titulo: 'Categoría hoy',
            celda: (v) => CATEGORIA[v.categoria as Categoria] ?? v.categoria,
          },
          { titulo: '', alinear: 'der', celda: (v) => puedeEditar && <Resolver v={v} /> },
        ]}
      />
    </Panel>
  );
}

/** Catálogo de vehículos y la revisión de los que los conductores escriben a mano (D-21). */
export function CatalogoVehiculos() {
  const [pestana, setPestana] = useState<Pestana>('catalogo');
  const { data: fuera } = useQuery({
    queryKey: ['fuera-de-catalogo'],
    queryFn: () =>
      api.get<Pagina<VehiculoFueraDeCatalogo>>('/v1/op/vehiculos-fuera-de-catalogo?limite=100'),
    refetchInterval: 30_000,
  });
  return (
    <>
      <Encabezado
        titulo="Catálogo de vehículos"
        subtitulo="Qué vehículos pueden trabajar y en qué categoría: Media, Media Alta o Alta"
      />
      <div className="space-y-4 p-6">
        <Pestanas<Pestana>
          activa={pestana}
          alCambiar={setPestana}
          items={[
            { id: 'catalogo', titulo: 'Catálogo' },
            { id: 'fuera', titulo: 'Fuera del catálogo', aviso: fuera?.total ?? 0 },
          ]}
        />
        {pestana === 'catalogo' ? <Catalogo /> : <FueraDeCatalogo />}
      </div>
    </>
  );
}
