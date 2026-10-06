# Documentación de Transporteya

Documentación inicial de la plataforma de transporte de pasajeros de Transporteya.
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
| 07 | [Flujos principales](07-flujos-principales.md) | Ciclo de vida del viaje, asignación, pagos, onboarding, liquidación, SOS |
| 08 | [Arquitectura](08-arquitectura.md) | Componentes, tiempo real, geoespacial, mapas, estructura del repositorio |
| 09 | [Modelo de datos](09-modelo-de-datos.md) | Entidades principales y relaciones |
| 10 | [API y tiempo real](10-api-y-tiempo-real.md) | Convenciones, endpoints iniciales y eventos WebSocket |
| 11 | [Requisitos no funcionales](11-requisitos-no-funcionales.md) | Rendimiento, seguridad, privacidad, compatibilidad |
| 12 | [Hoja de ruta](12-hoja-de-ruta.md) | Fases de entrega |
| 13 | [Decisiones pendientes y riesgos](13-decisiones-pendientes-y-riesgos.md) | Lo que falta definir y lo que puede salir mal |
| — | [Registros de decisiones (ADR)](adr/README.md) | Decisiones de arquitectura y su justificación |

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| País de operación | Colombia (COP, zona horaria `America/Bogota`, español de Colombia) |
| Modelo de conductores | Conductores independientes con vehículo propio; la empresa cobra una comisión por viaje |
| Tipos de servicio | Viajes inmediatos, programados, corporativos y aeropuerto / intermunicipal |
| Métodos de pago | Efectivo, tarjeta en la app y métodos locales (Nequi, PSE, Bre-B u otros según la pasarela) |
| Tarifa | Base + distancia + tiempo, con tarifa mínima y multiplicador dinámico por demanda |
| Módulos administrativos | Liquidación a conductores, documentos y vehículos, soporte y PQRS |
| Stack | TypeScript de punta a punta: React (PWA) + NestJS + PostgreSQL/PostGIS + Redis |
| Mapas | OpenStreetMap autoalojado (MapLibre, OSRM, Photon/Nominatim) |

## Convenciones de esta documentación

- **Idioma:** español. Los identificadores de código (tablas, endpoints, eventos) también van en español, sin tildes y en `snake_case`.
- **Identificadores:** cada requisito tiene un código para poder citarlo en tareas y pruebas:
  `RN-` reglas de negocio, `PAS-` app pasajero, `CON-` app conductor, `OPE-` app operación, `RNF-` requisitos no funcionales, `D-` decisiones pendientes, `R-` riesgos.
- **Fases:** cada funcionalidad indica en qué fase se entrega: **MVP**, **F2** o **F3** (ver [hoja de ruta](12-hoja-de-ruta.md)).
- **Valores entre corchetes** como `[2 min]` son valores iniciales propuestos y configurables desde la App Operación; no son definitivos.
- **Diagramas:** se escriben en [Mermaid](https://mermaid.js.org/) para que GitHub los muestre directamente.
- **Decisiones de arquitectura:** cualquier decisión técnica relevante se registra como ADR en [`adr/`](adr/README.md).
