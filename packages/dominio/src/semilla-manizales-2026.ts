/**
 * Semilla de la tarifa urbana de Manizales para 2026, tomada de las tarifas de taxi con taxímetro
 * (D-20). En producción las tarifas son datos versionados (RN-014); esta constante sirve para
 * cargar la primera versión y para las pruebas.
 *
 * Fuente: Decreto 0641 del 31 de diciembre de 2025, Alcaldía de Manizales. Rige desde el 1 de enero de 2026.
 *
 * Pendiente de decisión (docs/13): si el decreto de taxis aplica a vehículos particulares (D-19),
 * cómo se traduce a las categorías Media Alta y Alta (D-22) y cómo se mide el tiempo detenido (D-23).
 */
export const TARIFA_TAXI_MANIZALES_2026 = {
  fuente: 'Decreto 0641 del 31 de diciembre de 2025, Alcaldía de Manizales',
  vigenteDesde: '2026-01-01',
  parametros: {
    base: 3700, // banderazo
    valorKm: 1784,
    valorMinuto: 223, // por tiempo detenido; la unidad (minuto) es una interpretación: ver D-23
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
  horaDeTrabajo: 42_000,
} as const;
