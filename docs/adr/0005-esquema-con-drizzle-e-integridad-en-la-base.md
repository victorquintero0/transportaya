# 0005 · Esquema con Drizzle y reglas de integridad en la base de datos

- **Estado:** Aceptada
- **Fecha:** 2026-10-06

## Contexto

La plataforma mueve dinero (comisiones, cierres diarios, pagos) y debe poder reconstruir cualquier viaje. Los
errores de datos aquí son costosos y difíciles de corregir: un saldo mal calculado, un viaje asignado a dos
conductores o un movimiento editado a mano. Varios procesos escribirán a la vez (API, workers de despacho, cierre
diario, conciliación de pagos), así que no se puede confiar en que cada uno respete las reglas.

## Decisión

1. **Drizzle ORM** define el esquema en TypeScript (`packages/db/src/schema`). `drizzle-kit` genera las migraciones SQL,
   que se versionan y **nunca se editan una vez aplicadas**. Un cambio de esquema es una migración nueva (`pnpm generar`).
2. **Las reglas de integridad viven en la base**, no solo en el código: restricciones `CHECK`, índices únicos parciales,
   restricciones de exclusión, disparadores y vistas. La lista está en [docs/09](../09-modelo-de-datos.md#reglas-de-integridad-que-hace-cumplir-la-base).
3. **Las reglas que existen también en el dominio se prueban contra él.** La máquina de estados del viaje está en
   `@transportaya/dominio` y en un disparador; una prueba compara las 64 combinaciones. Los enums se crean desde las
   constantes del dominio.
4. **Tres migraciones por diseño:** `extensiones` (PostGIS, funciones), `esquema` (generada por Drizzle) e `integridad`
   (SQL que Drizzle no modela). Un script (`corregir-migraciones.mjs`) corrige un defecto conocido de `drizzle-kit`.
5. **Las pruebas de la base corren contra PostgreSQL con PostGIS real**, nunca contra un sustituto en memoria. En la CI son obligatorias.

## Alternativas consideradas

- **Validar solo en la aplicación:** más rápido de escribir, pero cualquier proceso (o un error) puede dejar datos
  inconsistentes. Para dinero y asignaciones no es aceptable.
- **Prisma:** buena experiencia de desarrollo, pero no modela PostGIS, índices parciales ni exclusiones, y el SQL de
  consultas geoespaciales terminaría fuera del ORM de todos modos.
- **SQL escrito a mano sin ORM:** control total, pero sin tipos compartidos con el código.
- **Base en memoria o SQLite para las pruebas:** no soportan PostGIS, particiones ni restricciones de exclusión.

## Consecuencias

- **Defecto conocido de `drizzle-kit`:** escribe los tipos personalizados entre comillas (`"geography(Point,4326)"`),
  lo que PostgreSQL rechaza. El script `corregir-migraciones.mjs` los arregla tras cada `generar`, y una prueba falla si
  queda alguno. Las particiones tampoco se modelan: `posicion_conductor` se declara en el esquema para tener tipos y se
  convierte en tabla particionada editando su migración de creación, que ya está aplicada y no se vuelve a tocar.
- **Las pruebas necesitan PostgreSQL con PostGIS y un usuario superusuario** (para crear extensiones y para probar los
  disparadores). En local se levanta con Docker Compose; la CI usa la imagen `postgis/postgis:16-3.4`.
- **Hay dos copias de la máquina de estados** (dominio y disparador). Se acepta porque la prueba de paridad hace imposible
  que diverjan sin que falle la CI.
- **Las particiones de posiciones no se crean solas:** falta el trabajo programado que las crea y retira (docs/09).
