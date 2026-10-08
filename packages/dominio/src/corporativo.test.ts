import { describe, expect, it } from 'vitest';
import {
  POLITICA_SIN_RESTRICCIONES,
  cicloCerrado,
  cicloDe,
  cicloParaFacturar,
  descuentoCorporativo,
  estadoDeCuenta,
  evaluarEmpresa,
  evaluarPolitica,
  vencimientoDe,
  type PoliticaUso,
} from './corporativo.js';

/** Un instante a partir de la hora de Bogotá (UTC−5). */
const bogota = (iso: string) => new Date(`${iso}-05:00`);

const horarioDeOficina: PoliticaUso = {
  ...POLITICA_SIN_RESTRICCIONES,
  dias: [1, 2, 3, 4, 5],
  desdeMin: 6 * 60,
  hastaMin: 20 * 60,
  montoMaximo: 40_000,
  categorias: ['media', 'media_alta'],
  tiposServicio: ['inmediato', 'programado'],
  motivoObligatorio: true,
};

const viaje = (o: Partial<Parameters<typeof evaluarPolitica>[1]> = {}) => ({
  instante: bogota('2026-10-07T09:00:00'), // miércoles
  categoria: 'media' as const,
  tipoServicio: 'inmediato' as const,
  precioMaximo: 25_000,
  motivo: 'Reunión con cliente',
  ...o,
});

describe('políticas de uso (RN-102, RN-103)', () => {
  it('sin restricciones permite todo', () => {
    expect(
      evaluarPolitica(
        POLITICA_SIN_RESTRICCIONES,
        viaje({ instante: bogota('2026-10-11T03:00:00') }),
      ),
    ).toEqual({ permitido: true });
  });

  it('permite un viaje que cumple todo', () => {
    expect(evaluarPolitica(horarioDeOficina, viaje())).toEqual({ permitido: true });
  });

  it('bloquea fuera de los días permitidos y dice cuáles son', () => {
    const r = evaluarPolitica(horarioDeOficina, viaje({ instante: bogota('2026-10-10T09:00:00') }));
    expect(r).toMatchObject({ permitido: false, codigo: 'POLITICA_DIA' });
    expect((r as { detalle: string }).detalle).toContain('lunes');
  });

  it('bloquea fuera del horario, medido en hora de Bogotá', () => {
    expect(
      evaluarPolitica(horarioDeOficina, viaje({ instante: bogota('2026-10-07T21:30:00') })),
    ).toMatchObject({
      codigo: 'POLITICA_HORARIO',
    });
    // 01:00 UTC del jueves es las 20:00 del miércoles en Bogotá: ya fuera de la ventana
    expect(
      evaluarPolitica(horarioDeOficina, viaje({ instante: new Date('2026-10-08T01:00:00Z') })),
    ).toMatchObject({
      codigo: 'POLITICA_HORARIO',
    });
    expect(
      evaluarPolitica(horarioDeOficina, viaje({ instante: bogota('2026-10-07T19:59:00') }))
        .permitido,
    ).toBe(true);
  });

  it('una ventana que cruza la medianoche funciona', () => {
    const noche: PoliticaUso = {
      ...POLITICA_SIN_RESTRICCIONES,
      desdeMin: 22 * 60,
      hastaMin: 5 * 60,
    };
    expect(
      evaluarPolitica(noche, viaje({ instante: bogota('2026-10-07T23:30:00') })).permitido,
    ).toBe(true);
    expect(
      evaluarPolitica(noche, viaje({ instante: bogota('2026-10-08T04:00:00') })).permitido,
    ).toBe(true);
    expect(
      evaluarPolitica(noche, viaje({ instante: bogota('2026-10-08T12:00:00') })).permitido,
    ).toBe(false);
  });

  it('bloquea por monto, categoría, servicio y motivo', () => {
    expect(evaluarPolitica(horarioDeOficina, viaje({ precioMaximo: 40_001 }))).toMatchObject({
      codigo: 'POLITICA_MONTO',
    });
    expect(evaluarPolitica(horarioDeOficina, viaje({ precioMaximo: 40_000 })).permitido).toBe(true);
    expect(evaluarPolitica(horarioDeOficina, viaje({ categoria: 'alta' }))).toMatchObject({
      codigo: 'POLITICA_CATEGORIA',
    });
    expect(
      evaluarPolitica(horarioDeOficina, viaje({ tipoServicio: 'intermunicipal' })),
    ).toMatchObject({
      codigo: 'POLITICA_SERVICIO',
    });
    expect(evaluarPolitica(horarioDeOficina, viaje({ motivo: '   ' }))).toMatchObject({
      codigo: 'POLITICA_MOTIVO',
    });
    expect(evaluarPolitica(horarioDeOficina, viaje({ motivo: undefined }))).toMatchObject({
      codigo: 'POLITICA_MOTIVO',
    });
  });
});

describe('cupo y mora de la empresa (RN-104)', () => {
  const contrato = { estado: 'activa' as const, cupo: 1_000_000, diasPago: 15 };
  const base = {
    exposicion: 200_000,
    nuevo: 30_000,
    vencimientoMasAntiguo: null,
    hoy: '2026-10-08',
  };

  it('disponible dentro del cupo', () => {
    expect(evaluarEmpresa(contrato, base)).toEqual({ disponible: true });
  });

  it('sin cupo no hay tope', () => {
    expect(
      evaluarEmpresa({ ...contrato, cupo: null }, { ...base, exposicion: 99_000_000 }).disponible,
    ).toBe(true);
  });

  it('se agota cuando lo ya debido más el viaje pasa del cupo', () => {
    expect(evaluarEmpresa(contrato, { ...base, exposicion: 970_000 })).toEqual({
      disponible: true,
    });
    expect(evaluarEmpresa(contrato, { ...base, exposicion: 970_001 })).toMatchObject({
      codigo: 'CUPO_AGOTADO',
    });
  });

  it('un estado de cuenta vencido suspende el perfil corporativo', () => {
    expect(
      evaluarEmpresa(contrato, { ...base, vencimientoMasAntiguo: '2026-10-07' }),
    ).toMatchObject({
      codigo: 'CUENTA_VENCIDA',
    });
    // el mismo día del vencimiento todavía se puede pagar
    expect(
      evaluarEmpresa(contrato, { ...base, vencimientoMasAntiguo: '2026-10-08' }).disponible,
    ).toBe(true);
  });

  it('una empresa suspendida no puede cargar viajes', () => {
    expect(evaluarEmpresa({ ...contrato, estado: 'suspendida' }, base)).toMatchObject({
      codigo: 'EMPRESA_SUSPENDIDA',
    });
  });
});

describe('descuento pactado', () => {
  it('se calcula hacia abajo en pesos enteros', () => {
    expect(descuentoCorporativo(20_000, 500)).toBe(1_000); // 5 %
    expect(descuentoCorporativo(18_333, 500)).toBe(916);
    expect(descuentoCorporativo(20_000, 0)).toBe(0);
    expect(descuentoCorporativo(0, 500)).toBe(0);
  });

  it('nunca pasa del 50 %', () => {
    expect(descuentoCorporativo(10_000, 9_000)).toBe(5_000);
  });
});

describe('ciclos y estados de cuenta (RN-105)', () => {
  it('con corte el día 1 son los meses calendario', () => {
    expect(cicloDe(1, '2026-10-15')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(cicloDe(1, '2026-02-01')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });

  it('con otro día de corte el ciclo cruza de mes y de año', () => {
    expect(cicloDe(20, '2026-10-19')).toEqual({ desde: '2026-09-20', hasta: '2026-10-19' });
    expect(cicloDe(20, '2026-10-20')).toEqual({ desde: '2026-10-20', hasta: '2026-11-19' });
    expect(cicloDe(20, '2026-01-05')).toEqual({ desde: '2025-12-20', hasta: '2026-01-19' });
    expect(cicloDe(20, '2026-12-25')).toEqual({ desde: '2026-12-20', hasta: '2027-01-19' });
  });

  it('solo se factura el día de corte, y es el ciclo que acaba de cerrar', () => {
    expect(cicloParaFacturar(1, '2026-10-01')).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-30',
    });
    expect(cicloParaFacturar(20, '2026-10-20')).toEqual({
      desde: '2026-09-20',
      hasta: '2026-10-19',
    });
    expect(cicloParaFacturar(20, '2026-10-21')).toBeNull();
    expect(cicloParaFacturar(1, '2026-01-01')).toEqual({
      desde: '2025-12-01',
      hasta: '2025-12-31',
    });
  });

  it('el último ciclo cerrado se factura aunque ya haya pasado el día de corte', () => {
    expect(cicloCerrado(1, '2026-10-08')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(cicloCerrado(20, '2026-10-19')).toEqual({ desde: '2026-08-20', hasta: '2026-09-19' });
    expect(cicloCerrado(20, '2026-10-20')).toEqual({ desde: '2026-09-20', hasta: '2026-10-19' });
  });

  it('vence a los días pactados y se muestra vencido solo después', () => {
    expect(vencimientoDe('2026-10-01', 15)).toBe('2026-10-16');
    expect(estadoDeCuenta({ estado: 'emitido', venceEn: '2026-10-16' }, '2026-10-16')).toBe(
      'emitido',
    );
    expect(estadoDeCuenta({ estado: 'emitido', venceEn: '2026-10-16' }, '2026-10-17')).toBe(
      'vencido',
    );
    expect(estadoDeCuenta({ estado: 'pagado', venceEn: '2026-10-16' }, '2026-12-01')).toBe(
      'pagado',
    );
  });
});
