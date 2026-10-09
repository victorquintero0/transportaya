import { api, cargarConfigMapa, mensajeDe } from '@transportaya/ui';
import {
  ESTILOS_OPENFREEMAP,
  PRESETS_MAPA,
  PROVEEDORES_MAPA,
  urlEstiloValida,
  type ProveedorMapa,
} from '@transportaya/dominio';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AccionMotivo,
  Boton,
  Campo,
  Cargando,
  Entrada,
  Insignia,
  Panel,
} from '../componentes/ui.tsx';
import { useEjecutar, usePermiso } from '../lib/consultas.ts';

interface MapaAdmin {
  proveedor: ProveedorMapa;
  estilo: string | null;
  estiloOscuro: string | null;
  tieneClave: boolean;
  claveEnmascarada: string | null;
}

type Prueba = { estado: 'ok' | 'error'; texto: string } | null;

/** Pide el estilo desde el navegador, igual que lo harán las apps, y dice si sirve. */
async function probarEstilo(url: string): Promise<Prueba> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok)
      return {
        estado: 'error',
        texto: `El proveedor respondió ${res.status}. Revisa la dirección y la clave.`,
      };
    const estilo = (await res.json()) as { version?: number; layers?: unknown[] };
    if (typeof estilo.version !== 'number' || !Array.isArray(estilo.layers))
      return {
        estado: 'error',
        texto: 'La dirección responde, pero no es un estilo de MapLibre (style.json).',
      };
    return { estado: 'ok', texto: `El estilo responde y tiene ${estilo.layers.length} capas.` };
  } catch (e) {
    return {
      estado: 'error',
      texto: `No se pudo cargar el estilo (${mensajeDe(e)}). Puede ser la dirección, la red o que el proveedor no permita este dominio.`,
    };
  }
}

function Formulario({ actual, editable }: { actual: MapaAdmin; editable: boolean }) {
  const ejecutar = useEjecutar();
  const [proveedor, setProveedor] = useState<ProveedorMapa>(actual.proveedor);
  const [estilo, setEstilo] = useState(actual.estilo ?? '');
  const [estiloOscuro, setEstiloOscuro] = useState(actual.estiloOscuro ?? '');
  const [clave, setClave] = useState('');
  const [prueba, setPrueba] = useState<Prueba>(null);
  const [probando, setProbando] = useState(false);

  const elegir = (p: ProveedorMapa) => {
    setProveedor(p);
    setPrueba(null);
    if (p === actual.proveedor) {
      setEstilo(actual.estilo ?? '');
      setEstiloOscuro(actual.estiloOscuro ?? '');
    } else {
      setEstilo(PRESETS_MAPA[p].estilo ?? '');
      setEstiloOscuro(PRESETS_MAPA[p].estiloOscuro ?? '');
    }
  };

  const preset = PRESETS_MAPA[proveedor];
  const necesitaClave =
    preset.requiereClave || estilo.includes('{clave}') || estiloOscuro.includes('{clave}');
  const hayClave = clave.trim() !== '' || actual.tieneClave;
  const urlsBien = [estilo, estiloOscuro].every((u) => u === '' || urlEstiloValida(u));
  const valido =
    proveedor === 'esquematico' || (estilo !== '' && urlsBien && (!necesitaClave || hayClave));

  const probar = async () => {
    const conClave = (u: string) => u.replaceAll('{clave}', encodeURIComponent(clave.trim()));
    if (necesitaClave && clave.trim() === '') {
      setPrueba({
        estado: 'error',
        texto: actual.tieneClave
          ? 'Para probar, escribe la clave de nuevo (la guardada no se puede mostrar).'
          : 'Escribe la clave para probar.',
      });
      return;
    }
    setProbando(true);
    setPrueba(await probarEstilo(conClave(estilo)));
    setProbando(false);
  };

  return (
    <div className="space-y-4">
      <fieldset className="grid gap-2 md:grid-cols-2" disabled={!editable}>
        <legend className="sr-only">Proveedor del mapa</legend>
        {PROVEEDORES_MAPA.map((p) => (
          <label
            key={p}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
              proveedor === p ? 'border-ty bg-ty/10' : 'border-borde hover:bg-superficie-2'
            }`}
          >
            <input
              type="radio"
              name="proveedor-mapa"
              value={p}
              checked={proveedor === p}
              onChange={() => elegir(p)}
              className="mt-1 accent-[var(--color-ty)]"
            />
            <span>
              <b>{PRESETS_MAPA[p].nombre}</b>
              <span className="mt-0.5 block text-xs text-suave">{PRESETS_MAPA[p].descripcion}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {proveedor === 'openfreemap' && (
        <Campo etiqueta="Estilo">
          <select
            className="h-10 w-full rounded-lg border border-borde bg-fondo px-3 text-sm text-texto"
            value={estilo}
            disabled={!editable}
            onChange={(e) => {
              setEstilo(e.target.value);
              setPrueba(null);
            }}
          >
            {ESTILOS_OPENFREEMAP.map((s) => (
              <option key={s.id} value={s.url}>
                {s.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {(proveedor === 'maptiler' || proveedor === 'personalizado') && (
        <div className="grid gap-3 md:grid-cols-2">
          <Campo
            etiqueta="Estilo (tema claro)"
            ayuda="Dirección del style.json. Si el proveedor pide clave, escribe {clave} donde va."
          >
            <Entrada
              id="mapa-estilo"
              value={estilo}
              disabled={!editable}
              placeholder="https://…/style.json"
              onChange={(e) => {
                setEstilo(e.target.value.trim());
                setPrueba(null);
              }}
            />
          </Campo>
          <Campo
            etiqueta="Estilo (tema oscuro)"
            ayuda="Opcional. Si lo dejas vacío, el claro se oscurece solo."
          >
            <Entrada
              id="mapa-estilo-oscuro"
              value={estiloOscuro}
              disabled={!editable}
              onChange={(e) => setEstiloOscuro(e.target.value.trim())}
            />
          </Campo>
          <Campo
            etiqueta="Clave"
            ayuda={
              actual.tieneClave
                ? `Hay una clave guardada (${actual.claveEnmascarada}). Déjalo vacío para conservarla.`
                : 'La clave que te dio el proveedor. Restríngela por dominio en su panel.'
            }
          >
            <Entrada
              id="mapa-clave"
              type="password"
              autoComplete="off"
              value={clave}
              disabled={!editable}
              onChange={(e) => setClave(e.target.value)}
            />
          </Campo>
        </div>
      )}

      {!urlsBien && (
        <p className="text-sm text-peligro">
          La dirección debe empezar por https:// (o http://localhost en desarrollo) y no llevar
          espacios.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {proveedor !== 'esquematico' && (
          <Boton
            variante="secundario"
            tamano="sm"
            cargando={probando}
            onClick={() => void probar()}
            id="probar-mapa"
          >
            Probar estilo
          </Boton>
        )}
        {prueba && (
          <span
            role="status"
            className={`text-sm ${prueba.estado === 'ok' ? 'text-ty' : 'text-peligro'}`}
          >
            {prueba.texto}
          </span>
        )}
        {editable && (
          <div className="ml-auto">
            <AccionMotivo
              id="guardar-mapa"
              etiqueta="Guardar mapa"
              variante="primario"
              tamano="md"
              titulo="Cambiar el proveedor del mapa"
              descripcion={
                <>
                  Las tres apps usarán <b>{preset.nombre}</b> la próxima vez que se abran. No hay
                  que publicar nada nuevo.
                </>
              }
              confirmar="Guardar"
              valido={valido}
              alConfirmar={(motivo) =>
                ejecutar(
                  async () => {
                    await api.put('/v1/op/mapa', {
                      proveedor,
                      estilo: proveedor === 'esquematico' ? null : estilo,
                      estiloOscuro: proveedor === 'esquematico' ? null : estiloOscuro,
                      ...(clave.trim() !== '' ? { clave: clave.trim() } : {}),
                      motivo,
                    });
                    await cargarConfigMapa();
                  },
                  { invalidar: ['mapa-admin'], exito: 'Mapa actualizado' },
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Sección «Mapa» de Configuración: elige el proveedor que muestran las tres apps (ADR-0009). */
export function ConfiguracionMapa() {
  const editable = usePermiso('config.editar');
  const { data } = useQuery({
    queryKey: ['mapa-admin'],
    queryFn: () => api.get<MapaAdmin>('/v1/op/mapa'),
  });
  return (
    <Panel
      id="panel-mapa"
      titulo="Mapa de las apps"
      acciones={data && <Insignia tono="info">{PRESETS_MAPA[data.proveedor].nombre}</Insignia>}
    >
      {data ? (
        <Formulario
          key={`${data.proveedor}|${data.estilo}|${data.estiloOscuro}|${data.tieneClave}`}
          actual={data}
          editable={editable}
        />
      ) : (
        <Cargando />
      )}
    </Panel>
  );
}
