# 09 · Modelo de datos

Modelo **inicial** de las entidades principales. Sirve para alinear al equipo; los nombres exactos de
columnas e índices se definen en las migraciones.

## Convenciones

- **Identificadores:** UUID v7 (ordenables por fecha). Los viajes tienen además un **código corto** legible
  para soporte, por ejemplo `TY-7K3M9Q`.
- **Dinero:** `bigint` en pesos colombianos. Nunca `float`.
- **Fechas:** `timestamptz` guardadas en UTC; se muestran en `America/Bogota`.
- **Geografía:** PostGIS `geography` SRID 4326. Puntos para ubicaciones, polígonos para zonas y
  `LineString` para trayectorias.
- **Enumeraciones:** definidas una sola vez en `packages/dominio` y reflejadas en la base de datos.
- **Borrado de cuentas:** se **anonimizan** los datos personales y se conservan los viajes y movimientos
  por obligaciones contables y legales.

## Personas y vehículos

```mermaid
erDiagram
    USUARIO ||--o| PASAJERO : "es"
    USUARIO ||--o| CONDUCTOR : "es"
    USUARIO ||--o{ USUARIO_ROL : "tiene"
    CONDUCTOR ||--o{ CONDUCTOR_VEHICULO : "usa"
    VEHICULO ||--o{ CONDUCTOR_VEHICULO : "es usado por"
    CONDUCTOR ||--o{ DOCUMENTO : "carga"
    VEHICULO ||--o{ DOCUMENTO : "tiene"
    CONDUCTOR ||--o| CUENTA_BANCARIA : "cobra en"
    CONDUCTOR ||--o{ SESION_CONDUCTOR : "se conecta"
    CIUDAD ||--o{ CONDUCTOR : "opera en"

    USUARIO {
        uuid id PK
        text telefono UK "+57..."
        text email
        text nombre
        text estado "activo, bloqueado, anonimizado"
        timestamptz creado_en
    }
    USUARIO_ROL {
        uuid usuario_id FK
        text rol "monitor, soporte, cumplimiento, financiero, supervisor, admin"
    }
    PASAJERO {
        uuid usuario_id PK, FK
        numeric calificacion_promedio
        bigint deuda_pendiente "COP"
    }
    CONDUCTOR {
        uuid usuario_id PK, FK
        uuid ciudad_id FK
        text estado_habilitacion "registro_incompleto ... bloqueado"
        text estado_operativo "desconectado ... en_viaje"
        uuid vehiculo_activo_id FK
        numeric calificacion_promedio
        boolean acepta_intermunicipal
    }
    VEHICULO {
        uuid id PK
        text placa UK
        text marca
        text linea
        int modelo_anio
        text color
        text categoria "economico, confort"
        text estado
    }
    CONDUCTOR_VEHICULO {
        uuid conductor_id FK
        uuid vehiculo_id FK
        text relacion "propietario, autorizado"
    }
    DOCUMENTO {
        uuid id PK
        text titular_tipo "conductor, vehiculo"
        uuid titular_id
        text tipo "licencia, soat, rtm, ..."
        text numero
        date vence_en
        text archivo_clave "almacenamiento de objetos"
        text estado "pendiente, aprobado, rechazado, vencido"
        uuid revisado_por FK
        text motivo_rechazo
    }
    CUENTA_BANCARIA {
        uuid conductor_id FK
        text banco
        text tipo_cuenta
        text numero_cifrado
        text estado
    }
    SESION_CONDUCTOR {
        uuid id PK
        uuid conductor_id FK
        uuid vehiculo_id FK
        timestamptz inicio
        timestamptz fin
    }
    CIUDAD {
        uuid id PK
        text nombre
        geography area_servicio "polígono"
    }
```

## Viajes, despacho y ubicación

```mermaid
erDiagram
    PASAJERO ||--o{ VIAJE : "solicita"
    CONDUCTOR ||--o{ VIAJE : "realiza"
    VIAJE ||--o{ VIAJE_EVENTO : "registra"
    VIAJE ||--o{ OFERTA : "se ofrece en"
    CONDUCTOR ||--o{ OFERTA : "recibe"
    COTIZACION ||--o| VIAJE : "origina"
    TARIFA ||--o{ COTIZACION : "se aplica en"
    CIUDAD ||--o{ TARIFA : "define"
    CIUDAD ||--o{ ZONA : "contiene"
    CONDUCTOR ||--o{ POSICION_CONDUCTOR : "reporta"
    VIAJE ||--o{ CALIFICACION : "recibe"
    VIAJE ||--o{ ALERTA : "dispara"

    VIAJE {
        uuid id PK
        text codigo UK "TY-7K3M9Q"
        uuid pasajero_id FK
        uuid conductor_id FK
        uuid vehiculo_id FK
        text tipo_servicio "inmediato, programado, aeropuerto, intermunicipal"
        text categoria
        text estado "buscando_conductor ... finalizado"
        text estado_pago
        geography origen
        text origen_direccion
        geography destino
        text destino_direccion
        timestamptz programado_para
        uuid cotizacion_id FK
        uuid tarifa_id FK "versión aplicada"
        numeric multiplicador_dinamico
        bigint precio_estimado
        bigint precio_final
        bigint comision
        text metodo_pago
        uuid empresa_id FK
        uuid centro_costo_id FK
        int distancia_real_m
        int duracion_real_s
        geography trayectoria "LineString ajustada al mapa"
        timestamptz solicitado_en
        timestamptz aceptado_en
        timestamptz en_sitio_en
        timestamptz iniciado_en
        timestamptz finalizado_en
        timestamptz cancelado_en
        text cancelado_por "pasajero, conductor, operacion, sistema"
        text motivo_cancelacion
    }
    VIAJE_EVENTO {
        uuid id PK
        uuid viaje_id FK
        text tipo "solicitado, oferta_enviada, aceptado, ..."
        text actor_tipo
        uuid actor_id
        geography ubicacion
        jsonb datos
        timestamptz ocurrido_en
    }
    OFERTA {
        uuid id PK
        uuid viaje_id FK
        uuid conductor_id FK
        int ronda
        int eta_recogida_s
        int distancia_recogida_m
        timestamptz ofrecida_en
        timestamptz expira_en
        timestamptz respondida_en
        text resultado "aceptada, rechazada, expirada, retirada"
    }
    COTIZACION {
        uuid id PK
        uuid pasajero_id FK
        geography origen
        geography destino
        text categoria
        uuid tarifa_id FK
        numeric multiplicador_dinamico
        bigint precio
        int distancia_m
        int duracion_s
        timestamptz expira_en
    }
    TARIFA {
        uuid id PK
        uuid ciudad_id FK
        text categoria
        text tipo_servicio
        int version
        bigint base
        bigint valor_km
        bigint valor_minuto
        bigint minima
        bigint cancelacion
        bigint espera_minuto
        timestamptz vigente_desde
        timestamptz vigente_hasta
    }
    ZONA {
        uuid id PK
        uuid ciudad_id FK
        text tipo "aeropuerto, restringida, punto_encuentro, ..."
        text nombre
        geography poligono
    }
    POSICION_CONDUCTOR {
        uuid conductor_id FK
        timestamptz registrada_en "partición diaria"
        geography ubicacion
        int precision_m
        int velocidad_kmh
        int rumbo
        text estado_operativo
        uuid viaje_id FK
    }
    CALIFICACION {
        uuid id PK
        uuid viaje_id FK
        uuid de_usuario_id FK
        uuid a_usuario_id FK
        int estrellas
        text[] etiquetas
        text comentario
    }
    ALERTA {
        uuid id PK
        text tipo
        text severidad "critica, alta, media, baja"
        uuid viaje_id FK
        uuid conductor_id FK
        text estado "abierta, tomada, cerrada"
        uuid tomada_por FK
        text nota_cierre
        timestamptz creada_en
        timestamptz cerrada_en
    }
```

## Pagos, saldos, corporativo y soporte

```mermaid
erDiagram
    PASAJERO ||--o{ METODO_PAGO : "registra"
    VIAJE ||--o{ PAGO : "se cobra con"
    METODO_PAGO ||--o{ PAGO : "usa"
    PAGO ||--o{ REEMBOLSO : "tiene"
    CONDUCTOR ||--o{ MOVIMIENTO_SALDO : "acumula"
    VIAJE ||--o{ MOVIMIENTO_SALDO : "genera"
    LIQUIDACION ||--o{ MOVIMIENTO_SALDO : "agrupa"
    CONDUCTOR ||--o{ LIQUIDACION : "recibe"
    LOTE_DISPERSION ||--o{ LIQUIDACION : "paga"
    EMPRESA ||--o{ CENTRO_COSTO : "tiene"
    EMPRESA ||--o{ EMPLEADO_EMPRESA : "autoriza"
    EMPRESA ||--o{ ESTADO_CUENTA : "recibe"
    USUARIO ||--o{ EMPLEADO_EMPRESA : "pertenece"
    USUARIO ||--o{ TICKET : "radica"
    VIAJE ||--o{ TICKET : "se reclama en"
    TICKET ||--o{ TICKET_MENSAJE : "contiene"

    METODO_PAGO {
        uuid id PK
        uuid pasajero_id FK
        text tipo "tarjeta, nequi, pse, ..."
        text proveedor
        text token_proveedor "nunca el número de tarjeta"
        text marca
        text ultimos4
        boolean predeterminado
    }
    PAGO {
        uuid id PK
        uuid viaje_id FK
        uuid metodo_pago_id FK
        text tipo "efectivo, electronico, corporativo"
        bigint monto
        text estado
        text referencia_proveedor
        text clave_idempotencia UK
        int intentos
    }
    REEMBOLSO {
        uuid id PK
        uuid pago_id FK
        uuid ticket_id FK
        bigint monto
        uuid aprobado_por FK
    }
    MOVIMIENTO_SALDO {
        uuid id PK
        uuid conductor_id FK
        text tipo "ingreso_viaje_electronico, comision_viaje_efectivo, ..."
        bigint monto "con signo"
        uuid viaje_id FK
        uuid liquidacion_id FK
        text motivo
        uuid creado_por FK
        uuid aprobado_por FK
        timestamptz creado_en
    }
    LIQUIDACION {
        uuid id PK
        uuid conductor_id FK
        date periodo_inicio
        date periodo_fin
        bigint saldo_inicial
        bigint saldo_final
        text estado "borrador, aprobada, en_pago, pagada, rechazada"
        uuid lote_dispersion_id FK
    }
    LOTE_DISPERSION {
        uuid id PK
        date fecha
        text archivo_clave
        text estado
    }
    EMPRESA {
        uuid id PK
        text nit UK
        text razon_social
        numeric descuento_pct
        boolean aplica_dinamica
        bigint cupo_credito
        int dia_corte
        text estado
    }
    CENTRO_COSTO {
        uuid id PK
        uuid empresa_id FK
        text codigo
        text nombre
    }
    EMPLEADO_EMPRESA {
        uuid usuario_id FK
        uuid empresa_id FK
        text rol "empleado, administrador"
        uuid centro_costo_id FK
        jsonb politica
    }
    ESTADO_CUENTA {
        uuid id PK
        uuid empresa_id FK
        date periodo
        bigint total
        text estado "emitido, pagado, vencido"
    }
    TICKET {
        uuid id PK
        text tipo "peticion, queja, reclamo, ..."
        text estado
        text prioridad
        uuid usuario_id FK
        uuid viaje_id FK
        uuid asignado_a FK
        timestamptz vence_sla_en
        timestamptz creado_en
    }
    TICKET_MENSAJE {
        uuid id PK
        uuid ticket_id FK
        uuid autor_id FK
        text cuerpo
        boolean interno
        timestamptz creado_en
    }
```

## Auditoría

Tabla `auditoria` independiente, de solo inserción:

| Columna | Descripción |
|---|---|
| `id` | UUID v7 |
| `usuario_id` | Quién hizo la acción |
| `accion` | Por ejemplo `tarifa.publicar`, `conductor.suspender`, `saldo.ajustar` |
| `entidad`, `entidad_id` | Registro afectado |
| `antes`, `despues` | `jsonb` con los valores anteriores y nuevos |
| `motivo` | Texto obligatorio en acciones sensibles |
| `ip`, `ocurrido_en` | Contexto |

## Índices y consideraciones clave

- `viaje (estado)` parcial para viajes activos; `viaje (conductor_id, solicitado_en)` y `viaje (pasajero_id, solicitado_en)`.
- Índices **GiST** en todas las columnas `geography`.
- **Una sola oferta activa por conductor** y **un solo conductor por viaje**: restricciones únicas parciales
  (además del bloqueo en Redis).
- `movimiento_saldo (conductor_id, creado_en)`; el saldo actual se guarda también en una vista materializada
  o columna calculada, siempre reconciliable con la suma del libro.
- `posicion_conductor` particionada por día; las particiones viejas se eliminan según la política de retención.
