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
| **D-20** | Tarifa urbana de Manizales | **Tarifas de taxi con taxímetro 2026** (Decreto 0641 del 31/12/2025): banderazo $3.700, $1.784 por km, $223 por tiempo detenido, mínima $6.300 y los recargos de [RN-011](03-reglas-de-negocio.md). Cargadas en `packages/dominio` como semilla | Ver D-19, D-22 y D-23 |
| **D-22** | Tarifa por categoría | **Media Alta suma $1.000 y Alta suma $2.000** a la carrera. Se interpretó como un recargo fijo sobre la tarifa (no sobre el banderazo ni el mínimo), sin multiplicar por la dinámica y dentro de la base de la comisión | Confirmar esa interpretación |
| **D-23** | Tiempo detenido | **$223 por minuto**, medido por un **taxímetro con GPS en la app del conductor** que mide distancia y tiempos ([RN-015](03-reglas-de-negocio.md)) | Ver D-24 |

## Decisiones que siguen abiertas

| Código | Decisión | Responsable | Estado | Bloquea |
|---|---|---|---|---|
| **D-15** | Seguros para pasajeros: póliza de responsabilidad civil y de accidentes de pasajeros. El todo riesgo cubre el vehículo, no al pasajero | Legal | Definido por Legal. Mientras tanto se exigen SOAT, todo riesgo y RTM | Lanzamiento |
| **D-18** | Proveedor de nube y región | Tecnología | Comparar en la Fase 0 por costo, latencia desde Colombia y cumplimiento de la Ley 1581 | Fase 0 |
| **D-19** | **Marco de las tarifas.** Las rutas desde Manizales se titulan "tarifas sugeridas" para taxis de servicio público (Resolución 031 de 1981), y el Decreto 0641 regula taxis **con taxímetro**. Falta confirmar con Legal si se pueden aplicar a vehículos particulares, si la **dinámica** (RN-020 a RN-025) es compatible con una tarifa regulada, y que el decreto no prevé recargo de reserva ni otros recargos | Negocio + Legal | Abierta | Fase 1 |
| **D-24** | **Parámetros del taxímetro.** Velocidad y duración que definen "detenido" (propuesta: menos de 3 km/h durante 10 s), tolerancia de diferencia entre el taxímetro y la trayectoria del servidor (propuesta: 10 %), cuál valor se cobra si difieren, y la fracción de tiempo detenido para estimar la cotización | Negocio + Tecnología | Abierta. Se calibra con datos del piloto | Fase 1 |
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
| **R-15** | **Taxímetro por software:** la precisión del GPS del celular, las zonas sin señal o un GPS falso alteran la distancia y el tiempo detenido, y con ello el cobro. Además, el decreto de taxis exige taxímetro electrónico calibrado, y el de la app no es un dispositivo homologado (ver D-19) | Media | Alto | Verificar con la trayectoria del servidor, alerta `diferencia_taximetro`, filtrado de posiciones imprecisas (RNF-50), límites de diferencia y revisión de los viajes con diferencias grandes |
