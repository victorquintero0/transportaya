import {
  Boton,
  Chip,
  Hoja,
  Icono,
  Interruptor,
  PanelPrivacidad,
  Tarjeta,
  api,
  auth,
  avisar,
  mensajeDe,
  primerNombre,
  telefonoLegible,
  useSesion,
  type NombreIcono,
} from '@transportaya/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAjustes } from '../estado/ajustes.ts';
import { usePedido } from '../estado/pedido.ts';
import { useEmpresa, usePerfil, useSimulador } from '../lib/consultas.ts';
import { CENTRO_MANIZALES, useUbicacion } from '../servicios/ubicacion.ts';

const ENTRADA =
  'min-h-14 w-full rounded-2xl border-2 border-borde bg-superficie px-4 text-lg font-bold outline-none placeholder:font-semibold placeholder:text-borde focus:border-ty';

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xl font-black">{titulo}</h2>
      {children}
    </section>
  );
}

/** PAS-60: invitaciones de empresas y la empresa a la que pertenece la persona. */
function MiEmpresa() {
  const qc = useQueryClient();
  const { data } = useEmpresa();
  const cambiar = useMutation({
    mutationFn: ({ ruta }: { ruta: string }) => api.post(ruta),
    onSuccess: (_r, { ruta }) => {
      void qc.invalidateQueries({ queryKey: ['empresa'] });
      avisar(
        ruta.includes('aceptar')
          ? 'Listo: ya puedes cargar viajes a tu empresa'
          : ruta.includes('salir')
            ? 'Saliste de la empresa'
            : 'Rechazaste la invitación',
        'exito',
      );
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  if (!data || (!data.vinculo && data.invitaciones.length === 0)) return null;
  return (
    <Seccion titulo="Mi empresa">
      <div className="space-y-3" id="mi-empresa">
        {data.invitaciones.map((i) => (
          <Tarjeta
            key={i.id}
            className="space-y-3 border-ty/50 bg-ty/5"
            data-invitacion={i.empresa}
          >
            <p className="font-extrabold">
              {i.empresa} te invitó a cargar tus viajes de trabajo a la empresa.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Boton
                id={`aceptar-invitacion`}
                alPulsar={() =>
                  cambiar.mutate({ ruta: `/v1/pasajero/empresa/invitaciones/${i.id}/aceptar` })
                }
              >
                Aceptar
              </Boton>
              <Boton
                variante="secundario"
                alPulsar={() =>
                  cambiar.mutate({ ruta: `/v1/pasajero/empresa/invitaciones/${i.id}/rechazar` })
                }
              >
                Rechazar
              </Boton>
            </div>
          </Tarjeta>
        ))}
        {data.vinculo && (
          <Tarjeta className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-ty/15 text-ty">
                <Icono nombre="maletin" tamano={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold" id="nombre-empresa">
                  {data.vinculo.empresa.nombre}
                </span>
                <span className="block text-sm text-suave">
                  {data.vinculo.perfilDisponible
                    ? 'Perfil corporativo activo: elige «Empresa» al pagar'
                    : (data.vinculo.razon ?? 'Perfil corporativo no disponible')}
                </span>
              </span>
              <Chip tono={data.vinculo.perfilDisponible ? 'ok' : 'aviso'}>
                {data.vinculo.perfilDisponible ? 'Activo' : 'Suspendido'}
              </Chip>
            </div>
            <Boton
              variante="fantasma"
              id="salir-empresa"
              alPulsar={() => cambiar.mutate({ ruta: '/v1/pasajero/empresa/salir' })}
            >
              Salir de la empresa
            </Boton>
          </Tarjeta>
        )}
      </div>
    </Seccion>
  );
}

function Enlace({
  a,
  icono,
  titulo,
  detalle,
  insignia,
}: {
  a: string;
  icono: NombreIcono;
  titulo: string;
  detalle?: string;
  insignia?: string;
}) {
  return (
    <Link to={a} className="flex min-h-16 items-center gap-3 px-4 py-2">
      <span className="grid size-10 place-items-center rounded-xl bg-ty/15 text-ty">
        <Icono nombre={icono} tamano={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold">{titulo}</span>
        {detalle && <span className="block truncate text-sm text-suave">{detalle}</span>}
      </span>
      {insignia && <Chip tono="aviso">{insignia}</Chip>}
      <Icono nombre="derecha" className="text-suave" tamano={20} />
    </Link>
  );
}

export function Cuenta() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const { data: perfil } = usePerfil();
  const ajustes = useAjustes();
  const salir = useSesion((s) => s.limpiar);
  const simulador = useSimulador();
  const [editando, setEditando] = useState(false);
  const [contacto, setContacto] = useState(false);
  const [eliminar, setEliminar] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [cNombre, setCNombre] = useState('');
  const [cTel, setCTel] = useState('');

  const refrescar = () => qc.invalidateQueries({ queryKey: ['perfil'] });

  const guardar = useMutation({
    mutationFn: () =>
      api.patch('/v1/pasajero/yo', {
        nombre: nombre.trim(),
        email: email.trim() === '' ? null : email.trim(),
      }),
    onSuccess: async () => {
      setEditando(false);
      avisar('Guardamos tus datos', 'exito');
      await refrescar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  const agregarContacto = useMutation({
    mutationFn: () =>
      api.post('/v1/pasajero/contactos', { nombre: cNombre.trim(), telefono: cTel.trim() }),
    onSuccess: async () => {
      setContacto(false);
      setCNombre('');
      setCTel('');
      avisar('Contacto agregado', 'exito');
      await refrescar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  const quitarContacto = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/pasajero/contactos/${id}`),
    onSuccess: refrescar,
  });
  const quitarLugar = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/pasajero/lugares-guardados/${id}`),
    onSuccess: refrescar,
  });
  const eliminarCuenta = useMutation({
    mutationFn: () => api.delete('/v1/pasajero/cuenta'),
    onSuccess: () => {
      avisar('Eliminamos tu cuenta. Ojalá volvamos a vernos.', 'info');
      salir();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  const demo = useMutation({
    mutationFn: (accion: 'crear' | 'detener') => {
      const o = usePedido.getState().origen ?? useUbicacion.getState().posicion ?? CENTRO_MANIZALES;
      return accion === 'crear'
        ? api.post('/v1/dev/conductores-simulados', {
            lat: o.lat,
            lng: o.lng,
            cantidad: 3,
            velocidadMs: 22,
            cercaM: 1000,
          })
        : api.delete('/v1/dev/conductores-simulados');
    },
    onSuccess: (_r, accion) =>
      avisar(
        accion === 'crear'
          ? 'Hay 3 conductores de prueba cerca de ti'
          : 'Quitamos los conductores de prueba',
        'exito',
      ),
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  if (!perfil) return null;
  const u = perfil.usuario;

  return (
    <div className="fondo-calles min-h-dvh pb-28">
      <header className="area-segura-arriba flex items-center gap-4 px-5">
        <span className="grid size-16 place-items-center rounded-full bg-ty text-3xl font-black text-sobre-ty shadow-brillo">
          {primerNombre(u.nombre || '?').charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black leading-tight">{u.nombre}</h1>
          <p className="numeros text-suave">{telefonoLegible(u.telefono)}</p>
        </div>
        <button
          type="button"
          aria-label="Editar mis datos"
          onClick={() => {
            setNombre(u.nombre);
            setEmail(u.email ?? '');
            setEditando(true);
          }}
          className="grid size-11 place-items-center rounded-full bg-superficie-2"
        >
          <Icono nombre="editar" tamano={20} />
        </button>
      </header>

      <div className="mt-5 space-y-6 px-5">
        <Tarjeta className="divide-y divide-borde p-0">
          <Enlace
            a="/pagos"
            icono="tarjeta"
            titulo="Pagos"
            detalle={
              perfil.metodosPago.length
                ? `${perfil.metodosPago.length} tarjeta${perfil.metodosPago.length > 1 ? 's' : ''} · efectivo`
                : 'Efectivo'
            }
            insignia={perfil.deuda > 0 ? 'Pendiente' : undefined}
          />
          <Enlace
            a="/ayuda"
            icono="ayuda"
            titulo="Ayuda"
            detalle="Reportes, objetos perdidos y soporte"
          />
        </Tarjeta>

        <MiEmpresa />

        <Seccion titulo="Mis lugares">
          <Tarjeta className="divide-y divide-borde p-0">
            {perfil.lugares.map((l) => (
              <div key={l.id} className="flex min-h-16 items-center gap-3 px-4 py-2">
                <span className="grid size-10 place-items-center rounded-xl bg-superficie-2 text-suave">
                  <Icono
                    nombre={
                      l.etiqueta.toLowerCase() === 'casa'
                        ? 'inicio'
                        : l.etiqueta.toLowerCase() === 'trabajo'
                          ? 'maletin'
                          : 'estrella'
                    }
                    tamano={20}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{l.etiqueta}</span>
                  <span className="block truncate text-sm text-suave">{l.direccion}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${l.etiqueta}`}
                  onClick={() => quitarLugar.mutate(l.id)}
                  className="grid size-11 place-items-center text-suave"
                >
                  <Icono nombre="basura" tamano={20} />
                </button>
              </div>
            ))}
            {(['casa', 'trabajo'] as const)
              .filter((e) => !perfil.lugares.some((l) => l.etiqueta.toLowerCase() === e))
              .map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => void navegar(`/destino?campo=${e}`)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 text-left font-extrabold text-ty"
                >
                  <Icono nombre="mas" tamano={20} /> Agregar {e}
                </button>
              ))}
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Contactos de confianza">
          <Tarjeta className="space-y-3">
            <p className="text-sm text-suave">
              Si usas el botón SOS durante un viaje, les avisamos con el enlace para seguirte en
              vivo.
            </p>
            {perfil.contactos.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-ty/15 font-black text-ty">
                  {c.nombre.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{c.nombre}</span>
                  <span className="numeros block text-sm text-suave">
                    {telefonoLegible(c.telefono)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Quitar a ${c.nombre}`}
                  onClick={() => quitarContacto.mutate(c.id)}
                  className="grid size-11 place-items-center text-suave"
                >
                  <Icono nombre="basura" tamano={20} />
                </button>
              </div>
            ))}
            {perfil.contactos.length < 5 && (
              <Boton
                id="agregar-contacto"
                variante="secundario"
                icono="mas"
                alPulsar={() => setContacto(true)}
              >
                Agregar contacto
              </Boton>
            )}
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Preferencias">
          <Tarjeta className="divide-y divide-borde py-1">
            <Interruptor
              activo={ajustes.sonido}
              alCambiar={(v) => ajustes.cambiar({ sonido: v })}
              etiqueta="Sonidos"
              descripcion="Avisos cuando tu conductor llega"
            />
            <Interruptor
              activo={ajustes.vibracion}
              alCambiar={(v) => ajustes.cambiar({ vibracion: v })}
              etiqueta="Vibración"
            />
            <div className="py-3">
              <p className="mb-2 text-lg font-extrabold">Tema</p>
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-superficie-2 p-1.5">
                {(['auto', 'oscuro', 'claro'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => ajustes.cambiar({ tema: t })}
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-extrabold ${ajustes.tema === t ? 'bg-ty text-sobre-ty' : 'text-suave'}`}
                  >
                    <Icono
                      nombre={t === 'claro' ? 'sol' : t === 'oscuro' ? 'luna' : 'chispas'}
                      tamano={16}
                    />
                    {t === 'auto' ? 'Auto' : t === 'oscuro' ? 'Noche' : 'Día'}
                  </button>
                ))}
              </div>
            </div>
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Mis datos y privacidad">
          <PanelPrivacidad>
            <Boton
              id="eliminar-cuenta"
              variante="fantasma"
              icono="basura"
              alPulsar={() => setEliminar(true)}
            >
              Eliminar mi cuenta
            </Boton>
          </PanelPrivacidad>
        </Seccion>

        {simulador && (
          <Seccion titulo="Modo demostración">
            <Tarjeta className="space-y-3 border-dashed border-sol/60 bg-sol/5">
              <p className="text-sm text-suave">
                Todavía no hay conductores reales. Aquí aparecen unos de prueba que atienden tus
                viajes de punta a punta, y puedes probar tarjetas y pagos.
              </p>
              <Boton
                id="demo-conductores"
                variante="secundario"
                icono="carro"
                cargando={demo.isPending}
                alPulsar={() => demo.mutate('crear')}
              >
                Poner conductores de prueba cerca
              </Boton>
              <Boton variante="fantasma" alPulsar={() => demo.mutate('detener')}>
                Quitar conductores de prueba
              </Boton>
            </Tarjeta>
          </Seccion>
        )}

        <Boton
          variante="secundario"
          icono="salir"
          alPulsar={() => {
            void auth.salir().catch(() => undefined);
            salir();
          }}
        >
          Cerrar sesión
        </Boton>
        <p className="pb-2 text-center text-xs text-suave">TransporteYa · versión de prueba</p>
      </div>

      <Hoja abierta={editando} alCerrar={() => setEditando(false)} titulo="Mis datos">
        <div className="space-y-3 pb-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-extrabold text-suave">Nombre</span>
            <input className={ENTRADA} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-extrabold text-suave">
              Correo para recibos
            </span>
            <input
              className={ENTRADA}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <Boton
            icono="ok"
            deshabilitado={nombre.trim().length < 3}
            cargando={guardar.isPending}
            alPulsar={() => guardar.mutate()}
          >
            Guardar
          </Boton>
        </div>
      </Hoja>

      <Hoja abierta={contacto} alCerrar={() => setContacto(false)} titulo="Contacto de confianza">
        <div className="space-y-3 pb-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-extrabold text-suave">Nombre</span>
            <input
              id="contacto-nombre"
              className={ENTRADA}
              value={cNombre}
              placeholder="Mamá"
              onChange={(e) => setCNombre(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-extrabold text-suave">Celular</span>
            <input
              id="contacto-celular"
              className={`${ENTRADA} numeros`}
              inputMode="tel"
              value={cTel}
              placeholder="310 555 1111"
              onChange={(e) => setCTel(e.target.value)}
            />
          </label>
          <Boton
            id="guardar-contacto"
            icono="ok"
            deshabilitado={cNombre.trim().length < 2 || cTel.replace(/\D/g, '').length < 10}
            cargando={agregarContacto.isPending}
            alPulsar={() => agregarContacto.mutate()}
          >
            Guardar contacto
          </Boton>
        </div>
      </Hoja>

      <Hoja abierta={eliminar} alCerrar={() => setEliminar(false)} titulo="¿Eliminar tu cuenta?">
        <div className="space-y-4 pb-4">
          <p className="text-lg text-suave">
            Borramos tus datos personales, tus tarjetas y tus lugares. Los viajes que hiciste se
            conservan sin tu nombre por obligaciones contables. No se puede deshacer.
          </p>
          <Boton
            id="confirmar-eliminar"
            variante="peligro"
            tamano="grande"
            cargando={eliminarCuenta.isPending}
            alPulsar={() => eliminarCuenta.mutate()}
          >
            Sí, eliminar mi cuenta
          </Boton>
          <Boton variante="secundario" alPulsar={() => setEliminar(false)}>
            Mejor no
          </Boton>
        </div>
      </Hoja>
    </div>
  );
}
