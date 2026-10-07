import { describe, expect, it } from 'vitest';
import { permisosDe, tienePermiso } from './permisos.js';

describe('permisos de operación', () => {
  it('el monitor despacha pero no ajusta tarifas ni ve finanzas', () => {
    expect(tienePermiso(['monitor'], 'viajes.despachar')).toBe(true);
    expect(tienePermiso(['monitor'], 'viajes.ajustar_tarifa')).toBe(false);
    expect(tienePermiso(['monitor'], 'finanzas.ver')).toBe(false);
  });

  it('solo el administrador edita tarifas y gestiona usuarios', () => {
    expect(tienePermiso(['supervisor'], 'tarifas.editar')).toBe(false);
    expect(tienePermiso(['admin'], 'tarifas.editar')).toBe(true);
    expect(tienePermiso(['admin'], 'usuarios.gestionar')).toBe(true);
    expect(tienePermiso(['supervisor'], 'usuarios.gestionar')).toBe(false);
  });

  it('el financiero propone ajustes pero no los aprueba', () => {
    expect(tienePermiso(['financiero'], 'finanzas.proponer_ajuste')).toBe(true);
    expect(tienePermiso(['financiero'], 'finanzas.aprobar_ajuste')).toBe(false);
    expect(tienePermiso(['supervisor'], 'finanzas.aprobar_ajuste')).toBe(true);
  });

  it('cumplimiento aprueba documentos y no despacha', () => {
    expect(tienePermiso(['cumplimiento'], 'conductores.aprobar')).toBe(true);
    expect(tienePermiso(['cumplimiento'], 'viajes.despachar')).toBe(false);
  });

  it('con varios roles se suman los permisos', () => {
    const p = permisosDe(['soporte', 'financiero']);
    expect(p).toContain('tickets.gestionar');
    expect(p).toContain('finanzas.operar');
    expect(p).not.toContain('tarifas.editar');
  });
});
