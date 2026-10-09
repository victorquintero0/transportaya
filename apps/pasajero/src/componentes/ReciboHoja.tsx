import { Boton, Hoja, Icono, api, distancia, duracion, pesos } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import type { Recibo } from '../lib/tipos.ts';

const FECHA = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

/** Recibo del viaje (PAS-40, PAS-43): cada concepto del precio, y se puede guardar como PDF desde el navegador. */
export function ReciboHoja({
  viajeId,
  abierto,
  alCerrar,
  alReportar,
}: {
  viajeId: string;
  abierto: boolean;
  alCerrar: () => void;
  alReportar?: () => void;
}) {
  const { data, isPending } = useQuery({
    enabled: abierto,
    queryKey: ['recibo', viajeId],
    queryFn: () => api.get<Recibo>(`/v1/pasajero/viajes/${viajeId}/recibo`),
    staleTime: 60_000,
  });

  return (
    <Hoja abierta={abierto} alCerrar={alCerrar} titulo="Recibo del viaje">
      <div className="space-y-4 pb-4" id="recibo-imprimible">
        {isPending || !data ? (
          <div className="h-48 animate-pulso-suave rounded-tarjeta bg-superficie-2" />
        ) : (
          <>
            <div>
              <p className="text-sm font-bold text-suave">
                {data.codigo} · {FECHA.format(new Date(data.fecha))}
              </p>
              <p className="mt-1 font-extrabold">{(data.origen ?? '').split(',')[0]}</p>
              <p className="font-extrabold">→ {(data.destino ?? '').split(',')[0]}</p>
              {data.conductor && (
                <p className="mt-1 text-sm text-suave">
                  {data.conductor.nombre} · {data.conductor.vehiculo.marca}{' '}
                  {data.conductor.vehiculo.linea} · {data.conductor.vehiculo.placa}
                </p>
              )}
            </div>
            <ul
              className="divide-y divide-borde rounded-tarjeta border border-borde"
              aria-label="Detalle del cobro"
            >
              {data.lineas.map((l) => (
                <li
                  key={l.concepto}
                  className="flex items-baseline justify-between gap-3 px-4 py-3"
                >
                  <span className="font-bold text-suave">{l.concepto}</span>
                  <span className="numeros font-extrabold">{pesos(l.valor)}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 bg-ty/10 px-4 py-3 text-xl font-black">
                <span>Total</span>
                <span className="numeros text-ty" id="recibo-total">
                  {pesos(data.total)}
                </span>
              </li>
            </ul>
            <p className="text-sm text-suave">
              {data.metodoPago === 'corporativo'
                ? `Cargado a ${data.corporativo?.empresa ?? 'tu empresa'}`
                : `Pagado con ${data.metodoPago === 'tarjeta' ? 'tarjeta' : 'efectivo'}`}
              {data.mediciones.distanciaM ? ` · ${distancia(data.mediciones.distanciaM)}` : ''}
              {data.mediciones.duracionS ? ` · ${duracion(data.mediciones.duracionS)}` : ''}
            </p>
          </>
        )}
      </div>
      <div className="space-y-2 pb-3 print:hidden">
        <Boton
          variante="secundario"
          icono="descargar"
          deshabilitado={!data}
          alPulsar={() => window.print()}
        >
          Guardar como PDF
        </Boton>
        {alReportar && (
          <button
            type="button"
            onClick={alReportar}
            className="flex min-h-12 w-full items-center justify-center gap-2 text-base font-extrabold text-suave"
          >
            <Icono nombre="ayuda" tamano={18} /> ¿Algún problema con este viaje?
          </button>
        )}
      </div>
    </Hoja>
  );
}
