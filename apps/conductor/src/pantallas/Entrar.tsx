import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boton } from '@transportaya/ui';
import { Icono } from '@transportaya/ui';
import { Logo } from '@transportaya/ui';
import { useSesion } from '@transportaya/ui';
import { auth, mensajeDe } from '@transportaya/ui';
import { telefonoLegible } from '@transportaya/ui';
import { ding } from '@transportaya/ui';
import { vibrar } from '@transportaya/ui';

/** "300 123 4567" mientras se escribe */
function formatear(digitos: string): string {
  const d = digitos.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
}

export function Entrar() {
  const navegar = useNavigate();
  const guardar = useSesion((s) => s.guardar);
  const [paso, setPaso] = useState<'telefono' | 'codigo'>('telefono');
  const [digitos, setDigitos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [simulado, setSimulado] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const celda = useRef<HTMLInputElement>(null);

  const pedir = useMutation({
    mutationFn: () => auth.pedirCodigo(digitos),
    onSuccess: (r) => {
      setTelefono(r.telefono);
      setSimulado(r.simulado?.codigo ?? null);
      setCodigo('');
      setError(null);
      setPaso('codigo');
    },
    onError: (e) => setError(mensajeDe(e)),
  });

  const verificar = useMutation({
    mutationFn: (c: string) => auth.verificar(telefono, c),
    onSuccess: (r) => {
      ding();
      vibrar('exito');
      guardar({ accessToken: r.accessToken, refreshToken: r.refreshToken, usuario: r.usuario });
      void navegar('/', { replace: true });
    },
    onError: (e) => {
      vibrar('alerta');
      setError(mensajeDe(e));
      setCodigo('');
      celda.current?.focus();
    },
  });

  useEffect(() => {
    if (paso === 'codigo') celda.current?.focus();
  }, [paso]);

  const telefonoValido = /^3\d{9}$/.test(digitos);

  return (
    <main className="fondo-calles area-segura-arriba area-segura-abajo relative flex min-h-dvh flex-col overflow-hidden px-6">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-ty/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 size-80 rounded-full bg-ty/10 blur-3xl" />

      <motion.div
        className="relative mx-auto mt-6 animate-flotar"
        initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 14 }}
      >
        <Logo tamano={210} />
      </motion.div>

      <div className="relative mx-auto mt-2 w-full max-w-md flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {paso === 'telefono' ? (
            <motion.form
              key="telefono"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (telefonoValido) pedir.mutate();
              }}
              className="space-y-5"
            >
              <div className="text-center">
                <h1 className="text-3xl font-black leading-tight">
                  Tú manejas, <span className="texto-marca">tú decides</span>
                </h1>
                <p className="mt-2 text-lg text-suave">
                  Entra con tu celular y empieza a recibir viajes.
                </p>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-extrabold text-suave">
                  Tu número de celular
                </span>
                <div className="flex items-center gap-3 rounded-2xl border-2 border-borde bg-superficie px-4 focus-within:border-ty">
                  <span className="shrink-0 whitespace-nowrap text-xl font-extrabold text-suave">
                    🇨🇴 +57
                  </span>
                  <input
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="300 123 4567"
                    aria-label="Número de celular"
                    value={formatear(digitos)}
                    onChange={(e) => {
                      setDigitos(e.target.value.replace(/\D/g, '').slice(0, 10));
                      setError(null);
                    }}
                    className="numeros min-h-16 w-full bg-transparent text-2xl font-extrabold outline-none placeholder:text-borde"
                  />
                </div>
              </label>

              {error && (
                <p className="rounded-xl bg-peligro/15 px-4 py-3 font-bold text-peligro">{error}</p>
              )}

              <Boton
                type="submit"
                tamano="grande"
                deshabilitado={!telefonoValido}
                cargando={pedir.isPending}
                icono="rayo"
              >
                Recibir mi código
              </Boton>
              <p className="text-center text-sm text-suave">
                Te lo enviamos por WhatsApp. Si no te llega, por mensaje de texto.
              </p>
            </motion.form>
          ) : (
            <motion.div
              key="codigo"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              className="space-y-5"
            >
              <div className="text-center">
                <h1 className="text-3xl font-black">Escribe tu código</h1>
                <p className="mt-2 text-lg text-suave">
                  Lo enviamos al <b className="numeros text-texto">{telefonoLegible(telefono)}</b>
                </p>
              </div>

              <div className="relative" onClick={() => celda.current?.focus()}>
                <div className="flex justify-center gap-2.5">
                  {Array.from({ length: 6 }, (_, i) => {
                    const c = codigo[i];
                    const activa = i === codigo.length && !verificar.isPending;
                    return (
                      <motion.div
                        key={i}
                        animate={
                          c ? { scale: [1.18, 1], borderColor: 'var(--color-ty)' } : { scale: 1 }
                        }
                        className={`numeros grid h-16 w-12 place-items-center rounded-2xl border-2 bg-superficie text-3xl font-black ${activa ? 'border-ty shadow-brillo' : 'border-borde'}`}
                      >
                        {c}
                      </motion.div>
                    );
                  })}
                </div>
                <input
                  ref={celda}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="Código de 6 dígitos"
                  value={codigo}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setCodigo(v);
                    setError(null);
                    if (v.length === 6) verificar.mutate(v);
                  }}
                  className="absolute inset-0 h-full w-full opacity-0"
                />
              </div>

              {simulado && (
                <button
                  type="button"
                  onClick={() => {
                    setCodigo(simulado);
                    verificar.mutate(simulado);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-sol/60 bg-sol/10 px-4 py-3 text-left"
                >
                  <Icono nombre="chispas" className="text-sol" />
                  <span className="flex-1">
                    <span className="block text-xs font-extrabold uppercase tracking-wide text-sol">
                      Modo demostración
                    </span>
                    <span className="block text-sm text-suave">
                      Aún no enviamos mensajes reales. Toca para usar el código
                    </span>
                  </span>
                  <span className="numeros text-2xl font-black text-sol">{simulado}</span>
                </button>
              )}

              {error && (
                <p className="rounded-xl bg-peligro/15 px-4 py-3 text-center font-bold text-peligro">
                  {error}
                </p>
              )}
              {verificar.isPending && <p className="text-center font-bold text-ty">Verificando…</p>}

              <Boton
                variante="fantasma"
                alPulsar={() => {
                  setPaso('telefono');
                  setError(null);
                }}
              >
                Cambiar de número
              </Boton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
