# Registros de decisiones de arquitectura (ADR)

Un ADR documenta una decisión técnica importante: el contexto, lo que se decidió, las alternativas y sus
consecuencias. Los ADR **no se editan** después de aceptados; si una decisión cambia, se crea un ADR nuevo
que reemplaza al anterior y se actualiza el estado del viejo.

| # | Decisión | Estado |
|---|---|---|
| [0001](0001-monorepo-typescript-y-monolito-modular.md) | Monorepo TypeScript y backend como monolito modular | Aceptada |
| [0002](0002-mapas-openstreetmap-autoalojado.md) | Mapas, rutas y direcciones con OpenStreetMap autoalojado | Aceptada |
| [0003](0003-app-conductor-como-pwa.md) | App de conductores como PWA, con Capacitor como plan B | Aceptada, sujeta a prueba técnica |
| [0004](0004-postgresql-postgis-y-redis.md) | PostgreSQL + PostGIS como base principal y Redis para tiempo real | Aceptada |
| [0005](0005-esquema-con-drizzle-e-integridad-en-la-base.md) | Esquema con Drizzle y reglas de integridad en la base de datos | Aceptada |

## Plantilla

Copiar como `NNNN-titulo-corto.md`:

```markdown
# NNNN · Título

- **Estado:** Propuesta | Aceptada | Reemplazada por NNNN
- **Fecha:** AAAA-MM-DD

## Contexto
Qué problema hay y qué restricciones existen.

## Decisión
Qué se decidió.

## Alternativas consideradas
Qué otras opciones había y por qué no se eligieron.

## Consecuencias
Qué se gana, qué se pierde y qué hay que hacer ahora.
```
