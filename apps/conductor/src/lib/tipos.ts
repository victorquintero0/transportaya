/** Formas de las respuestas de la API del conductor (docs/10). */

export type EstadoOperativo =
  | 'desconectado'
  | 'disponible'
  | 'con_oferta'
  | 'en_camino'
  | 'en_sitio'
  | 'en_viaje'
  | 'sin_senal';

export type EstadoHabilitacion =
  'registro_incompleto' | 'en_revision' | 'rechazado' | 'habilitado' | 'suspendido' | 'bloqueado';

export type EstadoRequisito =
  'falta' | 'en_revision' | 'rechazado' | 'aprobado' | 'por_vencer' | 'vencido';

export interface RequisitoDocumento {
  titular: 'conductor' | 'vehiculo';
  tipo: string;
  titulo: string;
  vence: boolean;
  estado: EstadoRequisito;
  venceEn: string | null;
  diasParaVencer: number | null;
  motivoRechazo: string | null;
  renovacionEnRevision: boolean;
}

export interface MotivoNoConectar {
  codigo: 'NO_HABILITADO' | 'SIN_VEHICULO' | 'DEUDA_PENDIENTE' | 'DOCUMENTOS_NO_VIGENTES';
  mensaje: string;
  deuda?: number;
  documentos?: string[];
}

export interface Vehiculo {
  id: string;
  placa: string;
  marca: string;
  linea: string;
  modeloAnio: number;
  color: string;
  categoria: 'media' | 'media_alta' | 'alta';
  activo: boolean;
  fueraDeCatalogo: boolean;
}

export interface Perfil {
  usuario: { id: string; nombre: string; telefono: string; email: string | null };
  ciudad: { id: string; nombre: string };
  conductor: {
    estadoHabilitacion: EstadoHabilitacion;
    estadoOperativo: EstadoOperativo;
    bloqueadoPorDeuda: boolean;
    aceptaCategoriaInferior: boolean;
    aceptaIntermunicipal: boolean;
    calificacionPromedio: number | null;
    calificacionesTotal: number;
  };
  vehiculos: Vehiculo[];
  cuentaPago: { tipo: string; valorEnmascarado: string; verificada: boolean } | null;
  documentos: { requisitos: RequisitoDocumento[]; completo: boolean; habilitado: boolean };
  terminos: { version: string; aceptados: boolean; aceptoEn: string | null };
  onboarding: {
    pasos: {
      id: 'datos' | 'vehiculo' | 'documentos' | 'cuenta' | 'revision';
      titulo: string;
      completo: boolean;
    }[];
    puedeEnviarRevision: boolean;
  };
  conexion: { puedeConectarse: boolean; motivos: MotivoNoConectar[] };
}

export interface CatalogoMarca {
  marca: string;
  lineas: {
    id: string;
    linea: string;
    carroceria: string | null;
    categoria: string;
    anioDesde: number;
    anioHasta: number | null;
  }[];
}

export interface Oferta {
  ofertaId: string;
  viajeId: string;
  expiraEn: string;
  segundosParaResponder: number;
  recogida: {
    lat: number;
    lng: number;
    direccion: string | null;
    distanciaM: number;
    etaS: number;
  };
  destino: { zona: string; distanciaViajeM: number };
  gananciaEstimada: number;
  precioEstimado: { min: number; max: number };
  metodoPago: 'efectivo' | 'tarjeta' | 'local';
  categoria: string;
  tipoServicio: string;
  pasajero: { nombre: string; calificacion: number | null };
}

export interface Recargo {
  nombre: string;
  tipo: 'fijo' | 'porcentaje';
  valor?: number;
  puntosBasicos?: number;
}

export interface ViajeActual {
  id: string;
  codigo: string;
  estado: 'asignado' | 'en_sitio' | 'en_curso';
  tipoServicio: string;
  categoria: string;
  pasajero: { nombre: string; calificacion: number | null };
  recogida: { lat: number; lng: number; direccion: string | null };
  destino: { lat: number; lng: number; direccion: string | null };
  nota: string | null;
  metodoPago: 'efectivo' | 'tarjeta' | 'local';
  pinRequerido: boolean;
  precioEstimado: { min: number; max: number };
  tarifa: {
    base: number;
    valorKm: number;
    valorMinuto: number;
    minima: number;
    esperaMinutosGratis: number;
    esperaMinuto: number;
    multiplicadorDinamico: number;
    recargos: Recargo[];
  } | null;
  rutaFija: { destino: string; modalidad: string; tarifa: number } | null;
  tiempos: {
    solicitadoEn: string;
    aceptadoEn: string | null;
    enSitioEn: string | null;
    iniciadoEn: string | null;
  };
  distanciaARecogidaM: number | null;
}

export interface ResultadoFinalizar {
  viajeId: string;
  codigo: string;
  metodoPago: 'efectivo' | 'tarjeta' | 'local';
  precioFinal: number;
  totalCarrera: number;
  cobroEspera: number;
  peajes?: number;
  comision: number;
  gananciaNeta: number;
  desglose: Record<string, unknown>;
  mediciones: {
    taximetro: { distanciaM: number; tiempoDetenidoS: number; duracionS: number };
    cobradas: { distanciaM: number; tiempoDetenidoS: number; duracionS: number };
    verificadas: boolean;
    usadaServidor: boolean;
  };
  cobrarEnEfectivo: number;
}

export interface Ganancias {
  desde: string;
  hasta: string;
  viajes: number;
  cancelacionesCobradas: number;
  bruto: number;
  comision: number;
  neto: number;
  efectivo: number;
  electronico: number;
  distanciaM: number;
  horasConectado: number;
  utilizacion: number | null;
  promedioPorViaje: number;
  porDia: { dia: string; viajes: number; bruto: number; neto: number }[];
}

export interface Saldo {
  saldo: number;
  deuda: number;
  aFavor: number;
  bloqueadoPorDeuda: boolean;
  datosPago: { llave: string | null; titular: string };
  ultimoCierre: { dia: string; saldoFinal: number; resultado: string; estado: string } | null;
  pagosEnRevision: { id: string; monto: number; referencia: string; creadoEn: string }[];
  pagosPorRecibir: { id: string; monto: number; estado: string }[];
}

export interface Movimiento {
  id: string;
  tipo: string;
  monto: number;
  viaje: string | null;
  motivo: string | null;
  creadoEn: string;
  saldoDespues: number;
}

export interface ViajeHistorial {
  id: string;
  codigo: string;
  estado: 'finalizado' | 'cancelado';
  tipoServicio: string;
  metodoPago: string;
  precioFinal: number | null;
  comision: number | null;
  gananciaNeta: number | null;
  distanciaM: number | null;
  tiempoDetenidoS: number | null;
  duracionS: number | null;
  origen: string | null;
  destino: string | null;
  finalizadoEn: string | null;
  estadoPago: string;
}

export interface Cierre {
  id: string;
  dia: string;
  saldoInicial: number;
  netoDia: number;
  saldoFinal: number;
  resultado: 'a_favor' | 'a_cargo' | 'en_cero';
  estado: string;
}

export interface Mensaje {
  id: string;
  viajeId: string;
  deQuien: 'pasajero' | 'conductor';
  cuerpo: string;
  creadoEn: string;
}
