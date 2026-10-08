import type { Permiso, RolInterno } from '@transportaya/dominio';

export interface PerfilOperador {
  id: string;
  nombre: string;
  email: string;
  roles: RolInterno[];
  permisos: Permiso[];
}

export interface Pagina<T> {
  total: number;
  items: T[];
}

export type Semaforo = 'verde' | 'ambar' | 'rojo';
export interface Coord {
  lat: number;
  lng: number;
}

export interface ViajeActivo {
  id: string;
  codigo: string;
  estado: string;
  segundosEnEstado: number;
  semaforo: Semaforo;
  pasajero: string;
  conductor: string | null;
  conductorId: string | null;
  placa: string | null;
  origen: Coord;
  destino: Coord;
  origenDireccion: string | null;
  destinoDireccion: string | null;
  categoria: string;
  tipoServicio: string;
  metodoPago: string;
  alertas: number;
}

export interface ConductorFlota {
  id: string;
  nombre: string;
  estado: string;
  placa: string | null;
  categoria: string | null;
  viaje: string | null;
  posicion: (Coord & { edadS: number }) | null;
}

export interface Alerta {
  id: string;
  tipo: string;
  severidad: 'critica' | 'alta' | 'media' | 'baja';
  estado: 'abierta' | 'tomada' | 'cerrada';
  viajeId: string | null;
  codigoViaje: string | null;
  conductorId: string | null;
  conductor: string | null;
  datos: Record<string, unknown>;
  tomadaPor: string | null;
  tomadaPorNombre: string | null;
  notaCierre: string | null;
  creadaEn: string;
}

export interface Torre {
  generadoEn: string;
  kpis: {
    conductoresEnLinea: number;
    conductoresDisponibles: number;
    conductoresOcupados: number;
    conductoresSinSenal: number;
    viajesActivos: number;
    solicitudesUltimaHora: number;
    asignacionMediaS: number | null;
    tasaCancelacion: number;
    demandaInsatisfechaUltimaHora: number;
    alertasAbiertas: number;
  };
  flota: ConductorFlota[];
  viajesActivos: ViajeActivo[];
  sinAsignar: ViajeActivo[];
  alertas: Alerta[];
}

export interface ViajeFila {
  id: string;
  codigo: string;
  estado: string;
  solicitadoEn: string;
  tipoServicio: string;
  categoria: string;
  metodoPago: string;
  origenDireccion: string | null;
  destinoDireccion: string | null;
  precio: number;
  precioFinal: number | null;
  pasajeroId: string;
  pasajero: string;
  conductorId: string | null;
  conductor: string | null;
  placa: string | null;
  canceladoPor: string | null;
}

export interface EventoViaje {
  id: string;
  tipo: string;
  actorTipo: string;
  actorNombre: string | null;
  ubicacion: Coord | null;
  datos: Record<string, unknown>;
  ocurridoEn: string;
}

export interface ViajeDetalleDatos {
  viaje: {
    id: string;
    codigo: string;
    estado: string;
    estadoPago: string;
    tipoServicio: string;
    categoria: string;
    metodoPago: string;
    origen: Coord;
    destino: Coord;
    origenDireccion: string | null;
    destinoDireccion: string | null;
    notaConductor: string | null;
    precioEstimado: { min: number; max: number };
    totalCarrera: number | null;
    cobroEspera: number;
    peajes: number;
    propina: number;
    precioFinal: number | null;
    comision: number | null;
    comisionPb: number | null;
    multiplicadorDinamico: number;
    desglose: Record<string, unknown> | null;
    distanciaRealM: number | null;
    distanciaTaximetroM: number | null;
    duracionS: number | null;
    tiempoDetenidoS: number | null;
    solicitadoEn: string;
    aceptadoEn: string | null;
    enSitioEn: string | null;
    iniciadoEn: string | null;
    finalizadoEn: string | null;
    canceladoEn: string | null;
    canceladoPor: string | null;
    motivoCancelacion: string | null;
  };
  pasajero: {
    id: string;
    nombre: string;
    telefono: string;
    calificacion: number | null;
    deuda: number;
  };
  conductor: {
    id: string;
    nombre: string;
    telefono: string;
    placa: string | null;
    vehiculo: string | null;
  } | null;
  eventos: EventoViaje[];
  ofertas: {
    id: string;
    conductor: string;
    conductorId: string;
    ronda: number;
    etaRecogidaS: number | null;
    distanciaRecogidaM: number | null;
    ofrecidaEn: string;
    respondidaEn: string | null;
    resultado: string;
  }[];
  pagos: { id: string; tipo: string; monto: number; estado: string; creadoEn: string }[];
  reembolsos: { id: string; monto: number; motivo: string; creadoEn: string }[];
  tickets: { id: string; tipo: string; estado: string; asunto: string; creadoEn: string }[];
  alertas: {
    id: string;
    tipo: string;
    severidad: string;
    estado: string;
    creadaEn: string;
    notaCierre: string | null;
  }[];
  mensajes: { id: string; autor: string; autorId: string; cuerpo: string; creadoEn: string }[];
  ajustesDeSaldo: { id: string; monto: number; estado: string; motivo: string }[];
  acciones: { despachar: boolean; reasignar: boolean; cancelar: boolean; ajustarPrecio: boolean };
}

export interface PuntoRecorrido {
  t: string;
  lat: number;
  lng: number;
  velocidadKmh: number | null;
  estado: string;
}

export interface ConductorFila {
  id: string;
  nombre: string;
  telefono: string;
  estadoHabilitacion: string;
  estadoOperativo: string;
  bloqueadoPorDeuda: boolean;
  suspensionManual: boolean;
  placa: string | null;
  categoria: string | null;
  calificacion: number | null;
  creadoEn: string;
  actualizadoEn: string;
  documentosPendientes: number;
}

export interface DocumentoFicha {
  id: string;
  titular: string;
  tipo: string;
  numero: string | null;
  venceEn: string | null;
  estado: string;
  motivoRechazo: string | null;
  revisadoPor: string | null;
  revisadoEn: string | null;
  placa: string | null;
  creadoEn: string;
}

export interface ConductorFicha {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  estadoUsuario: string;
  estadoHabilitacion: string;
  estadoOperativo: string;
  bloqueadoPorDeuda: boolean;
  suspensionManual: boolean;
  aceptaCategoriaInferior: boolean;
  aceptaIntermunicipal: boolean;
  calificacion: number | null;
  calificaciones: number;
  creadoEn: string;
  vehiculos: {
    id: string;
    placa: string;
    marca: string;
    linea: string;
    modeloAnio: number;
    color: string;
    categoria: string;
    fueraDeCatalogo: boolean;
    relacion: string;
  }[];
  documentos: DocumentoFicha[];
  evaluacion: {
    habilitado: boolean;
    completo: boolean;
    requisitos: { titulo: string; estado: string }[];
  };
  cuentaPago: { tipo: string; banco: string | null; valor: string; verificada: boolean } | null;
  saldo: number;
  resumen: {
    viajesFinalizados: number;
    cancelacionesPropias: number;
    horasConectadoUlt30d: number;
  };
  viajes: {
    id: string;
    codigo: string;
    estado: string;
    solicitadoEn: string;
    precioFinal: number | null;
  }[];
  alertas: { id: string; tipo: string; severidad: string; estado: string; creadaEn: string }[];
  historial: { accion: string; quien: string; motivo: string | null; ocurridoEn: string }[];
}

export interface PasajeroFila {
  id: string;
  nombre: string;
  telefono: string;
  estado: string;
  calificacion: number | null;
  deuda: number;
  creadoEn: string;
  viajes: number;
}

export interface PasajeroFicha {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  estado: string;
  calificacion: number | null;
  calificaciones: number;
  deuda: number;
  aceptoTerminosEn: string | null;
  creadoEn: string;
  resumen: { viajesFinalizados: number; cancelacionesPropias: number; cancelacionesUlt30d: number };
  viajes: {
    id: string;
    codigo: string;
    estado: string;
    solicitadoEn: string;
    precioFinal: number | null;
    canceladoPor: string | null;
  }[];
  tickets: { id: string; tipo: string; estado: string; asunto: string; creadoEn: string }[];
  historial: { accion: string; quien: string; motivo: string | null; ocurridoEn: string }[];
}

export interface Recargo {
  id: string;
  codigo: string;
  nombre: string;
  tipo: 'fijo' | 'porcentaje';
  valor: number;
  categoria: string | null;
  activo: boolean;
}

export interface VersionTarifa {
  id: string;
  version: number;
  estado: 'vigente' | 'programada' | 'historica';
  base: number;
  valorKm: number;
  valorMinuto: number;
  minima: number;
  cancelacion: number;
  esperaMinuto: number;
  esperaMinutosGratis: number;
  fuente: string | null;
  vigenteDesde: string;
  vigenteHasta: string | null;
  recargos: Recargo[];
}

export interface RutaFija {
  id: string;
  destino: string;
  modalidad: 'solo_ida' | 'ida_y_vuelta';
  tarifa: number;
  activa: boolean;
  vigenteDesde: string;
  fuente: string | null;
  conUbicacion: boolean;
}

export interface Zona {
  id: string;
  nombre: string;
  tipo: string;
  activa: boolean;
  poligono: { type: string; coordinates: number[][][] };
}

export interface DinamicaFila {
  id: string;
  zonaId: string;
  zona: string;
  multiplicador: number;
  desde: string;
  hasta: string;
  motivo: string;
  creadoPor: string;
  estado: 'activa' | 'programada' | 'terminada';
}

export interface SimulacionTarifa {
  tarifa: { id: string; version: number };
  festivo: boolean;
  recargosAplicados: string[];
  desglose: {
    base: number;
    distancia: number;
    tiempo: number;
    subtotal: number;
    multiplicadorDinamico: number;
    tarifaViaje: number;
    recargos: number;
    totalRedondeado: number;
    peajes: number;
    total: number;
  };
}

export interface ResumenFinanzas {
  saldoAFavorConductores: number;
  deudaDeConductores: number;
  conductoresBloqueadosPorDeuda: number;
  comisionesPorConciliar: number;
  pagosAConductoresPendientes: number;
  ajustesPendientes: number;
  ultimoCierre: string | null;
}

export interface CierreFila {
  id: string;
  conductorId: string;
  conductor: string;
  telefono: string;
  saldoInicial: number;
  netoDia: number;
  saldoFinal: number;
  resultado: 'a_favor' | 'a_cargo' | 'en_cero';
  estado: string;
  bloqueado: boolean;
}

export interface Cobranza {
  bloqueados: {
    id: string;
    nombre: string;
    telefono: string;
    deuda: number;
    desde: string | null;
  }[];
  pagosPorConciliar: {
    id: string;
    conductorId: string;
    conductor: string;
    monto: number;
    canal: string;
    referencia: string | null;
    creadoEn: string;
    saldo: number;
  }[];
}

export interface PagoConductor {
  id: string;
  conductorId: string;
  conductor: string;
  monto: number;
  estado: string;
  motivoRechazo: string | null;
  dia: string;
  tipoCuenta: string;
  banco: string | null;
  cuenta: string;
  creadoEn: string;
}

export interface AjusteFila {
  id: string;
  conductorId: string;
  conductor: string;
  monto: number;
  motivo: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  propuestoPor: string;
  propuestoPorId: string;
  resueltoPor: string | null;
  motivoResolucion: string | null;
  creadoEn: string;
}

export interface Libro {
  conductor: string;
  saldo: number;
  bloqueadoPorDeuda: boolean;
  movimientos: {
    id: string;
    tipo: string;
    monto: number;
    viaje: string | null;
    motivo: string | null;
    creadoEn: string;
    saldoDespues: number;
  }[];
}

export interface TicketFila {
  id: string;
  tipo: string;
  estado: string;
  prioridad: string;
  asunto: string;
  usuarioId: string;
  usuario: string;
  viajeId: string | null;
  codigoViaje: string | null;
  asignadoA: string | null;
  asignado: string | null;
  sla: Semaforo | null;
  venceSlaEn: string | null;
  creadoEn: string;
}

export interface TicketDetalleDatos {
  id: string;
  tipo: string;
  estado: string;
  prioridad: string;
  asunto: string;
  usuario: { id: string; nombre: string; telefono: string; tipo: string };
  viaje: { id: string; codigo: string | null } | null;
  asignadoA: string | null;
  asignado: string | null;
  sla: Semaforo | null;
  venceSlaEn: string | null;
  creadoEn: string;
  resueltoEn: string | null;
  mensajes: {
    id: string;
    autorId: string;
    autor: string;
    esEmpleado: boolean;
    cuerpo: string;
    interno: boolean;
    creadoEn: string;
  }[];
  reembolsable: { pagoId: string; monto: number; reembolsado: number } | null;
}

export interface Reporte {
  desde: string;
  hasta: string;
  viajes: {
    solicitudes: number;
    finalizados: number;
    cancelados: number;
    canceladosPorPasajero: number;
    canceladosPorConductor: number;
    canceladosPorOperacion: number;
    sinConductor: number;
    tasaFinalizacion: number;
  };
  tiempos: {
    asignacionMediaS: number | null;
    asignacionP50S: number | null;
    asignacionP90S: number | null;
    llegadaMediaS: number | null;
    esperaMediaS: number | null;
    duracionMediaS: number | null;
    respuestaOfertaMediaS: number | null;
  };
  ofertas: {
    total: number;
    aceptadas: number;
    rechazadas: number;
    expiradas: number;
    tasaAceptacion: number | null;
  };
  flota: {
    horasEnLinea: number;
    horasProductivas: number;
    utilizacion: number | null;
    kmProductivos: number;
    distanciaMediaKm: number | null;
  };
  dinero: {
    ingresosBrutos: number;
    comisiones: number;
    viajesEfectivo: number;
    viajesElectronico: number;
  };
  porDia: {
    dia: string;
    solicitudes: number;
    finalizados: number;
    cancelados: number;
    sinConductor: number;
  }[];
  porHora: { hora: number; solicitudes: number; sinConductor: number }[];
  conductores: {
    id: string;
    nombre: string;
    viajes: number;
    horasEnLinea: number;
    tasaAceptacion: number | null;
    cancelaciones: number;
  }[];
}

export interface Empleado {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  activo: boolean;
  totpActivo: boolean;
  ultimoIngresoEn: string | null;
  creadoEn: string;
  roles: RolInterno[];
  permisos: Permiso[];
}

export interface FilaAuditoria {
  id: string;
  usuarioId: string | null;
  quien: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  antes: unknown;
  despues: unknown;
  motivo: string | null;
  ip: string | null;
  ocurridoEn: string;
}

export interface Parametro {
  clave: string;
  grupo: string;
  descripcion: string;
  unidad: string;
  defecto: number;
  min: number;
  max: number;
  valor: number;
  personalizado: boolean;
  actualizadoEn: string | null;
}

export interface VencimientoFila {
  id: string;
  tipo: string;
  venceEn: string | null;
  estado: string;
  diasRestantes: number | null;
  conductorId: string;
  conductor: string | null;
  telefono: string | null;
  placa: string | null;
}

export interface TareaSistema {
  nombre: string;
  descripcion: string;
  cadaMs: number;
  ejecuciones: number;
  fallos: number;
  ultimaEjecucionEn: string | null;
  ultimoExitoEn: string | null;
  ultimoError: string | null;
  ultimaDuracionMs: number | null;
  atrasada: boolean;
}

export interface EstadoSistema {
  estado: 'ok' | 'degradado' | 'caido';
  problemas: string[];
  version: string;
  entorno: string;
  simulador: boolean;
  inicioEn: string;
  memoriaMb: number;
  baseDatos: {
    ok: boolean;
    latenciaMs: number | null;
    pool: { total: number; ociosas: number; esperando: number };
  };
  tiempoReal: Record<string, number>;
  http: {
    ultimos15min: {
      solicitudes: number;
      errores4xx: number;
      errores5xx: number;
      p50Ms: number | null;
      p95Ms: number | null;
    };
    serie: { minuto: string; solicitudes: number; errores5xx: number }[];
  };
  tareas: TareaSistema[];
  negocio: { viajesActivos: Record<string, number>; conductores: Record<string, number> };
  erroresDeApps15min: number;
}

export interface SolicitudDatosFila {
  id: string;
  tipo: 'consulta' | 'rectificacion' | 'supresion' | 'revocatoria';
  detalle: string;
  estado: 'recibida' | 'en_tramite' | 'aceptada' | 'rechazada' | 'ejecutada';
  creadaEn: string;
  venceEn: string;
  respuesta: string | null;
  resueltaEn: string | null;
  rol: 'conductor' | 'pasajero';
  titular: { id: string; nombre: string; telefono: string };
  semaforo?: Semaforo;
  diasHabilesRestantes?: number;
}

export interface SolicitudDatosDetalle extends Omit<
  SolicitudDatosFila,
  'titular' | 'semaforo' | 'diasHabilesRestantes'
> {
  titular: { id: string; nombre: string; telefono: string; estadoCuenta: string };
  bloqueadores: { codigo: string; detalle: string; monto?: number }[];
}
