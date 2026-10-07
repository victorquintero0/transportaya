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

Todas las rutas requieren el rol `pasajero` (el celular entra con `app: "pasajero"` en la verificación del OTP).

| Método | Ruta | Descripción |
|---|---|---|
| GET / PATCH | `/v1/pasajero/yo` | Perfil: nombre, correo, deuda, términos aceptados, contactos, lugares y tarjetas |
| POST | `/v1/pasajero/terminos` | Aceptar los términos y la autorización de datos (versión vigente) |
| GET | `/v1/pasajero/mis-datos` · DELETE `/v1/pasajero/cuenta` | Descargar mis datos · eliminar la cuenta (anonimiza; no con viaje activo o deuda) |
| POST / DELETE | `/v1/pasajero/contactos[/{id}]` | Contactos de confianza (hasta 5) |
| POST / DELETE | `/v1/pasajero/lugares-guardados[/{id}]` | Lugares guardados; "Casa" y "Trabajo" se reemplazan |
| GET | `/v1/pasajero/lugares/buscar?q=&lat=&lng=` | Lugares y direcciones (`Cra 23 # 62-14`) y destinos recientes |
| GET | `/v1/pasajero/lugares/inversa?lat=&lng=` | Nombre del punto del mapa |
| GET | `/v1/pasajero/rutas` | Destinos con tarifa fija y su precio `solo_ida` / `ida_y_vuelta` |
| POST | `/v1/pasajero/cotizaciones` | Precio por categoría (rango), recargos, dinámica y ETA; o la tarifa fija de una ruta |
| POST | `/v1/pasajero/viajes` | Crear el viaje desde una cotización vigente, con PIN; empieza a buscar conductor |
| GET | `/v1/pasajero/viaje-actual` | El viaje activo, o el que acaba de terminar y falta calificar |
| GET | `/v1/pasajero/viajes[?estado=&antes=]` · `/{id}` · `/{id}/recibo` | Historial, detalle y recibo con cada concepto del precio |
| POST | `/v1/pasajero/viajes/{id}/cancelar` | Cancelar (gratis al buscar y 2 min tras la asignación; después, tarifa de cancelación) |
| POST | `/v1/pasajero/viajes/{id}/calificacion` · `/propina` | Calificar al conductor; propina (solo viajes pagados con tarjeta, completa al conductor) |
| GET / POST | `/v1/pasajero/viajes/{id}/mensajes` | Chat con el conductor, solo durante el viaje |
| POST / DELETE | `/v1/pasajero/viajes/{id}/compartir` | Crear o revocar el enlace del viaje |
| GET | `/v1/compartido/{token}` | **Público.** Lo que ve quien recibe el enlace: conductor, vehículo, placa, posición y barrio de destino |
| POST | `/v1/pasajero/sos` | SOS: alerta crítica con el viaje y la ubicación; avisa cuántos contactos de confianza hay |
| POST | `/v1/pasajero/metodos-pago` | Agregar tarjeta con el token de la pasarela; `PUT .../{id}/predeterminado`, `DELETE .../{id}` |
| POST | `/v1/pasajero/deuda/pagar` | Pagar la deuda con una tarjeta |
| GET / POST | `/v1/pasajero/soporte/tickets` | Reportar un problema u objeto perdido ligado a un viaje; ver mis reportes |

### Modo demostración para el pasajero

| Método | Ruta | Descripción |
|---|---|---|
| POST / DELETE | `/v1/dev/conductores-simulados` | Crea conductores de mentira cerca de un punto, que atienden el viaje de punta a punta (oferta, llegada, PIN, taxímetro, cobro); los quita |
| POST | `/v1/dev/tarjetas/tokenizar` | Hace de Wompi: recibe la tarjeta y devuelve solo un token. Un número que termina en `0002` queda como tarjeta que el banco rechaza al cobrar |

## App Conductor

Todas las rutas requieren el rol `conductor`. Los errores siguen RFC 9457 con un `codigo` estable.

| Método | Ruta | Descripción |
|---|---|---|
| GET / PATCH | `/v1/conductor/yo` | Perfil, vehículos, documentos requeridos con su estado, pasos del registro y si puede conectarse (con los motivos si no) |
| GET | `/v1/catalogo-vehiculos` | Marcas, líneas y años del catálogo, con su categoría |
| POST | `/v1/conductor/vehiculos` | Registrar vehículo (del catálogo, o manual: queda en revisión) |
| PUT | `/v1/conductor/vehiculo-activo` | Elegir con cuál trabaja |
| GET / POST | `/v1/conductor/documentos` | Estado de cada requisito · subir documento (`multipart`; el servidor valida el tipo real del archivo y que lo vigente no se pierda al renovar) |
| GET | `/v1/conductor/documentos/{id}/archivo` | Ver un documento propio |
| PUT | `/v1/conductor/cuenta-pago` | Llave Bre-B o cuenta bancaria (se guarda cifrada) |
| POST | `/v1/conductor/enviar-revision` | Pasar el registro a revisión de cumplimiento |
| POST | `/v1/conductor/conectar` | Pasar a disponible (valida habilitación, vehículo, deuda y documentos vigentes) |
| POST | `/v1/conductor/desconectar` | Pasar a desconectado |
| POST | `/v1/conductor/ubicaciones` | Posiciones en lote (también las guardadas sin conexión); reenviar es seguro |
| GET | `/v1/conductor/oferta-actual` | Oferta pendiente (recuperar al reconectar) |
| POST | `/v1/conductor/ofertas/{id}/aceptar` | Aceptar oferta; devuelve el viaje con destino exacto y la tarifa para el taxímetro |
| POST | `/v1/conductor/ofertas/{id}/rechazar` | Rechazar oferta (sin penalidad, RN-035) |
| GET | `/v1/conductor/viaje-actual` | Viaje activo (recuperar estado) |
| GET | `/v1/conductor/viajes` | Historial reciente |
| POST | `/v1/conductor/viajes/{id}/llegue` | Marcar llegada (solo a menos de 150 m de la recogida) |
| POST | `/v1/conductor/viajes/{id}/iniciar` | Iniciar viaje (con PIN si el pasajero lo eligió) |
| POST | `/v1/conductor/viajes/{id}/finalizar` | Finalizar con las mediciones del taxímetro (`distanciaM`, `tiempoDetenidoS`, `duracionS`); el servidor las compara con la trayectoria que recibió, aplica la tarifa y registra el dinero |
| POST | `/v1/conductor/viajes/{id}/efectivo-recibido` | Confirmar el efectivo recibido (si fue menos, queda deuda del pasajero y un caso de soporte) |
| POST | `/v1/conductor/viajes/{id}/cancelar` | Cancelar con motivo (pasajero ausente solo tras 5 min en sitio) |
| POST | `/v1/conductor/viajes/{id}/calificacion` | Calificar al pasajero |
| POST | `/v1/conductor/sos` | Alerta de emergencia a la torre de control |
| GET | `/v1/conductor/ganancias?periodo=` | Resumen por `hoy`, `ayer`, `semana`, `mes` (o `desde` y `hasta`) |
| GET | `/v1/conductor/saldo` · `movimientos` · `cierres` | Saldo y deuda, libro de movimientos, cierres diarios; el saldo incluye la llave a la que se paga la comisión (D-04) |
| POST | `/v1/conductor/pagos-comision` | Avisar que pagó la comisión (queda en revisión hasta conciliar) |
| GET / POST | `/v1/conductor/reservas` | Tablero de reservas y tomar una (F2) |

### Modo demostración (`/v1/dev/*`)

Solo existen con `SIMULADOR=true` y la API se niega a arrancar así en producción (D-26).

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/v1/dev/conductor/aprobar` | Hace de cumplimiento: aprueba los documentos y habilita al conductor |
| POST | `/v1/dev/pasajeros/viaje` | Un pasajero de mentira pide un viaje cerca (urbano o ruta nacional); devuelve el PIN |
| POST | `/v1/dev/pasajeros/viaje/{id}/cancelar` | El pasajero de mentira cancela |
| POST | `/v1/dev/cierre` | Adelanta el cierre diario de hoy |
| POST | `/v1/dev/pagos/entregar` | Hace de banco: consigna los pagos pendientes al conductor |
| POST | `/v1/dev/pagos-comision/simular` | Paga y concilia la comisión adeudada por Bre-B |

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

Conexión Socket.IO autenticada con el mismo token de acceso (`auth: { token }`); el servidor responde `listo` o `error:autenticacion`. El conductor entra a su sala y solo recibe lo suyo. Cada evento lleva `id`, `ocurrido_en` y, si aplica, `viaje_id`.
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
