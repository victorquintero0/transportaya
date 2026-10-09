import {
  ETIQUETA_ESTADO_SOLICITUD,
  ETIQUETA_TIPO_SOLICITUD,
  TIPOS_SOLICITUD_DATOS,
  type EstadoSolicitudDatos,
  type PoliticaDatos,
  type TipoSolicitudDatos,
} from '@transportaya/dominio';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ErrorApi, api, mensajeDe } from '../lib/api.ts';
import { avisar } from '../estado/avisos.ts';
import { Boton } from './Boton.tsx';
import { Chip } from './Chip.tsx';
import { Hoja } from './Hoja.tsx';
import { Tarjeta } from './Tarjeta.tsx';

/** La política de tratamiento de datos tal como la entrega el servidor (RNF-61): una sola fuente para las tres apps. */
export function PoliticaDatosVista() {
  const [politica, setPolitica] = useState<PoliticaDatos | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api
      .get<PoliticaDatos>('/v1/politica-datos')
      .then(setPolitica)
      .catch(() => setError(true));
  }, []);

  if (error)
    return <p className="py-4 text-suave">No pudimos cargar la política. Revisa tu internet.</p>;
  if (!politica) return <p className="py-4 text-suave">Cargando…</p>;
  return (
    <article className="space-y-4 pb-4 text-base text-suave" data-politica>
      <Chip tono={politica.pendienteRevisionLegal ? 'aviso' : 'ok'}>
        Versión {politica.version}
        {politica.pendienteRevisionLegal ? ' · borrador pendiente de revisión legal' : ''}
      </Chip>
      {politica.secciones.map((s) => (
        <section key={s.id} className="space-y-2">
          <h3 className="text-lg font-black text-texto">{s.titulo}</h3>
          {s.parrafos.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s.items && (
            <ul className="list-disc space-y-1 pl-5">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}

interface Solicitud {
  id: string;
  tipo: TipoSolicitudDatos;
  detalle: string;
  estado: EstadoSolicitudDatos;
  creadaEn: string;
  venceEn: string;
  respuesta: string | null;
  resueltaEn: string | null;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  });

const TONO_ESTADO: Record<EstadoSolicitudDatos, 'info' | 'ok' | 'malo'> = {
  recibida: 'info',
  en_tramite: 'info',
  aceptada: 'ok',
  ejecutada: 'ok',
  rechazada: 'malo',
};

const CAMPO =
  'min-h-14 w-full rounded-2xl border-2 border-borde bg-superficie px-4 text-lg font-bold outline-none placeholder:font-semibold placeholder:text-borde focus:border-ty';

/** Descargar los datos propios y ejercer los derechos de la Ley 1581 (RNF-62): la usan el pasajero y el conductor. */
export function PanelPrivacidad({ children }: { children?: ReactNode }) {
  const [politica, setPolitica] = useState(false);
  const [nueva, setNueva] = useState(false);
  const [lista, setLista] = useState<Solicitud[]>([]);
  const [tipo, setTipo] = useState<TipoSolicitudDatos>('consulta');
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    api
      .get<Solicitud[]>('/v1/datos/solicitudes')
      .then(setLista)
      .catch(() => undefined);
  }, []);
  useEffect(cargar, [cargar]);

  const descargar = async () => {
    try {
      const datos = await api.get('/v1/datos/exportar');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mis-datos-transporteya.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    }
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      await api.post('/v1/datos/solicitudes', { tipo, detalle: detalle.trim() });
      avisar('Recibimos tu solicitud. Te respondemos dentro del plazo de la ley.', 'exito');
      setNueva(false);
      setDetalle('');
      cargar();
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.detalle : mensajeDe(e), 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Tarjeta className="space-y-2.5" data-panel-privacidad>
        <Boton
          id="ver-politica"
          variante="secundario"
          icono="escudo"
          alPulsar={() => setPolitica(true)}
        >
          Política de tratamiento de datos
        </Boton>
        <Boton
          id="descargar-datos"
          variante="secundario"
          icono="descargar"
          alPulsar={() => void descargar()}
        >
          Descargar mis datos
        </Boton>
        <Boton
          id="nueva-solicitud"
          variante="secundario"
          icono="editar"
          alPulsar={() => setNueva(true)}
        >
          Corregir, consultar o borrar mis datos
        </Boton>
        {children}
      </Tarjeta>

      {lista.length > 0 && (
        <div className="mt-3 space-y-2" id="mis-solicitudes">
          <p className="text-sm font-extrabold text-suave">Mis solicitudes</p>
          {lista.map((s) => (
            <Tarjeta key={s.id} className="space-y-1.5 py-3" data-solicitud={s.tipo}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{ETIQUETA_TIPO_SOLICITUD[s.tipo]}</b>
                <Chip tono={TONO_ESTADO[s.estado]}>{ETIQUETA_ESTADO_SOLICITUD[s.estado]}</Chip>
              </div>
              <p className="text-sm text-suave">{s.detalle}</p>
              {s.respuesta ? (
                <p className="rounded-xl bg-superficie-2 p-2.5 text-sm">
                  <b>Respuesta:</b> {s.respuesta}
                </p>
              ) : (
                <p className="text-xs text-suave">
                  Te respondemos a más tardar el {fecha(s.venceEn)}.
                </p>
              )}
            </Tarjeta>
          ))}
        </div>
      )}

      <Hoja
        abierta={politica}
        alCerrar={() => setPolitica(false)}
        titulo="Política de tratamiento de datos"
      >
        {politica && <PoliticaDatosVista />}
      </Hoja>

      <Hoja abierta={nueva} alCerrar={() => setNueva(false)} titulo="Tus datos, tus derechos">
        <div className="space-y-3 pb-4">
          <p className="text-suave">
            Por la Ley 1581 de 2012 respondemos las consultas en máximo 10 días hábiles y los
            reclamos en máximo 15.
          </p>
          <fieldset className="grid gap-2">
            <legend className="sr-only">Qué quieres hacer</legend>
            {TIPOS_SOLICITUD_DATOS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipo === t}
                data-tipo={t}
                onClick={() => setTipo(t)}
                className={`min-h-12 rounded-2xl border-2 px-4 text-left font-extrabold ${tipo === t ? 'border-ty bg-ty/10' : 'border-borde'}`}
              >
                {ETIQUETA_TIPO_SOLICITUD[t]}
              </button>
            ))}
          </fieldset>
          <label className="block">
            <span className="mb-1.5 block text-sm font-extrabold text-suave">
              Cuéntanos qué necesitas
            </span>
            <textarea
              id="detalle-solicitud"
              className={`${CAMPO} py-3`}
              rows={4}
              maxLength={2000}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder={
                tipo === 'rectificacion'
                  ? 'Qué dato está mal y cómo debería ser'
                  : 'Escribe aquí los detalles'
              }
            />
          </label>
          <Boton
            id="enviar-solicitud"
            tamano="grande"
            icono="ok"
            deshabilitado={detalle.trim().length < 5}
            cargando={enviando}
            alPulsar={() => void enviar()}
          >
            Enviar solicitud
          </Boton>
        </div>
      </Hoja>
    </>
  );
}

/** Enlace para leer la política sin haber iniciado sesión (RNF-61): va al pie de las pantallas de ingreso. */
export function EnlacePolitica() {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button
        type="button"
        id="enlace-politica"
        onClick={() => setAbierta(true)}
        className="mx-auto mt-4 block min-h-11 text-center text-sm font-bold text-suave underline-offset-4 hover:underline"
      >
        Política de tratamiento de datos
      </button>
      <Hoja
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo="Política de tratamiento de datos"
      >
        {abierta && <PoliticaDatosVista />}
      </Hoja>
    </>
  );
}
