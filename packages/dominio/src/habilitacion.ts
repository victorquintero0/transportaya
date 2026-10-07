import { diasEntre } from './tiempo.js';

/** Tipos de documento, en el orden de la base de datos. */
export const TIPOS_DOCUMENTO = [
  'documento_identidad',
  'licencia_conduccion',
  'antecedentes',
  'simit',
  'selfie',
  'certificacion_bancaria',
  'licencia_transito',
  'soat',
  'revision_tecnicomecanica',
  'seguro_todo_riesgo',
  'poliza_pasajeros',
  'fotos_vehiculo',
  'rut',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export type TitularDocumento = 'conductor' | 'vehiculo';

export interface DocumentoRequerido {
  titular: TitularDocumento;
  tipo: TipoDocumento;
  titulo: string;
  /** Si tiene fecha de vencimiento que hay que registrar y vigilar (RN-112). */
  vence: boolean;
}

/**
 * Documentos que se exigen para habilitar a un conductor y su vehículo (RN-110, D-01, D-14).
 * Pendiente de Legal: póliza de pasajeros (D-15). El RUT es configurable (D-06) y no se exige aún.
 */
export const DOCUMENTOS_REQUERIDOS: readonly DocumentoRequerido[] = [
  {
    titular: 'conductor',
    tipo: 'documento_identidad',
    titulo: 'Cédula de ciudadanía',
    vence: false,
  },
  {
    titular: 'conductor',
    tipo: 'licencia_conduccion',
    titulo: 'Licencia de conducción B1',
    vence: true,
  },
  {
    titular: 'conductor',
    tipo: 'antecedentes',
    titulo: 'Certificado de antecedentes',
    vence: false,
  },
  { titular: 'conductor', tipo: 'selfie', titulo: 'Foto de perfil', vence: false },
  { titular: 'vehiculo', tipo: 'licencia_transito', titulo: 'Licencia de tránsito', vence: false },
  { titular: 'vehiculo', tipo: 'soat', titulo: 'SOAT', vence: true },
  {
    titular: 'vehiculo',
    tipo: 'revision_tecnicomecanica',
    titulo: 'Revisión técnico-mecánica',
    vence: true,
  },
  { titular: 'vehiculo', tipo: 'seguro_todo_riesgo', titulo: 'Seguro todo riesgo', vence: true },
  { titular: 'vehiculo', tipo: 'fotos_vehiculo', titulo: 'Fotos del vehículo', vence: false },
];

/** Días de anticipación con que se avisa un vencimiento (RN-112: 30, 15, 7 y 1). */
export const AVISOS_VENCIMIENTO_DIAS = [30, 15, 7, 1] as const;

export interface DocumentoRegistrado {
  titular: TitularDocumento;
  tipo: TipoDocumento;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'vencido';
  /** AAAA-MM-DD */
  venceEn: string | null;
  /** Cuando hay varios del mismo tipo, cuenta el más reciente. */
  creadoEn: Date | number;
  motivoRechazo?: string | null;
}

export type EstadoRequisito =
  'falta' | 'en_revision' | 'rechazado' | 'aprobado' | 'por_vencer' | 'vencido';

export interface RequisitoDocumento extends DocumentoRequerido {
  estado: EstadoRequisito;
  venceEn: string | null;
  /** Días que faltan para vencer (negativo si ya venció). */
  diasParaVencer: number | null;
  motivoRechazo: string | null;
  /** Hay un documento nuevo en revisión que reemplazará al vigente (una renovación a tiempo). */
  renovacionEnRevision: boolean;
}

export interface EvaluacionDocumentos {
  requisitos: RequisitoDocumento[];
  /** Ya se subió todo lo exigido (aunque falte revisarlo): se puede enviar a revisión. */
  completo: boolean;
  /** Todo está aprobado y vigente: el conductor puede conectarse (RN-111). */
  habilitado: boolean;
}

const marca = (v: Date | number) => (typeof v === 'number' ? v : v.getTime());

/**
 * Evalúa el estado de cada documento exigido. `hoy` es la fecha de Bogotá (AAAA-MM-DD).
 *
 * Para cada tipo cuenta el documento **aprobado y vigente** más reciente; así, subir un SOAT nuevo para
 * renovarlo no deja al conductor sin poder trabajar mientras se revisa. Si no hay ninguno vigente, cuenta
 * el más reciente (en revisión, rechazado o vencido). Un aprobado cuya fecha ya pasó es `vencido`.
 */
export function evaluarDocumentos(
  documentos: readonly DocumentoRegistrado[],
  hoy: string,
  diasAviso = 30,
): EvaluacionDocumentos {
  const requisitos = DOCUMENTOS_REQUERIDOS.map((req): RequisitoDocumento => {
    const delTipo = documentos
      .filter((d) => d.titular === req.titular && d.tipo === req.tipo)
      .sort((a, b) => marca(b.creadoEn) - marca(a.creadoEn));
    const diasDe = (d: DocumentoRegistrado) => (d.venceEn ? diasEntre(hoy, d.venceEn) : null);

    const vigente = delTipo.find(
      (d) => d.estado === 'aprobado' && (diasDe(d) === null || (diasDe(d) ?? 0) >= 0),
    );
    const doc = vigente ?? delTipo[0];
    const renovacionEnRevision =
      !!vigente &&
      delTipo.some((d) => d.estado === 'pendiente' && marca(d.creadoEn) > marca(vigente.creadoEn));

    const base = {
      ...req,
      venceEn: doc?.venceEn ?? null,
      motivoRechazo: doc?.motivoRechazo ?? null,
      renovacionEnRevision,
    };
    const dias = doc ? diasDe(doc) : null;

    if (!doc) return { ...base, estado: 'falta', diasParaVencer: null };
    if (doc.estado === 'pendiente') return { ...base, estado: 'en_revision', diasParaVencer: dias };
    if (doc.estado === 'rechazado') return { ...base, estado: 'rechazado', diasParaVencer: dias };
    if (doc.estado === 'vencido' || (dias !== null && dias < 0))
      return { ...base, estado: 'vencido', diasParaVencer: dias };
    if (dias !== null && dias <= diasAviso)
      return { ...base, estado: 'por_vencer', diasParaVencer: dias };
    return { ...base, estado: 'aprobado', diasParaVencer: dias };
  });

  return {
    requisitos,
    completo: requisitos.every((r) => r.estado !== 'falta'),
    habilitado: requisitos.every((r) => r.estado === 'aprobado' || r.estado === 'por_vencer'),
  };
}
