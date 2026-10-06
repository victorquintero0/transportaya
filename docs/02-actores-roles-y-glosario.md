# 02 · Actores, roles y glosario

## Actores externos

| Actor | Aplicación | Descripción |
|---|---|---|
| **Pasajero** | App Pasajero | Persona que pide viajes y los paga con su propio método de pago. |
| **Empleado corporativo** | App Pasajero | Pasajero vinculado a una empresa cliente; puede cargar viajes a la empresa según sus políticas. Una misma cuenta puede tener perfil personal y corporativo. |
| **Administrador corporativo** | App Pasajero (sección Empresa) | Persona de la empresa cliente que gestiona empleados, centros de costo y consulta estados de cuenta. Ver [D-09](13-decisiones-pendientes-y-riesgos.md). |
| **Conductor** | App Conductor | Conductor independiente con vehículo propio o a su cargo, habilitado por Transporteya. |
| **Contacto de confianza** | Enlace web | Persona con quien el pasajero comparte el viaje en vivo; no necesita cuenta. |

## Sistemas externos

| Sistema | Uso |
|---|---|
| Pasarela de pagos | Tokenizar tarjetas, cobrar, reembolsar, pagos locales (Nequi, PSE, Bre-B) |
| Proveedor de SMS / WhatsApp | Códigos OTP y mensajes transaccionales |
| Web Push (VAPID) | Notificaciones a las PWA |
| Correo transaccional | Recibos, estados de cuenta, respuestas de PQRS |
| Servicios de mapas autoalojados | Mapas base, rutas y tiempos, búsqueda de direcciones (ver [ADR-0002](adr/0002-mapas-openstreetmap-autoalojado.md)) |
| Almacenamiento de archivos | Documentos y fotos de conductores y vehículos |
| Banco (archivo de dispersión) | Pago de liquidaciones a conductores |

## Roles internos (App Operación)

| Rol | Responsabilidad principal |
|---|---|
| **Monitor de operación** | Vigila la torre de control, atiende alertas y SOS, despacha y reasigna viajes manualmente. |
| **Agente de soporte** | Atiende tickets y PQRS, objetos perdidos, aplica reembolsos hasta su límite. |
| **Analista de cumplimiento** | Revisa y aprueba documentos de conductores y vehículos, suspende o bloquea conductores. |
| **Analista financiero** | Genera, revisa y aprueba liquidaciones, registra pagos de deudas, gestiona clientes corporativos. |
| **Supervisor** | Todo lo anterior, más reembolsos sin límite, ajustes de saldo y reportes. |
| **Administrador** | Configura tarifas, zonas, parámetros y usuarios internos. |

### Matriz de permisos

✅ permitido · 👁 solo lectura · — sin acceso

| Módulo | Monitor | Soporte | Cumplimiento | Financiero | Supervisor | Admin |
|---|---|---|---|---|---|---|
| Torre de control y alertas | ✅ | 👁 | 👁 | — | ✅ | ✅ |
| Viajes: consultar | ✅ | ✅ | 👁 | ✅ | ✅ | ✅ |
| Viajes: despachar, reasignar, cancelar | ✅ | — | — | — | ✅ | ✅ |
| Viajes: ajustar tarifa | — | — | — | — | ✅ | ✅ |
| Conductores: consultar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Conductores: aprobar documentos | — | — | ✅ | — | ✅ | ✅ |
| Conductores: suspender o bloquear | ✅ (temporal) | — | ✅ | — | ✅ | ✅ |
| Pasajeros: consultar y bloquear | 👁 | ✅ | — | 👁 | ✅ | ✅ |
| Tickets y PQRS | 👁 | ✅ | — | 👁 | ✅ | ✅ |
| Reembolsos | — | ✅ (hasta límite) | — | ✅ | ✅ | ✅ |
| Liquidaciones | — | — | — | ✅ | ✅ | ✅ |
| Ajustes manuales de saldo | — | — | — | Propone | Aprueba | Aprueba |
| Clientes corporativos | — | 👁 | — | ✅ | ✅ | ✅ |
| Tarifas, zonas y dinámica | 👁 (activar dinámica manual) | — | — | 👁 | 👁 | ✅ |
| Usuarios internos y auditoría | — | — | — | — | 👁 | ✅ |

Reglas generales:

- Toda acción que modifique dinero, estados de conductores o tarifas queda en la **auditoría**
  con usuario, fecha, valor anterior, valor nuevo y motivo.
- Los ajustes de saldo requieren **doble aprobación**: quien propone no puede aprobar.
- Los usuarios internos usan **doble factor de autenticación**.

## Glosario

| Término | Significado |
|---|---|
| **Viaje** | Servicio de transporte desde que se solicita hasta que se finaliza o cancela. |
| **Cotización** | Precio estimado que se muestra al pasajero antes de confirmar. Tiene validez limitada `[5 min]`. |
| **Oferta** | Propuesta de un viaje enviada a un conductor específico, con tiempo límite para aceptar. |
| **Asignación** | Momento en que un conductor acepta una oferta y queda vinculado al viaje. |
| **Despacho** | Proceso (automático o manual) de buscar y asignar conductor a un viaje. |
| **ETA** | Tiempo estimado de llegada (*estimated time of arrival*). Puede ser a la recogida o al destino. |
| **Tarifa mínima** | Valor mínimo que se cobra por un viaje, sin importar distancia o tiempo. |
| **Dinámica** | Multiplicador de la tarifa que se aplica cuando hay más demanda que conductores en una zona. |
| **Recargo** | Valor adicional por condición especial: nocturno, festivo, aeropuerto, reserva. |
| **Zona** | Polígono geográfico con una función: área de servicio, aeropuerto, zona restringida, zona de tarifa. |
| **Celda H3** | Hexágono de la grilla [H3](https://h3geo.org/) usado para medir oferta y demanda y calcular dinámica. |
| **Geocerca** | Zona que dispara una acción cuando un vehículo entra o sale (por ejemplo, llegada al aeropuerto). |
| **En línea** | Conductor conectado y disponible para recibir ofertas. |
| **Sesión** | Periodo continuo en el que un conductor está en línea. Base para medir tiempo conectado. |
| **Comisión** | Porcentaje de la tarifa que se queda Transporteya. |
| **Saldo del conductor** | Lo que la empresa le debe al conductor (positivo) o el conductor a la empresa (negativo). |
| **Libro de movimientos** | Registro inmutable de cada crédito y débito que afecta el saldo del conductor. |
| **Liquidación** | Cierre de un periodo (semanal) que calcula el saldo final y genera el pago o el cobro. |
| **Dispersión** | Pago masivo a cuentas bancarias de los conductores mediante archivo del banco. |
| **PQRS** | Peticiones, quejas, reclamos y sugerencias. |
| **SOAT** | Seguro obligatorio de accidentes de tránsito. |
| **RTM** | Revisión técnico-mecánica y de emisiones contaminantes. |
| **Licencia de tránsito** | Documento de propiedad del vehículo (antes "tarjeta de propiedad"). |
| **RUNT** | Registro Único Nacional de Tránsito; permite validar licencias, SOAT y RTM. |
| **SIMIT** | Sistema de información de multas de tránsito. |
| **Pico y placa** | Restricción municipal de circulación según el último dígito de la placa. |
| **PPT** | Permiso por Protección Temporal; documento de identidad válido para migrantes venezolanos. |
| **OTP** | Código de un solo uso enviado por SMS o WhatsApp para iniciar sesión. |
| **PWA** | *Progressive Web App*: aplicación web instalable en el teléfono, con notificaciones y funcionamiento parcial sin conexión. |
