import { Icono, PanelReferidos, PantallaCargando, api, avisar, mensajeDe } from '@transportaya/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useReferidos } from '../lib/consultas.ts';

/** Mis puntos: invitar a otros conductores y pasajeros, y pagar la comisión con puntos (CON-70). */
export function Referidos() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data, isPending, isError } = useReferidos();

  const refrescar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['referidos'] }),
      qc.invalidateQueries({ queryKey: ['saldo'] }),
      qc.invalidateQueries({ queryKey: ['movimientos'] }),
      qc.invalidateQueries({ queryKey: ['perfil'] }),
    ]);
  };

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
        <h1 className="mt-1 text-xl font-black">Puntos e invitados</h1>
      </header>
      <main className="px-5 pt-4">
        {isPending && <PantallaCargando />}
        {isError && (
          <p className="rounded-tarjeta border border-borde bg-superficie p-6 text-center text-suave">
            No pudimos cargar tus puntos. Intenta de nuevo en un momento.
          </p>
        )}
        {data && (
          <PanelReferidos
            rol="conductor"
            resumen={data.resumen}
            movimientos={data.movimientos}
            alUsarCodigo={async (codigo) => {
              try {
                await api.post('/v1/referidos/codigo', { codigo });
              } catch (e) {
                throw new Error(mensajeDe(e), { cause: e });
              }
              avisar('¡Listo! Ganarás tus puntos con tu primer viaje', 'exito');
              await refrescar();
            }}
            alAbonar={async () => {
              try {
                await api.post('/v1/referidos/abonar', {});
              } catch (e) {
                avisar(mensajeDe(e), 'error');
                return;
              }
              avisar('¡Abono aplicado a tu comisión!', 'exito');
              await refrescar();
            }}
          />
        )}
      </main>
    </div>
  );
}
