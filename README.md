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
  api/          Backend NestJS: API REST, WebSocket y tareas programadas
  pasajero/     PWA de pasajeros (completa)
  conductor/    PWA de conductores (completa) e incluye la prueba técnica del ADR-0003 en /diagnostico
  operacion/    App web de operación, de escritorio (completa en sus módulos principales: docs/13, D-32)
  e2e/          Pruebas de punta a punta con un navegador real (Playwright)
packages/
  dominio/      Reglas de negocio compartidas: estados del viaje, tarifa, comisión, cierre diario y taxímetro
  ui/           Identidad de marca y componentes compartidos de las apps: botones, hojas, iconos, cliente de la API
  db/           Esquema de PostgreSQL + PostGIS (Drizzle), migraciones, carga inicial y pruebas de integridad
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
pnpm build         # también deja listo @transportaya/dominio, que necesita el comando de migración

cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d   # servicios de apoyo

# Base de datos (las pruebas de packages/db necesitan PostgreSQL con PostGIS; ver docs/09)
export DATABASE_URL=postgres://transportaya:transportaya@localhost:5432/transportaya
pnpm --filter @transportaya/db migrar      # aplica las migraciones
pnpm --filter @transportaya/db semilla     # Manizales: tarifa, 193 rutas y catálogo de vehículos

pnpm --filter @transportaya/api dev        # API en http://localhost:3000/v1/salud
pnpm --filter @transportaya/pasajero dev   # http://localhost:5171
pnpm --filter @transportaya/conductor dev  # http://localhost:5172
pnpm --filter @transportaya/operacion dev  # http://localhost:5173 (en modo demostración, entra con un clic por rol)
```

> **Windows:** si ya tienes un PostgreSQL en el puerto 5432 (por ejemplo el de Laragon), el contenedor de Docker puede usar otro puerto (`-p 5433:5432`) y `DATABASE_URL` apuntar a él. El repositorio fuerza finales de línea LF (`.gitattributes`) para que los CSV de la semilla se lean bien.

### Mapa

Las apps muestran el mapa de calles con [MapLibre](https://maplibre.org) y **OpenFreeMap** por defecto (gratis, sin clave; necesita internet). El proveedor se cambia en la
App Operación, **Configuración → Mapa de las apps**, sin tocar código ([ADR-0009](docs/adr/0009-mapa-con-maplibre-y-proveedor-configurable.md)); sin internet o sin WebGL las apps
siguen con el mapa esquemático.

### Probar las apps (modo demostración)

Con la API y las apps en marcha, abre el conductor en <http://localhost:5172> y el pasajero en <http://localhost:5171>, en el navegador (idealmente con el modo móvil de las herramientas
de desarrollo). Aún no hay proveedor de OTP: la app muestra el código para usarlo con un toque. En **Perfil → Modo demostración**
hay un pasajero de mentira, un GPS simulado y atajos para el cierre diario y los bancos. En la app del pasajero, **Cuenta → Modo demostración** pone conductores de mentira que atienden de verdad tus viajes, y al agregar una tarjeta hay una de prueba que el banco rechaza. El camino completo (registro → conexión →
oferta → viaje con taxímetro → cobro → pago de comisión), el del pasajero (pedir → seguir → pagar → calificar) y el de operación (aprobar un registro → despachar a mano → alerta SOS → cierre y cobranza → soporte → tarifas → auditoría) los recorren las pruebas de punta a punta:

```bash
# necesita PostgreSQL con PostGIS (como las pruebas de la API) y un Chromium; deja capturas en apps/e2e/capturas
pnpm --filter @transportaya/e2e e2e
```

La **App Operación** (<http://localhost:5173>) tiene en el modo demostración una cuenta por rol (monitor, soporte, cumplimiento, financiero, supervisor y administrador) con las que se entra con un clic; cada una ve solo lo que su rol permite. En producción el ingreso es correo, contraseña y código de una app de autenticación ([ADR-0008](docs/adr/0008-app-operacion-web-con-segundo-factor.md)); la primera cuenta sale de `ADMIN_INICIAL_EMAIL` y `ADMIN_INICIAL_CONTRASENA`.

## Documentación

Toda la documentación funcional y técnica está en [`docs/`](docs/README.md).

- [Visión y alcance](docs/01-vision-y-alcance.md)
- [Reglas de negocio](docs/03-reglas-de-negocio.md)
- [Arquitectura](docs/08-arquitectura.md)
- [Decisiones y riesgos](docs/13-decisiones-pendientes-y-riesgos.md)
- [Catálogo de vehículos](docs/14-catalogo-de-vehiculos.md)
