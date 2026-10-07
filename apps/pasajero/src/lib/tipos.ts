/** Formas de las respuestas de la API del pasajero (docs/10). */

export type EstadoViaje =
  | 'buscando_conductor'
  | 'asignado'
  | 'en_sitio'
  | 'en_curso'
  | 'finalizado'
  | 'cancelado'
  | 'sin_conductor';

export type MetodoPago = 'efectivo' | 'tarjeta';

export interface Perfil {
  usuario: { id: string; nombre: string; telefono: string; email: string | null };
  calificacionPromedio: number | null;
  calificacionesTotal: number;
  deuda: number;
  terminos: { version: string; aceptados: boolean; aceptoEn: string | null };
  contactos: { id: string; nombre: string; telefono: string }[];
  lugares: { id: string; etiqueta: string; direccion: string; lat: number; lng: number }[];
  metodosPago: MetodoDePago[];
  viajeActivoId: string | null;
}

export interface MetodoDePago {
  id: string;
  tipo: string;
  marca: string | null;
  ultimos4: string | null;
  predeterminado: boolean;
}

export interface Lugar {
  id: string;
  titulo: string;
  subtitulo: string;
  barrio: string;
  /** Lo que se guarda en el viaje: termina en el barrio (D-11). */
  direccion: string;
  tipo: string;
  lat: number;
  lng: number;
  aproximada: boolean;
}

export interface PuntoDeViaje {
  lat: number;
  lng: number;
  /** Texto que se guarda en el viaje. */
  direccion: string;
  /** Nombre corto para mostrar. */
  titulo: string;
}

export interface RutaNacional {
  destino: string;
  lat: number;
  lng: number;
  soloIda: number | null;
  idaYVuelta: number | null;
}

export interface OpcionCotizacion {
  id: string;
  categoria: 'media' | 'media_alta' | 'alta';
  nombre: string;
  tipoServicio: 'inmediato' | 'intermunicipal';
  precio: { min: number; max: number };
  fijo: boolean;
  recargoCategoria: number;
  dinamica: number | null;
  conductoresCerca: number;
  etaRecogidaS: number | null;
}

export interface Cotizacion {
  origen: { lat: number; lng: number; direccion?: string };
  destino: { lat: number; lng: number; direccion?: string };
  distanciaM: number;
  duracionS: number;
  expiraEn: string;
  opciones: OpcionCotizacion[];
}

export interface ConductorAsignado {
  nombre: string;
  calificacion: number | null;
  viajes: number;
  vehiculo: {
    marca: string;
    linea: string;
    color: string;
    placa: string;
    categoria: string;
    anio: number;
  };
  posicion: { lat: number; lng: number; t: number } | null;
  distanciaM: number | null;
  etaS: number | null;
  hacia: 'recogida' | 'destino';
}

export interface Viaje {
  id: string;
  codigo: string;
  estado: EstadoViaje;
  tipoServicio: 'inmediato' | 'intermunicipal';
  categoria: string;
  origen: { lat: number; lng: number; direccion: string | null };
  destino: { lat: number; lng: number; direccion: string | null };
  nota: string | null;
  metodoPago: MetodoPago | 'local';
  estadoPago: string;
  pin: string | null;
  precioEstimado: { min: number; max: number };
  precioFinal: number | null;
  cobroEspera: number;
  propina: number;
  conductor: ConductorAsignado | null;
  tiempos: {
    solicitadoEn: string;
    aceptadoEn: string | null;
    enSitioEn: string | null;
    iniciadoEn: string | null;
    finalizadoEn: string | null;
    canceladoEn: string | null;
  };
  busqueda: { expiraEn: string } | null;
  cancelacion: { costo: number; gratis: boolean; segundosGratisRestantes: number | null } | null;
  compartido: boolean;
  calificacion: number | null;
  puedeCalificar: boolean;
  puedeDarPropina: boolean;
}

export interface ViajeHistorial {
  id: string;
  codigo: string;
  estado: EstadoViaje;
  tipoServicio: string;
  categoria: string;
  origen: string | null;
  destino: string | null;
  metodoPago: string;
  precioFinal: number | null;
  propina: number;
  fecha: string;
  canceladoPor: string | null;
  conductor: string | null;
  placa: string | null;
  calificacion: number | null;
}

export interface Recibo {
  codigo: string;
  estado: EstadoViaje;
  fecha: string;
  pasajero: string;
  origen: string | null;
  destino: string | null;
  conductor: { nombre: string; vehiculo: ConductorAsignado['vehiculo'] } | null;
  metodoPago: string;
  estadoPago: string;
  mediciones: {
    distanciaM: number | null;
    duracionS: number | null;
    tiempoDetenidoS: number | null;
  };
  lineas: { concepto: string; valor: number }[];
  total: number;
}

export interface Mensaje {
  id: string;
  viajeId: string;
  deQuien: 'pasajero' | 'conductor';
  cuerpo: string;
  creadoEn: string;
}

export interface TicketSoporte {
  id: string;
  tipo: string;
  estado: string;
  asunto: string;
  creadoEn: string;
  codigo: string | null;
}

export interface ViajeCompartido {
  estado: EstadoViaje;
  codigo: string;
  origen: { lat: number; lng: number };
  destino: { zona: string; lat: number; lng: number };
  conductor: {
    nombre: string;
    vehiculo: { marca: string; linea: string; color: string; placa: string };
    posicion: { lat: number; lng: number; t: number } | null;
    etaS: number | null;
  } | null;
  iniciadoEn: string | null;
  finalizadoEn: string | null;
}
