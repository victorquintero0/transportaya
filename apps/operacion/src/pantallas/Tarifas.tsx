import { api, mensajeDe as mensajeError, pesos } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Encabezado } from '../componentes/Layout.tsx';
import {
  AccionMotivo,
  Boton,
  Campo,
  Dato,
  Entrada,
  Insignia,
  Modal,
  Panel,
  Pestanas,
  Selector,
  Tabla,
} from '../componentes/ui.tsx';
import { consulta, useEjecutar, usePermiso } from '../lib/consultas.ts';
import { CATEGORIA, TIPO_ZONA } from '../lib/etiquetas.ts';
import { fechaCorta, fechaHora, soloHora } from '../lib/fechas.ts';
import type {
  DinamicaFila,
  Pagina,
  RutaFija,
  SimulacionTarifa,
  VersionTarifa,
  Zona,
} from '../lib/tipos.ts';

type Pestana = 'versiones' | 'simulador' | 'festivos' | 'rutas' | 'zonas' | 'dinamica';

const NOMBRES_RECARGO: Record<string, string> = {
  nocturno: 'Nocturno',
  dominical_festivo: 'Dominical y festivo',
  puerta_a_puerta: 'Servicio por aplicación',
  aeropuerto: 'Aeropuerto',
  moteles: 'Moteles',
  zona_termales: 'Zona de termales',
  mascotas: 'Mascotas',
  categoria: 'Categoría',
};

function Versiones() {
  const puedeEditar = usePermiso('tarifas.editar');
  const ejecutar = useEjecutar();
  const { data } = useQuery({
    queryKey: ['tarifas'],
    queryFn: () => api.get<VersionTarifa[]>('/v1/op/tarifas'),
  });
  const vigente = data?.find((t) => t.estado === 'vigente') ?? data?.[0];
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [recargos, setRecargos] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('');
  const [desde, setDesde] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);

  const abrir = () => {
    if (!vigente) return;
    setF({
      base: String(vigente.base),
      valorKm: String(vigente.valorKm),
      valorMinuto: String(vigente.valorMinuto),
      minima: String(vigente.minima),
      cancelacion: String(vigente.cancelacion),
      esperaMinuto: String(vigente.esperaMinuto),
      esperaMinutosGratis: String(vigente.esperaMinutosGratis),
      fuente: '',
    });
    setRecargos(Object.fromEntries(vigente.recargos.map((r) => [r.id, String(r.valor)])));
    setMotivo('');
    setDesde('');
    setError(null);
    setAbierto(true);
  };

  const guardar = async () => {
    if (!vigente) return;
    setEnCurso(true);
    setError(null);
    try {
      await ejecutar(
        () =>
          api.post('/v1/op/tarifas', {
            base: Number(f['base']),
            valorKm: Number(f['valorKm']),
            valorMinuto: Number(f['valorMinuto']),
            minima: Number(f['minima']),
            cancelacion: Number(f['cancelacion']),
            esperaMinuto: Number(f['esperaMinuto']),
            esperaMinutosGratis: Number(f['esperaMinutosGratis']),
            ...(f['fuente'] ? { fuente: f['fuente'] } : {}),
            ...(desde ? { vigenteDesde: new Date(desde).toISOString() } : {}),
            recargos: vigente.recargos.map((r) => ({
              codigo: r.codigo,
              nombre: r.nombre,
              tipo: r.tipo,
              valor: Number(recargos[r.id]),
              categoria: r.categoria ?? undefined,
              activo: r.activo,
            })),
            motivo,
          }),
        { invalidar: ['tarifas'], exito: 'Nueva versión de tarifa creada' },
      );
      setAbierto(false);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnCurso(false);
    }
  };

  const campo = (clave: string, etiqueta: string, ayuda?: string) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda} key={clave}>
      <Entrada
        type="number"
        min={0}
        value={f[clave] ?? ''}
        onChange={(e) => setF({ ...f, [clave]: e.target.value })}
      />
    </Campo>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-suave">
          Cada cambio crea una versión nueva con fecha de vigencia (RN-014). Las versiones
          anteriores quedan como historial.
        </p>
        {puedeEditar && vigente && (
          <Boton id="nueva-version" variante="primario" icono="mas" onClick={abrir}>
            Nueva versión
          </Boton>
        )}
      </div>
      {(data ?? []).map((t) => (
        <Panel
          key={t.id}
          id={`version-${t.version}`}
          titulo={`Versión ${t.version}`}
          acciones={
            <Insignia
              tono={t.estado === 'vigente' ? 'ok' : t.estado === 'programada' ? 'info' : 'neutro'}
            >
              {t.estado === 'vigente'
                ? 'Vigente'
                : t.estado === 'programada'
                  ? 'Programada'
                  : 'Historial'}
            </Insignia>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <dl>
              <Dato etiqueta="Banderazo">{pesos(t.base)}</Dato>
              <Dato etiqueta="Por kilómetro">{pesos(t.valorKm)}</Dato>
              <Dato etiqueta="Por minuto detenido">{pesos(t.valorMinuto)}</Dato>
              <Dato etiqueta="Tarifa mínima">{pesos(t.minima)}</Dato>
              <Dato etiqueta="Cancelación">{pesos(t.cancelacion)}</Dato>
              <Dato etiqueta="Espera">
                {pesos(t.esperaMinuto)} por minuto, tras {t.esperaMinutosGratis} min gratis
              </Dato>
              <Dato etiqueta="Vigencia">
                {fechaHora(t.vigenteDesde)} →{' '}
                {t.vigenteHasta ? fechaHora(t.vigenteHasta) : 'sin fin'}
              </Dato>
              {t.fuente && <Dato etiqueta="Fuente">{t.fuente}</Dato>}
            </dl>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-suave">Recargos</p>
              <dl>
                {t.recargos.map((r) => (
                  <Dato
                    key={r.id}
                    etiqueta={`${NOMBRES_RECARGO[r.codigo] ?? r.nombre}${r.categoria ? ` (${CATEGORIA[r.categoria]})` : ''}`}
                  >
                    {r.tipo === 'fijo' ? pesos(r.valor) : `${r.valor / 100} %`}
                  </Dato>
                ))}
              </dl>
            </div>
          </div>
        </Panel>
      ))}

      <Modal
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Nueva versión de tarifa"
        ancho="max-w-3xl"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {campo('base', 'Banderazo')}
            {campo('valorKm', 'Por kilómetro')}
            {campo('valorMinuto', 'Por minuto detenido')}
            {campo('minima', 'Tarifa mínima')}
            {campo('cancelacion', 'Cancelación')}
            {campo('esperaMinuto', 'Espera por minuto')}
            {campo('esperaMinutosGratis', 'Minutos de espera gratis')}
            <Campo etiqueta="Fuente (decreto)">
              <Entrada
                value={f['fuente'] ?? ''}
                onChange={(e) => setF({ ...f, fuente: e.target.value })}
                maxLength={200}
              />
            </Campo>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-suave">
              Recargos (fijos en pesos; porcentuales en puntos básicos)
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {(vigente?.recargos ?? []).map((r) => (
                <Campo
                  key={r.id}
                  etiqueta={`${NOMBRES_RECARGO[r.codigo] ?? r.nombre}${r.categoria ? ` · ${CATEGORIA[r.categoria]}` : ''}`}
                >
                  <Entrada
                    type="number"
                    min={0}
                    value={recargos[r.id] ?? ''}
                    onChange={(e) => setRecargos({ ...recargos, [r.id]: e.target.value })}
                  />
                </Campo>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo
              etiqueta="Empieza a regir"
              ayuda="Déjalo vacío para que rija desde ahora. Puedes programarla a futuro."
            >
              <Entrada
                type="datetime-local"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </Campo>
            <Campo
              etiqueta="Motivo del cambio"
              ayuda="Por ejemplo, el decreto o la resolución que lo fija."
            >
              <Entrada
                id="motivo-tarifa"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
              />
            </Campo>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-peligro/15 px-3 py-2 text-sm font-semibold text-peligro"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              variante="primario"
              cargando={enCurso}
              deshabilitado={motivo.trim().length < 5}
            >
              Crear versión
            </Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Simulador() {
  const { data: versiones } = useQuery({
    queryKey: ['tarifas'],
    queryFn: () => api.get<VersionTarifa[]>('/v1/op/tarifas'),
  });
  const [f, setF] = useState({
    tarifaId: '',
    categoria: 'media',
    distanciaKm: '5',
    tiempoDetenidoMin: '3',
    instante: '',
    aeropuerto: false,
    multiplicador: '1',
    extras: [] as string[],
  });
  const [resultado, setResultado] = useState<SimulacionTarifa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const calcular = async () => {
    setError(null);
    try {
      setResultado(
        await api.post<SimulacionTarifa>('/v1/op/tarifas/simular', {
          ...(f.tarifaId ? { tarifaId: f.tarifaId } : {}),
          categoria: f.categoria,
          distanciaKm: Number(f.distanciaKm),
          tiempoDetenidoMin: Number(f.tiempoDetenidoMin),
          ...(f.instante ? { instante: new Date(f.instante).toISOString() } : {}),
          aeropuerto: f.aeropuerto,
          multiplicador: Number(f.multiplicador) || 1,
          extras: f.extras,
        }),
      );
    } catch (e) {
      setError(mensajeError(e));
    }
  };
  const alternar = (c: string) =>
    setF({
      ...f,
      extras: f.extras.includes(c) ? f.extras.filter((x) => x !== c) : [...f.extras, c],
    });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel titulo="Trayecto">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void calcular();
          }}
        >
          <Campo etiqueta="Versión de tarifa" className="col-span-2">
            <Selector value={f.tarifaId} onChange={(e) => setF({ ...f, tarifaId: e.target.value })}>
              <option value="">La vigente en la fecha elegida</option>
              {(versiones ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  Versión {t.version} ({t.estado})
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Distancia (km)">
            <Entrada
              id="sim-km"
              type="number"
              min={0}
              step={0.1}
              value={f.distanciaKm}
              onChange={(e) => setF({ ...f, distanciaKm: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Minutos detenido">
            <Entrada
              id="sim-min"
              type="number"
              min={0}
              value={f.tiempoDetenidoMin}
              onChange={(e) => setF({ ...f, tiempoDetenidoMin: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Categoría">
            <Selector
              value={f.categoria}
              onChange={(e) => setF({ ...f, categoria: e.target.value })}
            >
              {Object.entries(CATEGORIA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Dinámica (×)">
            <Entrada
              type="number"
              min={1}
              max={3}
              step={0.05}
              value={f.multiplicador}
              onChange={(e) => setF({ ...f, multiplicador: e.target.value })}
            />
          </Campo>
          <Campo
            etiqueta="Fecha y hora"
            ayuda="Vacío: ahora. Define el recargo nocturno o festivo."
            className="col-span-2"
          >
            <Entrada
              type="datetime-local"
              value={f.instante}
              onChange={(e) => setF({ ...f, instante: e.target.value })}
            />
          </Campo>
          <div className="col-span-2 flex flex-wrap gap-4 text-sm font-bold">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.aeropuerto}
                onChange={(e) => setF({ ...f, aeropuerto: e.target.checked })}
                className="size-4 accent-[var(--color-ty)]"
              />
              Aeropuerto
            </label>
            {['moteles', 'zona_termales', 'mascotas'].map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={f.extras.includes(c)}
                  onChange={() => alternar(c)}
                  className="size-4 accent-[var(--color-ty)]"
                />
                {NOMBRES_RECARGO[c]}
              </label>
            ))}
          </div>
          <Boton id="simular" type="submit" variante="primario" className="col-span-2">
            Calcular precio
          </Boton>
          {error && (
            <p role="alert" className="col-span-2 text-sm font-semibold text-peligro">
              {error}
            </p>
          )}
        </form>
      </Panel>
      <Panel titulo="Resultado" id="resultado-simulacion">
        {resultado ? (
          <>
            <p className="text-sm text-suave">
              Versión {resultado.tarifa.version}
              {resultado.festivo ? ' · día festivo' : ''}
            </p>
            <p className="numeros my-2 text-4xl font-extrabold text-ty" id="total-simulado">
              {pesos(resultado.desglose.totalRedondeado)}
            </p>
            <dl>
              <Dato etiqueta="Banderazo">{pesos(resultado.desglose.base)}</Dato>
              <Dato etiqueta="Distancia">{pesos(resultado.desglose.distancia)}</Dato>
              <Dato etiqueta="Tiempo detenido">{pesos(resultado.desglose.tiempo)}</Dato>
              {resultado.desglose.multiplicadorDinamico > 1 && (
                <Dato etiqueta={`Con dinámica ×${resultado.desglose.multiplicadorDinamico}`}>
                  {pesos(resultado.desglose.tarifaViaje)}
                </Dato>
              )}
              <Dato
                etiqueta={`Recargos (${resultado.recargosAplicados.map((r) => NOMBRES_RECARGO[r] ?? r).join(', ') || 'ninguno'})`}
              >
                {pesos(resultado.desglose.recargos)}
              </Dato>
              <Dato etiqueta="Total aproximado a la centena">
                {pesos(resultado.desglose.totalRedondeado)}
              </Dato>
            </dl>
          </>
        ) : (
          <p className="text-sm text-suave">
            Llena el trayecto y calcula. Usa la misma lógica que la cotización de la app.
          </p>
        )}
      </Panel>
    </div>
  );
}

function Festivos() {
  const puedeEditar = usePermiso('tarifas.editar');
  const ejecutar = useEjecutar();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [nuevo, setNuevo] = useState({ fecha: '', nombre: '' });
  const { data } = useQuery({
    queryKey: ['festivos', anio],
    queryFn: () => api.get<{ fecha: string; nombre: string }[]>(`/v1/op/festivos?anio=${anio}`),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Año">
          <Entrada
            type="number"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="w-28"
          />
        </Campo>
        {puedeEditar && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ejecutar(() => api.post('/v1/op/festivos', nuevo), {
                invalidar: ['festivos'],
                exito: 'Festivo agregado',
              })
                .then(() => setNuevo({ fecha: '', nombre: '' }))
                .catch(() => undefined);
            }}
          >
            <Campo etiqueta="Fecha">
              <Entrada
                type="date"
                required
                value={nuevo.fecha}
                onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Nombre">
              <Entrada
                required
                minLength={3}
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              />
            </Campo>
            <Boton type="submit" variante="primario" icono="mas">
              Agregar
            </Boton>
          </form>
        )}
      </div>
      <Panel sinRelleno titulo={`Festivos ${anio}`}>
        <Tabla
          filas={data ?? []}
          clave={(d) => d.fecha}
          vacio="No hay festivos cargados para este año."
          columnas={[
            { titulo: 'Fecha', celda: (d) => fechaCorta(d.fecha) },
            { titulo: 'Festivo', celda: (d) => d.nombre },
            {
              titulo: '',
              alinear: 'der',
              celda: (d) =>
                puedeEditar && (
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    icono="basura"
                    titulo="Quitar"
                    onClick={() =>
                      void ejecutar(() => api.delete(`/v1/op/festivos/${d.fecha}`), {
                        invalidar: ['festivos'],
                        exito: 'Festivo quitado',
                      })
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

function Rutas() {
  const puedeEditar = usePermiso('tarifas.editar');
  const ejecutar = useEjecutar();
  const [q, setQ] = useState('');
  const [nuevaTarifa, setNuevaTarifa] = useState('');
  const { data } = useQuery({
    queryKey: ['rutas', q],
    queryFn: () => api.get<Pagina<RutaFija>>(`/v1/op/rutas-fijas${consulta({ q, limite: 60 })}`),
    placeholderData: (p) => p,
  });
  return (
    <div className="space-y-4">
      <Campo etiqueta="Buscar destino" className="w-72">
        <Entrada
          placeholder="Pereira, Medellín…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </Campo>
      <Panel sinRelleno titulo={`${data?.total ?? 0} rutas con tarifa fija desde Manizales`}>
        <Tabla
          id="tabla-rutas"
          filas={data?.items ?? []}
          clave={(r) => r.id}
          columnas={[
            { titulo: 'Destino', celda: (r) => <b>{r.destino}</b> },
            {
              titulo: 'Modalidad',
              celda: (r) => (r.modalidad === 'solo_ida' ? 'Solo ida' : 'Ida y vuelta'),
            },
            {
              titulo: 'Tarifa',
              alinear: 'der',
              celda: (r) => <b className="numeros">{pesos(r.tarifa)}</b>,
            },
            { titulo: 'Vigente desde', celda: (r) => fechaCorta(r.vigenteDesde) },
            {
              titulo: 'Estado',
              celda: (r) => (
                <Insignia tono={r.activa ? 'ok' : 'neutro'}>
                  {r.activa ? 'Activa' : 'Inactiva'}
                </Insignia>
              ),
            },
            {
              titulo: '',
              alinear: 'der',
              celda: (r) =>
                puedeEditar && (
                  <div className="flex justify-end gap-1.5">
                    <AccionMotivo
                      etiqueta="Cambiar valor"
                      titulo={`Tarifa a ${r.destino}`}
                      valido={Number(nuevaTarifa) >= 1000}
                      extra={
                        <Campo etiqueta="Tarifa nueva (COP)">
                          <Entrada
                            type="number"
                            min={1000}
                            value={nuevaTarifa}
                            onChange={(e) => setNuevaTarifa(e.target.value)}
                          />
                        </Campo>
                      }
                      alConfirmar={(motivo) =>
                        ejecutar(
                          () =>
                            api.patch(`/v1/op/rutas-fijas/${r.id}`, {
                              tarifa: Number(nuevaTarifa),
                              motivo,
                            }),
                          { invalidar: ['rutas'], exito: 'Tarifa actualizada' },
                        )
                      }
                    />
                    <AccionMotivo
                      etiqueta={r.activa ? 'Desactivar' : 'Activar'}
                      titulo={`${r.activa ? 'Desactivar' : 'Activar'} la ruta a ${r.destino}`}
                      alConfirmar={(motivo) =>
                        ejecutar(
                          () =>
                            api.patch(`/v1/op/rutas-fijas/${r.id}`, { activa: !r.activa, motivo }),
                          { invalidar: ['rutas'], exito: 'Ruta actualizada' },
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

function Zonas() {
  const puedeEditar = usePermiso('tarifas.editar');
  const ejecutar = useEjecutar();
  const [f, setF] = useState({ nombre: '', tipo: 'punto_encuentro', puntos: '' });
  const { data } = useQuery({
    queryKey: ['zonas'],
    queryFn: () => api.get<Zona[]>('/v1/op/zonas'),
  });
  // Una línea por vértice: "lat, lng". El mapa de dibujo llega con el mapa propio (ADR-0002).
  const anillo = f.puntos
    .split('\n')
    .map((l) => l.split(',').map((x) => Number(x.trim())))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .map(([lat, lng]) => [lng, lat] as [number, number]);
  return (
    <div className="space-y-4">
      {puedeEditar && (
        <AccionMotivo
          id="nueva-zona"
          etiqueta="Nueva zona"
          icono="mas"
          tamano="md"
          variante="primario"
          titulo="Nueva zona"
          valido={f.nombre.trim().length >= 3 && anillo.length >= 3}
          descripcion="Escribe los vértices del polígono, uno por línea, como «latitud, longitud»."
          extra={
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Nombre">
                  <Entrada
                    value={f.nombre}
                    onChange={(e) => setF({ ...f, nombre: e.target.value })}
                  />
                </Campo>
                <Campo etiqueta="Tipo">
                  <Selector value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                    {Object.entries(TIPO_ZONA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </div>
              <Campo etiqueta={`Vértices (${anillo.length})`}>
                <textarea
                  rows={5}
                  className="w-full rounded-lg border border-borde bg-fondo p-3 font-mono text-xs"
                  placeholder={'5.0689, -75.5174\n5.0700, -75.5100\n5.0650, -75.5100'}
                  value={f.puntos}
                  onChange={(e) => setF({ ...f, puntos: e.target.value })}
                />
              </Campo>
            </div>
          }
          alConfirmar={(motivo) =>
            ejecutar(
              () => api.post('/v1/op/zonas', { nombre: f.nombre, tipo: f.tipo, anillo, motivo }),
              { invalidar: ['zonas'], exito: 'Zona creada' },
            )
          }
        />
      )}
      <Panel sinRelleno titulo={`${data?.length ?? 0} zonas`}>
        <Tabla
          id="tabla-zonas"
          filas={data ?? []}
          clave={(z) => z.id}
          vacio="Todavía no hay zonas."
          columnas={[
            { titulo: 'Zona', celda: (z) => <b>{z.nombre}</b> },
            { titulo: 'Tipo', celda: (z) => TIPO_ZONA[z.tipo] ?? z.tipo },
            {
              titulo: 'Vértices',
              alinear: 'der',
              celda: (z) => Math.max(0, (z.poligono.coordinates[0]?.length ?? 1) - 1),
            },
            {
              titulo: 'Estado',
              celda: (z) => (
                <Insignia tono={z.activa ? 'ok' : 'neutro'}>
                  {z.activa ? 'Activa' : 'Inactiva'}
                </Insignia>
              ),
            },
            {
              titulo: '',
              alinear: 'der',
              celda: (z) =>
                puedeEditar && (
                  <AccionMotivo
                    etiqueta={z.activa ? 'Desactivar' : 'Activar'}
                    titulo={`${z.activa ? 'Desactivar' : 'Activar'} ${z.nombre}`}
                    alConfirmar={(motivo) =>
                      ejecutar(
                        () => api.patch(`/v1/op/zonas/${z.id}`, { activa: !z.activa, motivo }),
                        { invalidar: ['zonas'], exito: 'Zona actualizada' },
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

function Dinamica() {
  const puedeActivar = usePermiso('dinamica.activar');
  const ejecutar = useEjecutar();
  const [f, setF] = useState({ zonaId: '', multiplicador: '1.3', horas: '2' });
  const { data } = useQuery({
    queryKey: ['dinamica'],
    queryFn: () => api.get<DinamicaFila[]>('/v1/op/dinamica'),
    refetchInterval: 30_000,
  });
  const { data: zonas } = useQuery({
    queryKey: ['zonas'],
    queryFn: () => api.get<Zona[]>('/v1/op/zonas'),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-suave">
        En el MVP la dinámica se activa a mano por zona y horario (RN-025). El pasajero siempre ve
        que hay dinámica y el valor antes de confirmar.
      </p>
      {puedeActivar && (
        <AccionMotivo
          id="activar-dinamica"
          etiqueta="Activar dinámica"
          icono="rayo"
          tamano="md"
          variante="primario"
          titulo="Activar dinámica en una zona"
          descripcion="El multiplicador aplica a los viajes que se piden desde esa zona mientras dure."
          valido={
            !!f.zonaId &&
            Number(f.multiplicador) >= 1.05 &&
            Number(f.multiplicador) <= 3 &&
            Number(f.horas) > 0 &&
            Number(f.horas) <= 12
          }
          extra={
            <div className="grid grid-cols-3 gap-3">
              <Campo etiqueta="Zona">
                <Selector
                  id="dinamica-zona"
                  value={f.zonaId}
                  onChange={(e) => setF({ ...f, zonaId: e.target.value })}
                >
                  <option value="">Elige…</option>
                  {(zonas ?? [])
                    .filter((z) => z.activa)
                    .map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nombre}
                      </option>
                    ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Multiplicador (×)" ayuda="Entre 1,05 y 3">
                <Entrada
                  id="dinamica-mult"
                  type="number"
                  step={0.05}
                  min={1.05}
                  max={3}
                  value={f.multiplicador}
                  onChange={(e) => setF({ ...f, multiplicador: e.target.value })}
                />
              </Campo>
              <Campo etiqueta="Duración (horas)" ayuda="Máximo 12">
                <Entrada
                  id="dinamica-horas"
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={f.horas}
                  onChange={(e) => setF({ ...f, horas: e.target.value })}
                />
              </Campo>
            </div>
          }
          confirmar="Activar"
          alConfirmar={(motivo) =>
            ejecutar(
              () =>
                api.post('/v1/op/dinamica', {
                  zonaId: f.zonaId,
                  multiplicador: Number(f.multiplicador),
                  hasta: new Date(Date.now() + Number(f.horas) * 3_600_000).toISOString(),
                  motivo,
                }),
              { invalidar: ['dinamica'], exito: 'Dinámica activada' },
            )
          }
        />
      )}
      <Panel sinRelleno titulo="Dinámica manual">
        <Tabla
          id="tabla-dinamica"
          filas={data ?? []}
          clave={(d) => d.id}
          vacio="No hay dinámica activa ni programada."
          columnas={[
            { titulo: 'Zona', celda: (d) => <b>{d.zona}</b> },
            {
              titulo: 'Multiplicador',
              alinear: 'der',
              celda: (d) => <b className="numeros">×{d.multiplicador}</b>,
            },
            { titulo: 'Horario', celda: (d) => `${fechaHora(d.desde)} → ${soloHora(d.hasta)}` },
            {
              titulo: 'Estado',
              celda: (d) => (
                <Insignia
                  tono={
                    d.estado === 'activa' ? 'aviso' : d.estado === 'programada' ? 'info' : 'neutro'
                  }
                >
                  {d.estado}
                </Insignia>
              ),
            },
            {
              titulo: 'Motivo',
              celda: (d) => (
                <span className="text-xs">
                  {d.motivo} · {d.creadoPor}
                </span>
              ),
            },
            {
              titulo: '',
              alinear: 'der',
              celda: (d) =>
                puedeActivar &&
                d.estado !== 'terminada' && (
                  <AccionMotivo
                    etiqueta="Desactivar"
                    titulo="Desactivar la dinámica"
                    confirmar="Desactivar"
                    alConfirmar={(motivo) =>
                      ejecutar(() => api.post(`/v1/op/dinamica/${d.id}/desactivar`, { motivo }), {
                        invalidar: ['dinamica'],
                        exito: 'Dinámica desactivada',
                      })
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

export function Tarifas() {
  const [pestana, setPestana] = useState<Pestana>('versiones');
  return (
    <>
      <Encabezado
        titulo="Tarifas, zonas y dinámica"
        subtitulo="Versiones de tarifa, recargos, festivos, rutas fijas, zonas y dinámica manual"
      />
      <div className="space-y-4 p-6">
        <Pestanas
          activa={pestana}
          alCambiar={setPestana}
          items={[
            { id: 'versiones', titulo: 'Tarifa y recargos' },
            { id: 'simulador', titulo: 'Simulador' },
            { id: 'festivos', titulo: 'Festivos' },
            { id: 'rutas', titulo: 'Rutas fijas' },
            { id: 'zonas', titulo: 'Zonas' },
            { id: 'dinamica', titulo: 'Dinámica' },
          ]}
        />
        {pestana === 'versiones' && <Versiones />}
        {pestana === 'simulador' && <Simulador />}
        {pestana === 'festivos' && <Festivos />}
        {pestana === 'rutas' && <Rutas />}
        {pestana === 'zonas' && <Zonas />}
        {pestana === 'dinamica' && <Dinamica />}
      </div>
    </>
  );
}
