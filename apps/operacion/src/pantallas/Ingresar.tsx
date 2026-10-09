import { ErrorApi, MarcaAnimada, api, mensajeDe, useSesion } from '@transportaya/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boton, Campo, Entrada, Insignia } from '../componentes/ui.tsx';
import type { PerfilOperador } from '../lib/tipos.ts';

interface Demo {
  contrasena: string;
  cuentas: { rol: string; etiqueta: string; nombre: string; email: string; codigo: string }[];
}
interface Inscripcion {
  secreto: string;
  uri: string;
  simulado?: { codigo: string };
}
interface Respuesta {
  accessToken: string;
  refreshToken: string;
  usuario: PerfilOperador;
}

/** Correo + contraseña + código de la app de autenticación (RNF-43). */
export function Ingresar() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [codigo, setCodigo] = useState('');
  const [paso, setPaso] = useState<'credenciales' | 'codigo' | 'configurar'>('credenciales');
  const [inscripcion, setInscripcion] = useState<Inscripcion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);

  const { data: demo } = useQuery({
    queryKey: ['demo-operacion'],
    queryFn: () => api.get<Demo>('/v1/op/auth/demo'),
    retry: false,
    staleTime: 0,
    refetchInterval: 10_000, // los códigos de demostración cambian cada 30 s
  });

  async function enviar(e: { email: string; contrasena: string; codigo?: string }) {
    setEnCurso(true);
    setError(null);
    try {
      const r = await api.post<Respuesta>('/v1/op/auth/ingresar', e);
      useSesion.getState().guardar({ accessToken: r.accessToken, refreshToken: r.refreshToken });
      qc.setQueryData(['yo'], r.usuario);
      void navegar('/', { replace: true });
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'TOTP_REQUERIDO') {
        setPaso('codigo');
      } else if (err instanceof ErrorApi && err.codigo === 'TOTP_NO_CONFIGURADO') {
        try {
          setInscripcion(await api.post<Inscripcion>('/v1/op/auth/enrolar', e));
          setPaso('configurar');
        } catch (e2) {
          setError(mensajeDe(e2));
        }
      } else {
        setError(mensajeDe(err));
        if (paso === 'codigo' || paso === 'configurar') setCodigo('');
      }
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-[1fr_20rem]">
        <section className="rounded-2xl border border-borde bg-superficie p-8">
          <MarcaAnimada modo="armar" ancho={150} />
          <h1 className="mt-6 text-2xl font-extrabold">Ingreso a Operación</h1>
          <p className="mt-1 text-sm text-suave">
            Personal autorizado de TransporteYa. Cada ingreso pide tu contraseña y un código de tu
            app de autenticación.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              void enviar({ email, contrasena, ...(codigo ? { codigo } : {}) });
            }}
          >
            {paso === 'credenciales' && (
              <>
                <Campo etiqueta="Correo">
                  <Entrada
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Campo>
                <Campo etiqueta="Contraseña">
                  <Entrada
                    id="contrasena"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                  />
                </Campo>
              </>
            )}

            {paso === 'configurar' && inscripcion && (
              <div className="space-y-3 rounded-xl border border-ty/40 bg-ty/10 p-4 text-sm">
                <p className="font-bold">Configura tu segundo factor</p>
                <ol className="list-decimal space-y-1 pl-5 text-suave">
                  <li>
                    Abre tu app de autenticación (Google Authenticator, Microsoft Authenticator,
                    1Password…).
                  </li>
                  <li>Agrega una cuenta con esta clave:</li>
                </ol>
                <code
                  id="secreto-totp"
                  className="block break-all rounded-lg bg-fondo px-3 py-2 text-base font-extrabold tracking-widest"
                >
                  {inscripcion.secreto.replace(/(.{4})/g, '$1 ').trim()}
                </code>
                <a className="text-xs font-bold text-ty underline" href={inscripcion.uri}>
                  Abrir en la app de autenticación
                </a>
                {inscripcion.simulado && (
                  <p className="text-xs text-sol">
                    Modo demostración: el código de ahora es{' '}
                    <b id="codigo-simulado">{inscripcion.simulado.codigo}</b>
                  </p>
                )}
              </div>
            )}

            {(paso === 'codigo' || paso === 'configurar') && (
              <Campo etiqueta="Código de 6 dígitos">
                <Entrada
                  id="codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-xl font-extrabold tracking-[0.5em]"
                />
              </Campo>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-peligro/15 px-3 py-2 text-sm font-semibold text-peligro"
              >
                {error}
              </p>
            )}
            <Boton
              id="entrar"
              type="submit"
              variante="primario"
              cargando={enCurso}
              className="w-full"
              deshabilitado={paso !== 'credenciales' && codigo.length !== 6}
            >
              {paso === 'credenciales' ? 'Continuar' : 'Entrar'}
            </Boton>
            {paso !== 'credenciales' && (
              <Boton
                variante="fantasma"
                className="w-full"
                onClick={() => {
                  setPaso('credenciales');
                  setCodigo('');
                  setError(null);
                }}
              >
                Volver
              </Boton>
            )}
          </form>
        </section>

        {demo && (
          <aside className="rounded-2xl border border-sol/40 bg-sol/10 p-5" id="cuentas-demo">
            <Insignia tono="aviso">Modo demostración</Insignia>
            <p className="mt-2 text-sm text-suave">
              Entra con un clic con la cuenta de cada rol. Estas cuentas solo existen con el
              simulador activo.
            </p>
            <div className="mt-3 space-y-2">
              {demo.cuentas.map((c) => (
                <button
                  key={c.rol}
                  type="button"
                  data-rol={c.rol}
                  disabled={enCurso}
                  onClick={() =>
                    void enviar({ email: c.email, contrasena: demo.contrasena, codigo: c.codigo })
                  }
                  className="flex w-full items-center justify-between rounded-lg border border-borde bg-superficie px-3 py-2 text-left text-sm hover:border-ty disabled:opacity-50"
                >
                  <span>
                    <b>{c.etiqueta}</b>
                    <span className="block text-xs text-suave">{c.nombre}</span>
                  </span>
                  <span className="text-xs font-bold text-ty">Entrar</span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
