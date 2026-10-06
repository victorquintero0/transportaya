# 12 · Hoja de ruta

Las fases se definen por **alcance**, no por fechas. Las estimaciones de tiempo se harán cuando se conozca
el tamaño del equipo y se cierren las decisiones críticas de la [lista de pendientes](13-decisiones-pendientes-y-riesgos.md).

```mermaid
flowchart LR
    F0[Fase 0<br/>Fundaciones] --> F1[Fase 1<br/>MVP en una ciudad]
    F1 --> P[Piloto cerrado]
    P --> L[Lanzamiento]
    L --> F2[Fase 2<br/>Más servicios y automatización]
    F2 --> F3[Fase 3<br/>Corporativo y expansión]
```

## Fase 0 · Fundaciones

**Objetivo:** cerrar lo que bloquea el desarrollo y dejar lista la base técnica.

- Concepto legal sobre el modelo de operación (D-01) y requisitos de documentos para conductores.
- Definición de comisión, tarifas iniciales, ciudad de lanzamiento y pasarela de pagos (D-03, D-05, D-08).
- Diseño UX/UI de los flujos críticos de las tres apps y prueba con usuarios reales (conductores incluidos).
- Monorepo, CI/CD, entornos local y *staging*.
- Servicios de mapas para la ciudad de lanzamiento: PMTiles, OSRM, Photon y **prueba de calidad de búsqueda
  de direcciones** con un set de direcciones reales (ver [ADR-0002](adr/0002-mapas-openstreetmap-autoalojado.md)).
- **Prueba técnica de la PWA del conductor** en teléfonos Android de gama baja y media: ubicación continua,
  pantalla activa, sonido de ofertas, consumo de batería y datos (ver [ADR-0003](adr/0003-app-conductor-como-pwa.md)).
- Autenticación con OTP y usuarios internos con doble factor.

**Criterio de salida:** decisiones críticas cerradas y prueba de PWA del conductor con resultado aceptable.

## Fase 1 · MVP

**Objetivo:** operar viajes inmediatos en una ciudad, con control total desde la torre de control.

| Área | Alcance |
|---|---|
| Pasajero | Registro, cotización, viaje inmediato, seguimiento, chat, compartir, SOS, PIN, calificación, propina, recibos, historial, soporte básico |
| Conductor | Registro y documentos, conexión, ofertas, navegación, estados del viaje, cobro en efectivo, ganancias y saldo, indicadores |
| Operación | Torre de control con alertas, detalle de viaje con línea de tiempo y recorrido, despacho manual, onboarding y documentos, tarifas y zonas, dinámica manual, liquidaciones semanales con archivo de dispersión, soporte básico, usuarios y auditoría |
| Pagos | Efectivo y tarjeta |
| Backend | Despacho automático, libro de movimientos, alertas automáticas, notificaciones push, SMS y correo |

**Piloto cerrado:** `[30–50]` conductores y pasajeros invitados durante `[2–4]` semanas, para ajustar
parámetros (radios, tiempos, tarifas) y validar la PWA en condiciones reales.

**Criterio de salida:** metas de [visión y alcance](01-vision-y-alcance.md#métricas-de-éxito) alcanzadas en el piloto
y prueba de penetración sin hallazgos críticos abiertos.

## Fase 2 · Más servicios y automatización

- Viajes programados y tablero de reservas.
- Aeropuerto e intermunicipal: rutas con tarifa fija, peajes, recargos.
- Métodos de pago locales y abono de deudas desde la app del conductor.
- Dinámica automática por celdas H3.
- PQRS completo con SLA, plantillas y reembolsos con niveles de aprobación.
- Paradas intermedias, cambio de destino y llamada enmascarada.
- Pico y placa en el despacho.
- Reportes completos de tiempos y movimientos, exportables.
- Verificación de identidad del conductor con selfie al conectarse.
- Automatización de consultas de antecedentes, RUNT y SIMIT con un proveedor.

## Fase 3 · Corporativo y expansión

- Cuentas corporativas: empresas, contratos, empleados, centros de costo, políticas y estados de cuenta.
- Sección Empresa para administradores corporativos.
- Integración con facturación electrónica (si se decide en D-02).
- Nuevas ciudades.
- Evaluación de app nativa (Capacitor) para conductores según los datos del piloto.
