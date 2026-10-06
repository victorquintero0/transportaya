# 01 · Visión y alcance

## Contexto

Transporteya es una empresa colombiana de transporte de pasajeros. Su plataforma conecta a pasajeros
que necesitan un viaje con **conductores independientes** que usan su propio vehículo. La empresa no es
dueña de la flota: gana una **comisión** por cada viaje completado y es responsable de la calidad,
la seguridad y el control de la operación.

Además del pasajero ocasional, la empresa quiere atender a **clientes corporativos** (empresas que
pagan los viajes de sus empleados) y ofrecer **viajes programados** y **traslados al aeropuerto o entre
municipios**.

## Objetivos

1. **Pedir un viaje en segundos.** El pasajero confirma origen, destino y precio, y recibe un conductor
   cercano sin intervención humana.
2. **Asignación automática y justa.** El sistema ofrece cada viaje al conductor que puede llegar
   más rápido.
3. **Control total de tiempos y movimientos.** La operación ve en tiempo real dónde está cada conductor
   y cada viaje, y puede reconstruir después cualquier viaje minuto a minuto.
4. **Operación segura.** Conductores verificados con documentos vigentes, botón de emergencia,
   viaje compartido con contactos y alertas automáticas ante situaciones anómalas.
5. **Administración ordenada.** Liquidación semanal transparente para los conductores, gestión
   documental con alertas de vencimiento y atención de PQRS dentro de los plazos.

## Las tres aplicaciones

| Aplicación | Usuarios | Plataforma | Propósito |
|---|---|---|---|
| [App Pasajero](04-app-pasajero.md) | Pasajeros, empleados y administradores de empresas cliente | PWA móvil instalable | Cotizar, pedir, seguir, pagar y calificar viajes |
| [App Conductor](05-app-conductor.md) | Conductores independientes | PWA móvil instalable (Android como prioridad) | Registrarse, recibir y ejecutar viajes, ver ganancias y saldo |
| [App Operación](06-app-operacion.md) | Personal interno de Transporteya | Aplicación web para escritorio | Monitorear en vivo, despachar, gestionar conductores, tarifas, liquidaciones y soporte |

Las tres comparten un mismo backend. Ver [arquitectura](08-arquitectura.md).

## Alcance por fases

La propuesta es lanzar en **una sola ciudad** con un MVP reducido y ampliar por fases. La ciudad de
lanzamiento está pendiente (ver [D-08](13-decisiones-pendientes-y-riesgos.md)).

### MVP — operar viajes inmediatos de forma segura

- Registro e inicio de sesión con código OTP al celular.
- Viajes **inmediatos** dentro del área de servicio de la ciudad.
- Cotización con tarifa base + distancia + tiempo, tarifa mínima y **dinámica configurable manualmente**
  por zona desde la App Operación.
- Pago en **efectivo** y con **tarjeta** tokenizada.
- Asignación automática por cercanía (tiempo estimado de llegada).
- Seguimiento en vivo, chat pasajero–conductor, compartir viaje, botón SOS.
- Calificación mutua.
- Onboarding de conductores con carga y revisión de documentos; bloqueo automático por vencimiento.
- Torre de control: mapa en vivo, viajes activos, alertas, línea de tiempo y recorrido de cada viaje.
- Liquidación semanal con saldo del conductor (comisiones de efectivo vs. ingresos electrónicos).
- Soporte básico: tickets sobre un viaje y objetos perdidos.

### F2 — más servicios y más automatización

- Viajes **programados** con tablero de reservas.
- Traslados **aeropuerto / intermunicipales** con tarifas fijas por ruta y peajes.
- **Métodos de pago locales** (Nequi, PSE, Bre-B u otros según la pasarela).
- **Dinámica automática** según oferta y demanda.
- Módulo completo de **PQRS** con SLA, reembolsos y respuesta por plantillas.
- Paradas intermedias y cambio de destino durante el viaje.
- Reportes de tiempos y movimientos exportables.
- Restricción de **pico y placa** en la asignación.

### F3 — clientes corporativos y escala

- **Cuentas corporativas**: empleados autorizados, centros de costo, políticas de uso y estados de cuenta mensuales.
- Portal del administrador corporativo.
- Expansión a nuevas ciudades (tarifas, zonas y festivos por ciudad).
- Evaluación de una app nativa para conductores si la PWA no alcanza (ver [ADR-0003](adr/0003-app-conductor-como-pwa.md)).

## Fuera de alcance (por ahora)

- **Facturación electrónica DIAN** dentro de la plataforma. Probablemente sea obligatoria; se propone
  integrarla con un proveedor o software contable externo (ver [D-02](13-decisiones-pendientes-y-riesgos.md)).
- Contabilidad general y nómina (los conductores no son empleados).
- Apps nativas publicadas en tiendas.
- Viajes compartidos entre pasajeros desconocidos (*pool*), envíos y domicilios.
- Operación fuera de Colombia y múltiples monedas.

## Supuestos

- La mayoría de conductores usa teléfonos **Android** con plan de datos prepago.
- La empresa obtiene el concepto legal sobre su modelo de operación antes del lanzamiento
  (ver [R-01](13-decisiones-pendientes-y-riesgos.md)).
- Volumen inicial estimado para dimensionar: **hasta 500 conductores conectados a la vez** y
  **5.000 viajes al día** en la ciudad de lanzamiento. La arquitectura debe escalar 10× sin rediseño.

## Métricas de éxito

| Métrica | Definición | Meta inicial |
|---|---|---|
| Tiempo de asignación | Desde la solicitud hasta que un conductor acepta | p50 < 30 s |
| Tasa de cumplimiento | Viajes finalizados / solicitudes | > 80 % |
| Precisión del ETA de recogida | Diferencia entre la llegada prometida y la real | p80 dentro de ±2 min |
| Tasa de cancelación del conductor | Viajes cancelados por el conductor / viajes aceptados | < 5 % |
| Calificación promedio | Calificación de pasajeros a conductores | ≥ 4,7 |
| Utilización de conductores | Tiempo ocupado / tiempo en línea | > 55 % |
| Respuesta a PQRS | Tickets resueltos dentro del SLA interno | > 90 % |

Las definiciones exactas de cada tiempo están en [App Operación → tiempos y movimientos](06-app-operacion.md#ope-03--tiempos-y-movimientos).
