import { Boton, Chip, Icono, api } from '@transportaya/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReporteHoja } from '../componentes/ReporteHoja.tsx';
import { fechaCorta } from '../lib/fechas.ts';
import type { TicketSoporte } from '../lib/tipos.ts';

const NOMBRE_TIPO: Record<string, string> = {
  cobro_incorrecto: 'Cobro incorrecto',
  objeto_perdido: 'Objeto perdido',
  incidente_seguridad: 'Seguridad',
  queja: 'Queja',
  peticion: 'Solicitud',
  sugerencia: 'Sugerencia',
  reclamo: 'Reclamo',
};
const NOMBRE_ESTADO: Record<string, { texto: string; tono: 'ok' | 'info' | 'aviso' | 'neutro' }> = {
  abierto: { texto: 'Recibido', tono: 'info' },
  en_proceso: { texto: 'En proceso', tono: 'aviso' },
  esperando_usuario: { texto: 'Te escribimos', tono: 'aviso' },
  resuelto: { texto: 'Resuelto', tono: 'ok' },
  cerrado: { texto: 'Cerrado', tono: 'neutro' },
};

/** Ayuda y soporte (PAS-50, PAS-51): reportar y ver el estado de lo reportado. */
export function Ayuda() {
  const navegar = useNavigate();
  const [reportando, setReportando] = useState(false);
  const { data } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () =>
      (await api.get<{ tickets: TicketSoporte[] }>('/v1/pasajero/soporte/tickets')).tickets,
  });

  return (
    <div className="flex min-h-dvh flex-col bg-fondo pb-10">
      <header className="area-segura-arriba flex items-center gap-2 border-b border-borde px-4 pb-3">
        <button
          type="button"
          aria-label="Volver"
          onClick={() => void navegar(-1)}
          className="mt-1 grid size-11 place-items-center rounded-full"
        >
          <Icono nombre="izquierda" />
        </button>
        <h1 className="mt-1 text-xl font-black">Ayuda</h1>
      </header>
      <main className="space-y-4 px-5 pt-4">
        <p className="text-lg text-suave">
          Si algo no salió bien en un viaje, cuéntanos. Nuestra torre de control atiende las 24
          horas.
        </p>
        <Boton id="nuevo-reporte" icono="mensaje" alPulsar={() => setReportando(true)}>
          Escribir a soporte
        </Boton>
        <a
          href="tel:123"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-peligro/15 text-lg font-extrabold text-peligro"
        >
          <Icono nombre="telefono" /> Emergencia: 123
        </a>

        <h2 className="pt-2 text-xl font-black">Mis reportes</h2>
        {data?.length === 0 && (
          <p className="rounded-tarjeta border border-borde bg-superficie p-6 text-center text-suave">
            Aún no has enviado reportes.
          </p>
        )}
        <ul className="space-y-2.5">
          {data?.map((t) => {
            const e = NOMBRE_ESTADO[t.estado] ?? { texto: t.estado, tono: 'neutro' as const };
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">
                    {NOMBRE_TIPO[t.tipo] ?? t.asunto}
                  </span>
                  <span className="block text-sm text-suave">
                    {fechaCorta(t.creadoEn)}
                    {t.codigo ? ` · ${t.codigo}` : ''}
                  </span>
                </span>
                <Chip tono={e.tono}>{e.texto}</Chip>
              </li>
            );
          })}
        </ul>
      </main>
      <ReporteHoja abierto={reportando} alCerrar={() => setReportando(false)} />
    </div>
  );
}
