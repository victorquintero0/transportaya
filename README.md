# transportaya

Software de gestión para **TransporteYa**, empresa de transporte de pasajeros con base en Manizales y el Eje Cafetero,
con cobertura nacional, que conecta pasajeros con conductores independientes (modelo tipo Uber).

## Aplicaciones

| Aplicación        | Usuarios                                                                    | Tipo                         |
| ----------------- | --------------------------------------------------------------------------- | ---------------------------- |
| **App Pasajero**  | Pasajeros y empleados de clientes corporativos                              | PWA móvil                    |
| **App Conductor** | Conductores independientes                                                  | PWA móvil                    |
| **App Operación** | Equipo interno (monitoreo, soporte, cumplimiento, finanzas, administración) | Aplicación web de escritorio |

Las tres aplicaciones consumen un mismo backend (API REST + WebSocket).

## Estado del proyecto

**Fase 0 (fundaciones)** en curso: la documentación está completa y el monorepo base compila, con pruebas
y verificación en CI. Aún no hay funcionalidades de negocio visibles para el usuario. El avance detallado
está en la [hoja de ruta](docs/12-hoja-de-ruta.md#avance-de-la-fase-0).

## Estructura

```text
apps/
  api/          Backend NestJS (API REST; WebSocket y workers vendrán después)
  pasajero/     PWA de pasajeros (React + Vite)
  conductor/    PWA de conductores, incluye la prueba técnica del ADR-0003
  operacion/    App web de operación
packages/
  dominio/      Reglas de negocio compartidas: estados del viaje, tarifa, comisión y cierre diario
infra/docker/   Servicios locales: PostgreSQL + PostGIS, Redis, MinIO y Mailpit
docs/           Documentación funcional y técnica
```

## Desarrollo local

Requisitos: Node 22 (`.nvmrc`) y pnpm 10 (`corepack enable`). Docker es opcional por ahora.

```bash
pnpm install
pnpm test          # pruebas de todos los paquetes
pnpm typecheck
pnpm lint
pnpm build

cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d   # servicios de apoyo

pnpm --filter @transportaya/api dev        # API en http://localhost:3000/v1/salud
pnpm --filter @transportaya/pasajero dev   # http://localhost:5171
pnpm --filter @transportaya/conductor dev  # http://localhost:5172
pnpm --filter @transportaya/operacion dev  # http://localhost:5173
```

## Documentación

Toda la documentación funcional y técnica está en [`docs/`](docs/README.md).

- [Visión y alcance](docs/01-vision-y-alcance.md)
- [Reglas de negocio](docs/03-reglas-de-negocio.md)
- [Arquitectura](docs/08-arquitectura.md)
- [Decisiones y riesgos](docs/13-decisiones-pendientes-y-riesgos.md)
- [Catálogo de vehículos](docs/14-catalogo-de-vehiculos.md)
