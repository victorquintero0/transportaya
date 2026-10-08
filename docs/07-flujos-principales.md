# 07 · Flujos principales

## 1. Ciclo de vida del viaje

El **estado del viaje** y el **estado del pago** se manejan por separado: un viaje puede estar
`finalizado` con el pago `pendiente` o `fallido`.

```mermaid
stateDiagram-v2
    [*] --> programado: reserva
    [*] --> buscando_conductor: viaje inmediato
    programado --> buscando_conductor: llega la hora de despacho
    buscando_conductor --> asignado: conductor acepta
    buscando_conductor --> sin_conductor: nadie acepta en el tiempo límite
    asignado --> buscando_conductor: conductor cancela
    asignado --> en_sitio: conductor marca Llegué
    en_sitio --> en_curso: conductor inicia (PIN)
    en_curso --> finalizado: conductor finaliza
    programado --> cancelado
    buscando_conductor --> cancelado
    asignado --> cancelado
    en_sitio --> cancelado: incluye pasajero ausente
    en_curso --> cancelado: solo operación
    finalizado --> [*]
    cancelado --> [*]
    sin_conductor --> [*]
```

| Estado del pago | Significado |
|---|---|
| `no_aplica` | Viaje cancelado sin costo o sin conductor |
| `pendiente` | Esperando cobro o confirmación del pasajero |
| `preautorizado` | Monto reservado en la tarjeta (si la pasarela lo permite) |
| `pagado` | Cobro exitoso o efectivo confirmado por el conductor |
| `fallido` | Cobro rechazado; se convierte en deuda del pasajero |
| `reembolsado_parcial` / `reembolsado` | Se devolvió parte o todo el valor |

Cada transición genera un **evento** (`viaje_evento`) con fecha y hora, actor y datos. Esos eventos son la
fuente de la línea de tiempo y de los [indicadores de tiempos](06-app-operacion.md#ope-03--tiempos-y-movimientos).

## 2. Solicitud y asignación de un viaje inmediato

```mermaid
sequenceDiagram
    autonumber
    actor P as Pasajero
    participant AP as App Pasajero
    participant API as API
    participant DES as Despacho (worker)
    participant R as Redis (posiciones)
    participant OSRM as Motor de rutas
    participant AC as App Conductor
    actor C as Conductor

    P->>AP: Elige destino
    AP->>API: POST /v1/cotizaciones
    API->>OSRM: Ruta origen → destino
    API-->>AP: Precio por categoría, ETA, dinámica
    P->>AP: Confirma
    AP->>API: POST /v1/viajes (cotizacion_id, metodo_pago)
    API-->>AP: viaje en buscando_conductor
    API->>DES: Encolar despacho
    DES->>R: Conductores disponibles cerca (radio 3 km)
    DES->>OSRM: Matriz de ETA candidatos → recogida
    loop Por cada candidato, en orden de ETA
        DES->>AC: oferta:nueva (15 s)
        AC->>C: Sonido + pantalla de oferta
        alt Acepta
            C->>AC: Aceptar
            AC->>API: POST /v1/conductor/ofertas/{id}/aceptar
            API-->>AP: viaje:estado = asignado (conductor, vehículo, ETA)
        else Rechaza o expira
            DES->>DES: Siguiente candidato (o ampliar radio)
        end
    end
    loop Cada 4 s hasta finalizar
        AC->>API: conductor:ubicacion
        API-->>AP: viaje:ubicacion_conductor
    end
```

Puntos clave:

- La aceptación es **atómica**: si dos procesos intentan asignar el mismo viaje o el mismo conductor, solo
  uno gana (bloqueo en Redis + restricción en base de datos).
- Si el pasajero cancela mientras hay una oferta abierta, la oferta se retira (`oferta:retirada`).

## 3. Finalización y pago

```mermaid
sequenceDiagram
    autonumber
    participant AC as App Conductor
    participant API as API
    participant PAG as Pasarela de pagos
    participant AP as App Pasajero

    AC->>API: POST /v1/conductor/viajes/{id}/finalizar
    API->>API: Calcular precio final (RN-012) y comisión
    alt Efectivo
        API-->>AC: Valor a cobrar
        AC->>API: Confirmar valor recibido
        API->>API: Libro: comision_viaje_efectivo (−)
    else Tarjeta
        API->>PAG: Cobrar con token (clave de idempotencia)
        PAG-->>API: Resultado (síncrono o por webhook)
        alt Aprobado
            API->>API: Libro: ingreso_viaje_electronico (+)
        else Rechazado
            API->>API: Deuda del pasajero + reintentos
            API->>API: Libro: ingreso_viaje_electronico (+) igual para el conductor
        end
    end
    API-->>AP: viaje:estado = finalizado + resumen
    API->>AP: Recibo por correo
```

## 4. Habilitación de un conductor

```mermaid
flowchart TD
    A[Registro con OTP] --> B[Datos personales y del vehículo]
    B --> C[Carga de documentos y fotos]
    C --> D[Cuenta bancaria]
    D --> E[En revisión]
    E --> F{Cumplimiento revisa cada documento}
    F -->|Algún rechazo| G[Conductor ve el motivo y corrige]
    G --> E
    F -->|Todo aprobado| H[Consulta de antecedentes, RUNT y SIMIT]
    H -->|Hallazgo| I[Rechazo o revisión del supervisor]
    H -->|Sin hallazgos| J[Habilitado]
    J --> K[Capacitación / aceptación del reglamento]
    K --> L[Puede conectarse]
```

En el MVP las consultas de antecedentes, RUNT y SIMIT las hace el analista manualmente en los portales
oficiales y adjunta el soporte. La automatización con un proveedor se evalúa en F2.

## 5. Cierre diario y cobro de la comisión

```mermaid
flowchart TD
    A[00:00 · cierre del día del conductor] --> B[Cruce neto: ingresos electrónicos − comisiones de efectivo]
    B --> C{Resultado}
    C -->|A favor del conductor| D[Finanzas revisa alertas y aprueba]
    D --> E[Pago por llave / Bre-B]
    E -->|Pagado| F[Movimiento pago_liquidacion]
    E -->|Rechazado| G[Saldo se conserva · pedir actualizar la llave]
    C -->|A cargo del conductor| H[Conductor queda sin habilitar]
    H --> I[Conductor paga la comisión por llave / Bre-B]
    I --> J{¿Pago conciliado?}
    J -->|Sí| K[Movimiento pago_comision · habilitación automática]
    J -->|No llega| L[Cobranza verifica · habilitación manual si el pago está confirmado]
    L --> K
```

## 6. Botón SOS

```mermaid
sequenceDiagram
    autonumber
    actor U as Pasajero o conductor
    participant App as App
    participant API as API
    participant OP as Torre de control
    participant CT as Contactos de confianza

    U->>App: Mantiene presionado SOS
    App->>API: POST /v1/viajes/{id}/sos (ubicación)
    App->>U: Opción de llamar al 123
    API->>OP: alerta:nueva (crítica, sonido)
    API->>CT: SMS / WhatsApp con enlace del viaje en vivo
    API->>App: Aumentar frecuencia de GPS
    OP->>OP: Monitor toma la alerta (meta < 60 s)
    OP->>U: Llamada de verificación
    OP->>OP: Protocolo: autoridades, seguimiento, cierre con nota
```

## 7. Viaje programado

Una reserva es un viaje en estado `programado` con `programado_para`; sigue siendo `inmediato` o `intermunicipal` en
su tipo de servicio. Cada 30 s una tarea la mantiene: la **activa** (`buscando_conductor`) a la hora de despacho, la
**libera** si su conductor no confirmó a tiempo y **alerta** si a `[15 min]` sigue sin conductor.


```mermaid
flowchart TD
    A[Pasajero reserva con 45 min a 7 días] --> B[Precio cerrado + recargo de reserva]
    B --> C[Reserva visible en el tablero de conductores desde 24 h antes]
    C --> D{¿Un conductor la toma?}
    D -->|Sí| E[Confirmación 60 min antes]
    E -->|No confirma| C
    E -->|Confirma| F[Recordatorios a ambos]
    F --> G[Viaje normal desde 'asignado']
    D -->|No, a 30 min| H[Despacho automático con prioridad]
    H -->|Sin conductor a 15 min| I[Alerta alta a la operación · despacho manual]
    H -->|Asignado| G
    I --> G
```
