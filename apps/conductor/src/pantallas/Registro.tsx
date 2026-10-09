import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { Boton } from '@transportaya/ui';
import { Chip } from '@transportaya/ui';
import { Hoja, PoliticaDatosVista } from '@transportaya/ui';
import { Icono } from '@transportaya/ui';
import { Logo } from '@transportaya/ui';
import { Tarjeta } from '@transportaya/ui';
import { avisar } from '@transportaya/ui';
import { useSesion } from '@transportaya/ui';
import { api, auth, mensajeDe } from '@transportaya/ui';
import { usePerfil, useSimulador } from '../lib/consultas.ts';
import { primerNombre } from '@transportaya/ui';
import { celebrar } from '@transportaya/ui';
import { ding } from '@transportaya/ui';
import type { CatalogoMarca, Perfil, RequisitoDocumento } from '../lib/tipos.ts';

type IdPaso = Perfil['onboarding']['pasos'][number]['id'];

const COLORES = [
  'Blanco',
  'Negro',
  'Gris',
  'Plata',
  'Rojo',
  'Azul',
  'Verde',
  'Amarillo',
  'Beige',
  'Naranja',
];
const RECARGO_CATEGORIA = {
  media: 'Categoría Media',
  media_alta: 'Categoría Media Alta · +$ 1.000',
  alta: 'Categoría Alta · +$ 2.000',
} as const;

export function Registro() {
  const { data: perfil, isLoading } = usePerfil();
  const estado = perfil?.conductor.estadoHabilitacion;

  if (isLoading || !perfil) return <Cargando />;
  if (estado === 'en_revision') return <EnRevision perfil={perfil} />;
  if (estado === 'suspendido' || estado === 'bloqueado')
    return <Suspendido bloqueado={estado === 'bloqueado'} />;
  return <Asistente perfil={perfil} />;
}

function Cargando() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <div className="animate-pulso-suave">
        <Logo variante="marca" tamano={110} />
      </div>
    </main>
  );
}

function Cabecera({ perfil }: { perfil: Perfil }) {
  const salir = useSesion((s) => s.limpiar);
  return (
    <header className="area-segura-arriba flex items-center justify-between px-5 pb-2">
      <Logo variante="marca" tamano={46} />
      <button
        type="button"
        className="rounded-xl px-3 py-2 text-sm font-extrabold text-suave"
        onClick={() => {
          void auth.salir().catch(() => undefined);
          salir();
        }}
      >
        Salir · {primerNombre(perfil.usuario.nombre || 'Conductor')}
      </button>
    </header>
  );
}

/* ------------------------------------------------------------------ asistente */

function Asistente({ perfil }: { perfil: Perfil }) {
  const pasos = perfil.onboarding.pasos;
  const primeroPendiente = pasos.find((p) => !p.completo)?.id ?? 'revision';
  const [elegido, setElegido] = useState<IdPaso | null>(null);
  const actual = elegido ?? primeroPendiente;
  const indice = pasos.findIndex((p) => p.id === actual);

  return (
    <main className="fondo-calles flex min-h-dvh flex-col overflow-x-hidden">
      <Cabecera perfil={perfil} />
      <div className="px-5 pb-3">
        <h1 className="text-3xl font-black">
          {perfil.conductor.estadoHabilitacion === 'rechazado'
            ? 'Ajustemos tu registro'
            : 'Vamos a dejarte listo'}
        </h1>
        <p className="mt-1 text-suave">Cuatro pasos y empiezas a recibir viajes.</p>
        <ol className="mt-4 flex gap-2" aria-label="Pasos del registro">
          {pasos.map((p, i) => (
            <li key={p.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setElegido(p.id)}
                aria-label={`${p.titulo}${p.completo ? ' (listo)' : ''}`}
                aria-current={i === indice ? 'step' : undefined}
                className="block w-full text-left"
              >
                <motion.div
                  className="h-2.5 rounded-full"
                  animate={{
                    backgroundColor: p.completo
                      ? 'var(--color-ty)'
                      : i === indice
                        ? 'var(--color-ty-oscuro)'
                        : 'var(--color-borde)',
                  }}
                />
                <span
                  className={`mt-1.5 block truncate text-xs font-extrabold ${i === indice ? 'text-texto' : 'text-suave'}`}
                >
                  {p.completo ? '✓ ' : ''}
                  {p.titulo}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex-1 px-5 pb-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={actual}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.22 }}
          >
            {actual === 'datos' && <PasoDatos perfil={perfil} />}
            {actual === 'vehiculo' && <PasoVehiculo perfil={perfil} />}
            {actual === 'documentos' && <PasoDocumentos perfil={perfil} />}
            {actual === 'cuenta' && <PasoCuenta perfil={perfil} />}
            {actual === 'revision' && <PasoRevision perfil={perfil} irA={setElegido} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

function Campo({
  etiqueta,
  children,
  ayuda,
  grupo = false,
}: {
  etiqueta: string;
  children: React.ReactNode;
  ayuda?: string;
  grupo?: boolean;
}) {
  const contenido = (
    <>
      <span className="mb-1.5 block text-sm font-extrabold text-suave">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-sm text-suave">{ayuda}</span>}
    </>
  );
  // Un grupo de botones no puede ir dentro de un <label>: el lector de pantalla lo leería como un solo botón.
  return grupo ? (
    <div role="group" aria-label={etiqueta}>
      {contenido}
    </div>
  ) : (
    <label className="block">{contenido}</label>
  );
}

const ENTRADA =
  'min-h-14 w-full rounded-2xl border-2 border-borde bg-superficie px-4 text-lg font-bold outline-none placeholder:font-semibold placeholder:text-borde focus:border-ty';

function useGuardarPerfil() {
  const qc = useQueryClient();
  return (perfil: Perfil) => qc.setQueryData(['perfil'], perfil);
}

function MensajeError({ texto }: { texto: string | null }) {
  return texto ? (
    <p className="rounded-xl bg-peligro/15 px-4 py-3 font-bold text-peligro">{texto}</p>
  ) : null;
}

/* ------------------------------------------------------------------ 1. datos */

function PasoDatos({ perfil }: { perfil: Perfil }) {
  const poner = useGuardarPerfil();
  const [nombre, setNombre] = useState(perfil.usuario.nombre);
  const [email, setEmail] = useState(perfil.usuario.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: () =>
      api.patch<Perfil>('/v1/conductor/yo', {
        nombre: nombre.trim(),
        email: email.trim() === '' ? null : email.trim(),
      }),
    onSuccess: (p) => {
      poner(p);
      ding();
    },
    onError: (e) => setError(mensajeDe(e)),
  });

  return (
    <div className="space-y-5">
      <Tarjeta className="space-y-4">
        <Campo etiqueta="Tu nombre completo, como aparece en la cédula">
          <input
            className={ENTRADA}
            value={nombre}
            autoComplete="name"
            placeholder="Carlos Andrés Pérez"
            onChange={(e) => setNombre(e.target.value)}
          />
        </Campo>
        <Campo
          etiqueta="Correo electrónico (opcional)"
          ayuda="Te servirá para recuperar tu cuenta y recibir tus comprobantes."
        >
          <input
            className={ENTRADA}
            type="email"
            value={email}
            autoComplete="email"
            placeholder="tucorreo@gmail.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Campo>
      </Tarjeta>
      <MensajeError texto={error} />
      <Boton
        tamano="grande"
        cargando={guardar.isPending}
        deshabilitado={nombre.trim().length < 3}
        alPulsar={() => (setError(null), guardar.mutate())}
        icono="ok"
      >
        Guardar y seguir
      </Boton>
    </div>
  );
}

/* ------------------------------------------------------------------ 2. vehículo */

function PasoVehiculo({ perfil }: { perfil: Perfil }) {
  const poner = useGuardarPerfil();
  const { data: catalogo } = useQuery({
    queryKey: ['catalogo'],
    queryFn: () => api.get<CatalogoMarca[]>('/v1/catalogo-vehiculos'),
    staleTime: Infinity,
  });
  const [marca, setMarca] = useState<string | null>(null);
  const [lineaId, setLineaId] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [marcaManual, setMarcaManual] = useState('');
  const [lineaManual, setLineaManual] = useState('');
  const [anio, setAnio] = useState('');
  const [placa, setPlaca] = useState('');
  const [color, setColor] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lineas = useMemo(
    () => catalogo?.find((m) => m.marca === marca)?.lineas ?? [],
    [catalogo, marca],
  );
  const linea = lineas.find((l) => l.id === lineaId) ?? null;
  const vehiculo = perfil.vehiculos[0];

  const guardar = useMutation({
    mutationFn: () =>
      api.post<{ perfil: Perfil }>('/v1/conductor/vehiculos', {
        placa,
        color,
        modeloAnio: Number(anio),
        ...(manual
          ? { marca: marcaManual.trim(), linea: lineaManual.trim() }
          : { catalogoVehiculoId: lineaId }),
      }),
    onSuccess: (r) => {
      poner(r.perfil);
      ding();
    },
    onError: (e) => setError(mensajeDe(e)),
  });

  if (vehiculo) {
    return (
      <div className="space-y-4">
        <Tarjeta resaltada className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-ty text-sobre-ty">
            <Icono nombre="carro" tamano={30} />
          </div>
          <div className="flex-1">
            <p className="text-xl font-black">
              {vehiculo.marca} {vehiculo.linea}
            </p>
            <p className="numeros font-bold text-suave">
              {vehiculo.placa} · {vehiculo.color} · {vehiculo.modeloAnio}
            </p>
          </div>
        </Tarjeta>
        <Chip tono={vehiculo.fueraDeCatalogo ? 'aviso' : 'ok'}>
          {vehiculo.fueraDeCatalogo
            ? 'Lo revisaremos manualmente'
            : RECARGO_CATEGORIA[vehiculo.categoria]}
        </Chip>
        <p className="text-suave">
          Si necesitas cambiar los datos del vehículo, escríbenos desde Perfil → Ayuda.
        </p>
      </div>
    );
  }

  const anioNum = Number(anio);
  const listo =
    /^[A-Za-z]{3}\s?-?\d{2}[A-Za-z\d]$/.test(placa.trim()) &&
    color &&
    anioNum >= 1990 &&
    (manual ? marcaManual.trim().length >= 2 && lineaManual.trim() !== '' : !!lineaId);

  return (
    <div className="space-y-5">
      <Tarjeta className="space-y-4">
        {!manual ? (
          <>
            <Campo etiqueta="Marca" grupo>
              <div className="-mx-1 flex flex-wrap gap-2 px-1">
                {catalogo?.map((m) => (
                  <button
                    key={m.marca}
                    type="button"
                    onClick={() => (setMarca(m.marca), setLineaId(null))}
                    className={`min-h-11 rounded-full border-2 px-4 text-base font-extrabold ${marca === m.marca ? 'border-ty bg-ty text-sobre-ty' : 'border-borde bg-superficie-2'}`}
                  >
                    {m.marca}
                  </button>
                ))}
              </div>
            </Campo>
            {marca && (
              <Campo etiqueta="Línea" grupo>
                <div className="flex flex-wrap gap-2">
                  {lineas.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLineaId(l.id)}
                      className={`min-h-11 rounded-full border-2 px-4 text-base font-extrabold ${lineaId === l.id ? 'border-ty bg-ty text-sobre-ty' : 'border-borde bg-superficie-2'}`}
                    >
                      {l.linea}
                    </button>
                  ))}
                </div>
              </Campo>
            )}
            {linea && (
              <Chip tono="ok">
                {RECARGO_CATEGORIA[linea.categoria as keyof typeof RECARGO_CATEGORIA] ??
                  linea.categoria}
              </Chip>
            )}
            <button
              type="button"
              className="text-sm font-extrabold text-ty underline-offset-4 hover:underline"
              onClick={() => setManual(true)}
            >
              Mi carro no aparece en la lista
            </button>
          </>
        ) : (
          <>
            <Campo etiqueta="Marca">
              <input
                className={ENTRADA}
                value={marcaManual}
                placeholder="Ej. Chevrolet"
                onChange={(e) => setMarcaManual(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Línea" ayuda="Revisaremos tu vehículo para asignarle la categoría.">
              <input
                className={ENTRADA}
                value={lineaManual}
                placeholder="Ej. Spark GT"
                onChange={(e) => setLineaManual(e.target.value)}
              />
            </Campo>
            <button
              type="button"
              className="text-sm font-extrabold text-ty"
              onClick={() => setManual(false)}
            >
              Volver a la lista
            </button>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Modelo (año)">
            <input
              className={`${ENTRADA} numeros`}
              inputMode="numeric"
              value={anio}
              placeholder="2019"
              onChange={(e) => setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </Campo>
          <Campo etiqueta="Placa">
            <input
              className={`${ENTRADA} numeros uppercase`}
              value={placa}
              placeholder="ABC123"
              maxLength={7}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            />
          </Campo>
        </div>

        <Campo etiqueta="Color" grupo>
          <div className="flex flex-wrap gap-2">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`min-h-11 rounded-full border-2 px-4 text-base font-extrabold ${color === c ? 'border-ty bg-ty text-sobre-ty' : 'border-borde bg-superficie-2'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </Campo>
      </Tarjeta>
      <MensajeError texto={error} />
      <Boton
        tamano="grande"
        icono="carro"
        deshabilitado={!listo}
        cargando={guardar.isPending}
        alPulsar={() => (setError(null), guardar.mutate())}
      >
        Guardar mi vehículo
      </Boton>
    </div>
  );
}

/* ------------------------------------------------------------------ 3. documentos */

const ESTADO_DOC: Record<
  RequisitoDocumento['estado'],
  { texto: string; tono: 'neutro' | 'ok' | 'aviso' | 'malo' | 'info' }
> = {
  falta: { texto: 'Falta', tono: 'neutro' },
  en_revision: { texto: 'En revisión', tono: 'info' },
  rechazado: { texto: 'Rechazado', tono: 'malo' },
  aprobado: { texto: 'Aprobado', tono: 'ok' },
  por_vencer: { texto: 'Por vencer', tono: 'aviso' },
  vencido: { texto: 'Vencido', tono: 'malo' },
};

export function FilaDocumento({
  req,
  vehiculoId,
}: {
  req: RequisitoDocumento;
  vehiculoId: string | undefined;
}) {
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [vence, setVence] = useState('');
  const [error, setError] = useState<string | null>(null);

  const subir = useMutation({
    mutationFn: (archivo: File) => {
      const f = new FormData();
      f.set('tipo', req.tipo);
      if (req.titular === 'vehiculo' && vehiculoId) f.set('vehiculoId', vehiculoId);
      if (req.vence && vence) f.set('venceEn', vence);
      f.set('archivo', archivo);
      return api.postForm('/v1/conductor/documentos', f);
    },
    onSuccess: async () => {
      ding();
      setError(null);
      await qc.invalidateQueries({ queryKey: ['perfil'] });
    },
    onError: (e) => setError(mensajeDe(e)),
  });

  const { texto, tono } = ESTADO_DOC[req.estado];
  const puedeSubir = req.titular === 'conductor' || vehiculoId !== undefined;
  const necesitaFecha = req.vence && !vence;
  const accion =
    req.estado === 'falta' ? 'Subir' : req.estado === 'rechazado' ? 'Subir otra vez' : 'Renovar';

  return (
    <Tarjeta className="space-y-3" data-documento={req.tipo}>
      <div className="flex items-start gap-3">
        <div
          className={`grid size-11 shrink-0 place-items-center rounded-xl ${req.estado === 'aprobado' ? 'bg-ty/15 text-ty' : 'bg-superficie-2 text-suave'}`}
        >
          <Icono
            nombre={
              req.estado === 'aprobado' ? 'ok' : req.titular === 'vehiculo' ? 'carro' : 'archivo'
            }
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold leading-tight">{req.titulo}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Chip tono={tono}>{texto}</Chip>
            {req.venceEn && <span className="numeros text-sm text-suave">vence {req.venceEn}</span>}
          </div>
          {req.motivoRechazo && (
            <p className="mt-1 text-sm font-bold text-peligro">{req.motivoRechazo}</p>
          )}
        </div>
      </div>
      {req.estado !== 'aprobado' && req.estado !== 'en_revision' ? (
        <div className="space-y-2">
          {req.vence && (
            <Campo etiqueta="¿Hasta cuándo está vigente?">
              <input
                type="date"
                className={ENTRADA}
                value={vence}
                onChange={(e) => setVence(e.target.value)}
              />
            </Campo>
          )}
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            data-subir={req.tipo}
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) subir.mutate(archivo);
              e.target.value = '';
            }}
          />
          <Boton
            variante="secundario"
            icono={req.estado === 'falta' ? 'camara' : 'subir'}
            cargando={subir.isPending}
            deshabilitado={!puedeSubir || necesitaFecha}
            alPulsar={() => entrada.current?.click()}
          >
            {puedeSubir
              ? necesitaFecha
                ? 'Primero escribe la fecha de vencimiento'
                : accion
              : 'Primero registra tu vehículo'}
          </Boton>
          <MensajeError texto={error} />
        </div>
      ) : null}
    </Tarjeta>
  );
}

function PasoDocumentos({ perfil }: { perfil: Perfil }) {
  const vehiculoId = perfil.vehiculos.find((v) => v.activo)?.id ?? perfil.vehiculos[0]?.id;
  const { requisitos } = perfil.documentos;
  const listos = requisitos.filter(
    (r) => r.estado === 'aprobado' || r.estado === 'en_revision' || r.estado === 'por_vencer',
  ).length;
  return (
    <div className="space-y-3">
      <Tarjeta resaltada>
        <p className="font-extrabold">
          {listos} de {requisitos.length} documentos cargados
        </p>
        <p className="text-sm text-suave">
          Toma la foto con buena luz y que se lea todo el documento. Aceptamos fotos y PDF.
        </p>
      </Tarjeta>
      {requisitos.map((r) => (
        <FilaDocumento key={`${r.titular}-${r.tipo}`} req={r} vehiculoId={vehiculoId} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ 4. cuenta */

function PasoCuenta({ perfil }: { perfil: Perfil }) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<'llave_bre_b' | 'cuenta_bancaria'>('llave_bre_b');
  const [valor, setValor] = useState('');
  const [banco, setBanco] = useState('');
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: () =>
      api.put('/v1/conductor/cuenta-pago', {
        tipo,
        valor: valor.trim(),
        ...(banco.trim() ? { banco: banco.trim() } : {}),
      }),
    onSuccess: async () => {
      ding();
      await qc.invalidateQueries({ queryKey: ['perfil'] });
    },
    onError: (e) => setError(mensajeDe(e)),
  });

  return (
    <div className="space-y-5">
      {perfil.cuentaPago && (
        <Tarjeta resaltada className="flex items-center gap-3">
          <Icono nombre="ok" className="text-ty" />
          <p className="font-bold">
            Cuenta guardada: <span className="numeros">{perfil.cuentaPago.valorEnmascarado}</span>
          </p>
        </Tarjeta>
      )}
      <Tarjeta className="space-y-4">
        <p className="text-suave">
          Aquí te depositamos tus ganancias de los viajes que pagan con tarjeta. Usa una llave Bre-B
          a tu nombre.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-superficie-2 p-1.5">
          {(['llave_bre_b', 'cuenta_bancaria'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`min-h-12 rounded-xl text-base font-extrabold ${tipo === t ? 'bg-ty text-sobre-ty' : 'text-suave'}`}
            >
              {t === 'llave_bre_b' ? 'Llave Bre-B' : 'Cuenta bancaria'}
            </button>
          ))}
        </div>
        <Campo
          etiqueta={
            tipo === 'llave_bre_b' ? 'Tu llave (celular, correo o alias)' : 'Número de cuenta'
          }
        >
          <input
            className={`${ENTRADA} numeros`}
            value={valor}
            placeholder={tipo === 'llave_bre_b' ? '@micuenta o 3001234567' : '0123456789'}
            onChange={(e) => setValor(e.target.value)}
          />
        </Campo>
        {tipo === 'cuenta_bancaria' && (
          <Campo etiqueta="Banco">
            <input
              className={ENTRADA}
              value={banco}
              placeholder="Bancolombia"
              onChange={(e) => setBanco(e.target.value)}
            />
          </Campo>
        )}
      </Tarjeta>
      <MensajeError texto={error} />
      <Boton
        tamano="grande"
        icono="ok"
        deshabilitado={valor.trim().length < 3}
        cargando={guardar.isPending}
        alPulsar={() => (setError(null), guardar.mutate())}
      >
        Guardar cuenta
      </Boton>
    </div>
  );
}

/* ------------------------------------------------------------------ 5. revisión */

function PasoRevision({ perfil, irA }: { perfil: Perfil; irA: (p: IdPaso) => void }) {
  const poner = useGuardarPerfil();
  const [error, setError] = useState<string | null>(null);
  const enviar = useMutation({
    mutationFn: () => api.post<Perfil>('/v1/conductor/enviar-revision'),
    onSuccess: (p) => {
      poner(p);
      celebrar();
    },
    onError: (e) => setError(mensajeDe(e)),
  });
  const faltantes = perfil.onboarding.pasos.filter((p) => p.id !== 'revision' && !p.completo);
  const [acepto, setAcepto] = useState(perfil.terminos.aceptados);
  const [politica, setPolitica] = useState(false);
  const aceptar = useMutation({
    mutationFn: () =>
      api.post<Perfil>('/v1/conductor/terminos', { version: perfil.terminos.version }),
    onSuccess: (p) => poner(p),
    onError: (e) => setError(mensajeDe(e)),
  });

  return (
    <div className="space-y-5">
      <Tarjeta className="space-y-3">
        {perfil.onboarding.pasos
          .filter((p) => p.id !== 'revision')
          .map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => irA(p.id)}
              className="flex w-full items-center gap-3 text-left"
            >
              <span
                className={`grid size-9 place-items-center rounded-full ${p.completo ? 'bg-ty text-sobre-ty' : 'bg-superficie-2 text-suave'}`}
              >
                <Icono nombre={p.completo ? 'ok' : 'mas'} tamano={20} />
              </span>
              <span className="flex-1 text-lg font-extrabold">{p.titulo}</span>
              <Icono nombre="derecha" className="text-suave" />
            </button>
          ))}
      </Tarjeta>
      {faltantes.length > 0 ? (
        <p className="font-bold text-sol">
          Te falta completar: {faltantes.map((f) => f.titulo.toLowerCase()).join(', ')}.
        </p>
      ) : (
        <p className="text-suave">
          Nuestro equipo revisa tus documentos, normalmente en menos de un día hábil. Te avisamos
          apenas estés listo.
        </p>
      )}
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
        disabled={perfil.terminos.aceptados}
        onClick={() => setAcepto((a) => !a)}
        className="flex items-start gap-3 rounded-2xl border border-borde bg-superficie p-4 text-left"
      >
        <span
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 ${acepto ? 'border-ty bg-ty text-sobre-ty' : 'border-borde'}`}
        >
          {acepto && <Icono nombre="ok" tamano={18} />}
        </span>
        <span className="font-bold">
          Acepto la política de tratamiento de datos y autorizo el uso de mis datos y documentos
          para verificar mi identidad y operar como conductor.
        </span>
      </button>
      <MensajeError texto={error} />
      <Boton
        id="enviar-revision"
        tamano="grande"
        icono="rayo"
        deshabilitado={faltantes.length > 0 || !acepto}
        cargando={enviar.isPending || aceptar.isPending}
        alPulsar={() => {
          setError(null);
          // La autorización se guarda primero; con ella el servidor deja enviar el registro a revisión.
          if (!perfil.terminos.aceptados)
            aceptar.mutate(undefined, { onSuccess: () => enviar.mutate() });
          else enviar.mutate();
        }}
      >
        Enviar a revisión
      </Boton>
      <Hoja
        abierta={politica}
        alCerrar={() => setPolitica(false)}
        titulo="Política de tratamiento de datos"
      >
        {politica && <PoliticaDatosVista />}
      </Hoja>
    </div>
  );
}

/* ------------------------------------------------------------------ en revisión / suspendido */

function EnRevision({ perfil }: { perfil: Perfil }) {
  const qc = useQueryClient();
  const simulador = useSimulador();
  const aprobar = useMutation({
    mutationFn: () => api.post<Perfil>('/v1/dev/conductor/aprobar'),
    onSuccess: (p) => {
      celebrar('grande');
      ding();
      qc.setQueryData(['perfil'], p);
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  return (
    <main className="fondo-calles flex min-h-dvh flex-col">
      <Cabecera perfil={perfil} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="relative grid size-40 place-items-center">
          {[0, 1].map((i) => (
            <span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-ty animate-radar"
              style={{ animationDelay: `${i * 1.4}s` }}
            />
          ))}
          <div className="grid size-28 place-items-center rounded-full bg-ty/15 text-ty">
            <Icono nombre="escudo" tamano={56} />
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-black">¡Recibimos tu registro!</h1>
          <p className="mt-2 text-lg text-suave">
            Estamos revisando tus documentos. Normalmente toma menos de un día hábil. Te avisamos
            por mensaje de texto apenas estés habilitado.
          </p>
        </div>
        {simulador && (
          <Tarjeta className="w-full space-y-3 border-dashed border-sol/60 bg-sol/10">
            <p className="text-xs font-extrabold uppercase tracking-wide text-sol">
              Modo demostración
            </p>
            <p className="text-sm text-suave">
              Aquí aprobaría tus documentos una persona de cumplimiento. Para la prueba lo hacemos
              nosotros.
            </p>
            <Boton
              id="aprobar-demo"
              icono="ok"
              cargando={aprobar.isPending}
              alPulsar={() => aprobar.mutate()}
            >
              Simular aprobación
            </Boton>
          </Tarjeta>
        )}
      </div>
    </main>
  );
}

function Suspendido({ bloqueado }: { bloqueado: boolean }) {
  const salir = useSesion((s) => s.limpiar);
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-md space-y-4">
        <Icono nombre="alerta" tamano={64} className="mx-auto text-sol" />
        <h1 className="text-3xl font-black">
          {bloqueado ? 'Tu cuenta está bloqueada' : 'Tu cuenta está suspendida'}
        </h1>
        <p className="text-lg text-suave">
          Escríbenos por WhatsApp para ayudarte a resolverlo lo antes posible.
        </p>
        <Boton variante="secundario" alPulsar={salir}>
          Salir
        </Boton>
      </div>
    </main>
  );
}
