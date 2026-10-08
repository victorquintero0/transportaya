# Documentación de TransporteYa

Documentación inicial de la plataforma de transporte de pasajeros de TransporteYa.
Es un documento vivo: se debe actualizar cuando cambie una regla de negocio o una decisión técnica.

## Índice

| # | Documento | Contenido |
|---|---|---|
| 01 | [Visión y alcance](01-vision-y-alcance.md) | Objetivos, las tres aplicaciones, alcance por fases, métricas de éxito |
| 02 | [Actores, roles y glosario](02-actores-roles-y-glosario.md) | Quién usa el sistema, permisos internos, vocabulario común |
| 03 | [Reglas de negocio](03-reglas-de-negocio.md) | Tarifas, dinámica, comisiones, pagos, cancelaciones, asignación, liquidaciones |
| 04 | [App Pasajero](04-app-pasajero.md) | Funcionalidades, pantallas e historias de usuario |
| 05 | [App Conductor](05-app-conductor.md) | Funcionalidades, pantallas, limitaciones de la PWA |
| 06 | [App Operación](06-app-operacion.md) | Torre de control, tiempos y movimientos, módulos administrativos |
| 07 | [Flujos principales](07-flujos-principales.md) | Ciclo de vida del viaje, asignación, pagos, onboarding, cierre diario, SOS |
| 08 | [Arquitectura](08-arquitectura.md) | Componentes, tiempo real, geoespacial, mapas, estructura del repositorio |
| 09 | [Modelo de datos](09-modelo-de-datos.md) | Entidades principales y relaciones |
| 10 | [API y tiempo real](10-api-y-tiempo-real.md) | Convenciones, endpoints iniciales y eventos WebSocket |
| 11 | [Requisitos no funcionales](11-requisitos-no-funcionales.md) | Rendimiento, seguridad, privacidad, compatibilidad |
| 12 | [Hoja de ruta](12-hoja-de-ruta.md) | Fases de entrega |
| 13 | [Decisiones y riesgos](13-decisiones-pendientes-y-riesgos.md) | Decisiones tomadas, las que siguen abiertas y los riesgos |
| 14 | [Catálogo de vehículos](14-catalogo-de-vehiculos.md) | Categorías Media, Media Alta y Alta y catálogo para el registro de conductores |
| 15 | [Observabilidad y protección de datos](15-observabilidad-y-privacidad.md) | Registro, métricas, alertas, Ley 1581, derechos del titular y retención |
| — | [Datos iniciales](datos/README.md) | Tarifas de rutas desde Manizales y catálogo de vehículos en CSV |
| — | [Registros de decisiones (ADR)](adr/README.md) | Decisiones de arquitectura y su justificación |

## Decisiones tomadas

El detalle de las 18 decisiones y de lo que queda abierto está en [13 · Decisiones y riesgos](13-decisiones-pendientes-y-riesgos.md).

| Tema | Decisión |
|---|---|
| Nombre | **TransporteYa** |
| Lanzamiento | **Manizales y el Eje Cafetero**, con cobertura nacional por rutas de tarifa fija |
| Marco legal | Vehículos **particulares con licencia B1** (pendiente de concepto legal) |
| Modelo de conductores | Independientes con vehículo propio; la empresa cobra comisión: **3 % urbano y 5 % nacional** |
| Cierre y pago | **Diario**, con cruce neto; el conductor paga su comisión por **llave / Bre-B** y, si no paga, **no se habilita** |
| Servicios | Inmediatos, programados, corporativos e intermunicipales / nacionales con tarifa fija |
| Pagos | Efectivo y tarjeta en el MVP; métodos locales en F2. Pasarela **Wompi** |
| Tarifa urbana | Base + distancia + tiempo, con mínima y dinámica; **recalculada al final** |
| Categorías | **Media, Media Alta y Alta**, según un catálogo de vehículos |
| Requisitos del vehículo | Sin límite de antigüedad; **revisión técnico-mecánica** y **seguro todo riesgo** |
| Módulos administrativos | Cierre y pagos a conductores, documentos y vehículos, soporte y PQRS |
| Portal corporativo | Dentro de la App Operación, con rol externo limitado |
| Stack | TypeScript de punta a punta: React (PWA) + NestJS + PostgreSQL/PostGIS + Redis |
| Mapas | OpenStreetMap autoalojado (MapLibre, OSRM, Photon/Nominatim) |
| Torre de control | **24/7** desde el lanzamiento |

## Convenciones de esta documentación

- **Idioma:** español. Los identificadores de código (tablas, endpoints, eventos) también van en español, sin tildes y en `snake_case`.
- **Identificadores:** cada requisito tiene un código para poder citarlo en tareas y pruebas:
  `RN-` reglas de negocio, `PAS-` app pasajero, `CON-` app conductor, `OPE-` app operación, `RNF-` requisitos no funcionales, `D-` decisiones pendientes, `R-` riesgos.
- **Fases:** cada funcionalidad indica en qué fase se entrega: **MVP**, **F2** o **F3** (ver [hoja de ruta](12-hoja-de-ruta.md)).
- **Valores entre corchetes** como `[2 min]` son valores iniciales propuestos y configurables desde la App Operación; no son definitivos.
- **Diagramas:** se escriben en [Mermaid](https://mermaid.js.org/) para que GitHub los muestre directamente.
- **Decisiones de arquitectura:** cualquier decisión técnica relevante se registra como ADR en [`adr/`](adr/README.md).
