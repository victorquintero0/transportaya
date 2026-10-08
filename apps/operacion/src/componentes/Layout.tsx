import { api, Icono, Logo, type NombreIcono, useSesion } from '@transportaya/ui';
import { ETIQUETA_ROL, tienePermiso, type Permiso } from '@transportaya/dominio';
import { useQueryClient } from '@tanstack/react-query';
import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAjustes } from '../estado/ajustes.ts';
import { Notificaciones } from './Notificaciones.tsx';
import { Cargando } from './ui.tsx';
import { usePerfilOperador, useSimulador } from '../lib/consultas.ts';
import { conectarOperacion, desconectar, useConexion } from '../servicios/tiempo-real.ts';

interface Destino {
  ruta: string;
  titulo: string;
  icono: NombreIcono;
  permiso: Permiso;
}

export const DESTINOS: Destino[] = [
  { ruta: '/', titulo: 'Torre de control', icono: 'velocimetro', permiso: 'torre.ver' },
  { ruta: '/viajes', titulo: 'Viajes', icono: 'carro', permiso: 'viajes.ver' },
  { ruta: '/conductores', titulo: 'Conductores', icono: 'maletin', permiso: 'conductores.ver' },
  { ruta: '/pasajeros', titulo: 'Pasajeros', icono: 'usuario', permiso: 'pasajeros.ver' },
  { ruta: '/soporte', titulo: 'Soporte', icono: 'mensaje', permiso: 'tickets.ver' },
  { ruta: '/finanzas', titulo: 'Finanzas', icono: 'billetera', permiso: 'finanzas.ver' },
  { ruta: '/tarifas', titulo: 'Tarifas y zonas', icono: 'pin', permiso: 'tarifas.ver' },
  { ruta: '/reportes', titulo: 'Reportes', icono: 'archivo', permiso: 'reportes.ver' },
  { ruta: '/usuarios', titulo: 'Usuarios', icono: 'escudo', permiso: 'usuarios.ver' },
  { ruta: '/auditoria', titulo: 'Auditoría', icono: 'candado', permiso: 'usuarios.ver' },
  { ruta: '/configuracion', titulo: 'Configuración', icono: 'editar', permiso: 'config.ver' },
  { ruta: '/sistema', titulo: 'Sistema', icono: 'rayo', permiso: 'sistema.ver' },
];

export function Layout() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const { data: perfil } = usePerfilOperador();
  const conectado = useConexion((s) => s.conectado);
  const simulador = useSimulador();
  const { tema, cambiar } = useAjustes();

  useEffect(() => conectarOperacion(qc), [qc]);

  if (!perfil)
    return (
      <main className="grid min-h-dvh place-items-center">
        <div className="size-10 animate-spin rounded-full border-4 border-ty border-t-transparent" />
      </main>
    );

  const permitidos = DESTINOS.filter((d) => tienePermiso(perfil.roles, d.permiso));
  const salir = async () => {
    try {
      await api.post('/v1/auth/salir');
    } catch {
      // si la sesión ya no existe en el servidor, igual se cierra aquí
    }
    desconectar();
    useSesion.getState().limpiar();
    qc.clear();
    void navegar('/ingresar', { replace: true });
  };

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-borde bg-superficie">
        <div className="px-5 pb-2 pt-5">
          <Logo tamano={128} />
        </div>
        <nav
          aria-label="Principal"
          className="scroll-fino flex-1 space-y-0.5 overflow-y-auto px-3 py-2"
        >
          {permitidos.map((d) => (
            <NavLink
              key={d.ruta}
              to={d.ruta}
              end={d.ruta === '/'}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold transition',
                  isActive
                    ? 'bg-ty/15 text-ty'
                    : 'text-suave hover:bg-superficie-2 hover:text-texto',
                ].join(' ')
              }
            >
              <Icono nombre={d.icono} tamano={18} />
              {d.titulo}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-borde p-3">
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="flex items-center gap-1.5 text-suave" title="Conexión en tiempo real">
              <span
                className={`size-2 rounded-full ${conectado ? 'bg-ty' : 'bg-peligro parpadeo'}`}
              />
              {conectado ? 'En vivo' : 'Reconectando…'}
            </span>
            <button
              type="button"
              onClick={() => cambiar({ tema: tema === 'claro' ? 'oscuro' : 'claro' })}
              aria-label={tema === 'claro' ? 'Usar tema oscuro' : 'Usar tema claro'}
              className="rounded-lg p-1.5 text-suave hover:bg-superficie-2 hover:text-texto"
            >
              <Icono nombre={tema === 'claro' ? 'luna' : 'sol'} tamano={16} />
            </button>
          </div>
          {simulador && (
            <p className="rounded-lg bg-sol/15 px-2 py-1 text-center text-[11px] font-bold text-sol">
              Modo demostración
            </p>
          )}
          <div className="flex items-center gap-2 rounded-lg bg-superficie-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold" id="operador-nombre">
                {perfil.nombre}
              </div>
              <div className="truncate text-xs text-suave">
                {perfil.roles.map((r) => ETIQUETA_ROL[r]).join(' · ')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void salir()}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="rounded-lg p-1.5 text-suave hover:bg-fondo hover:text-texto"
            >
              <Icono nombre="salir" tamano={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <Suspense fallback={<Cargando />}>
          <Outlet />
        </Suspense>
      </main>
      <Notificaciones />
    </div>
  );
}

/** Encabezado de cada pantalla. */
export function Encabezado({
  titulo,
  subtitulo,
  acciones,
}: {
  titulo: string;
  subtitulo?: string;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-borde px-6 py-3">
      <div>
        <h1 className="text-xl font-extrabold">{titulo}</h1>
        {subtitulo && <p className="text-sm text-suave">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </header>
  );
}
