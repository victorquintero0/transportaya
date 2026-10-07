import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { BarraInferior } from './componentes/BarraInferior.tsx';
import { Avisos } from './componentes/ui/Avisos.tsx';
import { useAjustes } from './estado/ajustes.ts';
import { useJornada } from './estado/jornada.ts';
import { useSesion } from './estado/sesion.ts';
import { usePerfil } from './lib/consultas.ts';
import { PruebaPwa } from './diagnostico/PruebaPwa.tsx';
import { Entrar } from './pantallas/Entrar.tsx';
import { Ganancias } from './pantallas/Ganancias.tsx';
import { Inicio } from './pantallas/Inicio.tsx';
import { OfertaEntrante } from './pantallas/OfertaEntrante.tsx';
import { PantallaViaje } from './pantallas/PantallaViaje.tsx';
import { Perfil } from './pantallas/Perfil.tsx';
import { Registro } from './pantallas/Registro.tsx';
import { Resumen } from './pantallas/Resumen.tsx';
import { iniciarMotor } from './servicios/motor.ts';

/** Aplica el tema elegido (o el del sistema) al documento. */
function useTema(): void {
  const tema = useAjustes((s) => s.tema);
  useEffect(() => {
    const aplicar = () => {
      const claro =
        tema === 'claro' ||
        (tema === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
      document.documentElement.dataset['tema'] = claro ? 'claro' : 'oscuro';
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', claro ? '#f6f8f6' : '#101010');
    };
    aplicar();
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, [tema]);
}

/** Pantalla principal con el motor de la jornada encendido: solo existe con la sesión iniciada y el conductor habilitado. */
function Jornada() {
  const qc = useQueryClient();
  const oferta = useJornada((s) => s.oferta);
  const viaje = useJornada((s) => s.viaje);
  const resumen = useJornada((s) => s.resumen);

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
      <Outlet />
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
  if (isLoading) return <Cargando />;
  if (isError || !perfil) return <Cargando />;
  if (perfil.conductor.estadoHabilitacion !== 'habilitado') return <Registro />;
  return <Jornada />;
}

function Cargando() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <div className="size-12 animate-spin rounded-full border-4 border-ty border-t-transparent" />
    </main>
  );
}

export function App() {
  useTema();
  const token = useSesion((s) => s.accessToken);
  return (
    <>
      <Routes>
        <Route path="/diagnostico" element={<PruebaPwa />} />
        <Route path="/entrar" element={token ? <Navigate to="/" replace /> : <Entrar />} />
        <Route element={<Protegida />}>
          <Route index element={<Inicio />} />
          <Route path="ganancias" element={<Ganancias />} />
          <Route path="perfil" element={<Perfil />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Avisos />
    </>
  );
}

export default App;
