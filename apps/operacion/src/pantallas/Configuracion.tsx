import { api, numero } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Encabezado } from '../componentes/Layout.tsx';
import { AccionMotivo, Campo, Entrada, Insignia, Panel } from '../componentes/ui.tsx';
import { useEjecutar, usePermiso } from '../lib/consultas.ts';
import type { Parametro } from '../lib/tipos.ts';

function FilaParametro({ p, editable }: { p: Parametro; editable: boolean }) {
  const ejecutar = useEjecutar();
  const [valor, setValor] = useState(String(p.valor));
  const refrescar = { invalidar: ['parametros'] };
  return (
    <tr className="border-b border-borde/60 last:border-0" data-parametro={p.clave}>
      <td className="px-3 py-3">
        <b className="text-sm">{p.descripcion}</b>
        <code className="block text-[11px] text-suave">{p.clave}</code>
      </td>
      <td className="px-3 py-3 text-xs text-suave">
        {numero(p.min)} – {numero(p.max)} {p.unidad}
      </td>
      <td className="px-3 py-3 text-sm">
        <b className="numeros">
          {numero(p.valor)} {p.unidad}
        </b>
        {p.personalizado ? (
          <Insignia tono="aviso">Personalizado</Insignia>
        ) : (
          <span className="ml-2 text-xs text-suave">por defecto</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        {editable && (
          <div className="flex justify-end gap-1.5">
            <AccionMotivo
              etiqueta="Cambiar"
              titulo="Cambiar el parámetro"
              descripcion={
                <>
                  <b>{p.descripcion}</b>. Rige de inmediato para toda la operación.
                </>
              }
              valido={
                Number.isFinite(Number(valor)) && Number(valor) >= p.min && Number(valor) <= p.max
              }
              extra={
                <Campo etiqueta={`Valor nuevo (${p.unidad})`} ayuda={`Entre ${p.min} y ${p.max}`}>
                  <Entrada
                    type="number"
                    min={p.min}
                    max={p.max}
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                  />
                </Campo>
              }
              alConfirmar={(motivo) =>
                ejecutar(
                  () => api.put(`/v1/op/parametros/${p.clave}`, { valor: Number(valor), motivo }),
                  { ...refrescar, exito: 'Parámetro actualizado' },
                )
              }
            />
            {p.personalizado && (
              <AccionMotivo
                etiqueta="Restablecer"
                titulo="Volver al valor por defecto"
                descripcion={
                  <>
                    Vuelve a{' '}
                    <b>
                      {numero(p.defecto)} {p.unidad}
                    </b>
                    .
                  </>
                }
                confirmar="Restablecer"
                alConfirmar={(motivo) =>
                  ejecutar(() => api.delete(`/v1/op/parametros/${p.clave}`, { motivo }), {
                    ...refrescar,
                    exito: 'Parámetro restablecido',
                  })
                }
              />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function Configuracion() {
  const editable = usePermiso('config.editar');
  const { data } = useQuery({
    queryKey: ['parametros'],
    queryFn: () => api.get<Parametro[]>('/v1/op/parametros'),
  });
  const grupos = [...new Set((data ?? []).map((p) => p.grupo))];
  return (
    <>
      <Encabezado
        titulo="Configuración"
        subtitulo="Parámetros operativos. Cada cambio queda en la auditoría con su motivo."
      />
      <div className="space-y-4 p-6">
        {grupos.map((g) => (
          <Panel key={g} titulo={g} sinRelleno>
            <table className="w-full">
              <tbody>
                {(data ?? [])
                  .filter((p) => p.grupo === g)
                  .map((p) => (
                    <FilaParametro key={`${p.clave}-${p.valor}`} p={p} editable={editable} />
                  ))}
              </tbody>
            </table>
          </Panel>
        ))}
      </div>
    </>
  );
}
