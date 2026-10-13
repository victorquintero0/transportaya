/**
 * Referidos y puntos (RN-120 a RN-129). Quien tiene la app invita a otra persona con su código; cuando la persona
 * invitada termina su primer viaje, las dos reciben puntos. Los puntos valen pesos y se canjean por un descuento en un
 * viaje (pasajero) o como abono a la comisión (conductor); TransporteYa absorbe ese costo.
 *
 * Todo lo de este archivo son funciones puras: la API les pasa los datos y las reglas vigentes (editables en
 * Operación) y ellas deciden.
 */

export const ROLES_REFERIDO = ['pasajero', 'conductor'] as const;
/** Desde qué app se invitó a la persona y, por tanto, qué primer viaje cuenta: el de pasajero o el de conductor. */
export type RolReferido = (typeof ROLES_REFERIDO)[number];

export const ESTADOS_REFERIDO = ['pendiente', 'otorgado', 'rechazado'] as const;
export type EstadoReferido = (typeof ESTADOS_REFERIDO)[number];

/** Tipos de movimiento del libro de puntos. `puntos` lleva signo: positivo suma, negativo resta. */
export const TIPOS_PUNTOS = [
  'referido_referidor',
  'referido_invitado',
  'canje_descuento',
  'canje_abono',
  'reverso',
  'ajuste',
] as const;
export type TipoPuntos = (typeof TIPOS_PUNTOS)[number];

export interface ReglasReferidos {
  /** El programa está encendido: sin esto no se aceptan códigos nuevos ni se canjea. */
  activo: boolean;
  /** Puntos que gana quien invita, según a quién invitó. */
  puntosReferidorPasajero: number;
  puntosReferidorConductor: number;
  /** Puntos de bienvenida de la persona invitada. */
  puntosInvitadoPasajero: number;
  puntosInvitadoConductor: number;
  /** Cuántos pesos vale un punto. */
  valorPunto: number;
  /** Máximo del valor de un viaje que se puede pagar con puntos, en %. */
  topeDescuentoPct: number;
  /** Valor mínimo del primer viaje para que cuente (evita viajes de mentira). */
  minViaje: number;
  /** Días desde que se crea la cuenta durante los que se puede escribir un código. */
  ventanaDias: number;
  /** Máximo de invitaciones por las que un mismo referidor recibe puntos en un mes. */
  topeMensual: number;
  /** Mínimo de puntos para abonar a la comisión (salvo que con eso se salde toda la deuda). */
  minAbonoPuntos: number;
}

export const REGLAS_REFERIDOS_POR_DEFECTO: ReglasReferidos = {
  activo: true,
  puntosReferidorPasajero: 500,
  puntosReferidorConductor: 1500,
  puntosInvitadoPasajero: 300,
  puntosInvitadoConductor: 300,
  valorPunto: 10,
  topeDescuentoPct: 30,
  minViaje: 5000,
  ventanaDias: 7,
  topeMensual: 20,
  minAbonoPuntos: 500,
};

// ───────────────────────────────────────────────────────────── códigos

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Sin 0, 1, I ni O: no se confunden al dictar el código. */
const CARACTERES = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Deja el código como se guarda: mayúsculas, sin espacios y con un solo guion. */
export function normalizarCodigo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[^A-Z0-9-]/g, '');
}

export const esCodigoValido = (codigo: string): boolean =>
  /^[A-Z]{2,4}-[2-9A-HJ-NP-Z]{4}$/.test(codigo);

/** Prefijo con las letras del nombre (2 a 4); si no alcanza, «TY». */
function prefijoDe(nombre: string): string {
  const letras = normalizarCodigo(nombre.split(/\s+/)[0] ?? '')
    .replace(/[^A-Z]/g, '')
    .split('')
    .filter((c) => LETRAS.includes(c))
    .join('');
  return letras.length >= 2 ? letras.slice(0, 4) : 'TY';
}

/** Un código fácil de decir en voz alta, como `ANA-7K3Q`. `aleatorio` devuelve un número en [0, 1). */
export function generarCodigo(nombre: string, aleatorio: () => number): string {
  let sufijo = '';
  for (let i = 0; i < 4; i++)
    sufijo +=
      CARACTERES[Math.min(CARACTERES.length - 1, Math.floor(aleatorio() * CARACTERES.length))];
  return `${prefijoDe(nombre)}-${sufijo}`;
}

// ───────────────────────────────────────────────────────────── recompensas

/** Puntos de cada parte cuando el primer viaje de la persona invitada cuenta. */
export function puntosDeReferido(
  reglas: ReglasReferidos,
  rolInvitado: RolReferido,
): { referidor: number; invitado: number } {
  return rolInvitado === 'conductor'
    ? { referidor: reglas.puntosReferidorConductor, invitado: reglas.puntosInvitadoConductor }
    : { referidor: reglas.puntosReferidorPasajero, invitado: reglas.puntosInvitadoPasajero };
}

export const valorEnPesos = (puntos: number, reglas: Pick<ReglasReferidos, 'valorPunto'>): number =>
  puntos * reglas.valorPunto;

export type MotivoNoAplica = {
  ok: false;
  codigo:
    | 'REFERIDOS_INACTIVOS'
    | 'CODIGO_NO_EXISTE'
    | 'CODIGO_PROPIO'
    | 'YA_INVITADO'
    | 'FUERA_DE_VENTANA'
    | 'YA_VIAJO';
  detalle: string;
};

export interface EntradaAplicarCodigo {
  reglas: Pick<ReglasReferidos, 'activo' | 'ventanaDias'>;
  /** Hay una persona con ese código. */
  codigoExiste: boolean;
  /** Es la misma persona que quiere usarlo. */
  esPropio: boolean;
  /** Esta persona ya usó un código antes. */
  yaInvitado: boolean;
  /** Días desde que creó su cuenta. */
  edadCuentaDias: number;
  /** Viajes que ya terminó en el rol por el que la invitan. */
  viajesTerminados: number;
}

/** RN-121: quién puede usar un código y cuándo. */
export function validarAplicarCodigo(e: EntradaAplicarCodigo): { ok: true } | MotivoNoAplica {
  if (!e.reglas.activo)
    return {
      ok: false,
      codigo: 'REFERIDOS_INACTIVOS',
      detalle: 'Por ahora no estamos recibiendo códigos de invitación.',
    };
  if (!e.codigoExiste)
    return {
      ok: false,
      codigo: 'CODIGO_NO_EXISTE',
      detalle: 'Ese código no existe. Revisa que esté bien escrito.',
    };
  if (e.esPropio)
    return { ok: false, codigo: 'CODIGO_PROPIO', detalle: 'No puedes usar tu propio código.' };
  if (e.yaInvitado)
    return { ok: false, codigo: 'YA_INVITADO', detalle: 'Ya usaste un código de invitación.' };
  if (e.viajesTerminados > 0)
    return {
      ok: false,
      codigo: 'YA_VIAJO',
      detalle: 'El código se usa antes de tu primer viaje.',
    };
  if (e.edadCuentaDias > e.reglas.ventanaDias)
    return {
      ok: false,
      codigo: 'FUERA_DE_VENTANA',
      detalle: `El código se puede usar durante los primeros ${e.reglas.ventanaDias} días de tu cuenta.`,
    };
  return { ok: true };
}

export type DecisionOtorgamiento =
  | { accion: 'esperar'; motivo: 'VIAJE_MUY_BARATO' }
  | { accion: 'rechazar'; motivo: 'VIAJE_CON_EL_REFERIDOR' }
  | { accion: 'otorgar'; referidor: number; invitado: number; topeAlcanzado: boolean };

/**
 * RN-123 y RN-124: cuándo se entregan los puntos. Con el primer viaje terminado que llegue al mínimo, y no si el propio
 * referidor fue la otra parte del viaje. Si el referidor ya llegó al
 * tope del mes, la persona invitada igual recibe sus puntos de bienvenida y el referidor no.
 */
export function decidirOtorgamiento(e: {
  reglas: ReglasReferidos;
  rolInvitado: RolReferido;
  precioFinal: number;
  /** Referidos por los que este referidor ya recibió puntos en el mes calendario. */
  otorgadosEnElMes: number;
  /** El referidor fue la otra parte de ese viaje (el conductor que llevó al pasajero invitado, o al revés). */
  viajeConElReferidor?: boolean;
}): DecisionOtorgamiento {
  // Invitar a alguien y llevarlo uno mismo es la forma más fácil de cobrar puntos de mentira (RN-124)
  if (e.viajeConElReferidor) return { accion: 'rechazar', motivo: 'VIAJE_CON_EL_REFERIDOR' };
  if (e.precioFinal < e.reglas.minViaje) return { accion: 'esperar', motivo: 'VIAJE_MUY_BARATO' };
  const base = puntosDeReferido(e.reglas, e.rolInvitado);
  const tope = e.otorgadosEnElMes >= e.reglas.topeMensual;
  return {
    accion: 'otorgar',
    referidor: tope ? 0 : base.referidor,
    invitado: base.invitado,
    topeAlcanzado: tope,
  };
}

// ───────────────────────────────────────────────────────────── canje

/** Puntos que se pueden usar en un cobro de `precio` pesos (RN-125): hasta el tope %, y lo que alcance el saldo. */
export function descuentoConPuntos(e: {
  saldo: number;
  precio: number;
  reglas: Pick<ReglasReferidos, 'activo' | 'valorPunto' | 'topeDescuentoPct'>;
}): { puntos: number; descuento: number } {
  if (!e.reglas.activo || e.saldo <= 0 || e.precio <= 0 || e.reglas.valorPunto <= 0)
    return { puntos: 0, descuento: 0 };
  const topePesos = Math.floor((e.precio * e.reglas.topeDescuentoPct) / 100);
  const puntos = Math.min(e.saldo, Math.floor(topePesos / e.reglas.valorPunto));
  return { puntos, descuento: puntos * e.reglas.valorPunto };
}

/**
 * Al terminar el viaje se conoce el precio real: de los puntos separados al pedirlo se usan los que el tope permita y
 * el resto se devuelve (RN-126).
 */
export function liquidarPuntosDeViaje(e: {
  separados: number;
  precioFinal: number;
  reglas: Pick<ReglasReferidos, 'valorPunto' | 'topeDescuentoPct'>;
}): { usados: number; devueltos: number; descuento: number } {
  const topePesos = Math.floor((e.precioFinal * e.reglas.topeDescuentoPct) / 100);
  const usados = Math.max(0, Math.min(e.separados, Math.floor(topePesos / e.reglas.valorPunto)));
  return {
    usados,
    devueltos: e.separados - usados,
    descuento: usados * e.reglas.valorPunto,
  };
}

export type ResultadoAbono =
  | { ok: true; puntos: number; monto: number }
  | { ok: false; codigo: 'SIN_DEUDA' | 'SIN_PUNTOS' | 'MINIMO_ABONO'; detalle: string };

/**
 * RN-128: el conductor abona su comisión con puntos. Nunca más que su deuda, y al menos el mínimo de puntos salvo que
 * con ellos se salde toda la deuda. Con `puntosPedidos` se abona menos que el máximo posible.
 */
export function abonoConPuntos(e: {
  saldoPuntos: number;
  deuda: number;
  reglas: Pick<ReglasReferidos, 'valorPunto' | 'minAbonoPuntos'>;
  puntosPedidos?: number;
}): ResultadoAbono {
  if (e.deuda <= 0)
    return { ok: false, codigo: 'SIN_DEUDA', detalle: 'No tienes comisión pendiente para abonar.' };
  if (e.saldoPuntos <= 0)
    return { ok: false, codigo: 'SIN_PUNTOS', detalle: 'No tienes puntos para abonar.' };
  const necesarios = Math.ceil(e.deuda / e.reglas.valorPunto);
  const tope = Math.min(e.saldoPuntos, necesarios);
  const puntos = Math.min(tope, e.puntosPedidos ?? tope);
  if (puntos <= 0)
    return { ok: false, codigo: 'SIN_PUNTOS', detalle: 'Indica cuántos puntos quieres abonar.' };
  if (puntos < e.reglas.minAbonoPuntos && puntos < necesarios)
    return {
      ok: false,
      codigo: 'MINIMO_ABONO',
      detalle: `El mínimo para abonar es de ${e.reglas.minAbonoPuntos} puntos.`,
    };
  return { ok: true, puntos, monto: Math.min(puntos * e.reglas.valorPunto, e.deuda) };
}
