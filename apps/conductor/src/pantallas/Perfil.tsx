import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boton } from '../componentes/ui/Boton.tsx';
import { Chip } from '../componentes/ui/Chip.tsx';
import { Icono } from '../componentes/ui/Icono.tsx';
import { Interruptor } from '../componentes/ui/Interruptor.tsx';
import { Tarjeta } from '../componentes/ui/Tarjeta.tsx';
import { avisar } from '../estado/avisos.ts';
import { useAjustes, type Tema } from '../estado/ajustes.ts';
import { useDemo } from '../estado/demo.ts';
import { useSesion } from '../estado/sesion.ts';
import { api, auth, mensajeDe } from '../lib/api.ts';
import { usePerfil, useSimulador } from '../lib/consultas.ts';
import { distancia, duracion, hora, pesos, primerNombre, telefonoLegible } from '../lib/formato.ts';
import type { Perfil as PerfilTipo, ViajeHistorial } from '../lib/tipos.ts';
import { ding } from '../lib/sonido.ts';
import { FilaDocumento } from './Registro.tsx';

const CATEGORIA = {
  media: 'Media',
  media_alta: 'Media Alta · +$ 1.000',
  alta: 'Alta · +$ 2.000',
} as const;

export function Perfil() {
  const { data: perfil } = usePerfil();
  const salir = useSesion((s) => s.limpiar);
  if (!perfil) return null;
  const v = perfil.vehiculos.find((x) => x.activo) ?? perfil.vehiculos[0];
  const requierenAtencion = perfil.documentos.requisitos.filter((r) =>
    ['por_vencer', 'vencido', 'rechazado', 'falta'].includes(r.estado),
  );

  return (
    <div className="fondo-calles min-h-dvh pb-28">
      <header className="area-segura-arriba flex items-center gap-4 px-5">
        <div className="grid size-16 place-items-center rounded-full bg-ty text-3xl font-black text-sobre-ty shadow-brillo">
          {primerNombre(perfil.usuario.nombre || '?').charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black leading-tight">{perfil.usuario.nombre}</h1>
          <p className="numeros text-suave">{telefonoLegible(perfil.usuario.telefono)}</p>
        </div>
        {perfil.conductor.calificacionPromedio !== null && (
          <Chip tono="aviso">
            <Icono nombre="estrella" tamano={14} relleno />{' '}
            {perfil.conductor.calificacionPromedio.toFixed(1)}
          </Chip>
        )}
      </header>

      <section className="mt-5 space-y-4 px-5">
        {v && (
          <Tarjeta className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-2xl bg-ty/15 text-ty">
              <Icono nombre="carro" tamano={30} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black">
                {v.marca} {v.linea} {v.modeloAnio}
              </p>
              <p className="numeros font-bold text-suave">
                {v.placa} · {v.color}
              </p>
              <div className="mt-1">
                <Chip tono="ok">{v.fueraDeCatalogo ? 'En revisión' : CATEGORIA[v.categoria]}</Chip>
              </div>
            </div>
          </Tarjeta>
        )}

        {requierenAtencion.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-black">Documentos por atender</h2>
            {requierenAtencion.map((r) => (
              <FilaDocumento key={`${r.titular}-${r.tipo}`} req={r} vehiculoId={v?.id} />
            ))}
          </div>
        )}

        <div>
          <h2 className="mb-2 text-xl font-black">Mis documentos</h2>
          <Tarjeta className="divide-y divide-borde p-0">
            {perfil.documentos.requisitos.map((r) => (
              <div key={`${r.titular}-${r.tipo}`} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 font-bold">{r.titulo}</span>
                {r.venceEn && <span className="numeros text-xs text-suave">{r.venceEn}</span>}
                <Chip
                  tono={
                    r.estado === 'aprobado'
                      ? 'ok'
                      : r.estado === 'en_revision'
                        ? 'info'
                        : r.estado === 'por_vencer'
                          ? 'aviso'
                          : r.estado === 'falta'
                            ? 'neutro'
                            : 'malo'
                  }
                >
                  {
                    {
                      aprobado: 'Al día',
                      en_revision: 'Revisando',
                      por_vencer: 'Por vencer',
                      vencido: 'Vencido',
                      rechazado: 'Rechazado',
                      falta: 'Falta',
                    }[r.estado]
                  }
                </Chip>
              </div>
            ))}
          </Tarjeta>
        </div>

        {perfil.cuentaPago && (
          <Tarjeta className="flex items-center gap-3">
            <Icono nombre="billetera" className="text-ty" />
            <div className="flex-1">
              <p className="text-sm font-bold text-suave">Donde te pagamos</p>
              <p className="numeros text-lg font-black">{perfil.cuentaPago.valorEnmascarado}</p>
            </div>
          </Tarjeta>
        )}

        <Preferencias perfil={perfil} />
        <Historial />
        <Demostracion />

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
        <p className="pb-2 text-center text-xs text-suave">
          TransporteYa Conductor · versión de prueba
        </p>
      </section>
    </div>
  );
}

function Preferencias({ perfil }: { perfil: PerfilTipo }) {
  const qc = useQueryClient();
  const a = useAjustes();
  const cambiarPerfil = useMutation({
    mutationFn: (parcial: { aceptaCategoriaInferior?: boolean; aceptaIntermunicipal?: boolean }) =>
      api.patch<PerfilTipo>('/v1/conductor/yo', parcial),
    onSuccess: (p) => qc.setQueryData(['perfil'], p),
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  return (
    <div>
      <h2 className="mb-2 text-xl font-black">Preferencias</h2>
      <Tarjeta className="divide-y divide-borde py-1">
        <Interruptor
          activo={a.sonido}
          alCambiar={(v) => a.cambiar({ sonido: v })}
          etiqueta="Sonidos"
          descripcion="Timbre de oferta y avisos"
        />
        <Interruptor
          activo={a.vibracion}
          alCambiar={(v) => a.cambiar({ vibracion: v })}
          etiqueta="Vibración"
        />
        <Interruptor
          activo={perfil.conductor.aceptaCategoriaInferior}
          alCambiar={(v) => cambiarPerfil.mutate({ aceptaCategoriaInferior: v })}
          etiqueta="Aceptar viajes de categoría inferior"
          descripcion="Recibes más ofertas, con la tarifa de esa categoría"
        />
        <Interruptor
          activo={perfil.conductor.aceptaIntermunicipal}
          alCambiar={(v) => cambiarPerfil.mutate({ aceptaIntermunicipal: v })}
          etiqueta="Viajes entre ciudades"
          descripcion="Rutas nacionales con tarifa fija"
        />
        <div className="py-3">
          <p className="mb-2 text-lg font-extrabold">Tema</p>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-superficie-2 p-1.5">
            {(['auto', 'oscuro', 'claro'] as Tema[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => a.cambiar({ tema: t })}
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-extrabold ${a.tema === t ? 'bg-ty text-sobre-ty' : 'text-suave'}`}
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
        <div className="py-3">
          <p className="mb-2 text-lg font-extrabold">Meta diaria</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Bajar meta"
              className="grid size-12 place-items-center rounded-xl bg-superficie-2"
              onClick={() => a.cambiar({ metaDia: Math.max(20_000, a.metaDia - 10_000) })}
            >
              <Icono nombre="menos" />
            </button>
            <span className="numeros flex-1 text-center text-2xl font-black">
              {pesos(a.metaDia)}
            </span>
            <button
              type="button"
              aria-label="Subir meta"
              className="grid size-12 place-items-center rounded-xl bg-superficie-2"
              onClick={() => a.cambiar({ metaDia: Math.min(1_000_000, a.metaDia + 10_000) })}
            >
              <Icono nombre="mas" />
            </button>
          </div>
        </div>
      </Tarjeta>
    </div>
  );
}

function Historial() {
  const { data } = useQuery({
    queryKey: ['historial'],
    queryFn: () => api.get<{ viajes: ViajeHistorial[] }>('/v1/conductor/viajes?limite=10'),
  });
  const viajes = data?.viajes ?? [];
  if (viajes.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 text-xl font-black">Últimos viajes</h2>
      <Tarjeta className="divide-y divide-borde p-0">
        {viajes.map((v) => (
          <div key={v.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${v.estado === 'finalizado' ? 'bg-ty/15 text-ty' : 'bg-superficie-2 text-suave'}`}
            >
              <Icono nombre={v.estado === 'finalizado' ? 'ok' : 'cerrar'} tamano={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold leading-tight">{v.destino ?? v.codigo}</p>
              <p className="text-xs text-suave">
                {v.codigo}
                {v.finalizadoEn ? ` · ${hora(v.finalizadoEn)}` : ''}
                {v.distanciaM ? ` · ${distancia(v.distanciaM)}` : ''}
                {v.duracionS ? ` · ${duracion(v.duracionS)}` : ''}
              </p>
            </div>
            <span className="numeros font-black">
              {v.gananciaNeta !== null
                ? pesos(v.gananciaNeta)
                : v.estado === 'cancelado'
                  ? 'Cancelado'
                  : '—'}
            </span>
          </div>
        ))}
      </Tarjeta>
    </div>
  );
}

/* ------------------------------------------------------------------ herramientas de demostración */

function Demostracion() {
  const simulador = useSimulador();
  const qc = useQueryClient();
  const a = useAjustes();
  const refrescar = () =>
    Promise.all(
      ['perfil', 'saldo', 'ganancias', 'movimientos', 'cierres'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );

  const pasajero = useMutation({
    mutationFn: (cuerpo: {
      nacional?: boolean;
      distanciaKm?: number;
      metodoPago?: 'efectivo' | 'tarjeta';
    }) => api.post<{ viajeId: string; pin: string }>('/v1/dev/pasajeros/viaje', cuerpo),
    onSuccess: (r) => {
      useDemo.getState().guardarPin(r.viajeId, r.pin);
      ding();
      avisar('Un pasajero de prueba pidió un viaje cerca de ti', 'info');
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  const cierre = useMutation({
    mutationFn: () => api.post('/v1/dev/cierre', { rehacer: true }),
    onSuccess: async () => {
      avisar('Cierre del día calculado', 'exito');
      await refrescar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });
  const entregar = useMutation({
    mutationFn: () => api.post<{ pagos: number; total: number }>('/v1/dev/pagos/entregar'),
    onSuccess: async (r) => {
      avisar(
        r.pagos > 0 ? `El banco te consignó ${pesos(r.total)}` : 'No tienes pagos pendientes',
        'exito',
      );
      await refrescar();
    },
    onError: (e) => avisar(mensajeDe(e), 'error'),
  });

  if (!simulador) return null;
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-xl font-black">
        <Icono nombre="chispas" className="text-sol" /> Modo demostración
      </h2>
      <Tarjeta className="space-y-3 border-dashed border-sol/60 bg-sol/5">
        <p className="text-sm text-suave">
          Estas herramientas simulan pasajeros, el GPS y los bancos para probar la app sin salir a
          la calle.
        </p>
        <Interruptor
          activo={a.gpsSimulado}
          alCambiar={(v) => a.cambiar({ gpsSimulado: v })}
          etiqueta="GPS simulado"
          descripcion="El carro se mueve solo hacia la recogida y el destino"
        />
        {a.gpsSimulado && (
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-superficie-2 p-1.5">
            {([1, 2, 4] as const).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => a.cambiar({ velocidadSimulada: x })}
                className={`min-h-11 rounded-xl text-sm font-extrabold ${a.velocidadSimulada === x ? 'bg-ty text-sobre-ty' : 'text-suave'}`}
              >
                {x === 1 ? '30 km/h' : x === 2 ? '60 km/h' : '120 km/h'}
              </button>
            ))}
          </div>
        )}
        <Boton
          id="demo-pasajero"
          variante="secundario"
          icono="usuario"
          cargando={pasajero.isPending}
          alPulsar={() => pasajero.mutate({ distanciaKm: 3, metodoPago: 'efectivo' })}
        >
          Pasajero cerca (3 km, efectivo)
        </Boton>
        <Boton
          id="demo-pasajero-tarjeta"
          variante="secundario"
          icono="tarjeta"
          cargando={pasajero.isPending}
          alPulsar={() => pasajero.mutate({ distanciaKm: 5, metodoPago: 'tarjeta' })}
        >
          Pasajero cerca (5 km, tarjeta)
        </Boton>
        <Boton
          id="demo-nacional"
          variante="secundario"
          icono="navegar"
          cargando={pasajero.isPending}
          alPulsar={() => pasajero.mutate({ nacional: true })}
        >
          Viaje nacional a ruta fija
        </Boton>
        <Boton
          id="demo-cierre"
          variante="secundario"
          icono="reloj"
          cargando={cierre.isPending}
          alPulsar={() => cierre.mutate()}
        >
          Hacer el cierre del día ahora
        </Boton>
        <Boton
          id="demo-entregar"
          variante="secundario"
          icono="billetera"
          cargando={entregar.isPending}
          alPulsar={() => entregar.mutate()}
        >
          Que el banco me consigne
        </Boton>
      </Tarjeta>
    </div>
  );
}
