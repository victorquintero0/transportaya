# 15 · Observabilidad y protección de datos

Qué se puede ver del sistema en funcionamiento y cómo se cumple la Ley 1581 de 2012 en el código. Complementa los
[requisitos no funcionales](11-requisitos-no-funcionales.md) (RNF-60 a 66 y RNF-80 a 83).

## 1. Observabilidad

### Registro (RNF-80)

La API escribe **una línea JSON por evento** (`LOG_FORMATO=json`, por defecto en producción; en desarrollo sale legible). Cada línea
trae la hora (`t`), el `nivel`, el `contexto` (el módulo), el `msg` y, si viene de una solicitud, el identificador `req`.

- **Identificador de solicitud.** Las apps mandan `x-request-id` en cada petición; si falta o no es válido, la API crea uno. Siempre
  se devuelve en la respuesta, y un error 500 también lo trae en el cuerpo (`idSolicitud`). Las apps muestran una referencia corta
  («ref. 3f9a1c2b») en los errores del servidor: con ella, soporte encuentra la línea exacta.
- **Una línea por solicitud** (`evento: "solicitud"`): método, **plantilla** de la ruta (`/v1/viajes/:id`, nunca la dirección real), estado,
  milisegundos y, si hay sesión, el usuario y el rol. No se registran cuerpos, contraseñas, tokens ni datos de tarjeta.
- **Errores de las apps** (`evento: "error_de_app"`): las tres apps reportan lo que no manejan a `POST /v1/telemetria/errores`
  (máximo 5 por carga de página y 20 por minuto y dirección).
- **Tareas programadas** (`evento: "tarea_fallida"`): antes un fallo se perdía; ahora se registra, se cuenta y aparece en la pantalla Sistema.

Variables: `LOG_FORMATO` (`json` | `texto`), `LOG_NIVEL` (`debug` | `info` | `warn` | `error`), `VERSION` (la pone el despliegue).

### Salud y métricas (RNF-82)

| Ruta | Quién | Qué |
|---|---|---|
| `GET /v1/salud` | pública | La API está viva (la usan las apps) |
| `GET /v1/listo` | pública | ¿Puede atender tráfico? 503 si la base no responde; lista las tareas atrasadas. Es la que consulta el balanceador |
| `GET /v1/metricas` | Prometheus | Métricas con `Authorization: Bearer $METRICAS_TOKEN`. En producción, sin token configurado, la ruta no existe |
| `GET /v1/op/sistema` | `sistema.ver` (supervisor, admin) | Lo que muestra la pantalla **Sistema** |

Métricas principales: `ty_http_solicitudes_total` y `ty_http_duracion_segundos` (por método, ruta y estado), `ty_ws_conexiones` (por rol),
`ty_viajes_activos` y `ty_conductores` (por estado), `ty_bd_conexiones` (pool), `ty_tarea_ejecuciones_total` y
`ty_tarea_ultimo_exito_timestamp_segundos` (por tarea), `ty_cliente_errores_total` y las del proceso de Node (`ty_nodejs_*`).

### Pantalla «Sistema» (App Operación)

Estado general (*todo en orden*, *con problemas* o *caído*) con el motivo, base de datos y latencia, solicitudes y percentiles de los
últimos 15 minutos, gráfica por minuto, conexiones en vivo, errores de las apps, **tareas programadas** (último éxito, fallos, atraso) y
cifras de la operación (viajes en curso, conductores conectados). Se actualiza cada 10 segundos.

Una tarea se considera **atrasada** si pasa más del doble de su cadencia (más 30 s) sin terminar bien.

### Prometheus, alertas y Grafana (RNF-83)

`docker compose -f infra/docker/docker-compose.yml --profile observabilidad up -d` levanta Prometheus (`:9090`) y Grafana (`:3001`) con el
tablero «TransporteYa · Sistema». Las reglas están en [`infra/observabilidad/alertas.yml`](../infra/observabilidad/alertas.yml):

| Alerta | Se dispara cuando | Gravedad |
|---|---|---|
| ApiCaida | la API no responde 1 min | crítica |
| ErroresDelServidor | más del 5 % de las solicitudes dan 5xx durante 5 min | crítica |
| RespuestaLenta | p95 > 1 s durante 10 min (RNF-01) | aviso |
| VigilanciaDeSenalAtrasada | no corre la vigilancia de señal en 90 s | crítica |
| CierreDiarioAtrasado / VencimientosAtrasados | la tarea no termina bien en 26 h | crítica / aviso |
| TareaFallando | una tarea falló en los últimos 15 min | aviso |
| BaseDeDatosSaturada | hay solicitudes esperando conexión 5 min | aviso |
| ViajesSinConductoresDisponibles | hay viajes buscando conductor y ninguno disponible 3 min | crítica |
| ErroresEnLasApps | más de 20 errores reportados por las apps en 10 min | aviso |

> Las reglas no se han probado contra un Prometheus real (no hay Docker en el entorno de desarrollo): hay que revisarlas con `promtool check rules`
> al montar el entorno. Falta además conectar un Alertmanager con el canal de guardia (correo, WhatsApp u otro) y las **trazas distribuidas**
> (RNF-81, OpenTelemetry).

## 2. Protección de datos personales

### Política y autorización (RNF-60, RNF-61)

- El texto vive en `packages/dominio/src/privacidad.ts` (`POLITICA_DATOS`), tiene **versión** y la sirve `GET /v1/politica-datos` (pública). Las tres
  apps la muestran desde el mismo lugar: en el ingreso (enlace al pie), en el registro y en «Mis datos y privacidad».
- **Es un borrador** (`pendienteRevisionLegal: true`): las apps lo dicen. Legal debe revisarlo y completar los datos entre corchetes (razón
  social, NIT, correo de privacidad, plazo contable) antes del lanzamiento.
- **Pasajero:** acepta al registrarse. **Conductor:** acepta en el último paso del registro; sin eso, la API no deja enviar el registro a
  revisión. Se guarda cuándo y qué versión (`pasajero` y `conductor`: `acepto_terminos_en`, `version_terminos`). Al cambiar la versión se vuelve a pedir.

### Derechos del titular (RNF-62)

Desde «Mis datos y privacidad» (pasajero: Cuenta; conductor: Perfil) la persona puede:

- **Descargar sus datos** (`GET /v1/datos/exportar`): perfil, viajes, documentos (sin los archivos), vehículos, movimientos, solicitudes, tickets y mensajes.
- **Hacer una solicitud** (`POST /v1/datos/solicitudes`): consulta, rectificación, supresión o revocatoria. Cada una guarda su **fecha límite** en días
  hábiles (**10** las consultas, **15** los reclamos; Ley 1581 arts. 14 y 15), descontando fines de semana y la tabla de festivos. Máximo 5 abiertas por persona.
- **Eliminar su cuenta** (pasajero): inmediato, si no hay viaje en curso ni deuda; deja constancia como solicitud ejecutada.

Personal interno (pantalla **Privacidad**, permisos `privacidad.ver` / `privacidad.responder` / `privacidad.suprimir`):

| Rol | Puede |
|---|---|
| Soporte | Ver, tomar, responder y rechazar |
| Supervisor y administrador | Además, **aceptar borrar datos** (ejecuta la anonimización) |

La cola va ordenada por fecha límite con semáforo (rojo: vencida o ≤ 2 días hábiles; ámbar: 3 a 5). Toda respuesta queda en la auditoría con el texto que recibe la persona.

### Qué hace «borrar mis datos» (anonimización)

No se borra la fila de la persona: viajes, pagos y libros apuntan a ella y se conservan por obligaciones contables. Se le quita lo que la identifica:

| Se quita | Se conserva |
|---|---|
| Nombre, correo, foto; el celular se cambia por uno inválido (queda libre para registrarse de nuevo) | Viajes con su precio, fechas y cobros; libro de movimientos; auditoría |
| Sesiones y suscripciones push; sus mensajes y comentarios de calificación | Los mensajes y calificaciones de la otra persona |
| El recorrido GPS de sus viajes | Los puntos de origen y destino escritos (decisión pendiente, D-37) |
| Pasajero: contactos, lugares guardados, métodos de pago | |
| Conductor: documentos personales (y sus archivos), cuenta de pago, RUT | El vehículo y su placa (trazabilidad y seguridad) |

**No se puede** mientras haya un viaje en curso, una deuda (pasajero) o un saldo distinto de cero (conductor: debe la comisión o se le debe un pago). La
API responde 409 con la lista de bloqueos y la pantalla los muestra.

### Retención (RNF-64)

Trabajo diario a las 03:30 (Bogotá) y al arrancar la API:

| Dato | Plazo por defecto | Parámetro |
|---|---|---|
| Posiciones GPS detalladas (se sueltan particiones enteras) | 180 días | `retencion.posiciones_dias` |
| Mensajes del viaje | 180 días | `retencion.chats_dias` |
| Recorrido GPS del viaje (el viaje y el cobro se conservan) | 365 días | `retencion.trayectorias_dias` |
| Códigos OTP | 1 día | — |
| Sesiones vencidas o revocadas | 30 días | — |
| Viajes, pagos, libros | según la norma contable | no se borra |

Los tres primeros se cambian en Configuración (grupo «Privacidad y retención»). El mismo trabajo **crea las particiones** de posiciones de hoy y los
próximos 8 días; si ya había posiciones de ese día en la partición por defecto, las pasa a la nueva (migración 0007).

### Pendiente

- **RNBD** (RNF-65): decidir con Legal si hay obligación de registrar las bases en la SIC; este documento y la política sirven de insumo.
- **Transferencia internacional** (RNF-66): depende de dónde se aloje (D-18).
- Texto definitivo de la política, aviso de privacidad para el mercadeo (autorización aparte) y canal de correo.
- Respuesta a la persona por canal externo (hoy la ve en la app; no hay correo ni push).
- Qué hacer con las direcciones escritas de los viajes de quien borra su cuenta (D-37).
