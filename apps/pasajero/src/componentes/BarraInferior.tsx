import { Icono, vibrar, type NombreIcono } from '@transportaya/ui';
import { motion } from 'motion/react';
import { NavLink } from 'react-router-dom';

const PESTANAS: { ruta: string; texto: string; icono: NombreIcono }[] = [
  { ruta: '/', texto: 'Inicio', icono: 'inicio' },
  { ruta: '/viajes', texto: 'Mis viajes', icono: 'reloj' },
  { ruta: '/cuenta', texto: 'Cuenta', icono: 'usuario' },
];

export function BarraInferior({ aviso = false }: { aviso?: boolean }) {
  return (
    <nav
      className="area-segura-abajo fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-fondo/90 px-3 pt-2 backdrop-blur-xl"
      aria-label="Secciones"
    >
      <ul className="mx-auto flex max-w-lg justify-around">
        {PESTANAS.map((p) => (
          <li key={p.ruta} className="flex-1">
            <NavLink
              to={p.ruta}
              end={p.ruta === '/'}
              onClick={() => vibrar('toque')}
              className="relative flex flex-col items-center gap-0.5 py-1.5"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="pestana"
                      className="absolute -top-2 h-1 w-10 rounded-full bg-ty"
                      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                    />
                  )}
                  <span className={isActive ? 'text-ty' : 'text-suave'}>
                    <Icono
                      nombre={p.icono}
                      tamano={26}
                      relleno={isActive && p.icono === 'inicio'}
                    />
                  </span>
                  <span className={`text-xs font-extrabold ${isActive ? 'text-ty' : 'text-suave'}`}>
                    {p.texto}
                  </span>
                  {aviso && p.ruta === '/cuenta' && (
                    <span className="absolute right-[28%] top-1 size-2.5 rounded-full bg-peligro" />
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
