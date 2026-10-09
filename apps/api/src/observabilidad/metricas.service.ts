import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { conductor, viaje } from '@transportaya/db';
import { ESTADOS_VIAJE, esEstadoFinal } from '@transportaya/dominio';
import { count, inArray, ne } from 'drizzle-orm';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { BaseDeDatos } from '../bd/bd.module.js';

interface Minuto {
  solicitudes: number;
  e4xx: number;
  e5xx: number;
  /** Duraciones en ms, para el percentil 95. Tope por minuto para no crecer sin fin. */
  duraciones: number[];
}

export interface ResumenHttp {
  solicitudes: number;
  errores4xx: number;
  errores5xx: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

const VENTANA_MIN = 60;
const TOPE_MUESTRAS_MIN = 2000;
const ACTIVOS = ESTADOS_VIAJE.filter((e) => !esEstadoFinal(e));

const minutoDe = (t: number) => Math.floor(t / 60_000);

function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  return Math.round(orden[Math.min(orden.length - 1, Math.ceil(p * orden.length) - 1)]! * 10) / 10;
}

/**
 * Medidas del sistema (RNF-82): las que expone `/v1/metricas` en formato Prometheus y las ventanas de los últimos
 * minutos que muestra la pantalla «Sistema» de la App Operación. Cada instancia tiene su propio registro.
 */
@Injectable()
export class MetricasService implements OnModuleDestroy {
  readonly registro = new Registry();
  readonly inicio = Date.now();

  private readonly solicitudes = new Counter({
    name: 'ty_http_solicitudes_total',
    help: 'Solicitudes HTTP atendidas',
    labelNames: ['metodo', 'ruta', 'estado'],
    registers: [this.registro],
  });
  private readonly duracion = new Histogram({
    name: 'ty_http_duracion_segundos',
    help: 'Duración de las solicitudes HTTP',
    labelNames: ['metodo', 'ruta'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registro],
  });
  private readonly tareas = new Counter({
    name: 'ty_tarea_ejecuciones_total',
    help: 'Ejecuciones de las tareas programadas',
    labelNames: ['tarea', 'resultado'],
    registers: [this.registro],
  });
  private readonly tareaExito = new Gauge({
    name: 'ty_tarea_ultimo_exito_timestamp_segundos',
    help: 'Cuándo terminó bien la tarea por última vez',
    labelNames: ['tarea'],
    registers: [this.registro],
  });
  private readonly conexiones = new Gauge({
    name: 'ty_ws_conexiones',
    help: 'Conexiones de tiempo real abiertas',
    labelNames: ['rol'],
    registers: [this.registro],
  });
  private readonly erroresCliente = new Counter({
    name: 'ty_cliente_errores_total',
    help: 'Errores que reportan las apps desde el navegador',
    labelNames: ['app'],
    registers: [this.registro],
  });

  private readonly porRol = new Map<string, number>();
  private readonly minutos = new Map<number, Minuto>();
  private readonly erroresDeApps: number[] = [];
  private cacheNegocio: { t: number; datos: Negocio } | null = null;

  constructor(@Inject(BaseDeDatos) private readonly bd: BaseDeDatos) {
    collectDefaultMetrics({ register: this.registro, prefix: 'ty_nodejs_' });

    const bdPool = this.bd.pool;
    new Gauge({
      name: 'ty_bd_conexiones',
      help: 'Conexiones del pool de PostgreSQL',
      labelNames: ['estado'],
      registers: [this.registro],
      collect() {
        this.set({ estado: 'total' }, bdPool.totalCount);
        this.set({ estado: 'ociosas' }, bdPool.idleCount);
        this.set({ estado: 'esperando' }, bdPool.waitingCount);
      },
    });
    const negocio = () => this.negocio();
    new Gauge({
      name: 'ty_viajes_activos',
      help: 'Viajes que todavía no terminan, por estado',
      labelNames: ['estado'],
      registers: [this.registro],
      async collect() {
        const n = await negocio();
        this.reset();
        for (const [estado, c] of Object.entries(n.viajesActivos)) this.set({ estado }, c);
      },
    });
    new Gauge({
      name: 'ty_conductores',
      help: 'Conductores conectados, por estado operativo',
      labelNames: ['estado'],
      registers: [this.registro],
      async collect() {
        const n = await negocio();
        this.reset();
        for (const [estado, c] of Object.entries(n.conductores)) this.set({ estado }, c);
      },
    });
  }

  onModuleDestroy(): void {
    this.registro.clear();
  }

  /** Cuenta una solicitud terminada. `ruta` es la plantilla (`/v1/viajes/:id`), nunca la dirección real. */
  solicitud(metodo: string, ruta: string, estado: number, ms: number): void {
    this.solicitudes.inc({ metodo, ruta, estado: String(estado) });
    this.duracion.observe({ metodo, ruta }, ms / 1000);
    const k = minutoDe(Date.now());
    let m = this.minutos.get(k);
    if (!m) {
      m = { solicitudes: 0, e4xx: 0, e5xx: 0, duraciones: [] };
      this.minutos.set(k, m);
      for (const viejo of this.minutos.keys())
        if (viejo < k - VENTANA_MIN) this.minutos.delete(viejo);
    }
    m.solicitudes += 1;
    if (estado >= 500) m.e5xx += 1;
    else if (estado >= 400) m.e4xx += 1;
    if (m.duraciones.length < TOPE_MUESTRAS_MIN) m.duraciones.push(ms);
  }

  tarea(nombre: string, resultado: 'ok' | 'error'): void {
    this.tareas.inc({ tarea: nombre, resultado });
    if (resultado === 'ok') this.tareaExito.set({ tarea: nombre }, Date.now() / 1000);
  }

  conexion(rol: string, delta: 1 | -1): void {
    this.conexiones.inc({ rol }, delta);
    this.porRol.set(rol, Math.max(0, (this.porRol.get(rol) ?? 0) + delta));
  }

  conexionesPorRol(): Record<string, number> {
    return Object.fromEntries([...this.porRol].filter(([, n]) => n > 0));
  }

  errorDeApp(app: string): void {
    this.erroresCliente.inc({ app });
    this.erroresDeApps.push(Date.now());
    if (this.erroresDeApps.length > 5000) this.erroresDeApps.splice(0, 1000);
  }

  erroresDeAppsEn(minutos: number): number {
    const desde = Date.now() - minutos * 60_000;
    return this.erroresDeApps.filter((t) => t >= desde).length;
  }

  /** Resumen de las solicitudes de los últimos `minutos` minutos. */
  http(minutos: number): ResumenHttp {
    const desde = minutoDe(Date.now()) - minutos + 1;
    let solicitudes = 0;
    let e4 = 0;
    let e5 = 0;
    const duraciones: number[] = [];
    for (const [k, m] of this.minutos) {
      if (k < desde) continue;
      solicitudes += m.solicitudes;
      e4 += m.e4xx;
      e5 += m.e5xx;
      duraciones.push(...m.duraciones);
    }
    return {
      solicitudes,
      errores4xx: e4,
      errores5xx: e5,
      p50Ms: percentil(duraciones, 0.5),
      p95Ms: percentil(duraciones, 0.95),
    };
  }

  /** Una cifra por minuto, del más viejo al más nuevo, para la gráfica. */
  serie(minutos: number): { minuto: string; solicitudes: number; errores5xx: number }[] {
    const ahora = minutoDe(Date.now());
    return Array.from({ length: minutos }, (_, i) => {
      const k = ahora - (minutos - 1 - i);
      const m = this.minutos.get(k);
      return {
        minuto: new Date(k * 60_000).toISOString(),
        solicitudes: m?.solicitudes ?? 0,
        errores5xx: m?.e5xx ?? 0,
      };
    });
  }

  /** Lo que pasa en el negocio ahora mismo. Se guarda 5 s para que un `scrape` frecuente no cargue la base. */
  async negocio(): Promise<Negocio> {
    if (this.cacheNegocio && Date.now() - this.cacheNegocio.t < 5000)
      return this.cacheNegocio.datos;
    const [viajes, conductores] = await Promise.all([
      this.bd.db
        .select({ estado: viaje.estado, n: count() })
        .from(viaje)
        .where(inArray(viaje.estado, ACTIVOS))
        .groupBy(viaje.estado),
      this.bd.db
        .select({ estado: conductor.estadoOperativo, n: count() })
        .from(conductor)
        .where(ne(conductor.estadoOperativo, 'desconectado'))
        .groupBy(conductor.estadoOperativo),
    ]);
    const datos: Negocio = {
      viajesActivos: Object.fromEntries(viajes.map((v) => [v.estado, Number(v.n)])),
      conductores: Object.fromEntries(conductores.map((c) => [c.estado, Number(c.n)])),
    };
    this.cacheNegocio = { t: Date.now(), datos };
    return datos;
  }
}

export interface Negocio {
  viajesActivos: Record<string, number>;
  conductores: Record<string, number>;
}
