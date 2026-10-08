import {
  Boton,
  PoliticaDatosVista,
  Hoja,
  Icono,
  Logo,
  Tarjeta,
  api,
  avisar,
  ding,
  mensajeDe,
  useSesion,
} from '@transportaya/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { auth } from '@transportaya/ui';
import type { Perfil } from '../lib/tipos.ts';

const ENTRADA =
  'min-h-14 w-full rounded-2xl border-2 border-borde bg-superficie px-4 text-lg font-bold outline-none placeholder:font-semibold placeholder:text-borde focus:border-ty';

/**
 * Primera vez: cómo te llamas y la autorización de datos (PAS-02, Ley 1581 de 2012). Sin esto no se puede pedir un
 * viaje: el conductor necesita saber tu nombre y nosotros necesitamos tu autorización expresa.
 */
export function Bienvenida({ perfil }: { perfil: Perfil }) {
  const qc = useQueryClient();
  const salir = useSesion((s) => s.limpiar);
  const tieneNombre = perfil.usuario.nombre.trim().length >= 3;
  const [paso, setPaso] = useState<'nombre' | 'terminos'>(tieneNombre ? 'terminos' : 'nombre');
  const [nombre, setNombre] = useState(perfil.usuario.nombre);
  const [email, setEmail] = useState(perfil.usuario.email ?? '');
  const [acepto, setAcepto] = useState(false);
  const [politica, setPolitica] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardarNombre = useMutation({
    mutationFn: () =>
      api.patch<Perfil>('/v1/pasajero/yo', {
        nombre: nombre.trim(),
        email: email.trim() === '' ? null : email.trim(),
      }),
    onSuccess: (p) => {
      qc.setQueryData(['perfil'], p);
      setError(null);
      setPaso('terminos');
    },
    onError: (e) => setError(mensajeDe(e)),
  });

  const aceptar = useMutation({
    mutationFn: () =>
      api.post<Perfil>('/v1/pasajero/terminos', { version: perfil.terminos.version }),
    onSuccess: (p) => {
      ding();
      qc.setQueryData(['perfil'], p);
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  return (
    <main className="fondo-calles area-segura-arriba area-segura-abajo relative flex min-h-dvh flex-col overflow-hidden px-6">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-ty/20 blur-3xl" />
      <header className="relative flex items-center justify-between pt-2">
        <Logo variante="marca" tamano={52} />
        <button
          type="button"
          className="rounded-xl px-3 py-2 text-sm font-extrabold text-suave"
          onClick={() => {
            void auth.salir().catch(() => undefined);
            salir();
          }}
        >
          Salir
        </button>
      </header>

      <div className="relative mx-auto mt-6 flex w-full max-w-md flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {paso === 'nombre' ? (
            <motion.div
              key="nombre"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex flex-1 flex-col gap-5"
            >
              <div>
                <h1 className="text-3xl font-black">¡Bienvenido! 👋</h1>
                <p className="mt-1 text-lg text-suave">
                  ¿Cómo te llamas? Tu conductor te saludará por tu nombre.
                </p>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-extrabold text-suave">Tu nombre</span>
                <input
                  className={ENTRADA}
                  value={nombre}
                  autoComplete="name"
                  placeholder="Valentina Ríos"
                  onChange={(e) => setNombre(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-extrabold text-suave">
                  Correo para tus recibos (opcional)
                </span>
                <input
                  className={ENTRADA}
                  type="email"
                  value={email}
                  autoComplete="email"
                  placeholder="tucorreo@gmail.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {error && (
                <p className="rounded-xl bg-peligro/15 px-4 py-3 font-bold text-peligro">{error}</p>
              )}
              <div className="mt-auto">
                <Boton
                  tamano="grande"
                  icono="derecha"
                  deshabilitado={nombre.trim().length < 3}
                  cargando={guardarNombre.isPending}
                  alPulsar={() => guardarNombre.mutate()}
                >
                  Seguir
                </Boton>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="terminos"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex flex-1 flex-col gap-5"
            >
              <div>
                <h1 className="text-3xl font-black">Tus datos, con tu permiso</h1>
                <p className="mt-1 text-lg text-suave">
                  Antes de pedir tu primer viaje, esto es lo que hacemos con tu información.
                </p>
              </div>
              <Tarjeta className="space-y-3">
                {[
                  [
                    'carro',
                    'Para llevarte',
                    'Tu conductor ve tu nombre de pila y el punto de recogida. Tu teléfono no se comparte.',
                  ],
                  [
                    'escudo',
                    'Para cuidarte',
                    'Guardamos el recorrido de cada viaje para atender emergencias y reclamos.',
                  ],
                  [
                    'mensaje',
                    'Para comunicarnos',
                    'Te escribimos sobre tus viajes y tu cuenta. La publicidad solo con tu permiso aparte.',
                  ],
                ].map(([icono, titulo, texto]) => (
                  <div key={titulo} className="flex gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ty/15 text-ty">
                      <Icono nombre={icono as 'carro'} tamano={20} />
                    </span>
                    <div>
                      <p className="font-extrabold">{titulo}</p>
                      <p className="text-sm text-suave">{texto}</p>
                    </div>
                  </div>
                ))}
                <p className="text-sm text-suave">
                  Puedes ver, corregir o borrar tus datos cuando quieras desde{' '}
                  <b className="text-texto">Cuenta</b>, conforme a la Ley 1581 de 2012.
                </p>
              </Tarjeta>
              <button
                type="button"
                onClick={() => setPolitica(true)}
                className="min-h-11 text-left text-base font-extrabold text-ty underline-offset-4 hover:underline"
              >
                Leer la política de tratamiento de datos
              </button>
              <button
                type="button"
                role="checkbox"
                aria-checked={acepto}
                id="acepto-terminos"
                onClick={() => setAcepto((a) => !a)}
                className="flex items-start gap-3 rounded-2xl border border-borde bg-superficie p-4 text-left"
              >
                <span
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 ${acepto ? 'border-ty bg-ty text-sobre-ty' : 'border-borde'}`}
                >
                  {acepto && <Icono nombre="ok" tamano={18} strokeWidth={3} />}
                </span>
                <span className="font-bold">
                  Acepto los términos de uso y autorizo el tratamiento de mis datos personales.
                </span>
              </button>
              <div className="mt-auto">
                <Boton
                  id="aceptar-terminos"
                  tamano="grande"
                  icono="ok"
                  deshabilitado={!acepto}
                  cargando={aceptar.isPending}
                  alPulsar={() => aceptar.mutate()}
                >
                  Aceptar y empezar
                </Boton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Hoja
        abierta={politica}
        alCerrar={() => setPolitica(false)}
        titulo="Política de tratamiento de datos"
      >
        {politica && <PoliticaDatosVista />}
      </Hoja>
    </main>
  );
}
