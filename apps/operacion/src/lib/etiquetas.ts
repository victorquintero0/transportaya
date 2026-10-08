import type { Tono } from '../componentes/ui.tsx';

export const ESTADO_VIAJE: Record<string, { texto: string; tono: Tono }> = {
  programado: { texto: 'Programado', tono: 'info' },
  buscando_conductor: { texto: 'Buscando conductor', tono: 'aviso' },
  asignado: { texto: 'Conductor en camino', tono: 'info' },
  en_sitio: { texto: 'Conductor en sitio', tono: 'info' },
  en_curso: { texto: 'En curso', tono: 'ok' },
  finalizado: { texto: 'Finalizado', tono: 'neutro' },
  cancelado: { texto: 'Cancelado', tono: 'error' },
  sin_conductor: { texto: 'Sin conductor', tono: 'error' },
};

export const ESTADO_OPERATIVO: Record<string, { texto: string; tono: Tono }> = {
  desconectado: { texto: 'Desconectado', tono: 'neutro' },
  disponible: { texto: 'Disponible', tono: 'ok' },
  con_oferta: { texto: 'Con oferta', tono: 'aviso' },
  en_camino: { texto: 'En camino', tono: 'info' },
  en_sitio: { texto: 'En sitio', tono: 'info' },
  en_viaje: { texto: 'En viaje', tono: 'uva' },
  sin_senal: { texto: 'Sin señal', tono: 'error' },
};

export const HABILITACION: Record<string, { texto: string; tono: Tono }> = {
  registro_incompleto: { texto: 'Registro incompleto', tono: 'neutro' },
  en_revision: { texto: 'En revisión', tono: 'aviso' },
  rechazado: { texto: 'Rechazado', tono: 'error' },
  habilitado: { texto: 'Habilitado', tono: 'ok' },
  suspendido: { texto: 'Suspendido', tono: 'aviso' },
  bloqueado: { texto: 'Bloqueado', tono: 'error' },
};

export const TIPO_ALERTA: Record<string, string> = {
  sos: 'SOS',
  parada_no_prevista: 'Parada no prevista',
  perdida_senal: 'Pérdida de señal',
  desvio_ruta: 'Desvío de ruta',
  viaje_excedido: 'Viaje excedido',
  velocidad_excesiva: 'Velocidad excesiva',
  reserva_sin_conductor: 'Reserva sin conductor',
  demanda_insatisfecha: 'Demanda insatisfecha',
  cancelaciones_repetidas: 'Cancelaciones repetidas',
  documento_vencido: 'Documento vencido',
  calificacion_seguridad: 'Calificación de seguridad',
  diferencia_taximetro: 'Diferencia de taxímetro',
};

export const SEVERIDAD: Record<string, { texto: string; tono: Tono }> = {
  critica: { texto: 'Crítica', tono: 'error' },
  alta: { texto: 'Alta', tono: 'aviso' },
  media: { texto: 'Media', tono: 'info' },
  baja: { texto: 'Baja', tono: 'neutro' },
};

export const TIPO_DOCUMENTO: Record<string, string> = {
  documento_identidad: 'Documento de identidad',
  licencia_conduccion: 'Licencia de conducción',
  antecedentes: 'Antecedentes',
  simit: 'SIMIT',
  selfie: 'Foto del conductor',
  certificacion_bancaria: 'Certificación bancaria',
  licencia_transito: 'Licencia de tránsito',
  soat: 'SOAT',
  revision_tecnicomecanica: 'Revisión técnico-mecánica',
  seguro_todo_riesgo: 'Seguro todo riesgo',
  poliza_pasajeros: 'Póliza de pasajeros',
  fotos_vehiculo: 'Fotos del vehículo',
  rut: 'RUT',
};

export const ESTADO_DOCUMENTO: Record<string, { texto: string; tono: Tono }> = {
  pendiente: { texto: 'Por revisar', tono: 'aviso' },
  aprobado: { texto: 'Aprobado', tono: 'ok' },
  rechazado: { texto: 'Rechazado', tono: 'error' },
  vencido: { texto: 'Vencido', tono: 'error' },
};

export const TIPO_TICKET: Record<string, string> = {
  peticion: 'Petición',
  queja: 'Queja',
  reclamo: 'Reclamo',
  sugerencia: 'Sugerencia',
  objeto_perdido: 'Objeto perdido',
  cobro_incorrecto: 'Cobro incorrecto',
  incidente_seguridad: 'Incidente de seguridad',
};

export const ESTADO_TICKET: Record<string, { texto: string; tono: Tono }> = {
  abierto: { texto: 'Abierto', tono: 'aviso' },
  en_proceso: { texto: 'En proceso', tono: 'info' },
  esperando_usuario: { texto: 'Esperando al usuario', tono: 'uva' },
  resuelto: { texto: 'Resuelto', tono: 'ok' },
  cerrado: { texto: 'Cerrado', tono: 'neutro' },
};

export const PRIORIDAD: Record<string, { texto: string; tono: Tono }> = {
  baja: { texto: 'Baja', tono: 'neutro' },
  normal: { texto: 'Normal', tono: 'info' },
  alta: { texto: 'Alta', tono: 'aviso' },
  critica: { texto: 'Crítica', tono: 'error' },
};

export const TIPO_MOVIMIENTO: Record<string, string> = {
  ingreso_viaje_electronico: 'Viaje electrónico',
  comision_viaje_efectivo: 'Comisión de viaje en efectivo',
  peaje: 'Peaje',
  propina: 'Propina',
  cancelacion: 'Tarifa de cancelación',
  pago_comision: 'Pago de comisión',
  pago_liquidacion: 'Pago al conductor',
  ajuste: 'Ajuste manual',
};

export const METODO_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  local: 'Pago local',
  corporativo: 'Empresa',
};

export const CATEGORIA: Record<string, string> = {
  media: 'Media',
  media_alta: 'Media Alta',
  alta: 'Alta',
};

export const TIPO_SERVICIO: Record<string, string> = {
  inmediato: 'Inmediato',
  programado: 'Programado',
  aeropuerto: 'Aeropuerto',
  intermunicipal: 'Intermunicipal',
};

export const TIPO_ZONA: Record<string, string> = {
  area_servicio: 'Área de servicio',
  aeropuerto: 'Aeropuerto',
  restringida: 'Zona restringida',
  punto_encuentro: 'Punto de encuentro',
  termales: 'Termales',
  moteles: 'Moteles',
};

export const ACCION_AUDITORIA: Record<string, string> = {
  'sesion.ingresar': 'Inició sesión',
  'viaje.despachar': 'Despachó un viaje',
  'viaje.reasignar': 'Reasignó un viaje',
  'viaje.cancelar': 'Canceló un viaje',
  'viaje.ajustar_precio': 'Ajustó el precio de un viaje',
  'alerta.tomar': 'Tomó una alerta',
  'alerta.cerrar': 'Cerró una alerta',
  'documento.aprobar': 'Aprobó un documento',
  'documento.rechazar': 'Rechazó un documento',
  'documento.ver': 'Vio un documento',
  'conductor.habilitar': 'Habilitó a un conductor',
  'conductor.rechazar': 'Devolvió un registro',
  'conductor.suspender': 'Suspendió a un conductor',
  'conductor.bloquear': 'Bloqueó a un conductor',
  'conductor.reactivar': 'Reactivó a un conductor',
  'conductor.habilitar_por_deuda': 'Habilitó por deuda a mano',
  'pasajero.bloquear': 'Bloqueó a un pasajero',
  'pasajero.desbloquear': 'Desbloqueó a un pasajero',
  'tarifa.crear_version': 'Creó una versión de tarifa',
  'festivo.agregar': 'Agregó un festivo',
  'festivo.quitar': 'Quitó un festivo',
  'ruta_fija.actualizar': 'Actualizó una ruta fija',
  'zona.crear': 'Creó una zona',
  'zona.actualizar': 'Actualizó una zona',
  'dinamica.activar': 'Activó dinámica',
  'dinamica.desactivar': 'Desactivó dinámica',
  'cierre.ejecutar': 'Ejecutó el cierre diario',
  'pago_comision.conciliar': 'Concilió un pago de comisión',
  'pago_comision.rechazar': 'Rechazó un pago de comisión',
  'pago_conductor.enviar': 'Envió un pago a un conductor',
  'pago_conductor.confirmar': 'Confirmó un pago a un conductor',
  'pago_conductor.rechazar': 'Rechazó un pago a un conductor',
  'ajuste_saldo.proponer': 'Propuso un ajuste de saldo',
  'ajuste_saldo.aprobar': 'Aprobó un ajuste de saldo',
  'ajuste_saldo.rechazar': 'Rechazó un ajuste de saldo',
  'ticket.crear': 'Creó un ticket',
  'ticket.responder': 'Respondió un ticket',
  'ticket.nota_interna': 'Dejó una nota interna',
  'ticket.actualizar': 'Actualizó un ticket',
  'reembolso.crear': 'Hizo un reembolso',
  'reporte.exportar': 'Exportó un reporte',
  'empleado.crear': 'Creó un usuario interno',
  'empleado.actualizar': 'Cambió un usuario interno',
  'empleado.desactivar': 'Desactivó un usuario interno',
  'empleado.reiniciar_totp': 'Reinició el segundo factor',
  'empleado.restablecer_contrasena': 'Restableció una contraseña',
  'empleado.cambiar_contrasena': 'Cambió su contraseña',
  'parametro.cambiar': 'Cambió un parámetro',
  'parametro.restablecer': 'Restableció un parámetro',
};

export const etiquetaAccion = (a: string): string => ACCION_AUDITORIA[a] ?? a;

export const EVENTO_VIAJE: Record<
  string,
  {
    texto: string;
    icono:
      | 'ok'
      | 'carro'
      | 'pin'
      | 'alerta'
      | 'cerrar'
      | 'reloj'
      | 'billetera'
      | 'mensaje'
      | 'rayo'
      | 'usuario';
  }
> = {
  solicitado: { texto: 'El pasajero pidió el viaje', icono: 'usuario' },
  oferta_enviada: { texto: 'Oferta enviada a un conductor', icono: 'rayo' },
  oferta_rechazada: { texto: 'El conductor rechazó la oferta', icono: 'cerrar' },
  oferta_expirada: { texto: 'La oferta venció sin respuesta', icono: 'reloj' },
  asignado: { texto: 'Viaje asignado', icono: 'carro' },
  llegue: { texto: 'El conductor llegó a la recogida', icono: 'pin' },
  iniciado: { texto: 'El viaje comenzó', icono: 'carro' },
  finalizado: { texto: 'El viaje terminó', icono: 'ok' },
  cancelado: { texto: 'Viaje cancelado', icono: 'cerrar' },
  cancelado_por_conductor: { texto: 'El conductor dejó el viaje', icono: 'cerrar' },
  reasignado_por_operacion: { texto: 'Operación reasignó el viaje', icono: 'carro' },
  precio_ajustado: { texto: 'Operación ajustó el precio', icono: 'billetera' },
  efectivo_confirmado: { texto: 'El conductor confirmó el efectivo', icono: 'billetera' },
  propina: { texto: 'El pasajero dejó una propina', icono: 'billetera' },
  mensaje: { texto: 'Mensaje en el chat', icono: 'mensaje' },
  sos: { texto: 'Botón SOS', icono: 'alerta' },
  sin_conductor: { texto: 'No se encontró conductor', icono: 'alerta' },
};
