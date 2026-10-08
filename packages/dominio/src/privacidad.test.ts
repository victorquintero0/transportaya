import { describe, expect, it } from 'vitest';
import {
  POLITICA_DATOS,
  PLAZO_DIAS_HABILES,
  diasHabilesRestantes,
  esSolicitudDeSupresion,
  fechaLimiteHabil,
  semaforoDePlazo,
} from './privacidad.js';

// 2026-10-07 es miércoles.
const miercoles = new Date('2026-10-07T15:00:00Z');

describe('plazos de las solicitudes de datos (Ley 1581)', () => {
  it('una consulta tiene 10 días hábiles y un reclamo, 15', () => {
    expect(PLAZO_DIAS_HABILES).toMatchObject({
      consulta: 10,
      rectificacion: 15,
      supresion: 15,
      revocatoria: 15,
    });
  });

  it('cuenta solo días hábiles: los fines de semana no suman', () => {
    // miércoles + 3 hábiles = lunes (jueves, viernes, lunes)
    expect(fechaLimiteHabil(miercoles, 3).toISOString()).toBe('2026-10-13T04:59:59.000Z');
    // Lunes 12-oct-2026 es festivo (Día de la Raza): se salta.
    const festivos = new Set(['2026-10-12']);
    expect(fechaLimiteHabil(miercoles, 3, festivos).toISOString()).toBe('2026-10-14T04:59:59.000Z');
  });

  it('vence al final del día en Bogotá, no a medianoche UTC', () => {
    const v = fechaLimiteHabil(miercoles, 1);
    expect(v.toISOString()).toBe('2026-10-09T04:59:59.000Z'); // 23:59 del jueves 8 en Bogotá
  });

  it('cuenta los días hábiles que faltan, y negativos si ya venció', () => {
    const v = fechaLimiteHabil(miercoles, 5); // miércoles 14
    expect(diasHabilesRestantes(v, miercoles)).toBe(5);
    expect(diasHabilesRestantes(v, new Date('2026-10-14T20:00:00Z'))).toBe(0);
    expect(diasHabilesRestantes(v, new Date('2026-10-15T20:00:00Z'))).toBe(-1);
    expect(diasHabilesRestantes(v, new Date('2026-10-20T20:00:00Z'))).toBeLessThan(-1);
  });

  it('el semáforo avisa con tiempo', () => {
    const v = fechaLimiteHabil(miercoles, 15);
    expect(semaforoDePlazo(v, miercoles)).toBe('verde');
    expect(semaforoDePlazo(v, new Date(v.getTime() - 6 * 86_400_000))).toBe('ambar');
    expect(semaforoDePlazo(v, new Date(v.getTime() - 1 * 86_400_000))).toBe('rojo');
    expect(semaforoDePlazo(v, new Date(v.getTime() + 86_400_000))).toBe('rojo');
  });

  it('borrar los datos y revocar la autorización se ejecutan igual', () => {
    expect(esSolicitudDeSupresion('supresion')).toBe(true);
    expect(esSolicitudDeSupresion('revocatoria')).toBe(true);
    expect(esSolicitudDeSupresion('consulta')).toBe(false);
  });
});

describe('política de tratamiento de datos', () => {
  it('es un borrador hasta que Legal la firme, y tiene todo lo que pide la ley', () => {
    expect(POLITICA_DATOS.pendienteRevisionLegal).toBe(true);
    const ids = POLITICA_DATOS.secciones.map((s) => s.id);
    for (const obligatoria of [
      'responsable',
      'finalidades',
      'derechos',
      'solicitudes',
      'conservacion',
    ])
      expect(ids).toContain(obligatoria);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dice los plazos de respuesta de la ley', () => {
    const texto = JSON.stringify(POLITICA_DATOS);
    expect(texto).toContain('10 días hábiles');
    expect(texto).toContain('15 días hábiles');
  });
});
