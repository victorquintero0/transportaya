import {
  ETIQUETA_ESTADO_SOLICITUD,
  ETIQUETA_TIPO_SOLICITUD,
  esSolicitudDeSupresion,
} from '@transportaya/dominio';
import { api, numero } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Encabezado } from '../componentes/Layout.tsx';
import {
  AccionMotivo,
  Boton,
  Dato,
  Insignia,
  Kpi,
  Panel,
  Pestanas,
  Tabla,
  Vacio,
  type Tono,
} from '../componentes/ui.tsx';
import { useEjecutar, usePermiso } from '../lib/consultas.ts';
import { fechaHora } from '../lib/fechas.ts';
import type { SolicitudDatosDetalle, SolicitudDatosFila } from '../lib/tipos.ts';

type Vista = 'abiertas' | 'resueltas';

const TONO_ESTADO: Record<SolicitudDatosFila['estado'], Tono> = {
  recibida: 'info',
  en_tramite: 'info',
  aceptada: 'ok',
  ejecutada: 'ok',
  rechazada: 'error',
};

function Plazo({ s }: { s: SolicitudDatosFila }) {
  if (s.resueltaEn || s.diasHabilesRestantes === undefined)
    return <span className="text-suave">—</span>;
  const n = s.diasHabilesRestantes;
  const texto = n < 0 ? 'Vencida' : n === 0 ? 'Vence hoy' : `${n} días hábiles`;
  return (
    <Insignia tono={s.semaforo === 'rojo' ? 'error' : s.semaforo === 'ambar' ? 'aviso' : 'ok'}>
      {texto}
    </Insignia>
  );
}

function Atender({ id }: { id: string }) {
  const ejecutar = useEjecutar();
  const puedeResponder = usePermiso('privacidad.responder');
  const puedeSuprimir = usePermiso('privacidad.suprimir');
  const { data: s } = useQuery({
    queryKey: ['privacidad', id],
    queryFn: () => api.get<SolicitudDatosDetalle>(`/v1/op/privacidad/solicitudes/${id}`),
  });
  if (!s) return <Panel titulo="Solicitud">Cargando…</Panel>;

  const suprime = esSolicitudDeSupresion(s.tipo);
  const abierta = !s.resueltaEn;
  const refrescar = { invalidar: ['privacidad'] };
  const sinPermiso = suprime && !puedeSuprimir;
  const resolver = (resultado: 'aceptar' | 'rechazar') => (respuesta: string) =>
    ejecutar(
      () => api.post(`/v1/op/privacidad/solicitudes/${id}/resolver`, { resultado, respuesta }),
      {
        ...refrescar,
        exito:
          resultado === 'rechazar'
            ? 'Solicitud rechazada'
            : suprime
              ? 'Datos borrados'
              : 'Solicitud resuelta',
      },
    );

  return (
    <Panel
      id="atender-solicitud"
      titulo={ETIQUETA_TIPO_SOLICITUD[s.tipo]}
      acciones={
        <Insignia tono={TONO_ESTADO[s.estado]}>{ETIQUETA_ESTADO_SOLICITUD[s.estado]}</Insignia>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Dato etiqueta="Persona">
            {s.titular.nombre}
            <span className="block text-xs text-suave">
              {s.rol === 'conductor' ? 'Conductor' : 'Pasajero'} · {s.titular.telefono}
            </span>
          </Dato>
          <Dato etiqueta="Recibida">{fechaHora(s.creadaEn)}</Dato>
          <Dato etiqueta="Responder antes del">{fechaHora(s.venceEn)}</Dato>
          {s.resueltaEn && <Dato etiqueta="Resuelta">{fechaHora(s.resueltaEn)}</Dato>}
        </div>
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-suave">
            Lo que pide la persona
          </p>
          <p className="whitespace-pre-wrap rounded-lg bg-superficie-2 p-3 text-sm">{s.detalle}</p>
        </div>

        {s.respuesta && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-suave">Respuesta</p>
            <p className="whitespace-pre-wrap rounded-lg bg-superficie-2 p-3 text-sm">
              {s.respuesta}
            </p>
          </div>
        )}

        {abierta && suprime && (
          <div className="rounded-lg border border-sol/40 bg-sol/10 p-3 text-sm">
            <b>Aceptar borra los datos personales de esta cuenta</b> y no se puede deshacer. Se
            conservan los viajes y pagos sin el nombre, celular ni correo.
            {s.bloqueadores.length > 0 && (
              <ul id="bloqueadores" className="mt-2 list-inside list-disc text-peligro">
                {s.bloqueadores.map((b) => (
                  <li key={b.codigo}>{b.detalle}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {abierta && puedeResponder && (
          <div className="flex flex-wrap gap-2">
            {s.estado === 'recibida' && (
              <Boton
                id="tomar-solicitud"
                onClick={() =>
                  void ejecutar(
                    () => api.post(`/v1/op/privacidad/solicitudes/${id}/tomar`, {}),
                    refrescar,
                  )
                }
              >
                Tomar
              </Boton>
            )}
            <AccionMotivo
              id="aceptar-solicitud"
              etiqueta={suprime ? 'Aceptar y borrar datos' : 'Aceptar y responder'}
              titulo={suprime ? 'Borrar los datos de esta persona' : 'Responder la solicitud'}
              descripcion="Lo que escribas lo ve la persona en su app."
              etiquetaMotivo="Respuesta para la persona"
              variante="primario"
              tamano="md"
              confirmar={suprime ? 'Borrar datos' : 'Responder'}
              deshabilitado={sinPermiso || (suprime && s.bloqueadores.length > 0)}
              alConfirmar={resolver('aceptar')}
            />
            <AccionMotivo
              id="rechazar-solicitud"
              etiqueta="Rechazar"
              titulo="Rechazar la solicitud"
              descripcion="Explícale a la persona por qué no se puede, con claridad."
              etiquetaMotivo="Motivo para la persona"
              variante="peligro"
              tamano="md"
              confirmar="Rechazar"
              alConfirmar={resolver('rechazar')}
            />
            {sinPermiso && (
              <p className="basis-full text-xs text-suave">
                Borrar datos lo hace supervisión o administración. Tú puedes rechazar o dejarla en
                trámite.
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Solicitudes de las personas sobre sus datos (Ley 1581): consultar, corregir, borrar o revocar. */
export function Privacidad() {
  const [vista, setVista] = useState<Vista>('abiertas');
  const [elegida, setElegida] = useState<string | null>(null);
  const { data: abiertas } = useQuery({
    queryKey: ['privacidad', 'lista', 'abiertas'],
    queryFn: () =>
      api.get<{ total: number; filas: SolicitudDatosFila[] }>(
        '/v1/op/privacidad/solicitudes?estado=abiertas&limite=100',
      ),
    refetchInterval: 30_000,
  });
  const { data: resueltas } = useQuery({
    queryKey: ['privacidad', 'lista', 'resueltas'],
    queryFn: () =>
      api.get<{ total: number; filas: SolicitudDatosFila[] }>(
        '/v1/op/privacidad/solicitudes?estado=resueltas&limite=100',
      ),
    enabled: vista === 'resueltas',
  });
  const filas = (vista === 'abiertas' ? abiertas : resueltas)?.filas ?? [];
  const urgentes = (abiertas?.filas ?? []).filter((s) => s.semaforo === 'rojo').length;

  return (
    <>
      <Encabezado
        titulo="Privacidad"
        subtitulo="Solicitudes de las personas sobre sus datos. La ley da 10 días hábiles para consultas y 15 para reclamos."
      />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <Kpi etiqueta="Abiertas" valor={numero(abiertas?.total ?? 0)} icono="escudo" />
          <Kpi
            etiqueta="Vencidas o por vencer"
            valor={numero(urgentes)}
            tono={urgentes > 0 ? 'error' : 'neutro'}
            icono="reloj"
            nota="Vencen en 2 días hábiles o menos"
          />
        </div>

        <Pestanas<Vista>
          activa={vista}
          alCambiar={(v) => {
            setVista(v);
            setElegida(null);
          }}
          items={[
            { id: 'abiertas', titulo: 'Abiertas', aviso: urgentes },
            { id: 'resueltas', titulo: 'Resueltas' },
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <Panel sinRelleno>
            {filas.length === 0 ? (
              <Vacio
                texto={
                  vista === 'abiertas'
                    ? 'No hay solicitudes abiertas.'
                    : 'Aún no hay solicitudes resueltas.'
                }
                icono="escudo"
              />
            ) : (
              <Tabla<SolicitudDatosFila>
                id="tabla-privacidad"
                clave={(s) => s.id}
                filas={filas}
                alFila={(s) => setElegida(s.id)}
                columnas={[
                  {
                    titulo: 'Persona',
                    celda: (s) => (
                      <span className="block">
                        <b>{s.titular.nombre}</b>
                        <span className="block text-xs text-suave">
                          {s.rol === 'conductor' ? 'Conductor' : 'Pasajero'}
                        </span>
                      </span>
                    ),
                  },
                  { titulo: 'Solicitud', celda: (s) => ETIQUETA_TIPO_SOLICITUD[s.tipo] },
                  { titulo: 'Recibida', celda: (s) => fechaHora(s.creadaEn) },
                  { titulo: 'Plazo', celda: (s) => <Plazo s={s} /> },
                  {
                    titulo: 'Estado',
                    celda: (s) => (
                      <Insignia tono={TONO_ESTADO[s.estado]}>
                        {ETIQUETA_ESTADO_SOLICITUD[s.estado]}
                      </Insignia>
                    ),
                  },
                ]}
              />
            )}
          </Panel>
          {elegida ? (
            <Atender key={elegida} id={elegida} />
          ) : (
            <Panel titulo="Solicitud">
              <Vacio texto="Elige una solicitud para atenderla." icono="escudo" />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
