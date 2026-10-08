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

## Salud, métricas y datos personales

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/salud` · `/v1/listo` | Viva / lista para tráfico (503 si la base no responde) |
| GET | `/v1/metricas` | Formato Prometheus; exige `METRICAS_TOKEN` si está definido |
| POST | `/v1/telemetria/errores` | Las apps reportan errores no manejados (tope por dirección) |
| GET | `/v1/politica-datos` | Política de tratamiento de datos con su versión (pública) |
| GET | `/v1/datos/exportar` | Todo lo que se guarda de la persona (pasajero o conductor) |
| GET / POST | `/v1/datos/solicitudes` | Sus solicitudes (consulta, rectificación, supresión, revocatoria) con su fecha límite |
| POST | `/v1/conductor/terminos` | El conductor acepta la política vigente (necesario para enviar el registro) |

Todas las respuestas llevan `x-request-id`; las apps lo envían para unir sus errores con el registro del servidor.

## Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/v1/auth/otp` | Envía código OTP al celular (límite de intentos por número e IP) |
| POST | `/v1/auth/otp/verificar` | Verifica el código y devuelve tokens |
| POST | `/v1/auth/refrescar` | Rota el *refresh token* |
| POST | `/v1/auth/salir` | Revoca la sesión |
| POST | `/v1/op/auth/ingresar` | Ingreso de usuarios internos: correo + contraseña + código TOTP (RFC 6238). Un código no sirve dos veces; 5 intentos fallidos bloquean el correo 15 min |
| POST | `/v1/op/auth/enrolar` | Primer ingreso: con correo y contraseña entrega el secreto TOTP para la app de autenticación. Solo si el segundo factor aún no está activo |
| GET | `/v1/op/auth/demo` | Cuentas de demostración (una por rol) con su código vigente. **Solo existe con `SIMULADOR=true`** |

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

Todas las rutas exigen sesión de personal interno (`rol: interno`) y un **permiso** concreto, que sale de la matriz de
[docs/02](02-actores-roles-y-glosario.md#roles-internos-app-operación) implementada en `@transportaya/dominio` (`permisos.ts`). Los roles de la
persona se leen de la base **en cada petición**: quitarlos o desactivar la cuenta rige de inmediato. Toda acción que cambia datos
guarda su registro en la auditoría dentro de la misma transacción. Las listas aceptan `limite` (máx. 200) y `desplazar`.

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/v1/op/yo` | sesión interna | Nombre, roles y permisos de quien ingresó |
| POST | `/v1/op/yo/contrasena` | sesión interna | Cambia la contraseña propia |
| GET | `/v1/op/torre` | `torre.ver` | Foto de la operación: KPIs, flota con posición, viajes activos con semáforo, sin asignar y alertas |
| GET | `/v1/op/alertas?estado=` | `torre.ver` | Alertas, las críticas primero |
| POST | `/v1/op/alertas/{id}/tomar` · `/cerrar` | `torre.operar` | Tomar una alerta; cerrarla con nota (solo quien la tomó) |
| GET | `/v1/op/viajes?q=&estado=&desde=&hasta=` · `/{id}` · `/{id}/recorrido` | `viajes.ver` | Búsqueda, detalle (línea de tiempo, ofertas, pagos, chat, tickets, alertas) y posiciones del conductor |
| POST | `/v1/op/viajes/{id}/despachar` | `viajes.despachar` | Despacho manual a un conductor disponible (solo mientras el viaje busca conductor) |
| POST | `/v1/op/viajes/{id}/reasignar` · `/cancelar` | `viajes.despachar` | Reasignar (a un conductor o a búsqueda automática) y cancelar, siempre con motivo |
| POST | `/v1/op/viajes/{id}/ajustar-precio` | `viajes.ajustar_tarifa` | Corrige el precio de un viaje finalizado; la diferencia del conductor queda como ajuste de saldo pendiente |
| GET | `/v1/op/conductores?estado=&q=` · `/{id}` · `/v1/op/vencimientos` | `conductores.ver` | Cola de revisión, ficha completa y documentos por vencer |
| GET | `/v1/op/documentos/{id}/archivo` | `conductores.aprobar` | Imagen del documento (queda en la auditoría) |
| POST | `/v1/op/documentos/{id}/aprobar` · `/rechazar` | `conductores.aprobar` | Revisión de documentos; rechazar exige motivo |
| POST | `/v1/op/conductores/{id}/habilitar` · `/rechazar-registro` | `conductores.aprobar` | Aprobar el registro (con todos los documentos aprobados) o devolverlo |
| POST | `/v1/op/conductores/{id}/suspender` · `/reactivar` | `conductores.suspender` | Suspensión manual (no la levanta la revisión diaria) y reactivación |
| POST | `/v1/op/conductores/{id}/bloquear` | `conductores.bloquear` | Bloqueo: cierra sus sesiones |
| GET | `/v1/op/pasajeros` · `/{id}` | `pasajeros.ver` | Búsqueda y ficha |
| POST | `/v1/op/pasajeros/{id}/bloquear` · `/desbloquear` | `pasajeros.bloquear` | Con motivo; no se bloquea a quien tiene un viaje activo |
| GET | `/v1/op/tarifas` · POST `/v1/op/tarifas` | `tarifas.ver` · `tarifas.editar` | Versiones con sus recargos; crear una versión (se puede programar a futuro) |
| POST | `/v1/op/tarifas/simular` | `tarifas.ver` | Simulador con la lógica de la cotización, con la versión vigente o una futura |
| GET / POST / DELETE | `/v1/op/festivos` | `tarifas.ver` · `tarifas.editar` | Calendario de festivos |
| GET / PATCH | `/v1/op/rutas-fijas` | `tarifas.ver` · `tarifas.editar` | Rutas con tarifa fija; cambiar el valor crea una vigencia nueva |
| GET / POST / PATCH | `/v1/op/zonas` | `tarifas.ver` · `tarifas.editar` | Zonas con su polígono |
| GET / POST | `/v1/op/dinamica` · POST `/{id}/desactivar` | `tarifas.ver` · `dinamica.activar` | Dinámica manual por zona (hasta 12 h, entre ×1,05 y ×3) |
| GET | `/v1/op/finanzas/resumen` · `/cierres` · `/cobranza` · `/conductores/{id}/movimientos` | `finanzas.ver` | Cierres del día, cobranza y libro de movimientos |
| POST | `/v1/op/finanzas/cierres/ejecutar` | `finanzas.operar` | Corre el cierre de un día (idempotente por conductor) |
| POST | `/v1/op/finanzas/pagos-comision/{id}/conciliar` · `/rechazar` | `finanzas.operar` | Conciliar el pago de comisión (acredita y habilita) o rechazarlo |
| POST | `/v1/op/finanzas/conductores/{id}/habilitar` | `finanzas.operar` | Habilitar a mano a quien está bloqueado por deuda, con motivo |
| GET / POST | `/v1/op/finanzas/pagos-conductor` · `/{id}/enviar` · `/confirmar` · `/rechazar` | `finanzas.ver` · `finanzas.operar` | Pagos a conductores por llave o Bre-B |
| GET / POST | `/v1/op/finanzas/ajustes` · `/{id}/aprobar` · `/rechazar` | `finanzas.ver` · `finanzas.proponer_ajuste` · `finanzas.aprobar_ajuste` | Ajustes de saldo con **doble aprobación**: quien propone no aprueba |
| GET / POST / PATCH | `/v1/op/tickets` · `/{id}` · `/{id}/mensajes` | `tickets.ver` · `tickets.gestionar` | Bandeja con plazo (SLA), respuestas y notas internas |
| POST | `/v1/op/tickets/{id}/reembolso` | `reembolsos.crear` | Reembolso; soporte hasta su límite, por encima finanzas o supervisión |
| GET | `/v1/op/reportes/tiempos` · `/viajes.csv` · `/tiempos.csv` | `reportes.ver` | Tiempos y movimientos y exportación a CSV (queda en la auditoría) |
| GET / POST / PATCH | `/v1/op/usuarios` · `/{id}` | `usuarios.ver` · `usuarios.gestionar` | Personal interno, roles y estado |
| POST | `/v1/op/usuarios/{id}/reiniciar-segundo-factor` · `/restablecer-contrasena` | `usuarios.gestionar` | Para quien perdió su dispositivo o su contraseña; cierra sus sesiones |
| GET | `/v1/op/auditoria?accion=&entidad=&desde=` | `usuarios.ver` | Consulta del registro de auditoría |
| GET / PUT / DELETE | `/v1/op/parametros` · `/{clave}` | `config.ver` · `config.editar` | Parámetros operativos; los de despacho rigen en caliente |
| GET / PUT | `/v1/op/mapa` | `config.ver` · `config.editar` | Proveedor del mapa de las apps (clave enmascarada, con motivo y auditoría) |
| GET | `/v1/mapa/config` | pública | Qué mapa muestran las apps: `{ proveedor, estilo, estiloOscuro }` (caché de 1 min) |
| GET | `/v1/op/sistema` | `sistema.ver` | Salud técnica: base de datos, tareas programadas, tráfico y conexiones ([doc 15](15-observabilidad-y-privacidad.md)) |
| GET | `/v1/op/privacidad/solicitudes` · `/{id}` | `privacidad.ver` | Solicitudes de las personas sobre sus datos, con plazo y semáforo |
| POST | `/v1/op/privacidad/solicitudes/{id}/tomar` · `/resolver` | `privacidad.responder` (borrar: `privacidad.suprimir`) | Responder; aceptar una supresión anonimiza la cuenta |

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
| `torre:cambio` | Operación | Algo cambió en la operación (viaje, oferta, conductor, alerta); se agrupa a como mucho un aviso por segundo y la pantalla vuelve a pedir `/v1/op/torre` |
| `alerta:nueva` · `alerta:actualizada` | Operación | Alertas automáticas y SOS (el servidor las detecta cada 2 s) |

### Del cliente al servidor

| Evento | Origen | Contenido |
|---|---|---|
| `conductor:ubicacion` | Conductor | `lat`, `lng`, `precision_m`, `velocidad`, `rumbo`, `registrada_en` (uno o varios puntos) |
| `latido` | Todos | Mantener la conexión y medir latencia |

Las acciones que cambian estado (aceptar oferta, iniciar viaje, etc.) se hacen **siempre por REST**, para tener
respuestas claras, idempotencia y reintentos simples.
