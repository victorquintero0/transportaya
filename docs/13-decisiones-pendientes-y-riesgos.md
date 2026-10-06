# 13 · Decisiones y riesgos

## Decisiones tomadas

Resueltas el 2026-10-06. Cada una indica qué documento se ajustó.

| Código | Decisión | Resultado | Pendiente de validar |
|---|---|---|---|
| **D-01** | Marco legal | Vehículos **particulares con licencia B1** | Concepto de Legal: ver [R-01](#riesgos) y la nota sobre la tabla de tarifas de taxi |
| **D-02** | Facturación electrónica DIAN | **Proveedor tecnológico externo** integrado por API | Elegir proveedor en la Fase 0 |
| **D-03** | Comisión | **3 %** en viajes dentro de la ciudad y **5 %** en viajes nacionales (intermunicipales) | Verificar que cubra el costo de la pasarela (ver [R-12](#riesgos)) |
| **D-04** | Liquidación | **Diaria**, con cruce neto. El conductor paga la comisión por **llave / Bre-B**; si no paga, **no se habilita** al día siguiente. Ver [RN-060 a RN-076](03-reglas-de-negocio.md) | Cómo concilia Wompi los pagos por Bre-B |
| **D-05** | Pasarela de pagos | **Wompi** | Tokenización, reembolsos, webhooks y Bre-B |
| **D-06** | Retenciones e impuestos | **Sin supuesto**: lo define el contador. RUT configurable, cálculo de impuestos fuera del MVP | Concepto del contador |
| **D-07** | Categorías de vehículo | **Media, Media Alta y Alta**, con un **catálogo de vehículos** de Colombia. Ver [catálogo](14-catalogo-de-vehiculos.md) | Validar la clasificación del catálogo |
| **D-08** | Ciudad de lanzamiento | **Manizales y el Eje Cafetero, con cobertura nacional**. Tarifas fijas por destino desde Manizales ([datos](datos/tarifas-rutas-manizales-2026.csv)) | Validar la tabla de tarifas (ver [datos/README](datos/README.md)) |
| **D-09** | Portal del administrador corporativo | **Dentro de la App Operación**, con rol externo limitado y aislamiento por empresa | — |
| **D-10** | Precio urbano | **Siempre recalculado al final** con distancia y tiempo reales; la cotización es un estimado. Las rutas con tarifa fija no se recalculan | — |
| **D-11** | Destino visible en la oferta | **Zona aproximada y distancia** | — |
| **D-12** | Espera y cancelación | 3 min de espera gratis, $250 por minuto, cancelación $4.000, pasajero ausente a los 5 min. Ajustables en el piloto | — |
| **D-13** | Canal de OTP | **WhatsApp con SMS de respaldo** | Elegir proveedor de WhatsApp Business API |
| **D-14** | Requisitos del vehículo | **Sin límite de antigüedad**. Exige **revisión técnico-mecánica** y **seguro todo riesgo** vigentes | — |
| **D-16** | Nombre comercial | **TransporteYa** | Dominio |
| **D-17** | Torre de control | **24/7 desde el lanzamiento** | Turnos y protocolo de emergencias |

## Decisiones que siguen abiertas

| Código | Decisión | Responsable | Estado | Bloquea |
|---|---|---|---|---|
| **D-15** | Seguros para pasajeros: póliza de responsabilidad civil y de accidentes de pasajeros. El todo riesgo cubre el vehículo, no al pasajero | Legal | Definido por Legal. Mientras tanto se exigen SOAT, todo riesgo y RTM | Lanzamiento |
| **D-18** | Proveedor de nube y región | Tecnología | Comparar en la Fase 0 por costo, latencia desde Colombia y cumplimiento de la Ley 1581 | Fase 0 |
| **D-19** | **Tabla de tarifas de taxi vs. vehículos particulares.** La tabla se titula "tarifas sugeridas" para "vehículo de servicio público tipo taxi" (Resolución 031 de 1981). Falta definir si se usa tal cual para vehículos particulares y si varía por categoría (Media, Media Alta, Alta) | Negocio + Legal | Abierta | Fase 1 |
| **D-20** | Tarifa urbana en Manizales y el Eje Cafetero: valores de base, km, minuto y mínima por categoría | Negocio | Abierta | Fase 1 |
| **D-21** | Clasificación definitiva de cada vehículo en el catálogo | Negocio | Borrador en [catálogo](14-catalogo-de-vehiculos.md) | Fase 1 |

## Riesgos

Escala: **Alto / Medio / Bajo** para probabilidad e impacto.

| Código | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| **R-01** | **Regulatorio:** el transporte de pasajeros con vehículos particulares tiene un marco legal discutido en Colombia; puede haber sanciones a conductores o a la empresa. La tabla de tarifas usada es de taxis de servicio público | Alta | Alto | Concepto legal (D-01, D-19) antes de construir; tarifas, documentos y servicios configurables para adaptarse a cambios |
| **R-02** | **Laboral:** que los conductores independientes sean considerados empleados. El bloqueo diario por no pagar la comisión es una condición que Legal debe revisar | Media | Alto | No imponer turnos, no sancionar rechazos (RN-035), libertad de conexión; revisar reglamentos y contratos con Legal |
| **R-03** | **PWA del conductor:** pérdida de ubicación u ofertas con la pantalla apagada o en segundo plano. Aún más grave en viajes largos intermunicipales | Alta | Alto | Prueba técnica en Fase 0, pantalla activa, estado `sin_senal`, plan B con Capacitor (ADR-0003) |
| **R-04** | **Búsqueda de direcciones con OpenStreetMap** de baja calidad en algunas zonas, sobre todo en municipios pequeños | Alta | Medio | Intérprete de nomenclatura colombiana, capa propia de lugares, pin en el mapa, prueba de calidad en Fase 0 (ADR-0002) |
| **R-05** | **Deuda de conductores** por comisiones de viajes en efectivo | Media | Bajo | Con comisiones del 3 % y 5 %, la deuda por viaje es pequeña; el bloqueo diario la limita (RN-063) |
| **R-06** | **Fraude:** cuentas falsas, GPS falso, viajes ficticios, tarjetas robadas, conductor y pasajero coludidos | Media | Medio | Verificación documental, validación de ubicaciones, reglas de detección (RNF-50), límites para cuentas nuevas |
| **R-07** | **Seguridad física** de pasajeros y conductores, con viajes largos y nocturnos | Media | Alto | SOS, PIN, viaje compartido, alertas automáticas, torre de control 24/7, verificación de antecedentes |
| **R-08** | **Costo y mantenimiento** de los servicios de mapas autoalojados | Media | Medio | Automatizar la actualización mensual; interfaces para cambiar a un proveedor comercial |
| **R-09** | **Notificaciones en iOS** solo con la PWA instalada | Alta | Bajo | Guiar la instalación; conexión en tiempo real mientras la app está abierta |
| **R-10** | **Facturación electrónica** sin proveedor elegido | Media | Medio | Elegir proveedor en la Fase 0 (D-02) |
| **R-11** | **Concentración en una pasarela de pagos** (Wompi) | Baja | Medio | Interfaz de pagos desacoplada; evaluar una segunda pasarela en F2 |
| **R-12** | **Margen insuficiente:** una comisión del 3 % puede ser menor que el costo de la pasarela en viajes con tarjeta (porcentaje más un valor fijo por transacción) | Alta | Alto | Obtener las tarifas de Wompi en la Fase 0 y modelar el margen por método de pago; si no alcanza, trasladar el costo al pasajero, limitar la tarjeta a viajes de cierto valor o ajustar la comisión |
| **R-13** | **Recálculo del precio al final (D-10):** el pasajero puede sentir que paga más de lo esperado, y la normativa de protección al consumidor exige información clara | Media | Medio | Mostrar siempre un rango estimado y el aviso de que el valor final depende de distancia y tiempo reales; poner un tope sobre el estimado, a definir con Negocio |
| **R-14** | **Cobro de la comisión por Bre-B:** conciliación manual o errores pueden bloquear a conductores que sí pagaron | Media | Medio | Conciliación automática por webhook si Wompi lo permite; si no, un monitor de cobranza y habilitación manual el mismo día |
