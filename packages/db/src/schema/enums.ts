import {
  CATEGORIAS_VEHICULO,
  ESTADOS_EMPRESA,
  ESTADOS_PAGO,
  ESTADOS_VIAJE,
  ESTADOS_VINCULO,
  ROLES_INTERNOS,
  TIPOS_MOVIMIENTO,
  TIPOS_SERVICIO,
} from '@transportaya/dominio';
import { pgEnum } from 'drizzle-orm/pg-core';

// Los enums que existen también en el dominio se crean desde esas mismas constantes.
export const categoriaVehiculo = pgEnum('categoria_vehiculo', CATEGORIAS_VEHICULO);
export const estadoViaje = pgEnum('estado_viaje', ESTADOS_VIAJE);
export const estadoPago = pgEnum('estado_pago', ESTADOS_PAGO);
export const tipoServicio = pgEnum('tipo_servicio', TIPOS_SERVICIO);
export const tipoMovimiento = pgEnum('tipo_movimiento', TIPOS_MOVIMIENTO);

export const estadoUsuario = pgEnum('estado_usuario', ['activo', 'bloqueado', 'anonimizado']);
export const rolInterno = pgEnum('rol_interno', ROLES_INTERNOS);

/** Empresas clientes (RN-100 a RN-105). */
export const estadoEmpresa = pgEnum('estado_empresa', ESTADOS_EMPRESA);
export const estadoVinculo = pgEnum('estado_vinculo', ESTADOS_VINCULO);
export const estadoCuentaEmpresa = pgEnum('estado_cuenta_empresa', [
  'emitido',
  'pagado',
  'anulado',
]);

export const estadoHabilitacion = pgEnum('estado_habilitacion', [
  'registro_incompleto',
  'en_revision',
  'rechazado',
  'habilitado',
  'suspendido',
  'bloqueado',
]);
export const estadoOperativo = pgEnum('estado_operativo', [
  'desconectado',
  'disponible',
  'con_oferta',
  'en_camino',
  'en_sitio',
  'en_viaje',
  'sin_senal',
]);

export const relacionVehiculo = pgEnum('relacion_vehiculo', ['propietario', 'autorizado']);
export const titularDocumento = pgEnum('titular_documento', ['conductor', 'vehiculo']);
export const tipoDocumento = pgEnum('tipo_documento', [
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
]);
export const estadoDocumento = pgEnum('estado_documento', [
  'pendiente',
  'aprobado',
  'rechazado',
  'vencido',
]);
export const tipoCuentaPago = pgEnum('tipo_cuenta_pago', ['llave_bre_b', 'cuenta_bancaria']);

export const tipoRecargo = pgEnum('tipo_recargo', ['fijo', 'porcentaje']);
export const tipoZona = pgEnum('tipo_zona', [
  'area_servicio',
  'aeropuerto',
  'restringida',
  'punto_encuentro',
  'termales',
  'moteles',
]);
export const modalidadRuta = pgEnum('modalidad_ruta', ['solo_ida', 'ida_y_vuelta']);

export const metodoPagoViaje = pgEnum('metodo_pago_viaje', [
  'efectivo',
  'tarjeta',
  'local',
  'corporativo',
]);
export const tipoMetodoPago = pgEnum('tipo_metodo_pago', ['tarjeta', 'nequi', 'pse', 'bre_b']);
export const tipoPago = pgEnum('tipo_pago', ['efectivo', 'electronico']);
export const actorTipo = pgEnum('actor_tipo', ['pasajero', 'conductor', 'operacion', 'sistema']);
export const resultadoOferta = pgEnum('resultado_oferta', [
  'pendiente',
  'aceptada',
  'rechazada',
  'expirada',
  'retirada',
]);

export const severidadAlerta = pgEnum('severidad_alerta', ['critica', 'alta', 'media', 'baja']);
export const estadoAlerta = pgEnum('estado_alerta', ['abierta', 'tomada', 'cerrada']);
export const tipoAlerta = pgEnum('tipo_alerta', [
  'sos',
  'parada_no_prevista',
  'perdida_senal',
  'desvio_ruta',
  'viaje_excedido',
  'velocidad_excesiva',
  'reserva_sin_conductor',
  'demanda_insatisfecha',
  'cancelaciones_repetidas',
  'documento_vencido',
  'calificacion_seguridad',
  'diferencia_taximetro',
]);

export const resultadoCierre = pgEnum('resultado_cierre', ['a_favor', 'a_cargo', 'en_cero']);
export const estadoCierre = pgEnum('estado_cierre', [
  'abierto',
  'por_pagar',
  'por_cobrar',
  'pagado',
  'cobrado',
  'sin_movimiento',
]);
export const estadoTransferencia = pgEnum('estado_transferencia', [
  'pendiente',
  'enviada',
  'confirmada',
  'rechazada',
]);
export const estadoConciliacion = pgEnum('estado_conciliacion', [
  'pendiente',
  'conciliado',
  'rechazado',
]);

export const tipoTicket = pgEnum('tipo_ticket', [
  'peticion',
  'queja',
  'reclamo',
  'sugerencia',
  'objeto_perdido',
  'cobro_incorrecto',
  'incidente_seguridad',
]);
export const estadoTicket = pgEnum('estado_ticket', [
  'abierto',
  'en_proceso',
  'esperando_usuario',
  'resuelto',
  'cerrado',
]);
export const prioridadTicket = pgEnum('prioridad_ticket', ['baja', 'normal', 'alta', 'critica']);
