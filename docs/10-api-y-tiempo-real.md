# 10 · API y tiempo real

Lista **inicial** de endpoints y eventos para orientar el desarrollo. La especificación definitiva es el
documento OpenAPI que genera el backend.

## Convenciones

- REST con JSON sobre HTTPS, versión en la ruta: `/v1/...`.
- Autenticación con `Authorization: Bearer <token>`.
- Prefijos por aplicación: `/v1/...` (pasajero), `/v1/conductor/...`, `/v1/op/...` (operación). Cada prefijo
  exige el tipo de usuario y los permisos correspondientes.
- Fechas en ISO 8601 UTC; dinero en pesos enteros; coordenadas como `{ "lat": 4.6097, "lng": -74.0817 }`.
- **Idempotencia:** las operaciones que crean viajes, cobran o reembolsan aceptan el encabezado
  `Idempotency-Key`. Repetir la petición con la misma clave devuelve el mismo resultado.
- **Paginación** por cursor: `?cursor=...&limite=50`.
- **Errores** en formato *Problem Details* (RFC 9457) con un `codigo` estable, por ejemplo:

  ```json
  {
    "type": "/errores/deuda-pendiente",
    "title": "Tienes una deuda pendiente",
    "status": 409,
    "codigo": "DEUDA_PENDIENTE",
    "detail": "Paga $ 12.300 para poder pedir un nuevo viaje."
  }
  ```

## Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/v1/auth/otp` | Envía código OTP al celular (límite de intentos por número e IP) |
| POST | `/v1/auth/otp/verificar` | Verifica el código y devuelve tokens |
| POST | `/v1/auth/refrescar` | Rota el *refresh token* |
| POST | `/v1/auth/salir` | Revoca la sesión |
| POST | `/v1/op/auth/ingresar` | Ingreso de usuarios internos (correo + contraseña + TOTP) |

## App Pasajero

| Método | Ruta | Descripción |
|---|---|---|
| GET / PATCH | `/v1/yo` | Perfil |
| GET / POST / DELETE | `/v1/lugares` | Lugares guardados |
| GET | `/v1/direcciones/buscar?q=` | Autocompletado de direcciones |
| GET | `/v1/direcciones/inversa?lat=&lng=` | Dirección de unas coordenadas |
| GET | `/v1/rutas-fijas` | Destinos nacionales con tarifa fija, `solo_ida` o `ida_y_vuelta` |
| GET / POST / DELETE | `/v1/metodos-pago` | Métodos de pago (el alta usa el token de la pasarela) |
| POST | `/v1/cotizaciones` | Precio y ETA por categoría para origen y destino |
| POST | `/v1/viajes` | Crear viaje desde una cotización vigente |
| GET | `/v1/viajes/{id}` | Estado actual del viaje |
| GET | `/v1/viajes` | Historial |
| POST | `/v1/viajes/{id}/cancelar` | Cancelar (responde el costo si aplica) |
| POST | `/v1/viajes/{id}/destino` | Cambiar destino (F2) |
| POST | `/v1/viajes/{id}/compartir` | Crear enlace de viaje compartido |
| POST | `/v1/viajes/{id}/sos` | Activar SOS |
| POST | `/v1/viajes/{id}/calificacion` | Calificar al conductor |
| POST | `/v1/viajes/{id}/propina` | Dar propina |
| GET / POST | `/v1/viajes/{id}/mensajes` | Chat |
| GET | `/v1/deudas` · POST `/v1/deudas/{id}/pagar` | Deudas pendientes |
| GET / POST | `/v1/tickets` | Soporte y PQRS |

## App Conductor

| Método | Ruta | Descripción |
|---|---|---|
| GET / PATCH | `/v1/conductor/yo` | Perfil y estado de habilitación |
| GET / POST | `/v1/conductor/documentos` | Documentos (la carga usa URL firmada al almacenamiento) |
| GET / POST | `/v1/conductor/vehiculos` | Vehículos y vehículo activo |
| GET | `/v1/catalogo-vehiculos` | Marcas, líneas y años del catálogo, con su categoría |
| POST | `/v1/conductor/conectar` | Pasar a disponible (valida documentos, deuda y vehículo) |
| POST | `/v1/conductor/desconectar` | Pasar a desconectado |
| POST | `/v1/conductor/ofertas/{id}/aceptar` | Aceptar oferta |
| POST | `/v1/conductor/ofertas/{id}/rechazar` | Rechazar oferta |
| GET | `/v1/conductor/viaje-actual` | Viaje activo (para recuperar estado al reconectar) |
| POST | `/v1/conductor/viajes/{id}/llegue` | Marcar llegada (valida distancia) |
| POST | `/v1/conductor/viajes/{id}/iniciar` | Iniciar viaje (con PIN si aplica) |
| POST | `/v1/conductor/viajes/{id}/finalizar` | Finalizar y calcular precio final |
| POST | `/v1/conductor/viajes/{id}/efectivo-recibido` | Confirmar valor recibido |
| POST | `/v1/conductor/viajes/{id}/cancelar` | Cancelar con motivo |
| POST | `/v1/conductor/ubicaciones` | Envío en lote de ubicaciones guardadas sin conexión |
| GET | `/v1/conductor/ganancias?desde=&hasta=` | Resumen y detalle de ganancias |
| GET | `/v1/conductor/saldo` · `/v1/conductor/movimientos` | Saldo y libro de movimientos |
| GET | `/v1/conductor/cierres` · `/v1/conductor/deuda` | Cierres diarios, deuda y datos de la llave de TransporteYa |
| GET / POST | `/v1/conductor/reservas` | Tablero de reservas y tomar una (F2) |

## App Operación

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/op/flota` | Foto actual de conductores en línea (al abrir la torre de control) |
| GET | `/v1/op/viajes` · `/v1/op/viajes/{id}` | Búsqueda y detalle con eventos y ofertas |
| GET | `/v1/op/viajes/{id}/recorrido` | Trayectoria GPS del viaje |
| POST | `/v1/op/viajes/{id}/despachar` | Despacho manual a un conductor |
| POST | `/v1/op/viajes/{id}/cancelar` | Cancelar con motivo |
| POST | `/v1/op/viajes/{id}/ajustar-precio` | Ajuste de tarifa con motivo |
| GET / PATCH | `/v1/op/alertas` · `/v1/op/alertas/{id}` | Tomar y cerrar alertas |
| GET | `/v1/op/conductores` · `/v1/op/conductores/{id}` | Búsqueda y ficha |
| POST | `/v1/op/documentos/{id}/aprobar` · `/rechazar` | Revisión de documentos |
| POST | `/v1/op/conductores/{id}/suspender` · `/bloquear` · `/reactivar` | Cambios de estado |
| GET | `/v1/op/pasajeros` · `/v1/op/pasajeros/{id}` | Búsqueda y ficha |
| GET / POST | `/v1/op/tarifas` · POST `/v1/op/tarifas/{id}/publicar` | Versiones de tarifa |
| POST | `/v1/op/tarifas/simular` | Simulador de precio |
| GET / POST / PATCH | `/v1/op/zonas` | Zonas y geocercas |
| PUT | `/v1/op/dinamica/{zona}` | Fijar o desactivar dinámica manual |
| GET / POST | `/v1/op/cierres` · POST `/{id}/aprobar` | Cierre diario por conductor |
| POST | `/v1/op/pagos-conductores` | Ejecutar o registrar pagos por llave / Bre-B |
| POST | `/v1/op/conductores/{id}/pagos-comision` · `/habilitar` · `/ajustes` | Conciliar pago de comisión, habilitar manualmente y ajustar saldo |
| GET / PATCH | `/v1/op/tickets` · `/v1/op/tickets/{id}` | Bandeja de soporte |
| POST | `/v1/op/pagos/{id}/reembolsos` | Reembolso |
| GET | `/v1/op/reportes/{tipo}?formato=csv` | Reportes de tiempos y movimientos |
| GET | `/v1/op/auditoria` | Consulta de auditoría |

## Integraciones entrantes

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/v1/webhooks/pagos/{proveedor}` | Resultado de cobros y reembolsos; se valida la firma del proveedor y se procesa de forma idempotente |
| GET | `/v1/compartido/{token}` | Datos del viaje compartido (público, expira) |

## Eventos WebSocket

Conexión Socket.IO autenticada con el mismo token. Cada evento lleva `id`, `ocurrido_en` y, si aplica, `viaje_id`.
Los eventos son **avisos**: al reconectar, el cliente vuelve a pedir el estado por REST.

### Del servidor al cliente

| Evento | Destino | Contenido |
|---|---|---|
| `viaje:estado` | Pasajero, conductor, operación | Nuevo estado del viaje y datos relevantes (conductor asignado, precio final...) |
| `viaje:ubicacion_conductor` | Pasajero, enlace compartido | Posición, rumbo y ETA actualizado |
| `viaje:mensaje` | Pasajero, conductor | Mensaje de chat |
| `oferta:nueva` | Conductor | Datos de la oferta y hora de expiración |
| `oferta:retirada` | Conductor | El pasajero canceló o expiró |
| `conductor:estado` | Conductor | Suspensión, sin señal, bloqueo o habilitación por deuda |
| `flota:resumen` | Operación | Posiciones y estados de la flota cada `[2 s]` |
| `alerta:nueva` · `alerta:actualizada` | Operación | Alertas automáticas y SOS |
| `operacion:indicadores` | Operación | KPIs del momento cada `[10 s]` |

### Del cliente al servidor

| Evento | Origen | Contenido |
|---|---|---|
| `conductor:ubicacion` | Conductor | `lat`, `lng`, `precision_m`, `velocidad`, `rumbo`, `registrada_en` (uno o varios puntos) |
| `latido` | Todos | Mantener la conexión y medir latencia |

Las acciones que cambian estado (aceptar oferta, iniciar viaje, etc.) se hacen **siempre por REST**, para tener
respuestas claras, idempotencia y reintentos simples.
