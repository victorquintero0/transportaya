# 0004 · PostgreSQL + PostGIS como base principal y Redis para tiempo real

- **Estado:** Aceptada
- **Fecha:** 2026-10-06

## Contexto

El sistema necesita:

- transacciones confiables para viajes, pagos, saldos y liquidaciones;
- consultas geográficas (zonas, geocercas, área de servicio, trayectorias);
- búsqueda muy rápida de conductores disponibles cercanos, con posiciones que cambian cada pocos segundos;
- mensajería entre instancias para el WebSocket y colas de trabajos.

## Decisión

- **PostgreSQL 16+ con PostGIS** como base de datos principal y fuente de verdad.
- **Redis** para:
  - índice geográfico de conductores disponibles (`GEOADD` / `GEOSEARCH`) y su última posición;
  - bloqueos cortos para asignación atómica (un viaje, un conductor);
  - adaptador pub/sub de Socket.IO;
  - colas y tareas programadas con BullMQ;
  - *streams* para persistir posiciones en lote.
- Las posiciones GPS históricas se guardan en PostgreSQL en una tabla **particionada por día**.

## Alternativas consideradas

- **MongoDB:** tiene consultas geográficas, pero las transacciones del dinero y las relaciones del dominio encajan mejor en un modelo relacional.
- **Base de series de tiempo separada** (por ejemplo, TimescaleDB) para posiciones: se puede agregar después
  si el volumen lo exige; al inicio basta con particiones nativas.
- **Solo PostgreSQL** (sin Redis): las escrituras de posición cada pocos segundos y la búsqueda de cercanos irían
  todas a la base principal; Redis absorbe esa carga y además resuelve colas y pub/sub.

## Consecuencias

- Redis contiene estado **efímero**: si se pierde, se reconstruye con los siguientes envíos de ubicación (segundos).
  Nada que deba persistir vive solo en Redis.
- Se deben usar servicios administrados con alta disponibilidad para ambos.
- Hay que definir la política de retención de posiciones y automatizar el borrado de particiones viejas.
