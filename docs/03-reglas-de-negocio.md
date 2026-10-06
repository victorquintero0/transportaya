# 03 · Reglas de negocio

Cada regla tiene un código `RN-xxx` para poder citarla en historias de usuario, pruebas y tickets.
Los valores entre corchetes, como `[2 min]`, son **propuestas iniciales configurables** desde la
App Operación; la definición final corresponde a negocio (ver [decisiones pendientes](13-decisiones-pendientes-y-riesgos.md)).

Convenciones generales:

- Moneda: pesos colombianos (COP), almacenados como **enteros** (sin decimales ni flotantes).
- Los precios que ve el usuario se **redondean a la centena** más cercana `[100 COP]`.
- Horas en zona `America/Bogota`. Los festivos siguen el calendario oficial de Colombia, cargado por año.

---

## 1. Ciudades, área de servicio y categorías

- **RN-001** Cada ciudad tiene un **área de servicio** (polígono). Solo se aceptan solicitudes cuyo
  origen esté dentro del área. El destino puede estar fuera solo para servicios aeropuerto / intermunicipal.
- **RN-002** Las tarifas, zonas, recargos, festivos y reglas de pico y placa se configuran **por ciudad**.
- **RN-003** Cada vehículo pertenece a una **categoría** (propuesta inicial: *Económico* y *Confort*; ver
  [D-07](13-decisiones-pendientes-y-riesgos.md)). Un vehículo de categoría superior puede atender
  viajes de una categoría inferior solo si el conductor lo activa.
- **RN-004** Existen **zonas restringidas** (por ejemplo, zonas con alto riesgo en ciertos horarios)
  donde se puede bloquear el origen o el destino, o exigir pago electrónico.

## 2. Tarifas

- **RN-010** La tarifa de un viaje urbano se calcula así:

  ```text
  subtotal       = tarifa_base + (km × valor_km) + (minutos × valor_minuto)
  tarifa_viaje   = max(tarifa_minima, subtotal × multiplicador_dinamico)
  total          = redondear(tarifa_viaje + recargos) + peajes + cobro_espera + propina
  ```

  La distancia y el tiempo estimados salen del motor de rutas (OSRM) para la ruta más rápida.

- **RN-011** **Recargos** configurables, fijos o porcentuales, que **no** se multiplican por la dinámica:
  nocturno `[20:00–05:59]`, dominical y festivo, aeropuerto (origen o destino dentro de la zona del
  aeropuerto) y reserva (viajes programados). Si aplican varios, se suman.
- **RN-012** **Precio cerrado.** El precio que el pasajero acepta al confirmar es el que se cobra, salvo que:
  1. el pasajero cambie el destino o agregue paradas (se recotiza desde la posición actual);
  2. haya cobro por espera (RN-041);
  3. haya peajes no incluidos en la cotización;
  4. la ruta real sea más de `[20 %]` más larga **por solicitud del pasajero**.

  En esos casos el precio final se recalcula con la distancia y el tiempo reales (trayectoria GPS
  ajustada al mapa). Ver [D-10](13-decisiones-pendientes-y-riesgos.md).
- **RN-013** Una **cotización** es válida por `[5 min]`. Pasado ese tiempo, la app debe recotizar antes de confirmar.
- **RN-014** Toda tarifa tiene **vigencia** (desde/hasta) y **versión**. Cada viaje guarda la versión de
  tarifa con la que se cotizó para poder auditarla.

**Ejemplo ilustrativo** (valores ficticios, no son tarifas reales):

| Concepto | Valor |
|---|---|
| Base | $ 2.500 |
| 6 km × $ 1.100 | $ 6.600 |
| 18 min × $ 250 | $ 4.500 |
| Subtotal | $ 13.600 |
| × dinámica 1,2 | $ 16.320 |
| + recargo nocturno | $ 1.000 |
| **Total redondeado** | **$ 17.300** |
| Comisión 20 % | $ 3.460 |
| Neto para el conductor | $ 13.840 |

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
  - si el pago es en efectivo, su saldo deudor está dentro del límite (RN-063);
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

- **RN-051** Transporteya **nunca almacena** números de tarjeta: solo el token que entrega la pasarela,
  la marca y los últimos 4 dígitos.
- **RN-052** Si la pasarela lo permite, al confirmar un viaje con tarjeta se hace una **preautorización**
  por el valor cotizado y se captura el valor final al terminar.
- **RN-053** Si un cobro electrónico falla, se reintenta `[3]` veces en `[24 h]`. Mientras tanto queda
  como **deuda del pasajero**, que no puede pedir otro viaje hasta saldarla. El conductor **recibe su
  pago igual**: el riesgo lo asume Transporteya.
- **RN-054** Con métodos locales que exigen confirmación del pasajero, el conductor puede finalizar el
  viaje aunque el pago esté pendiente. Si no se paga en `[15 min]`, aplica RN-053.
- **RN-055** En efectivo, el conductor confirma en la app el valor recibido. Si recibe menos, lo reporta
  y se crea un ticket de soporte.
- **RN-056** **Propinas:** solo por medios electrónicos, hasta `[24 h]` después del viaje; van **100 %**
  al conductor, sin comisión.
- **RN-057** Después de cada viaje se envía un **recibo** por correo. El recibo no es factura electrónica
  (ver [D-02](13-decisiones-pendientes-y-riesgos.md)).

## 7. Comisión y saldo del conductor

- **RN-060** Transporteya cobra una **comisión** `[20 %]` sobre la tarifa del viaje, los recargos, el cobro por
  espera y las tarifas de cancelación. **No** cobra comisión sobre peajes ni propinas.
  Ver [D-03](13-decisiones-pendientes-y-riesgos.md).
- **RN-061** Cada conductor tiene un **libro de movimientos** inmutable. El saldo es la suma de sus movimientos.
  Los movimientos no se editan ni se borran: los errores se corrigen con un movimiento de ajuste.

  | Movimiento | Signo | Origen |
  |---|---|---|
  | `ingreso_viaje_electronico` | + | Viaje pagado con tarjeta, método local o corporativo (tarifa − comisión) |
  | `comision_viaje_efectivo` | − | Viaje pagado en efectivo: el conductor ya tiene el dinero y debe la comisión |
  | `peaje` | + | Peajes de viajes pagados electrónicamente |
  | `propina` | + | Propina del pasajero |
  | `cancelacion` | + / − | Tarifa de cancelación o pasajero ausente (neto de comisión) |
  | `abono_conductor` | + | El conductor paga parte de su deuda |
  | `pago_liquidacion` | − | Transporteya le paga el saldo positivo |
  | `ajuste` | + / − | Corrección manual con motivo y doble aprobación |

- **RN-062** Ejemplo: viaje de $ 20.000 en efectivo → el conductor recibe $ 20.000 del pasajero y se registra
  `−$ 4.000`. El mismo viaje con tarjeta → se registra `+$ 16.000`.
- **RN-063** **Límite de deuda** `[$ 150.000]`. Si el saldo es más negativo que el límite, el conductor
  **solo recibe viajes con pago electrónico** hasta bajar del límite (así la deuda se compensa sola) y se
  le notifica. Si la deuda supera `[2 ×]` el límite o tiene más de `[2]` liquidaciones sin pagar, el
  conductor se suspende hasta abonar.
- **RN-064** El conductor puede abonar su deuda en cualquier momento: en el MVP por transferencia que
  registra finanzas; en F2 desde la app con métodos locales.

## 8. Liquidaciones

- **RN-070** El periodo de liquidación es **semanal**: de lunes 00:00 a domingo 23:59 (`America/Bogota`).
  Ver [D-04](13-decisiones-pendientes-y-riesgos.md).
- **RN-071** Cada lunes el sistema genera una **liquidación en borrador** por conductor con todos sus
  movimientos del periodo y el saldo final.
- **RN-072** Finanzas revisa las liquidaciones con alertas (saldos atípicos, ajustes, reclamos abiertos) y
  las **aprueba**. Al aprobar se genera el **archivo de dispersión** para el banco.
- **RN-073** Cuando el banco confirma el pago se registra `pago_liquidacion` y la liquidación pasa a **pagada**.
  Si un pago es rechazado (cuenta inválida), el saldo vuelve al conductor y se le pide actualizar sus datos.
- **RN-074** Saldos positivos menores a `[$ 20.000]` no se pagan y pasan al siguiente periodo.
  Los saldos negativos pasan al siguiente periodo como deuda.
- **RN-075** El conductor ve en la app el detalle de cada liquidación: viajes, comisiones, propinas, ajustes y pago.
- **RN-076** Retenciones e impuestos sobre los pagos quedan pendientes de definición contable
  (ver [D-06](13-decisiones-pendientes-y-riesgos.md)).

## 9. Viajes programados (F2)

- **RN-080** Se pueden reservar con mínimo `[45 min]` y máximo `[7 días]` de anticipación.
- **RN-081** El precio se **cierra al reservar**: sin dinámica y con el recargo de reserva.
- **RN-082** Los conductores ven las reservas disponibles en un **tablero** y pueden tomarlas desde
  `[24 h]` antes. Quien toma una reserva debe **confirmarla** `[60 min]` antes; si no confirma, vuelve al tablero.
- **RN-083** Si a `[30 min]` del servicio no hay conductor, se despacha automáticamente como un viaje inmediato
  con prioridad. Si a `[15 min]` sigue sin conductor, se genera una **alerta alta** a la operación.
- **RN-084** El pasajero puede cancelar gratis hasta `[60 min]` antes; después aplica la tarifa de cancelación.
- **RN-085** Se recuerda al pasajero `[24 h]` y `[1 h]` antes, y al conductor `[1 h]` y `[15 min]` antes.

## 10. Aeropuerto e intermunicipal (F2)

- **RN-090** La operación define **rutas con tarifa fija** (zona de origen → zona de destino), por ejemplo
  "Zona centro → Aeropuerto". Si origen y destino coinciden con una ruta, se usa la tarifa fija en vez de RN-010.
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
  | Licencia de conducción vigente, con la categoría que exija el modelo legal | SOAT vigente |
  | Certificados de antecedentes: judiciales, disciplinarios, fiscales y medidas correctivas | Revisión técnico-mecánica vigente, cuando aplique por antigüedad |
  | Consulta de multas pendientes (SIMIT) | Pólizas de responsabilidad civil, si el modelo legal las exige |
  | Foto de perfil (selfie) validada contra el documento | Fotos: frente, laterales, trasera e interior |
  | Certificación bancaria de una cuenta a su nombre | |

- **RN-111** Un conductor solo puede conectarse si **todos** sus documentos obligatorios y los de su vehículo
  activo están **aprobados y vigentes**.
- **RN-112** El sistema avisa al conductor `[30, 15, 7 y 1]` días antes de cada vencimiento. Al vencer, el
  conductor queda **suspendido automáticamente** hasta que se apruebe el documento nuevo.
- **RN-113** Requisitos del vehículo por categoría (configurables): antigüedad máxima `[10 años]`, 4 puertas,
  5 pasajeros y aire acondicionado para *Confort*.
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
