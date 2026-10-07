# 09 · Modelo de datos

La fuente de verdad es el código: [`packages/db/src/schema/`](../packages/db/src/schema) define las 43 tablas y
[`packages/db/migraciones/`](../packages/db/migraciones) las crea en PostgreSQL 16 con PostGIS 3.4. Este documento
explica el modelo y las reglas que la base hace cumplir; si difiere del código, manda el código.

## Cómo se trabaja con la base

```bash
cd packages/db
DATABASE_URL=postgres://transportaya:transportaya@localhost:5432/transportaya pnpm migrar   # aplica las migraciones
DATABASE_URL=... pnpm semilla                                                               # Manizales: tarifa, rutas y catálogo
pnpm generar                                                                                # genera una migración tras cambiar el esquema
pnpm test                                                                                   # 64 pruebas de integridad contra PostgreSQL real
```

- Las pruebas crean una base temporal por archivo y la borran al terminar. Necesitan un PostgreSQL con PostGIS y
  un usuario con permisos de superusuario (`TEST_DATABASE_URL`, por defecto `localhost:5432`). En la CI se exigen
  (`REQUIRE_DB=1`); en local, si no hay base, se saltan con aviso.
- **Nunca se edita una migración ya aplicada.** Un cambio de esquema es una migración nueva (ver
  [ADR-0005](adr/0005-esquema-con-drizzle-e-integridad-en-la-base.md)).

## Convenciones

- **Identificadores:** UUID v7 generado por la base (`uuid_v7()`), ordenable por fecha de creación. Los viajes tienen
  además un **código corto** legible, por ejemplo `TY-7K3M9Q`.
- **Dinero:** `bigint` en pesos colombianos. Nunca `float`.
- **Fechas:** `timestamptz` en UTC; se muestran en `America/Bogota`. El día contable de un movimiento es el día de Bogotá
  (columna generada `movimiento_saldo.dia`).
- **Geografía:** PostGIS `geography` SRID 4326, con índices GiST. En el código un punto es `{ lat, lng }`.
- **Enumeraciones:** las categorías, los estados del viaje y del pago, los tipos de servicio y los tipos de movimiento se
  crean desde las constantes de `@transportaya/dominio`, para que la base y la lógica no puedan divergir.
- **Borrado de cuentas:** se **anonimizan** los datos personales y se conservan los viajes y movimientos por
  obligaciones contables y legales. Por eso las claves hacia `usuario` no tienen borrado en cascada.

## Mapa de tablas

| Área | Tablas |
|---|---|
| Identidad | `usuario`, `empleado`, `usuario_rol`, `otp_codigo`, `sesion`, `suscripcion_push` |
| Pasajeros | `pasajero`, `contacto_confianza`, `lugar_guardado`, `metodo_pago` |
| Conductores y vehículos | `conductor`, `vehiculo`, `conductor_vehiculo`, `cuenta_pago_conductor`, `documento`, `sesion_conductor`, `posicion_conductor` |
| Catálogos y tarifas | `ciudad`, `catalogo_vehiculo`, `tarifa`, `tarifa_recargo`, `ruta_fija`, `zona`, `dinamica_zona`, `festivo`, `parametro` |
| Viajes y despacho | `cotizacion`, `viaje`, `viaje_evento`, `oferta`, `viaje_mensaje`, `viaje_compartido`, `calificacion`, `alerta` |
| Dinero | `pago`, `reembolso`, `movimiento_saldo`, `cierre_diario`, `pago_conductor`, `pago_comision` |
| Soporte y control | `ticket`, `ticket_mensaje`, `auditoria` |

Vistas: `saldo_conductor` (suma del libro) y `viaje_tiempos` (asignación, llegada, espera, viaje y total de servicio de cada viaje).

## Personas y vehículos

```mermaid
erDiagram
    USUARIO ||--o| PASAJERO : "es"
    USUARIO ||--o| CONDUCTOR : "es"
    USUARIO ||--o| EMPLEADO : "es"
    EMPLEADO ||--o{ USUARIO_ROL : "tiene"
    PASAJERO ||--o{ METODO_PAGO : "registra"
    PASAJERO ||--o{ LUGAR_GUARDADO : "guarda"
    PASAJERO ||--o{ CONTACTO_CONFIANZA : "tiene"
    CIUDAD ||--o{ CONDUCTOR : "opera en"
    CONDUCTOR ||--o{ CONDUCTOR_VEHICULO : "usa"
    VEHICULO ||--o{ CONDUCTOR_VEHICULO : "es usado por"
    CATALOGO_VEHICULO ||--o{ VEHICULO : "clasifica"
    CONDUCTOR ||--o{ DOCUMENTO : "carga"
    VEHICULO ||--o{ DOCUMENTO : "tiene"
    CONDUCTOR ||--o{ CUENTA_PAGO_CONDUCTOR : "cobra en"
    CONDUCTOR ||--o{ SESION_CONDUCTOR : "se conecta"

    CONDUCTOR {
        uuid usuario_id PK
        enum estado_habilitacion
        enum estado_operativo
        uuid vehiculo_activo_id FK
        bool bloqueado_por_deuda
        bool acepta_categoria_inferior
        bool acepta_intermunicipal
    }
    VEHICULO {
        uuid id PK
        text placa UK
        enum categoria "media, media_alta, alta"
        bool fuera_de_catalogo
    }
    CATALOGO_VEHICULO {
        text marca
        text linea
        enum categoria
    }
    DOCUMENTO {
        enum titular "conductor o vehiculo"
        enum tipo "soat, rtm, todo_riesgo, licencia..."
        date vence_en
        enum estado
    }
    CUENTA_PAGO_CONDUCTOR {
        enum tipo "llave_bre_b o cuenta_bancaria"
        text valor_cifrado
    }
```

## Tarifas, viajes y despacho

```mermaid
erDiagram
    CIUDAD ||--o{ TARIFA : "define"
    TARIFA ||--o{ TARIFA_RECARGO : "tiene"
    CIUDAD ||--o{ RUTA_FIJA : "origen de"
    CIUDAD ||--o{ ZONA : "contiene"
    ZONA ||--o{ DINAMICA_ZONA : "recibe"
    PASAJERO ||--o{ COTIZACION : "pide"
    TARIFA ||--o{ COTIZACION : "aplica en"
    RUTA_FIJA ||--o{ COTIZACION : "aplica en"
    COTIZACION ||--o| VIAJE : "origina"
    PASAJERO ||--o{ VIAJE : "solicita"
    CONDUCTOR ||--o{ VIAJE : "realiza"
    VIAJE ||--o{ VIAJE_EVENTO : "registra"
    VIAJE ||--o{ OFERTA : "se ofrece en"
    CONDUCTOR ||--o{ OFERTA : "recibe"
    VIAJE ||--o{ CALIFICACION : "recibe"
    VIAJE ||--o{ VIAJE_MENSAJE : "tiene"
    VIAJE ||--o{ ALERTA : "dispara"
    CONDUCTOR ||--o{ POSICION_CONDUCTOR : "reporta"

    TARIFA {
        int version
        bigint base "banderazo"
        bigint valor_km
        bigint valor_minuto "tiempo detenido"
        bigint minima
        tstzrange vigencia
    }
    TARIFA_RECARGO {
        text codigo "nocturno, aeropuerto, categoria..."
        bigint valor
        enum categoria "solo para recargos por categoria"
    }
    RUTA_FIJA {
        text destino
        enum modalidad "solo_ida o ida_y_vuelta"
        bigint tarifa
    }
    COTIZACION {
        bigint precio_min
        bigint precio_max
        numeric multiplicador_dinamico
    }
    VIAJE {
        text codigo UK
        enum estado
        enum estado_pago
        numeric multiplicador_dinamico
        int distancia_taximetro_m
        int tiempo_detenido_taximetro_s
        int distancia_real_m
        int tiempo_detenido_s
        bigint total_carrera
        bigint precio_final
        bigint comision
        int comision_pb
        geography trayectoria
    }
    OFERTA {
        int ronda
        enum resultado
        timestamptz expira_en
    }
    POSICION_CONDUCTOR {
        timestamptz registrada_en "particion diaria"
        geography ubicacion
    }
```

**Mediciones del taxímetro.** El viaje guarda dos juegos de valores: lo que reportó el **taxímetro de la app del conductor**
(`*_taximetro_*`) y los valores **con los que se cobra** (`distancia_real_m`, `tiempo_detenido_s`, `duracion_s`), que se verifican
con la trayectoria que recibe el servidor ([RN-015](03-reglas-de-negocio.md)). Si difieren más de un umbral se genera una alerta
`diferencia_taximetro`.

## Dinero: libro, cierre diario y pagos

```mermaid
erDiagram
    VIAJE ||--o{ PAGO : "se cobra con"
    METODO_PAGO ||--o{ PAGO : "usa"
    PAGO ||--o{ REEMBOLSO : "tiene"
    CONDUCTOR ||--o{ MOVIMIENTO_SALDO : "acumula"
    VIAJE ||--o{ MOVIMIENTO_SALDO : "genera"
    CONDUCTOR ||--o{ CIERRE_DIARIO : "cierra cada dia"
    CIERRE_DIARIO ||--o| PAGO_CONDUCTOR : "paga si es a favor"
    CIERRE_DIARIO ||--o{ PAGO_COMISION : "cobra si es a cargo"
    PAGO_COMISION ||--o| MOVIMIENTO_SALDO : "genera pago_comision"
    PAGO_CONDUCTOR ||--o| MOVIMIENTO_SALDO : "genera pago_liquidacion"
    CUENTA_PAGO_CONDUCTOR ||--o{ PAGO_CONDUCTOR : "recibe"

    MOVIMIENTO_SALDO {
        enum tipo
        bigint monto "con signo"
        date dia "dia de Bogota, generado"
        uuid creado_por FK
        uuid aprobado_por FK
    }
    CIERRE_DIARIO {
        date dia
        bigint saldo_inicial
        bigint neto_dia
        bigint saldo_final
        enum resultado "a_favor, a_cargo, en_cero"
    }
    PAGO_COMISION {
        bigint monto
        text referencia "llave o Bre-B"
        enum estado "pendiente, conciliado"
    }
```

El saldo de un conductor **no se guarda**: es la suma de su libro (`saldo_conductor`). El cierre diario lo fija a las 00:00;
si es negativo, el conductor queda bloqueado hasta que se concilie su pago ([RN-063](03-reglas-de-negocio.md)).

## Reglas de integridad que hace cumplir la base

Estas reglas no dependen de que la aplicación se comporte bien. Cada una tiene una prueba en `packages/db/test/`.

| Regla | Mecanismo |
|---|---|
| El libro de movimientos, la auditoría y los eventos del viaje **no se pueden modificar, borrar ni vaciar** | Disparadores `BEFORE UPDATE OR DELETE` y `BEFORE TRUNCATE` |
| El signo y el origen de cada movimiento son coherentes (efectivo debita, electrónico acredita, etc.) | `CHECK movimiento_signo_y_origen` |
| Un viaje no se contabiliza dos veces | Índice único parcial `(viaje_id, tipo)` |
| Un ajuste exige motivo y **doble aprobación** (quien lo crea no lo aprueba) | `CHECK` dentro del mismo constraint |
| El cierre diario cuadra (`saldo_final = saldo_inicial + neto`) y su resultado coincide con el signo | `CHECK cierre_diario_cuadra` y `cierre_diario_resultado` |
| Un pago de comisión no se concilia dos veces con la misma referencia | Índice único `(canal, referencia)` |
| Las transiciones de estado del viaje son las permitidas, **idénticas a las del dominio** | Disparador `validar_transicion_viaje` + prueba que compara las 64 combinaciones con `puedeTransitar` |
| Un viaje asignado tiene conductor y vehículo; uno finalizado tiene precio, comisión y tiempos; uno cancelado, quién y cuándo | `CHECK` del viaje |
| Un conductor no tiene dos viajes activos, ni dos sesiones en línea, ni dos ofertas pendientes | Índices únicos parciales |
| Un viaje tiene **una sola** oferta aceptada: la asignación es atómica | Índice único parcial |
| Una sola tarifa vigente por ciudad y servicio; una sola tarifa por ruta fija; un solo multiplicador de dinámica por zona y horario | Restricciones de exclusión (`EXCLUDE USING gist`) |
| Un documento es de un conductor **o** de un vehículo; rechazar exige motivo; aprobar exige revisor | `CHECK` del documento |
| Placa, teléfono E.164, PIN de 4 dígitos, últimos 4 de la tarjeta y código de viaje con formato válido | `CHECK` por columna |
| Una cotización usa una tarifa urbana **o** una ruta fija | `CHECK cotizacion_una_tarifa` |
| `actualizado_en` siempre refleja el último cambio | Disparador `fijar_actualizado_en` |

## Posiciones y retención

`posicion_conductor` es una tabla **particionada por día** (corte a la medianoche de Bogotá). La migración crea 14 días hacia
adelante y una partición por defecto que recibe lo que no tenga partición propia, para no perder datos.

Un trabajo programado debe, cada día:

1. `SELECT crear_particiones_posicion(current_date, 14)`: asegura los días siguientes.
2. `SELECT eliminar_particiones_posicion(current_date - 180)`: aplica la retención de `[6 meses]` ([RNF-64](11-requisitos-no-funcionales.md)).

Pendiente: implementar ese trabajo en `apps/api` (BullMQ).

## Fuera de esta versión

- **Clientes corporativos (F3):** `empresa`, `centro_costo`, `empleado_empresa` y `estado_cuenta`. Se agregan en una migración
  nueva cuando se construya esa fase; `viaje` ya podrá referenciarlas.
- **Calendario de festivos:** la tabla `festivo` existe pero falta cargar los de cada año.
- **Dinámica automática (F2):** las celdas H3 y sus mediciones no se guardan; viven en Redis. Aquí solo está la dinámica manual por zona.
- **Cifrado de columnas:** `valor_cifrado` (cuentas de pago) y `totp_secreto_cifrado` guardan texto ya cifrado por la aplicación
  (RNF-46); la gestión de llaves aún no está implementada.
