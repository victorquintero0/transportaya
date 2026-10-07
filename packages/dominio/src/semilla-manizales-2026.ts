/**
 * Semilla de la tarifa urbana de Manizales para 2026, tomada de las tarifas de taxi con taxímetro
 * (D-20). En producción las tarifas son datos versionados (RN-014); esta constante sirve para
 * cargar la primera versión y para las pruebas.
 *
 * Fuente: Decreto 0641 del 31 de diciembre de 2025, Alcaldía de Manizales. Rige desde el 1 de enero de 2026.
 *
 * Decisiones de Negocio: $223 es por **minuto** de tiempo detenido (D-23) y las categorías Media Alta y Alta
 * suman $1.000 y $2.000 a la tarifa (D-22). Pendiente de Legal: si el decreto aplica a vehículos
 * particulares (D-19).
 */
export const TARIFA_TAXI_MANIZALES_2026 = {
  fuente: 'Decreto 0641 del 31 de diciembre de 2025, Alcaldía de Manizales',
  vigenteDesde: '2026-01-01',
  parametros: {
    base: 3700, // banderazo
    valorKm: 1784,
    valorMinuto: 223, // por minuto de tiempo detenido (D-23)
    minima: 6300,
  },
  recargos: {
    aeropuerto: 4700, // origen o destino en el aeropuerto
    horario: 1000, // nocturno, dominical o festivo; excluyentes (ver recargoHorario)
    moteles: 2300,
    zonaTermales: 2700, // no se cobra a residentes de la vereda Gallinazo
    puertaAPuerta: 800, // servicio solicitado por central telefónica o aplicación web
    mascotas: 1000,
  },
  /** Recargo fijo por categoría de vehículo (D-22). Se suma a la tarifa; no se multiplica por la dinámica. */
  recargoCategoria: { media: 0, media_alta: 1000, alta: 2000 },
  horaDeTrabajo: 42_000,
} as const;
