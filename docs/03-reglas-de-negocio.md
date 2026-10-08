# 03 · Reglas de negocio

Cada regla tiene un código `RN-xxx` para poder citarla en historias de usuario, pruebas y tickets.
Los valores entre corchetes, como `[2 min]`, son **propuestas iniciales configurables** desde la
App Operación; la definición final corresponde a negocio (ver [decisiones pendientes](13-decisiones-pendientes-y-riesgos.md)).

Convenciones generales:

- Moneda: pesos colombianos (COP), almacenados como **enteros** (sin decimales ni flotantes).
- El valor de la carrera se **aproxima por defecto a la centena anterior** (Decreto 0641 de 2025, parágrafo tercero). Ver RN-010.
- Horas en zona `America/Bogota`. Los festivos siguen el calendario oficial de Colombia, cargado por año.

---

## 1. Ciudades, área de servicio y categorías

- **RN-001** Cada ciudad tiene un **área de servicio** (polígono). Solo se aceptan solicitudes cuyo
  origen esté dentro del área. El destino puede estar fuera solo para servicios intermunicipales, nacionales
  o de aeropuerto. La ciudad inicial es **Manizales**, con operación en el **Eje Cafetero** y cobertura nacional
  mediante rutas con tarifa fija (sección 10).
- **RN-002** Las tarifas, zonas, recargos, festivos y reglas de pico y placa se configuran **por ciudad**.
- **RN-003** Cada vehículo pertenece a una de tres **categorías**: **Media**, **Media Alta** o **Alta**. La categoría
  la asigna el [catálogo de vehículos](14-catalogo-de-vehiculos.md) según marca, línea y año, y puede corregirla
  cumplimiento con motivo. Un vehículo de categoría superior puede atender viajes de una categoría inferior
  solo si el conductor lo activa.
- **RN-004** Existen **zonas restringidas** (por ejemplo, zonas con alto riesgo en ciertos horarios)
  donde se puede bloquear el origen o el destino, o exigir pago electrónico.

## 2. Tarifas

- **RN-010** La tarifa de un viaje urbano se calcula así:

  ```text
  subtotal       = tarifa_base + (km × valor_km) + (minutos_cobrables × valor_minuto)
  tarifa_viaje   = max(tarifa_minima, subtotal × multiplicador_dinamico)
  total          = aproximar_por_defecto(tarifa_viaje + recargos) + peajes + cobro_espera + propina
  ```

  - La distancia estimada sale del motor de rutas (OSRM) para la ruta más rápida; la real, de la trayectoria GPS.
  - Los **minutos cobrables** son el **tiempo detenido**, como en el taxímetro de Manizales (D-20, D-23). Al
    cotizar no se conoce, así que se estima como una fracción de la duración estimada; al finalizar se mide con el GPS.
  - **Aproximación por defecto:** si el valor termina en una cifra mayor a $50, se aproxima **a la centena anterior**
    (parágrafo tercero del Decreto 0641 de 2025). El redondeo es siempre hacia abajo, nunca al más cercano.

  **Tarifa urbana de Manizales 2026** ([D-20](13-decisiones-pendientes-y-riesgos.md); Decreto 0641 del 31/12/2025,
  vigente desde el 1 de enero de 2026), tomada de las tarifas de taxi con taxímetro:

  | Concepto | Valor |
  |---|---|
  | Banderazo (`tarifa_base`) | $ 3.700 |
  | Costo por kilómetro | $ 1.784 |
  | Costo por tiempo detenido | $ 223 (por minuto; ver [D-23](13-decisiones-pendientes-y-riesgos.md)) |
  | Tarifa mínima | $ 6.300 |

- **RN-011** **Recargos** que **no** se multiplican por la dinámica. Los valores iniciales son los del Decreto 0641:

  | Recargo | Valor | Cuándo aplica |
  |---|---|---|
  | Aeropuerto | $ 4.700 | Origen o destino en el aeropuerto |
  | Nocturno | $ 1.000 | De `[19:00]` a `[06:00]` del día siguiente |
  | Dominical y festivo | $ 1.000 | Domingos y festivos; **no se suma al nocturno**: si el servicio es nocturno en domingo o festivo, solo se cobra el nocturno |
  | Servicio solicitado por central o aplicación web (puerta a puerta) | $ 800 | Todo viaje pedido por la aplicación |
  | Moteles | $ 2.300 | Servicio con destino a moteles |
  | Zona de termales | $ 2.700 | No se cobra a residentes de la vereda Gallinazo |
  | Mascotas | $ 1.000 | Servicio con mascota |
  | Categoría **Media Alta** | $ 1.000 | Vehículo de esa categoría ([D-22](13-decisiones-pendientes-y-riesgos.md)) |
  | Categoría **Alta** | $ 2.000 | Vehículo de esa categoría ([D-22](13-decisiones-pendientes-y-riesgos.md)) |

  El decreto establece que **no se cobrará ningún otro recargo**. Por eso **no hay recargo de reserva** en los
  viajes programados (ver RN-081) mientras Legal no confirme otra cosa ([D-19](13-decisiones-pendientes-y-riesgos.md)).
  El decreto fija además la **hora de trabajo en $ 42.000** (servicio por tiempo). Los recargos son configurables,
  fijos o porcentuales, y se suman cuando aplican varios.
- **RN-012** **Precio recalculado al final** ([D-10](13-decisiones-pendientes-y-riesgos.md)). En viajes urbanos, la
  cotización es un **estimado**: el precio que se cobra se calcula con la **distancia real y el tiempo detenido real**
  (trayectoria GPS ajustada al mapa) aplicando la tarifa vigente al momento de la cotización. Reglas:
  1. La app muestra siempre un **rango** (por ejemplo, "$ 15.000 – $ 18.000") y el aviso de que el valor final
     depende de la distancia y el tiempo detenido reales.
  2. El multiplicador de dinámica de la cotización (RN-022) se mantiene aunque cambie después.
  3. Pendiente de definir con Negocio: un **tope** sobre el máximo del rango (ver [R-13](13-decisiones-pendientes-y-riesgos.md)).
  4. Las **rutas con tarifa fija** (RN-090) **no se recalculan**: se cobra el valor de la tabla.
  5. Peajes y cobro de espera se suman al valor final (RN-041).
- **RN-013** Una **cotización** es válida por `[5 min]`. Pasado ese tiempo, la app debe recotizar antes de confirmar.
- **RN-015** **Taxímetro en la app del conductor** ([D-23](13-decisiones-pendientes-y-riesgos.md)). La app del conductor mide con GPS,
  desde "Iniciar" hasta "Finalizar", tres valores: **distancia recorrida**, **duración total** y **tiempo detenido**. El tiempo
  detenido es el que se cobra a $223 por minuto (RN-010). Reglas:
  1. El conductor y el pasajero ven el **valor en curso** mientras dura el viaje.
  2. Al finalizar, la app envía sus mediciones y el servidor las **verifica con la trayectoria** que recibió durante el viaje
     (ajustada al mapa). La base guarda las dos: lo que midió el taxímetro y los valores con los que se cobra.
  3. Si la diferencia supera `[10 %]`, se genera una alerta `diferencia_taximetro` para la operación (ver [R-15](13-decisiones-pendientes-y-riesgos.md)).
  4. Mientras no haya señal, la app **acumula las mediciones localmente** y las completa al reconectar; un tramo sin GPS se
     marca y se estima con la ruta del servidor.
  5. Un punto se considera **detenido** cuando la velocidad es menor a `[3 km/h]` durante al menos `[10 s]`: umbrales pendientes de calibrar en el piloto.
- **RN-014** Toda tarifa tiene **vigencia** (desde/hasta) y **versión**. Cada viaje guarda la versión de
  tarifa con la que se cotizó para poder auditarla.

**Ejemplo con la tarifa de Manizales 2026** (viaje nocturno de 6 km con 3 minutos detenido, pedido por la app):

| Concepto | Valor |
|---|---|
| Banderazo | $ 3.700 |
| 6 km × $ 1.784 | $ 10.704 |
| 3 min detenido × $ 223 | $ 669 |
| Subtotal (sin dinámica) | $ 15.073 |
| + recargo nocturno | $ 1.000 |
| + recargo puerta a puerta | $ 800 |
| Valor antes de aproximar | $ 16.873 |
| **Total aproximado por defecto** | **$ 16.800** |
| Comisión 3 % | $ 504 |
| Neto para el conductor | $ 16.296 |

El simulador de la App Operación y las pruebas automáticas del paquete `dominio` reproducen este ejemplo.

## 3. Dinámica

- **RN-020** La ciudad se divide en celdas hexagonales **H3** (resolución 8, ≈ 0,7 km²). Para cada celda
  se mide cada `[1 min]`: solicitudes de los últimos `[5 min]` y conductores disponibles en la celda y sus vecinas.
- **RN-021** El multiplicador sale de una tabla de tramos según la razón demanda/oferta. Ejemplo:
  razón < 1,2 → 1,0×; 1,2–1,6 → 1,2×; 1,6–2,0 → 1,4×; > 2,0 → 1,6×.
  El multiplicador tiene un **tope** por ciudad `[2,0×]` y se suaviza para no saltar más de `[0,2]` por minuto.
- **RN-022** El multiplicador que aplica es el de la celda de **origen** y se **congela** al confirmar el viaje.
- **RN-023** El pasajero siempre ve que hay dinámica activa y el valor resultante **antes** de confirmar.
- **RN-024** La operación puede **fijar, limitar o desactivar** la dinámica por zona y por tiempo
  (por ejemplo, durante una emergencia pública o un evento). Esta acción queda en auditoría.
- **RN-025** En el **MVP** la dinámica solo se activa manualmente por zona; el cálculo automático llega en F2.

## 4. Asignación de conductores (despacho)

- **RN-030** Un conductor es **candidato** para un viaje si cumple todo lo siguiente:
  - está en línea, disponible y sin otra oferta pendiente;
  - envió ubicación en los últimos `[30 s]`;
  - tiene todos sus documentos y los del vehículo aprobados y vigentes (RN-111);
  - su vehículo es de la categoría solicitada (o superior, según RN-003);
  - no tiene restricción de pico y placa en ese momento y lugar (RN-115, F2);
  - no está bloqueado por deuda de comisión (RN-063);
  - no está bloqueado con ese pasajero (calificación de 1 estrella entre ambos o bloqueo por soporte).
- **RN-031** Se buscan candidatos en un radio inicial `[3 km]` y se ordenan por **ETA real a la recogida**
  (motor de rutas), no por distancia en línea recta. En empate, gana quien lleva más tiempo disponible sin viaje.
- **RN-032** La oferta se envía a **un conductor a la vez**, con `[15 s]` para aceptar. Si rechaza o no
  responde, pasa al siguiente candidato.
- **RN-033** Si se agotan los candidatos, el radio se amplía `[3 → 5 → 8 km]`. Si en `[2 min]` nadie acepta,
  el viaje queda **sin conductor**: se notifica al pasajero (con opción de reintentar) y se registra como
  demanda insatisfecha para la operación.
- **RN-034** La oferta muestra al conductor: distancia y tiempo a la recogida, **zona aproximada** del
  destino y distancia total del viaje, ganancia estimada, método de pago y calificación del pasajero.
  Ver [D-11](13-decisiones-pendientes-y-riesgos.md).
- **RN-035** Rechazar ofertas **no genera sanciones automáticas**: la tasa de aceptación se mide e
  informa al conductor, pero no se usa para castigarlo (riesgo laboral, ver [R-02](13-decisiones-pendientes-y-riesgos.md)).
- **RN-036** Un monitor de operación puede **despachar manualmente** un viaje a un conductor específico
  o **reasignarlo**. El conductor recibe la oferta igual que en el despacho automático.

## 5. Espera, cancelaciones y pasajero ausente

- **RN-040** El conductor solo puede marcar **"llegué"** si su GPS está a menos de `[150 m]` del punto de recogida.
- **RN-041** Desde "llegué", el pasajero tiene `[3 min]` de espera gratis. Después se cobra `[$ 250]` por minuto
  hasta que inicie el viaje.
- **RN-042** **Cancelación del pasajero:**

  | Momento | Costo |
  |---|---|
  | Antes de tener conductor asignado | Gratis |
  | Hasta `[2 min]` después de la asignación | Gratis |
  | Si el ETA del conductor empeoró más de `[5 min]` frente al prometido | Gratis |
  | En cualquier otro caso | Tarifa de cancelación `[$ 4.000]` |

- **RN-043** **Pasajero ausente:** tras `[5 min]` de espera en el punto, el conductor puede cancelar como
  "pasajero no se presentó" y se cobra la tarifa de cancelación. Si el pago era en efectivo, queda como
  **deuda del pasajero** y se cobra en su siguiente viaje.
- **RN-044** La tarifa de cancelación va al conductor, descontando la comisión.
- **RN-045** **Cancelación del conductor** después de aceptar: el viaje vuelve a despacho con prioridad
  y el pasajero no paga nada. Si un conductor supera `[3]` cancelaciones en `[24 h]`, se genera una alerta
  a cumplimiento para revisión (no hay suspensión automática).
- **RN-046** Todo cancelado registra **quién** canceló (pasajero, conductor, operación o sistema) y el **motivo**.

## 6. Pagos

- **RN-050** Métodos de pago:

  | Método | Fase | Cuándo se cobra |
  |---|---|---|
  | Efectivo | MVP | El pasajero paga al conductor al finalizar |
  | Tarjeta crédito/débito (tokenizada) | MVP | Cobro automático al finalizar |
  | Métodos locales (Nequi, PSE, Bre-B u otros) | F2 | El pasajero confirma el pago en la app al finalizar |
  | Cuenta corporativa | F3 | A crédito; se cobra en el estado de cuenta mensual |

  La pasarela es **Wompi** ([D-05](13-decisiones-pendientes-y-riesgos.md)). El pago de la comisión del conductor por llave / Bre-B (RN-063) es un flujo aparte del pago del pasajero.

- **RN-051** TransporteYa **nunca almacena** números de tarjeta: solo el token que entrega la pasarela,
  la marca y los últimos 4 dígitos.
- **RN-052** Si la pasarela lo permite, al confirmar un viaje con tarjeta se hace una **preautorización**
  por el valor cotizado y se captura el valor final al terminar.
- **RN-053** Si un cobro electrónico falla, se reintenta `[3]` veces en `[24 h]`. Mientras tanto queda
  como **deuda del pasajero**, que no puede pedir otro viaje hasta saldarla. El conductor **recibe su
  pago igual**: el riesgo lo asume TransporteYa.
- **RN-054** Con métodos locales que exigen confirmación del pasajero, el conductor puede finalizar el
  viaje aunque el pago esté pendiente. Si no se paga en `[15 min]`, aplica RN-053.
- **RN-055** En efectivo, el conductor confirma en la app el valor recibido. Si recibe menos, lo reporta
  y se crea un ticket de soporte.
- **RN-056** **Propinas:** solo por medios electrónicos, hasta `[24 h]` después del viaje; van **100 %**
  al conductor, sin comisión.
- **RN-057** Después de cada viaje se envía un **recibo** por correo. El recibo no es factura electrónica
  (ver [D-02](13-decisiones-pendientes-y-riesgos.md)).

## 7. Comisión y cierre diario del conductor

- **RN-060** TransporteYa cobra una **comisión** sobre la tarifa del viaje, los recargos, el cobro por espera y
  las tarifas de cancelación ([D-03](13-decisiones-pendientes-y-riesgos.md)):

  | Tipo de viaje | Comisión |
  |---|---|
  | Dentro de la ciudad (urbano y aeropuerto urbano) | **3 %** |
  | Nacional (intermunicipal, con tarifa fija por destino) | **5 %** |

  No se cobra comisión sobre peajes ni propinas. Los porcentajes son configurables por tipo de servicio.
- **RN-061** Cada conductor tiene un **libro de movimientos** inmutable. El saldo es la suma de sus movimientos.
  Los movimientos no se editan ni se borran: los errores se corrigen con un movimiento de ajuste.

  | Movimiento | Signo | Origen |
  |---|---|---|
  | `ingreso_viaje_electronico` | + | Viaje pagado con tarjeta o método local (tarifa − comisión) |
  | `comision_viaje_efectivo` | − | Viaje pagado en efectivo: el conductor ya tiene el dinero y debe la comisión |
  | `peaje` | + | Peajes de viajes pagados electrónicamente |
  | `propina` | + | Propina del pasajero |
  | `cancelacion` | + / − | Tarifa de cancelación o pasajero ausente (neto de comisión) |
  | `pago_comision` | + | El conductor paga su comisión por llave / Bre-B |
  | `pago_liquidacion` | − | TransporteYa le paga el saldo a favor |
  | `ajuste` | + / − | Corrección manual con motivo y doble aprobación |

- **RN-062** Ejemplo urbano de $ 20.000: en **efectivo**, el conductor recibe $ 20.000 del pasajero y se registra
  `−$ 600` (3 %). Con **tarjeta**, se registra `+$ 19.400`. Un viaje nacional de $ 240.000 en efectivo registra `−$ 12.000` (5 %).
- **RN-063** **Cierre diario y bloqueo por deuda** ([D-04](13-decisiones-pendientes-y-riesgos.md)):
  1. A las **00:00** se cierra el día de cada conductor con un **cruce neto**: lo que TransporteYa le debe por viajes
     electrónicos contra la comisión que él debe por viajes en efectivo.
  2. Si el resultado es **a favor del conductor**, se le paga por llave / Bre-B (RN-070).
  3. Si el resultado es **a cargo del conductor**, debe pagar ese valor a TransporteYa por **llave o Bre-B**.
  4. Mientras exista una deuda del día anterior sin pagar, el conductor **queda sin habilitar para conectarse**.
     El bloqueo empieza en el cierre de las 00:00.
  5. El pago se concilia, se registra `pago_comision` y el conductor se **habilita automáticamente** (ver [R-14](13-decisiones-pendientes-y-riesgos.md)).
  6. Un viaje en curso a las 00:00 se cierra en el día en que **finaliza**.
- **RN-064** El conductor ve en la app su **deuda del día**, los datos de la llave de TransporteYa, y puede pagar
  desde su banca móvil. Soporte o finanzas pueden **habilitarlo manualmente** si el pago está confirmado y aún no concilia.

## 8. Pagos al conductor y cuenta de cobro

- **RN-070** El **periodo de cierre es diario**, de 00:00 a 23:59 (`America/Bogota`). Los saldos a favor se pagan
  al conductor por **llave / Bre-B** al día siguiente.
- **RN-071** Cada día a las 00:00 el sistema genera el **cierre diario** por conductor con los movimientos del día y el resultado neto.
- **RN-072** Finanzas revisa los cierres con alertas (saldos atípicos, ajustes, reclamos abiertos). Los pagos
  se aprueban y se ejecutan por Bre-B; en el MVP pueden hacerse por lote.
- **RN-073** Cuando el pago se confirma se registra `pago_liquidacion`. Si es rechazado (llave inválida), el saldo
  se conserva a favor del conductor y se le pide actualizar sus datos.
- **RN-074** Saldos a favor menores a `[$ 20.000]` se acumulan al día siguiente.
- **RN-075** El conductor ve en la app el detalle de cada cierre diario: viajes, comisiones, propinas, ajustes y pagos.
- **RN-076** Retenciones e impuestos sobre los pagos quedan pendientes del contador (sin supuesto, [D-06](13-decisiones-pendientes-y-riesgos.md)).

## 9. Viajes programados (F2)

- **RN-080** Se pueden reservar con mínimo `[45 min]` y máximo `[7 días]` de anticipación.
- **RN-081** El precio se **cierra al reservar**: sin dinámica. El decreto de tarifas no prevé recargo de reserva (RN-011).
- **RN-082** Los conductores ven las reservas disponibles en un **tablero** y pueden tomarlas desde
  `[24 h]` antes. Quien toma una reserva debe **confirmarla** `[60 min]` antes; si no confirma, vuelve al tablero.
- **RN-083** Si a `[30 min]` del servicio no hay conductor, se despacha automáticamente como un viaje inmediato
  con prioridad. Si a `[15 min]` sigue sin conductor, se genera una **alerta alta** a la operación.
- **RN-084** El pasajero puede cancelar gratis hasta `[60 min]` antes; después aplica la tarifa de cancelación.
- **RN-085** Se recuerda al pasajero `[24 h]` y `[1 h]` antes, y al conductor `[1 h]` y `[15 min]` antes. Los recordatorios
  son notificaciones *push*, que siguen pendientes (necesitan un proveedor): mientras tanto la reserva se ve en «Mis
  reservas» y en el tablero del conductor.
- **RN-086** Una reserva se cotiza con los recargos y la tarifa **de la hora del servicio** (por ejemplo, el recargo
  nocturno si es de madrugada), sin dinámica y sin conductores cerca. Cada pasajero puede tener hasta `[5]` reservas
  abiertas y no puede reservar dos servicios con menos de `[60 min]` entre sí.
- **RN-087** Un conductor no puede tener dos reservas con menos de `[90 min]` entre sí, y mientras tiene una reserva
  confirmada a menos de `[45 min]` no recibe viajes inmediatos. Puede **soltar** una reserva tomada hasta `[120 min]`
  antes. Si la toma cuando falta menos de `[60 min]` queda confirmada de una vez.
- **RN-088** La reserva confirmada **tiene prioridad**: a la hora del despacho se le asigna directamente a ese conductor
  (sin oferta). Si no la cumple, se busca otro conductor y se alerta a la operación. Si nadie la tomó, a los `[30 min]`
  se busca conductor como un viaje inmediato, pero con un presupuesto de búsqueda más largo (hasta `[10 min]` después de la hora).
- **RN-089** Si el pasajero cancela con menos de `[60 min]`, paga la tarifa de cancelación: va al conductor con reserva
  confirmada (menos la comisión) y, si no había, a la empresa. La operación puede asignar, cambiar o liberar el conductor
  de una reserva con motivo (queda auditado).

## 10. Rutas nacionales, intermunicipales y aeropuerto (MVP)

- **RN-090** La operación define **rutas con tarifa fija** (origen → destino, `solo_ida` o `ida_y_vuelta`).
  La carga inicial son las [193 tarifas desde Manizales](datos/tarifas-rutas-manizales-2026.csv). Si origen y destino
  coinciden con una ruta, se usa la tarifa fija en vez de RN-010. Pendiente: si la tarifa cambia por categoría ([D-19](13-decisiones-pendientes-y-riesgos.md)).
- **RN-091** Los viajes intermunicipales sin ruta fija usan una **tarifa por km intermunicipal** más los
  **peajes** de la ruta calculada (tabla de peajes georreferenciados mantenida por operación).
- **RN-092** Solo reciben ofertas intermunicipales los conductores que las **activen** en su perfil y cumplan
  los requisitos adicionales que defina el concepto legal (ver [D-01](13-decisiones-pendientes-y-riesgos.md)).
- **RN-093** La zona del aeropuerto es una geocerca: si el origen o el destino está dentro, aplica el recargo
  de aeropuerto. Puede definirse un **punto de encuentro** obligatorio para recogidas en el aeropuerto.

## 11. Clientes corporativos (F3)

- **RN-100** Una **empresa cliente** tiene contrato con: tarifa pactada (descuento o tarifa propia), si aplica
  o no la dinámica, **cupo de crédito** y día de corte mensual.
- **RN-101** El administrador corporativo invita empleados por correo o celular y los asigna a **centros de costo**.
- **RN-102** **Políticas de uso** por grupo de empleados: días y horarios permitidos, monto máximo por viaje,
  servicios permitidos, zonas permitidas y si se exige un motivo del viaje.
- **RN-103** Un viaje corporativo que viola una política se **bloquea antes de confirmar**, con el motivo.
- **RN-104** Si la empresa supera su cupo o tiene estados de cuenta vencidos `[> 15 días]`, se suspende el
  perfil corporativo de sus empleados (pueden seguir pidiendo viajes personales).
- **RN-105** Cada mes se genera un **estado de cuenta** con el detalle por empleado y centro de costo.

## 12. Habilitación de conductores y vehículos

- **RN-110** Documentos exigidos (la lista final depende del concepto legal, ver [D-01](13-decisiones-pendientes-y-riesgos.md)):

  | Del conductor | Del vehículo |
  |---|---|
  | Documento de identidad: cédula de ciudadanía, cédula de extranjería o PPT | Licencia de tránsito |
  | Licencia de conducción vigente categoría **B1** ([D-01](13-decisiones-pendientes-y-riesgos.md)) | SOAT vigente |
  | Certificados de antecedentes: judiciales, disciplinarios, fiscales y medidas correctivas | **Revisión técnico-mecánica** vigente |
  | Consulta de multas pendientes (SIMIT) | **Seguro todo riesgo** vigente ([D-14](13-decisiones-pendientes-y-riesgos.md)) |
  | Foto de perfil (selfie) validada contra el documento | Fotos: frente, laterales, trasera e interior |
  | Llave Bre-B o certificación bancaria a su nombre | Póliza para pasajeros, si Legal la exige ([D-15](13-decisiones-pendientes-y-riesgos.md)) |

- **RN-111** Un conductor solo puede conectarse si **todos** sus documentos obligatorios y los de su vehículo
  activo están **aprobados y vigentes**.
- **RN-112** El sistema avisa al conductor `[30, 15, 7 y 1]` días antes de cada vencimiento. Al vencer, el
  conductor queda **suspendido automáticamente** hasta que se apruebe el documento nuevo.
- **RN-113** **No hay límite de antigüedad** del vehículo ([D-14](13-decisiones-pendientes-y-riesgos.md)): lo que
  exige la empresa es la revisión técnico-mecánica y el seguro todo riesgo vigentes. La categoría sale del
  [catálogo de vehículos](14-catalogo-de-vehiculos.md). Otros requisitos por categoría (puertas, pasajeros) son configurables.
- **RN-114** Un vehículo puede estar asociado a varios conductores (por ejemplo, el dueño y otro conductor),
  pero solo **uno** puede estar en línea con él a la vez. Un conductor tiene un solo vehículo activo a la vez.
- **RN-115** **Pico y placa (F2):** por ciudad se configuran días, horarios, área y dígitos restringidos.
  El sistema avisa al conductor al conectarse y no le ofrece viajes que lo obliguen a circular en restricción.
  Si el conductor tiene una excepción (por ejemplo, un permiso pago), la carga como documento.
- **RN-116** Toda aprobación o rechazo de documentos registra quién lo hizo y el motivo del rechazo, que el
  conductor ve en la app.

## 13. Calificaciones y calidad

- **RN-120** Al terminar, pasajero y conductor se califican mutuamente de **1 a 5 estrellas**, con etiquetas y
  comentario opcional, hasta `[24 h]` después.
- **RN-121** El promedio se calcula sobre los últimos `[100]` viajes calificados.
- **RN-122** Un conductor con promedio menor a `[4,5]` genera una alerta a cumplimiento para revisión y
  acompañamiento. Un pasajero con promedio menor a `[4,0]` genera una revisión de soporte.
- **RN-123** Una calificación de **1 estrella** evita que ese pasajero y ese conductor vuelvan a coincidir.
- **RN-124** Una calificación con etiqueta de seguridad (por ejemplo, "conducción peligrosa" o "acoso") crea
  automáticamente un **ticket de seguridad**.

## 14. Seguridad

- **RN-130** Pasajero y conductor tienen un **botón SOS** durante el viaje. Al activarlo:
  se envía una alerta crítica a la operación con ubicación en vivo y datos del viaje, la app ofrece llamar
  al **123** y se notifica a los contactos de confianza del pasajero.
- **RN-131** La operación debe contactar a quien activó el SOS en menos de `[60 s]` y seguir el protocolo
  de emergencias (por definir con el área de seguridad).
- **RN-132** El pasajero puede **compartir el viaje** con un enlace público que muestra conductor, vehículo,
  placa y ubicación en vivo. El enlace **expira** `[30 min]` después de finalizar el viaje.
- **RN-133** **PIN de inicio** de 4 dígitos: el pasajero se lo dice al conductor para iniciar el viaje.
  Opcional para el pasajero; obligatorio entre `[22:00 y 05:00]` (configurable).
- **RN-134** Pasajero y conductor **no ven el número de teléfono** del otro. Se comunican por chat en la app
  (MVP) y por llamada enmascarada (F2).
- **RN-135** El sistema genera **alertas automáticas** por paradas prolongadas, desvíos, pérdida de señal y
  viajes que exceden el tiempo esperado. La lista está en [App Operación → alertas](06-app-operacion.md#alertas-automáticas).

## 15. Soporte y PQRS

- **RN-140** Tipos de ticket: petición, queja, reclamo, sugerencia, objeto perdido, cobro incorrecto,
  incidente de seguridad.
- **RN-141** Tiempos de primera respuesta internos: seguridad **inmediato**, objeto perdido `[2 h]`, cobro
  incorrecto `[24 h]`, demás `[48 h]`. La respuesta de fondo nunca supera el **plazo legal** aplicable
  (15 días hábiles para reclamos de consumo; validar con asesoría legal).
- **RN-142** Los tickets sobre un viaje quedan vinculados a él para que el agente vea su línea de tiempo y recorrido.
- **RN-143** **Reembolsos:** totales o parciales, al medio de pago original. Cada rol tiene un monto máximo
  de reembolso `[agente: $ 30.000]`; por encima, aprueba un supervisor.
- **RN-144** **Objetos perdidos:** al reportarlo, se habilita un chat entre pasajero y conductor durante `[48 h]`,
  mediado por soporte si es necesario.
