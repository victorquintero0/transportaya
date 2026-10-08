import { tienePermiso } from '@transportaya/dominio';
import { useSesion, useTemaDocumento } from '@transportaya/ui';
import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DESTINOS, Layout } from './componentes/Layout.tsx';
import { useAjustes } from './estado/ajustes.ts';
import { usePerfilOperador } from './lib/consultas.ts';
import { Ingresar } from './pantallas/Ingresar.tsx';

// Cada pantalla se descarga cuando se abre: quien solo usa la torre no baja el código de finanzas.
const Auditoria = lazy(() =>
  import('./pantallas/Auditoria.tsx').then((m) => ({ default: m.Auditoria })),
);
const Conductores = lazy(() =>
  import('./pantallas/Conductores.tsx').then((m) => ({ default: m.Conductores })),
);
const ConductorFicha = lazy(() =>
  import('./pantallas/ConductorFicha.tsx').then((m) => ({ default: m.ConductorFicha })),
);
const Configuracion = lazy(() =>
  import('./pantallas/Configuracion.tsx').then((m) => ({ default: m.Configuracion })),
);
const Finanzas = lazy(() =>
  import('./pantallas/Finanzas.tsx').then((m) => ({ default: m.Finanzas })),
);
const PasajeroFicha = lazy(() =>
  import('./pantallas/PasajeroFicha.tsx').then((m) => ({ default: m.PasajeroFicha })),
);
const Pasajeros = lazy(() =>
  import('./pantallas/Pasajeros.tsx').then((m) => ({ default: m.Pasajeros })),
);
const Reportes = lazy(() =>
  import('./pantallas/Reportes.tsx').then((m) => ({ default: m.Reportes })),
);
const Sistema = lazy(() => import('./pantallas/Sistema.tsx').then((m) => ({ default: m.Sistema })));
const Soporte = lazy(() => import('./pantallas/Soporte.tsx').then((m) => ({ default: m.Soporte })));
const Tarifas = lazy(() => import('./pantallas/Tarifas.tsx').then((m) => ({ default: m.Tarifas })));
const TicketDetalle = lazy(() =>
  import('./pantallas/TicketDetalle.tsx').then((m) => ({ default: m.TicketDetalle })),
);
const Torre = lazy(() => import('./pantallas/Torre.tsx').then((m) => ({ default: m.Torre })));
const Usuarios = lazy(() =>
  import('./pantallas/Usuarios.tsx').then((m) => ({ default: m.Usuarios })),
);
const ViajeDetalle = lazy(() =>
  import('./pantallas/ViajeDetalle.tsx').then((m) => ({ default: m.ViajeDetalle })),
);
const Viajes = lazy(() => import('./pantallas/Viajes.tsx').then((m) => ({ default: m.Viajes })));

/** La pantalla de inicio de cada persona es la primera a la que tiene acceso: un financiero no ve la torre. */
function Inicio() {
  const { data: perfil } = usePerfilOperador();
  if (!perfil) return null;
  const primero = DESTINOS.find((d) => tienePermiso(perfil.roles, d.permiso));
  if (primero && primero.ruta !== '/') return <Navigate to={primero.ruta} replace />;
  return <Torre />;
}

function Protegida() {
  const token = useSesion((s) => s.accessToken);
  if (!token) return <Navigate to="/ingresar" replace />;
  return <Layout />;
}

export function App() {
  useTemaDocumento(useAjustes((s) => s.tema));
  const token = useSesion((s) => s.accessToken);
  return (
    <Routes>
      <Route path="/ingresar" element={token ? <Navigate to="/" replace /> : <Ingresar />} />
      <Route element={<Protegida />}>
        <Route index element={<Inicio />} />
        <Route path="torre" element={<Torre />} />
        <Route path="viajes" element={<Viajes />} />
        <Route path="viajes/:id" element={<ViajeDetalle />} />
        <Route path="conductores" element={<Conductores />} />
        <Route path="conductores/:id" element={<ConductorFicha />} />
        <Route path="pasajeros" element={<Pasajeros />} />
        <Route path="pasajeros/:id" element={<PasajeroFicha />} />
        <Route path="soporte" element={<Soporte />} />
        <Route path="soporte/:id" element={<TicketDetalle />} />
        <Route path="finanzas" element={<Finanzas />} />
        <Route path="tarifas" element={<Tarifas />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="auditoria" element={<Auditoria />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route path="sistema" element={<Sistema />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
