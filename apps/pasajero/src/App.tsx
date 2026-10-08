import { Avisos, useSesion, useTemaDocumento } from '@transportaya/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Boton, Hoja, Icono } from '@transportaya/ui';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { BarraInferior } from './componentes/BarraInferior.tsx';
import { useAjustes } from './estado/ajustes.ts';
import { usePedido } from './estado/pedido.ts';
import { useSeguimiento } from './estado/seguimiento.ts';
import { usePerfil, useViajeActual } from './lib/consultas.ts';
import { Ayuda } from './pantallas/Ayuda.tsx';
import { Bienvenida } from './pantallas/Bienvenida.tsx';
import { BuscarDestino } from './pantallas/BuscarDestino.tsx';
import { Ciudades } from './pantallas/Ciudades.tsx';
import { Compartido } from './pantallas/Compartido.tsx';
import { Cotizar } from './pantallas/Cotizar.tsx';
import { Cuenta } from './pantallas/Cuenta.tsx';
import { Entrar } from './pantallas/Entrar.tsx';
import { Inicio } from './pantallas/Inicio.tsx';
import { Pagos } from './pantallas/Pagos.tsx';
import { ViajeDetalle } from './pantallas/ViajeDetalle.tsx';
import { ViajeEnCurso } from './pantallas/ViajeEnCurso.tsx';
import { Reservas } from './pantallas/Reservas.tsx';
import { Viajes } from './pantallas/Viajes.tsx';
import { iniciarMotor } from './servicios/motor.ts';

const CLAVE_VISTOS = 'ty.pasajero.resumenes-vistos';

/** Resúmenes de viaje que el pasajero ya cerró: no se le vuelven a mostrar aunque no los haya calificado. */
function leerVistos(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_VISTOS) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Con la sesión iniciada y la cuenta lista: mantiene el tiempo real y decide si mostrar el viaje en curso o las pestañas. */
function Principal() {
  const qc = useQueryClient();
  const { data: viaje } = useViajeActual();
  const { data: perfil } = usePerfil();
  const sinConductor = useSeguimiento((s) => s.sinConductor);
  const [vistos, setVistos] = useState(leerVistos);
  const { pathname } = useLocation();
  // La barra de pestañas solo va en las tres pantallas principales: las demás (cotizar, buscar…) usan toda la pantalla.
  const conBarra = ['/', '/viajes', '/cuenta'].includes(pathname);

  useEffect(() => iniciarMotor(qc), [qc]);

  const cerrarResumen = (id: string) => {
    const nuevos = new Set(vistos).add(id);
    setVistos(nuevos);
    try {
      localStorage.setItem(CLAVE_VISTOS, JSON.stringify([...nuevos].slice(-30)));
    } catch {
      // sin almacenamiento: el resumen reaparece al recargar, no pasa nada
    }
    usePedido.getState().limpiar();
    void qc.invalidateQueries({ queryKey: ['viaje-actual'] });
    void qc.invalidateQueries({ queryKey: ['historial'] });
  };

  const mostrar = viaje && !(viaje.estado === 'finalizado' && vistos.has(viaje.id)) ? viaje : null;
  if (mostrar) return <ViajeEnCurso viaje={mostrar} alCerrar={() => cerrarResumen(mostrar.id)} />;

  return (
    <>
      <Outlet />
      {conBarra && <BarraInferior aviso={(perfil?.deuda ?? 0) > 0} />}
      <SinConductor abierta={sinConductor} />
    </>
  );
}

/** Pasó el tiempo de búsqueda sin que nadie aceptara: se explica y se deja reintentar sin volver a escribir el destino. */
function SinConductor({ abierta }: { abierta: boolean }) {
  const navegar = useNavigate();
  const hayDestino = usePedido((s) => s.destino !== null);
  const cerrar = () => useSeguimiento.getState().ponerSinConductor(false);
  return (
    <Hoja abierta={abierta} alCerrar={cerrar} titulo="No encontramos conductor">
      <div className="space-y-4 pb-4" id="sin-conductor">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sol/15 text-sol">
            <Icono nombre="carro" />
          </span>
          <p className="text-lg text-suave">
            Ahora mismo no hay conductores disponibles cerca de ti. No te cobramos nada. Intenta de
            nuevo en un momento.
          </p>
        </div>
        <Boton
          id="reintentar"
          tamano="grande"
          icono="rayo"
          alPulsar={() => {
            cerrar();
            void navegar(hayDestino ? '/cotizar' : '/destino');
          }}
        >
          Intentar de nuevo
        </Boton>
        <Boton variante="secundario" alPulsar={cerrar}>
          Cerrar
        </Boton>
      </div>
    </Hoja>
  );
}

function Protegida() {
  const token = useSesion((s) => s.accessToken);
  const { data: perfil, isLoading, isError } = usePerfil();
  if (!token) return <Navigate to="/entrar" replace />;
  if (isLoading || isError || !perfil)
    return (
      <main className="grid min-h-dvh place-items-center">
        <div className="size-12 animate-spin rounded-full border-4 border-ty border-t-transparent" />
      </main>
    );
  if (!perfil.terminos.aceptados || perfil.usuario.nombre.trim().length < 3)
    return <Bienvenida perfil={perfil} />;
  return <Principal />;
}

export function App() {
  useTemaDocumento(useAjustes((s) => s.tema));
  const token = useSesion((s) => s.accessToken);
  return (
    <>
      <Routes>
        <Route path="/entrar" element={token ? <Navigate to="/" replace /> : <Entrar />} />
        <Route path="/c/:token" element={<Compartido />} />
        <Route element={<Protegida />}>
          <Route index element={<Inicio />} />
          <Route path="viajes" element={<Viajes />} />
          <Route path="reservas" element={<Reservas />} />
          <Route path="cuenta" element={<Cuenta />} />
          <Route path="viajes/:id" element={<ViajeDetalle />} />
          <Route path="destino" element={<BuscarDestino />} />
          <Route path="ciudades" element={<Ciudades />} />
          <Route path="cotizar" element={<Cotizar />} />
          <Route path="pagos" element={<Pagos />} />
          <Route path="ayuda" element={<Ayuda />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Avisos />
    </>
  );
}

export default App;
