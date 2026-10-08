import { api, duracion, numero, pesos, porcentaje, useSesion } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarrasApiladas } from '../componentes/Grafica.tsx';
import { Encabezado } from '../componentes/Layout.tsx';
import { MapaOperacion } from '../componentes/MapaOperacion.tsx';
import { Boton, Campo, Entrada, Kpi, Panel, Selector, Tabla } from '../componentes/ui.tsx';
import { consulta, usePermiso } from '../lib/consultas.ts';
import { CATEGORIA } from '../lib/etiquetas.ts';
import { fechaCorta, hoyBogota } from '../lib/fechas.ts';
import type { CeldaCalor, Reporte, Zona } from '../lib/tipos.ts';

const dias = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

async function descargar(ruta: string, nombre: string) {
  const r = await fetch(ruta, {
    headers: { authorization: `Bearer ${useSesion.getState().accessToken ?? ''}` },
  });
  if (!r.ok) throw new Error('No se pudo generar el archivo');
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

const SERIES_DIA = [
  { nombre: 'Finalizados', color: 'var(--color-ty)' },
  { nombre: 'Cancelados', color: 'var(--color-mandarina)' },
  { nombre: 'Sin conductor', color: 'var(--color-peligro)' },
];
const SERIES_HORA = [
  { nombre: 'Atendidas', color: 'var(--color-cielo)' },
  { nombre: 'Sin conductor', color: 'var(--color-peligro)' },
];

export function Reportes() {
  const [rango, setRango] = useState({
    desde: dias(6),
    hasta: hoyBogota(),
    categoria: '',
    zonaId: '',
  });
  const [aplicado, setAplicado] = useState(rango);
  const [calorTipo, setCalorTipo] = useState<'solicitudes' | 'sin_conductor'>('solicitudes');
  const { data: zonas } = useQuery({
    queryKey: ['zonas'],
    queryFn: () => api.get<Zona[]>('/v1/op/zonas'),
  });
  const [exportando, setExportando] = useState(false);
  const puedeVerFinanzas = usePermiso('finanzas.ver');
  const q = consulta({
    desde: `${aplicado.desde}T00:00:00-05:00`,
    hasta: `${aplicado.hasta}T23:59:59-05:00`,
    categoria: aplicado.categoria,
    zonaId: aplicado.zonaId,
  });
  const { data: calor } = useQuery({
    queryKey: ['calor', aplicado, calorTipo],
    queryFn: () =>
      api.get<{ total: number; celdas: CeldaCalor[] }>(
        `/v1/op/reportes/calor${q}${q ? '&' : '?'}tipo=${calorTipo}`,
      ),
    placeholderData: (p) => p,
  });
  const { data: r, isFetching } = useQuery({
    queryKey: ['reportes', aplicado],
    queryFn: () => api.get<Reporte>(`/v1/op/reportes/tiempos${q}`),
    placeholderData: (p) => p,
  });

  const preset = (n: number) => {
    const nuevo = { ...rango, desde: dias(n - 1), hasta: hoyBogota() };
    setRango(nuevo);
    setAplicado(nuevo);
  };

  return (
    <>
      <Encabezado
        titulo="Tiempos y movimientos"
        subtitulo="Indicadores de la operación calculados desde los eventos, ofertas y sesiones"
        acciones={
          <>
            <Boton
              icono="descargar"
              cargando={exportando}
              onClick={() => {
                setExportando(true);
                void descargar(
                  `/v1/op/reportes/viajes.csv${q}`,
                  `viajes-${aplicado.desde}_${aplicado.hasta}.csv`,
                ).finally(() => setExportando(false));
              }}
            >
              Exportar viajes (CSV)
            </Boton>
            <Boton
              icono="descargar"
              onClick={() =>
                void descargar(
                  `/v1/op/reportes/tiempos.csv${q}`,
                  `tiempos-por-dia-${aplicado.desde}_${aplicado.hasta}.csv`,
                )
              }
            >
              Exportar por día
            </Boton>
          </>
        }
      />
      <div className="space-y-4 p-6" style={{ opacity: isFetching ? 0.7 : 1 }}>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setAplicado(rango);
          }}
        >
          <div className="flex gap-1.5">
            {[
              ['Hoy', 1],
              ['7 días', 7],
              ['30 días', 30],
              ['90 días', 90],
            ].map(([t, n]) => (
              <Boton key={t as string} tamano="sm" onClick={() => preset(n as number)}>
                {t}
              </Boton>
            ))}
          </div>
          <Campo etiqueta="Desde">
            <Entrada
              type="date"
              value={rango.desde}
              max={rango.hasta}
              onChange={(e) => setRango({ ...rango, desde: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Hasta">
            <Entrada
              type="date"
              value={rango.hasta}
              min={rango.desde}
              max={hoyBogota()}
              onChange={(e) => setRango({ ...rango, hasta: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Categoría">
            <Selector
              id="filtro-categoria"
              value={rango.categoria}
              onChange={(e) => setRango({ ...rango, categoria: e.target.value })}
            >
              <option value="">Todas</option>
              {Object.entries(CATEGORIA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Zona de origen">
            <Selector
              id="filtro-zona"
              value={rango.zonaId}
              onChange={(e) => setRango({ ...rango, zonaId: e.target.value })}
            >
              <option value="">Toda la ciudad</option>
              {(zonas ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Boton type="submit" variante="primario">
            Aplicar
          </Boton>
        </form>

        {r && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6" id="kpis-reporte">
              <Kpi etiqueta="Solicitudes" valor={numero(r.viajes.solicitudes)} icono="navegar" />
              <Kpi
                etiqueta="Finalizados"
                valor={numero(r.viajes.finalizados)}
                tono="ok"
                nota={porcentaje(r.viajes.tasaFinalizacion)}
                icono="ok"
              />
              <Kpi
                etiqueta="Cancelados"
                valor={numero(r.viajes.cancelados)}
                tono="aviso"
                nota={`${r.viajes.canceladosPorPasajero} pasajero · ${r.viajes.canceladosPorConductor} conductor · ${r.viajes.canceladosPorOperacion} operación`}
              />
              <Kpi
                etiqueta="Sin conductor"
                valor={numero(r.viajes.sinConductor)}
                tono={r.viajes.sinConductor > 0 ? 'error' : 'neutro'}
                nota="Demanda insatisfecha"
                icono="alerta"
              />
              <Kpi
                etiqueta="Tasa de aceptación"
                valor={
                  r.ofertas.tasaAceptacion === null ? '—' : porcentaje(r.ofertas.tasaAceptacion)
                }
                nota={`${r.ofertas.aceptadas} de ${r.ofertas.total} ofertas`}
              />
              <Kpi
                etiqueta="Utilización de la flota"
                valor={r.flota.utilizacion === null ? '—' : porcentaje(r.flota.utilizacion)}
                nota={
                  r.flota.horasEnLinea === null
                    ? `${r.flota.horasProductivas} h productivas (la flota no se recorta por filtro)`
                    : `${r.flota.horasProductivas} h productivas de ${r.flota.horasEnLinea} h en línea`
                }
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel titulo="Tiempos">
                <dl className="grid grid-cols-2 gap-x-8">
                  {[
                    ['Asignación (media)', r.tiempos.asignacionMediaS],
                    ['Asignación (mediana)', r.tiempos.asignacionP50S],
                    ['Asignación (percentil 90)', r.tiempos.asignacionP90S],
                    ['Respuesta a ofertas', r.tiempos.respuestaOfertaMediaS],
                    ['Llegada a la recogida', r.tiempos.llegadaMediaS],
                    ['Espera del conductor', r.tiempos.esperaMediaS],
                    ['Duración del viaje', r.tiempos.duracionMediaS],
                  ].map(([t, v]) => (
                    <div
                      key={t as string}
                      className="flex items-baseline justify-between border-b border-borde/60 py-1.5 text-sm"
                    >
                      <dt className="text-suave">{t}</dt>
                      <dd className="numeros font-bold">
                        {v === null ? '—' : duracion(v as number)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between border-b border-borde/60 py-1.5 text-sm">
                    <dt className="text-suave">Km productivos</dt>
                    <dd className="numeros font-bold">{numero(r.flota.kmProductivos)} km</dd>
                  </div>
                </dl>
              </Panel>
              {puedeVerFinanzas ? (
                <Panel titulo="Dinero">
                  <dl>
                    {[
                      ['Ingresos brutos', pesos(r.dinero.ingresosBrutos)],
                      ['Comisiones', pesos(r.dinero.comisiones)],
                      ['Viajes en efectivo', numero(r.dinero.viajesEfectivo)],
                      ['Viajes electrónicos', numero(r.dinero.viajesElectronico)],
                    ].map(([t, v]) => (
                      <div
                        key={t}
                        className="flex items-baseline justify-between border-b border-borde/60 py-1.5 text-sm last:border-0"
                      >
                        <dt className="text-suave">{t}</dt>
                        <dd className="numeros font-bold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
              ) : (
                <Panel titulo="Dinero">
                  <p className="text-sm text-suave">Los montos son para finanzas y supervisión.</p>
                </Panel>
              )}
            </div>

            <Panel
              id="panel-calor"
              titulo="Dónde se piden los viajes"
              acciones={
                <div className="flex gap-1.5">
                  <Boton
                    tamano="sm"
                    variante={calorTipo === 'solicitudes' ? 'primario' : 'secundario'}
                    onClick={() => setCalorTipo('solicitudes')}
                  >
                    Todas
                  </Boton>
                  <Boton
                    tamano="sm"
                    variante={calorTipo === 'sin_conductor' ? 'primario' : 'secundario'}
                    onClick={() => setCalorTipo('sin_conductor')}
                  >
                    Sin conductor
                  </Boton>
                </div>
              }
            >
              <MapaOperacion
                className="h-[360px]"
                calor={calor?.celdas ?? []}
                colorCalor={
                  calorTipo === 'sin_conductor' ? 'var(--color-peligro)' : 'var(--color-mandarina)'
                }
              />
              <p className="mt-2 text-xs text-suave">
                {calor?.total ?? 0} solicitudes en celdas de unos 330 m: entre más intenso el color,
                más viajes empezaron ahí. No se muestran personas, solo zonas.
              </p>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel>
                <BarrasApiladas
                  titulo="Solicitudes por día"
                  series={SERIES_DIA}
                  datos={r.porDia.map((d) => ({
                    etiqueta: fechaCorta(d.dia).slice(0, -5),
                    valores: [d.finalizados, d.cancelados, d.sinConductor],
                  }))}
                  cadaN={Math.ceil(r.porDia.length / 10)}
                />
              </Panel>
              <Panel>
                <BarrasApiladas
                  titulo="Solicitudes por hora del día"
                  series={SERIES_HORA}
                  datos={r.porHora.map((h) => ({
                    etiqueta: `${h.hora}h`,
                    valores: [h.solicitudes - h.sinConductor, h.sinConductor],
                  }))}
                  cadaN={2}
                />
              </Panel>
            </div>

            <Panel titulo="Conductores" sinRelleno>
              <Tabla
                id="tabla-reporte-conductores"
                filas={r.conductores}
                clave={(c) => c.id}
                columnas={[
                  {
                    titulo: 'Conductor',
                    celda: (c) => (
                      <Link
                        className="font-bold text-ty hover:underline"
                        to={`/conductores/${c.id}`}
                      >
                        {c.nombre}
                      </Link>
                    ),
                  },
                  { titulo: 'Viajes', alinear: 'der', celda: (c) => c.viajes },
                  { titulo: 'Horas en línea', alinear: 'der', celda: (c) => c.horasEnLinea },
                  {
                    titulo: 'Aceptación',
                    alinear: 'der',
                    celda: (c) => (c.tasaAceptacion === null ? '—' : porcentaje(c.tasaAceptacion)),
                  },
                  { titulo: 'Cancelaciones', alinear: 'der', celda: (c) => c.cancelaciones },
                ]}
              />
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
