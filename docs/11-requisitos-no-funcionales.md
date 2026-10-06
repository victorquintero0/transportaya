# 11 · Requisitos no funcionales

Las metas numéricas son **iniciales** y se revisan después del piloto.

## Rendimiento

| Código | Requisito | Meta |
|---|---|---|
| RNF-01 | Respuesta de cotización | p95 < 1 s |
| RNF-02 | Desde la confirmación del viaje hasta la primera oferta enviada | p95 < 3 s |
| RNF-03 | Desde la aceptación del conductor hasta que el pasajero lo ve | p95 < 2 s |
| RNF-04 | Retraso de la posición del conductor en la app del pasajero | p95 < 3 s |
| RNF-05 | Retraso de la torre de control | < 5 s |
| RNF-06 | Autocompletado de direcciones | p95 < 400 ms |
| RNF-07 | Carga inicial de las PWA en 4G con caché vacía | < 3 s; con caché < 1 s |

## Capacidad y escalabilidad

- **RNF-10** Dimensionamiento inicial: 500 conductores conectados a la vez, 5.000 viajes al día, picos de
  `[15]` solicitudes por minuto por zona.
- **RNF-11** Escalar a 10× agregando instancias de API y workers, sin cambios de diseño.
- **RNF-12** Pruebas de carga del despacho y del flujo de ubicaciones antes del lanzamiento (k6 o similar).

## Disponibilidad y recuperación

- **RNF-20** Disponibilidad mensual: 99,5 % en el MVP; 99,9 % desde F2.
- **RNF-21** Respaldos automáticos de la base de datos con recuperación a un punto en el tiempo.
  RPO ≤ `[5 min]`, RTO ≤ `[1 h]`.
- **RNF-22** Si el despacho automático falla, la torre de control permite despachar manualmente.
- **RNF-23** Si la pasarela de pagos no responde, el viaje se finaliza igual y el cobro se reintenta en segundo plano.
- **RNF-24** Despliegues sin interrupción; las conexiones WebSocket se reconectan solas.

## Conectividad

- **RNF-30** Las apps funcionan con redes 3G/4G intermitentes: reintentos con idempotencia, reconexión
  automática y recuperación del viaje activo.
- **RNF-31** La App Conductor guarda ubicaciones sin conexión y las envía en lote al reconectar.
- **RNF-32** Uso de datos móviles de la App Conductor menor a `[30 MB]` por hora en línea (mapas en caché).

## Seguridad

- **RNF-40** Todo el tráfico por TLS 1.2 o superior.
- **RNF-41** Tokens de acceso de `[15 min]`; *refresh tokens* rotativos y revocables; cierre de sesión remoto.
- **RNF-42** OTP con límite de intentos y de envíos por número e IP; protección contra bots en el registro.
- **RNF-43** Usuarios internos con **doble factor** obligatorio y permisos por rol (principio de mínimo privilegio).
- **RNF-44** **No se almacenan datos de tarjetas**: solo tokens de la pasarela (alcance PCI DSS mínimo).
- **RNF-45** Documentos y fotos de conductores en almacenamiento privado y cifrado; acceso con URL firmada de corta duración.
- **RNF-46** Números de cuenta bancaria cifrados a nivel de columna.
- **RNF-47** Secretos en un gestor de secretos, nunca en el repositorio.
- **RNF-48** Auditoría de todas las acciones sensibles (ver [modelo de datos](09-modelo-de-datos.md#auditoría)).
- **RNF-49** Validación de webhooks por firma; protección contra repetición.
- **RNF-50** Detección de fraude básica: GPS falso (saltos imposibles, apps de ubicación simulada cuando sea
  detectable), cuentas múltiples por dispositivo, viajes cortos repetidos entre el mismo pasajero y conductor.
- **RNF-51** Revisión de seguridad según OWASP ASVS nivel 2 y prueba de penetración antes del lanzamiento.

## Privacidad y protección de datos

Marco aplicable: **Ley 1581 de 2012** y sus decretos reglamentarios (compilados en el Decreto 1074 de 2015).
Validar los detalles con asesoría legal.

- **RNF-60** Autorización **previa, expresa e informada** para el tratamiento de datos, con finalidades
  claras (prestar el servicio, seguridad, soporte, mercadeo por separado y opcional).
- **RNF-61** **Política de tratamiento de datos** publicada y accesible desde las apps.
- **RNF-62** Canales para que el titular conozca, actualice, rectifique y suprima sus datos, y revoque la autorización.
- **RNF-63** Minimización: el conductor no ve el teléfono del pasajero ni su dirección exacta hasta aceptar;
  el pasajero no ve el teléfono del conductor.
- **RNF-64** Retención definida por tipo de dato (posiciones GPS, documentos, chats). Propuesta: posiciones
  detalladas `[6 meses]`, chats `[6 meses]`, viajes y movimientos de dinero según obligaciones contables.
- **RNF-65** Evaluar la inscripción de bases de datos en el **Registro Nacional de Bases de Datos** (RNBD) de la SIC
  si la empresa está obligada.
- **RNF-66** Si los datos se alojan fuera de Colombia, cumplir las reglas de **transferencia internacional**
  (país con nivel adecuado de protección según la SIC, o los mecanismos que la ley permita).

## Usabilidad y accesibilidad

- **RNF-70** App Pasajero: cumplir **WCAG 2.1 AA** (contraste, tamaño de texto, lectores de pantalla).
- **RNF-71** App Conductor: botones de al menos `[56 px]`, alto contraste, modo nocturno automático,
  acciones del viaje con un toque y sin escribir mientras conduce.
- **RNF-72** Mensajes de error comprensibles y en español, sin códigos técnicos para el usuario final.

## Compatibilidad

| App | Objetivo |
|---|---|
| App Pasajero | Chrome en Android 9+; Safari en iOS 16.4+ |
| App Conductor | Chrome en Android 9+ (prioritario); Safari en iOS 16.4+ con la PWA instalada |
| App Operación | Últimas dos versiones de Chrome, Edge y Firefox en escritorio |

## Localización

- Español de Colombia; textos centralizados para permitir otros idiomas en el futuro.
- Moneda `COP` con formato `$ 12.500`; fechas `dd/mm/aaaa`; hora en formato de 12 horas con a. m./p. m. para usuarios finales.
- Zona horaria `America/Bogota`; festivos de Colombia por año.
- Teléfonos en formato E.164 (`+57 3XX XXX XXXX`).

## Observabilidad

- **RNF-80** Logs estructurados con identificador de correlación de punta a punta (app → API → worker).
- **RNF-81** Trazas distribuidas (OpenTelemetry) para cotización, despacho y pagos.
- **RNF-82** Tableros técnicos (latencia, errores, conexiones WebSocket, colas) y de negocio (viajes, asignación, cancelaciones).
- **RNF-83** Alertas al equipo técnico por caída de servicios, colas atascadas, tasa de errores o pagos fallidos anómalos.

## Calidad

- **RNF-90** Pruebas unitarias obligatorias para tarifas, máquina de estados del viaje, despacho, libro de movimientos y liquidaciones.
- **RNF-91** Pruebas de integración contra PostgreSQL/PostGIS y Redis reales en contenedores.
- **RNF-92** Pruebas de punta a punta (Playwright) del flujo pasajero–conductor–operación.
- **RNF-93** Simulador de conductores (bots que se mueven por rutas reales) para pruebas de despacho y carga.
