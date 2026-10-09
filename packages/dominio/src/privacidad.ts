import { fechaBogota } from './tiempo.js';

/**
 * Política de tratamiento de datos personales (Ley 1581 de 2012, RNF-60 y RNF-61). Es la única fuente: las apps la
 * muestran y la API la entrega. Al cambiar el texto se cambia `version`, y a las personas se les vuelve a pedir la
 * autorización.
 *
 * **Borrador.** El texto lo debe revisar y firmar Legal antes del lanzamiento (D-15, R-01); mientras tanto
 * `pendienteRevisionLegal` es verdadero y las apps lo dicen. Los datos entre corchetes los pone la empresa.
 */
export interface SeccionPolitica {
  id: string;
  titulo: string;
  parrafos: string[];
  items?: string[];
}

export interface PoliticaDatos {
  version: string;
  actualizadaEn: string;
  pendienteRevisionLegal: boolean;
  secciones: SeccionPolitica[];
}

export const POLITICA_DATOS: PoliticaDatos = {
  version: '2026-10',
  actualizadaEn: '2026-10-08',
  pendienteRevisionLegal: true,
  secciones: [
    {
      id: 'responsable',
      titulo: 'Quién es el responsable',
      parrafos: [
        'TransporteYa es el responsable del tratamiento de tus datos personales. [Razón social, NIT, dirección y ciudad: por completar por la empresa.]',
        'Para cualquier consulta o reclamo sobre tus datos escribe a [correo de privacidad: por definir] o usa la sección «Mis datos y privacidad» de la app.',
      ],
    },
    {
      id: 'datos',
      titulo: 'Qué datos tratamos',
      parrafos: ['Según uses la app como pasajero o como conductor, tratamos:'],
      items: [
        'Pasajeros: nombre, celular, correo (opcional), lugares guardados, contactos de confianza, historial de viajes, ubicación durante el viaje, mensajes del viaje, calificaciones y medios de pago tokenizados. No guardamos el número de tu tarjeta.',
        'Conductores: nombre, celular, correo, foto, documentos personales y del vehículo (cédula, licencia, SOAT, revisión técnico-mecánica, seguro y otros), datos del vehículo, cuenta o llave donde recibes pagos, ubicación mientras estás conectado, viajes, ganancias, saldo y calificaciones.',
        'De los dos: datos técnicos de uso (dispositivo, dirección IP y errores de la app) para la seguridad y el funcionamiento.',
      ],
    },
    {
      id: 'finalidades',
      titulo: 'Para qué los usamos',
      parrafos: ['Usamos tus datos solamente para estas finalidades:'],
      items: [
        'Prestar el servicio de transporte: conectar pasajero y conductor, calcular y cobrar el viaje y mostrar el seguimiento.',
        'Tu seguridad y la de los demás: verificar identidad y documentos, atender emergencias (SOS), prevenir fraudes y esclarecer reclamos.',
        'Soporte: responder tus solicitudes, quejas y reclamos.',
        'Obligaciones legales, contables y tributarias, y requerimientos de autoridades competentes.',
        'Comunicaciones sobre tus viajes y tu cuenta. La publicidad solo se envía con tu autorización aparte, que puedes retirar cuando quieras.',
      ],
    },
    {
      id: 'compartir',
      titulo: 'Con quién los compartimos',
      parrafos: [
        'Al conductor le mostramos tu nombre de pila y el punto de recogida; el destino exacto solo cuando acepta. Tu celular no se comparte. Al pasajero le mostramos el nombre, la foto, la calificación, el vehículo y la placa del conductor.',
        'Compartimos datos con proveedores que nos prestan servicios (pagos, mensajería, mapas, alojamiento y facturación electrónica) solo en lo necesario y bajo obligaciones de confidencialidad y seguridad. También con autoridades cuando la ley lo exija. No vendemos tus datos.',
      ],
    },
    {
      id: 'conservacion',
      titulo: 'Cuánto tiempo los conservamos',
      parrafos: [
        'Cada tipo de dato tiene un plazo. Al cumplirse, se borra o se deja sin datos personales:',
      ],
      items: [
        'Posiciones GPS detalladas y mensajes del viaje: hasta 6 meses.',
        'Recorrido guardado de cada viaje: hasta 12 meses.',
        'Códigos de verificación y sesiones vencidas: unos días.',
        'Viajes, pagos, comisiones y facturación: el tiempo que exigen las normas contables y tributarias [10 años: Legal debe confirmarlo]. Pasado el plazo se conservan sin tus datos de identificación cuando la ley lo permita.',
        'Documentos del conductor: mientras esté activo y el tiempo que exijan las normas de transporte y seguridad.',
      ],
    },
    {
      id: 'derechos',
      titulo: 'Tus derechos',
      parrafos: ['Como titular de los datos tienes derecho a:'],
      items: [
        'Conocer, actualizar y rectificar tus datos.',
        'Pedir prueba de la autorización que nos diste.',
        'Saber cómo usamos tus datos.',
        'Revocar la autorización y pedir que borremos tus datos, salvo que debamos conservarlos por una obligación legal o contractual.',
        'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).',
        'Acceder gratis a tus datos.',
      ],
    },
    {
      id: 'solicitudes',
      titulo: 'Cómo ejercer tus derechos',
      parrafos: [
        'Desde la app: «Cuenta» (pasajeros) o «Perfil» (conductores) → «Mis datos y privacidad». Allí puedes descargar tus datos, corregirlos, y enviarnos una solicitud de consulta, rectificación, supresión o revocatoria. También puedes eliminar tu cuenta.',
        'Respondemos las consultas en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles, contados desde que los recibimos. Si necesitamos más tiempo te avisamos el motivo y la nueva fecha.',
        'Si eliminas tu cuenta o aceptamos tu solicitud de supresión, borramos tus datos personales y dejamos los registros que la ley nos obliga a conservar (por ejemplo, viajes y pagos) sin tu nombre, celular ni correo. No puedes eliminar la cuenta con un viaje en curso, una deuda pendiente (pasajeros) o saldo pendiente (conductores).',
      ],
    },
    {
      id: 'seguridad',
      titulo: 'Cómo los protegemos',
      parrafos: [
        'Usamos conexiones cifradas, guardamos cifrados los datos más sensibles (como las cuentas de pago) y los documentos en almacenamiento privado. El personal interno entra con doble factor, solo ve lo que su rol permite y sus acciones quedan registradas.',
      ],
    },
    {
      id: 'menores',
      titulo: 'Menores de edad',
      parrafos: [
        'El servicio es para mayores de 18 años. No tratamos datos de menores a sabiendas.',
      ],
    },
    {
      id: 'cambios',
      titulo: 'Cambios a esta política',
      parrafos: [
        'Si cambiamos esta política de forma importante, te lo avisamos en la app y te pedimos de nuevo tu autorización antes de seguir usándola.',
      ],
    },
  ],
};

export const VERSION_TERMINOS = POLITICA_DATOS.version;

// ───────────────────────────── Solicitudes de los titulares ─────────────────────────────

export const TIPOS_SOLICITUD_DATOS = [
  'consulta',
  'rectificacion',
  'supresion',
  'revocatoria',
] as const;
export type TipoSolicitudDatos = (typeof TIPOS_SOLICITUD_DATOS)[number];

export const ETIQUETA_TIPO_SOLICITUD: Record<TipoSolicitudDatos, string> = {
  consulta: 'Consultar mis datos',
  rectificacion: 'Corregir mis datos',
  supresion: 'Borrar mis datos',
  revocatoria: 'Revocar mi autorización',
};

export const ESTADOS_SOLICITUD_DATOS = [
  'recibida',
  'en_tramite',
  'aceptada',
  'rechazada',
  'ejecutada',
] as const;
export type EstadoSolicitudDatos = (typeof ESTADOS_SOLICITUD_DATOS)[number];

export const ETIQUETA_ESTADO_SOLICITUD: Record<EstadoSolicitudDatos, string> = {
  recibida: 'Recibida',
  en_tramite: 'En trámite',
  aceptada: 'Resuelta',
  rechazada: 'Rechazada',
  ejecutada: 'Resuelta y ejecutada',
};

/** Ley 1581 de 2012, art. 14 (consultas: 10 días hábiles) y art. 15 (reclamos: 15 días hábiles). */
export const PLAZO_DIAS_HABILES: Record<TipoSolicitudDatos, number> = {
  consulta: 10,
  rectificacion: 15,
  supresion: 15,
  revocatoria: 15,
};

/** ¿Pide borrar o dejar de tratar los datos? Esas se ejecutan con la anonimización de la cuenta. */
export const esSolicitudDeSupresion = (t: TipoSolicitudDatos): boolean =>
  t === 'supresion' || t === 'revocatoria';

const esHabil = (fecha: string, festivos: ReadonlySet<string>): boolean => {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return dia !== 0 && dia !== 6 && !festivos.has(fecha);
};

const sumarDia = (fecha: string, dias: number): string =>
  new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

/**
 * Fecha límite: el final (23:59 en Bogotá) del n-ésimo día hábil siguiente. Los sábados, domingos y los festivos que se
 * pasen (AAAA-MM-DD) no cuentan.
 */
export function fechaLimiteHabil(
  desde: Date,
  diasHabiles: number,
  festivos: ReadonlySet<string> = new Set(),
): Date {
  let fecha = fechaBogota(desde);
  let contados = 0;
  while (contados < diasHabiles) {
    fecha = sumarDia(fecha, 1);
    if (esHabil(fecha, festivos)) contados += 1;
  }
  return new Date(`${fecha}T23:59:59-05:00`);
}

/** Días hábiles que faltan para la fecha límite (0 si es hoy; negativo si ya pasó). */
export function diasHabilesRestantes(
  venceEn: Date,
  ahora: Date,
  festivos: ReadonlySet<string> = new Set(),
): number {
  const hoy = fechaBogota(ahora);
  const limite = fechaBogota(venceEn);
  if (limite === hoy) return ahora.getTime() > venceEn.getTime() ? -1 : 0;
  const signo = limite > hoy ? 1 : -1;
  let fecha = hoy;
  let n = 0;
  while (fecha !== limite) {
    fecha = sumarDia(fecha, signo);
    if (esHabil(fecha, festivos)) n += signo;
  }
  return n;
}

export type SemaforoPlazo = 'verde' | 'ambar' | 'rojo';

/** Rojo: vencida o vence en 2 días hábiles o menos. Ámbar: 3 a 5. Verde: más. */
export function semaforoDePlazo(
  venceEn: Date,
  ahora: Date,
  festivos: ReadonlySet<string> = new Set(),
): SemaforoPlazo {
  const n = diasHabilesRestantes(venceEn, ahora, festivos);
  return n <= 2 ? 'rojo' : n <= 5 ? 'ambar' : 'verde';
}
