import { describe, expect, it } from 'vitest';
import {
  DOCUMENTOS_REQUERIDOS,
  evaluarDocumentos,
  type DocumentoRegistrado,
} from './habilitacion.js';
import { diasEntre, fechaBogota } from './tiempo.js';

const HOY = '2026-10-06';
const T = Date.UTC(2026, 9, 1);

/** Todos los documentos exigidos, aprobados y con vencimiento lejano. */
function todosAprobados(): DocumentoRegistrado[] {
  return DOCUMENTOS_REQUERIDOS.map((d) => ({
    titular: d.titular,
    tipo: d.tipo,
    estado: 'aprobado' as const,
    venceEn: d.vence ? '2027-06-30' : null,
    creadoEn: T,
  }));
}

describe('evaluarDocumentos', () => {
  it('sin documentos todo falta y no se puede enviar a revisión', () => {
    const r = evaluarDocumentos([], HOY);
    expect(r.requisitos.every((x) => x.estado === 'falta')).toBe(true);
    expect(r.completo).toBe(false);
    expect(r.habilitado).toBe(false);
  });

  it('con todo aprobado y vigente el conductor queda habilitado', () => {
    const r = evaluarDocumentos(todosAprobados(), HOY);
    expect(r).toMatchObject({ completo: true, habilitado: true });
  });

  it('con todo subido pero sin revisar está completo, aún no habilitado', () => {
    const docs = todosAprobados().map((d) => ({ ...d, estado: 'pendiente' as const }));
    expect(evaluarDocumentos(docs, HOY)).toMatchObject({ completo: true, habilitado: false });
  });

  it('un documento que vence en 30 días o menos está por vencer, pero sigue habilitado', () => {
    const docs = todosAprobados().map((d) =>
      d.tipo === 'soat' ? { ...d, venceEn: '2026-10-20' } : d,
    );
    const r = evaluarDocumentos(docs, HOY);
    const soat = r.requisitos.find((x) => x.tipo === 'soat');
    expect(soat).toMatchObject({ estado: 'por_vencer', diasParaVencer: 14 });
    expect(r.habilitado).toBe(true);
  });

  it('RN-112: un documento vencido deshabilita, aunque estuviera aprobado', () => {
    const docs = todosAprobados().map((d) =>
      d.tipo === 'soat' ? { ...d, venceEn: '2026-10-05' } : d,
    );
    const r = evaluarDocumentos(docs, HOY);
    expect(r.requisitos.find((x) => x.tipo === 'soat')).toMatchObject({
      estado: 'vencido',
      diasParaVencer: -1,
    });
    expect(r.habilitado).toBe(false);
  });

  it('vence hoy todavía sirve; vence ayer ya no', () => {
    const conVence = (venceEn: string) =>
      evaluarDocumentos(
        todosAprobados().map((d) => (d.tipo === 'soat' ? { ...d, venceEn } : d)),
        HOY,
      );
    expect(conVence(HOY).habilitado).toBe(true);
    expect(conVence('2026-10-05').habilitado).toBe(false);
  });

  it('renovar a tiempo: el documento vigente sigue valiendo mientras se revisa el nuevo', () => {
    const docs: DocumentoRegistrado[] = [
      ...todosAprobados(),
      {
        titular: 'vehiculo',
        tipo: 'soat',
        estado: 'pendiente',
        venceEn: '2027-10-01',
        creadoEn: T + 1000,
      },
    ];
    const r = evaluarDocumentos(docs, HOY);
    expect(r.requisitos.find((x) => x.tipo === 'soat')).toMatchObject({
      estado: 'aprobado',
      renovacionEnRevision: true,
    });
    expect(r.habilitado).toBe(true);
  });

  it('si el vigente ya venció, el nuevo en revisión es el que cuenta y no se puede trabajar', () => {
    const docs: DocumentoRegistrado[] = [
      ...todosAprobados().map((d) => (d.tipo === 'soat' ? { ...d, venceEn: '2026-10-01' } : d)),
      {
        titular: 'vehiculo',
        tipo: 'soat',
        estado: 'pendiente',
        venceEn: '2027-10-01',
        creadoEn: T + 1000,
      },
    ];
    const r = evaluarDocumentos(docs, HOY);
    expect(r.requisitos.find((x) => x.tipo === 'soat')?.estado).toBe('en_revision');
    expect(r.habilitado).toBe(false);
  });

  it('entre varios aprobados vigentes cuenta el más reciente', () => {
    const docs: DocumentoRegistrado[] = [
      ...todosAprobados(),
      {
        titular: 'vehiculo',
        tipo: 'soat',
        estado: 'aprobado',
        venceEn: '2028-01-01',
        creadoEn: T + 5000,
      },
    ];
    expect(evaluarDocumentos(docs, HOY).requisitos.find((x) => x.tipo === 'soat')?.venceEn).toBe(
      '2028-01-01',
    );
  });

  it('un documento rechazado conserva el motivo para mostrárselo al conductor', () => {
    const docs = todosAprobados().map((d) =>
      d.tipo === 'selfie'
        ? { ...d, estado: 'rechazado' as const, motivoRechazo: 'La foto está borrosa' }
        : d,
    );
    const r = evaluarDocumentos(docs, HOY);
    expect(r.requisitos.find((x) => x.tipo === 'selfie')).toMatchObject({
      estado: 'rechazado',
      motivoRechazo: 'La foto está borrosa',
    });
    expect(r.habilitado).toBe(false);
  });

  it('distingue documentos del conductor y del vehículo con el mismo tipo', () => {
    const docs = todosAprobados().filter((d) => !(d.titular === 'vehiculo' && d.tipo === 'soat'));
    expect(evaluarDocumentos(docs, HOY).requisitos.find((x) => x.tipo === 'soat')?.estado).toBe(
      'falta',
    );
  });

  it('exige la revisión técnico-mecánica y el seguro todo riesgo sin importar la antigüedad (D-14)', () => {
    const tipos = DOCUMENTOS_REQUERIDOS.filter((d) => d.titular === 'vehiculo').map((d) => d.tipo);
    expect(tipos).toEqual(
      expect.arrayContaining(['revision_tecnicomecanica', 'seguro_todo_riesgo', 'soat']),
    );
  });
});

describe('fechas de Bogotá', () => {
  it('a las 22:00 en Bogotá ya es el día siguiente en UTC, pero la fecha es la de Bogotá', () => {
    expect(fechaBogota(new Date('2026-10-07T03:00:00Z'))).toBe('2026-10-06');
    expect(fechaBogota(new Date('2026-10-07T05:00:00Z'))).toBe('2026-10-07');
  });
  it('diasEntre cuenta días calendario', () => {
    expect(diasEntre('2026-10-06', '2026-10-20')).toBe(14);
    expect(diasEntre('2026-10-06', '2026-10-05')).toBe(-1);
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2);
  });
});
