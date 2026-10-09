import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { useEffect } from 'react';
import { useTemaDocumento } from '@transportaya/ui';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { BarraInferior } from './componentes/BarraInferior.tsx';
import {
  AvisoSinConexion,
  Avisos,
  EntradaPagina,
  PantallaCargando,
  PantallaDiagnostico,
  Splash,
} from '@transportaya/ui';
import { useAjustes } from './estado/ajustes.ts';
import { useJornada } from './estado/jornada.ts';
import { useSesion } from '@transportaya/ui';
import { usePerfil } from './lib/consultas.ts';
import { PruebaPwa } from './diagnostico/PruebaPwa.tsx';
import { Entrar } from './pantallas/Entrar.tsx';
import { Ganancias } from './pantallas/Ganancias.tsx';
import { Inicio } from './pantallas/Inicio.tsx';
import { OfertaEntrante } from './pantallas/OfertaEntrante.tsx';
import { PantallaViaje } from './pantallas/PantallaViaje.tsx';
import { Perfil } from './pantallas/Perfil.tsx';
import { Reservas } from './pantallas/Reservas.tsx';
import { Registro } from './pantallas/Registro.tsx';
import { Resumen } from './pantallas/Resumen.tsx';
import { iniciarMotor } from './servicios/motor.ts';

/** Pantalla principal con el motor de la jornada encendido: solo existe con la sesión iniciada y el conductor habilitado. */
function Jornada() {
  const qc = useQueryClient();
  const oferta = useJornada((s) => s.oferta);
  const viaje = useJornada((s) => s.viaje);
  const resumen = useJornada((s) => s.resumen);
  const { pathname } = useLocation();

  useEffect(() => iniciarMotor(qc), [qc]);

  if (resumen) return <Resumen resultado={resumen} />;
  if (viaje)
    return (
      <>
        <PantallaViaje viaje={viaje} />
        <AnimatePresence>
          {oferta && <OfertaEntrante key={oferta.ofertaId} oferta={oferta} />}
        </AnimatePresence>
      </>
    );
  return (
    <>
      <EntradaPagina clave={pathname}>
        <Outlet />
      </EntradaPagina>
      <BarraInferior />
      <AnimatePresence>
        {oferta && <OfertaEntrante key={oferta.ofertaId} oferta={oferta} />}
      </AnimatePresence>
    </>
  );
}

function Protegida() {
  const token = useSesion((s) => s.accessToken);
  const { data: perfil, isLoading, isError } = usePerfil();
  if (!token) return <Navigate to="/entrar" replace />;
  if (isLoading) return <PantallaCargando />;
  if (isError || !perfil) return <PantallaCargando />;
  if (perfil.conductor.estadoHabilitacion !== 'habilitado') return <Registro />;
  return <Jornada />;
}

export function App() {
  useTemaDocumento(useAjustes((s) => s.tema));
  const token = useSesion((s) => s.accessToken);
  return (
    <>
      <Routes>
        <Route
          path="/diagnostico"
          element={
            <PantallaDiagnostico app="App Conductor">
              <PruebaPwa />
            </PantallaDiagnostico>
          }
        />
        <Route path="/entrar" element={token ? <Navigate to="/" replace /> : <Entrar />} />
        <Route element={<Protegida />}>
          <Route index element={<Inicio />} />
          <Route path="reservas" element={<Reservas />} />
          <Route path="ganancias" element={<Ganancias />} />
          <Route path="perfil" element={<Perfil />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Avisos />
      <AvisoSinConexion />
      <Splash />
    </>
  );
}

export default App;
