# 13 · Decisiones pendientes y riesgos

## Decisiones pendientes

Cada decisión tiene un responsable sugerido y una recomendación para no frenar el diseño. Cuando se decida,
se actualiza el documento afectado y se marca aquí como cerrada.

| Código | Decisión | Responsable | Recomendación / valor de trabajo | Bloquea |
|---|---|---|---|---|
| **D-01** | **Marco legal de operación**: vehículos particulares, servicio especial habilitado u otro esquema. Define licencia exigida (B1 o C1), pólizas, requisitos intermunicipales y documentos | Legal | Obtener concepto antes de la Fase 1 | Fase 1 |
| **D-02** | **Facturación electrónica DIAN** por las comisiones cobradas a conductores y por los servicios a clientes corporativos | Contabilidad + Legal | No se priorizó como módulo, pero probablemente sea obligatoria. Integrar con un proveedor tecnológico o software contable externo en vez de construirla | Fase 1 (comisiones), Fase 3 (corporativo) |
| **D-03** | Porcentaje de comisión y si varía por tipo de servicio o categoría | Negocio | 20 % para todos los servicios | Fase 1 |
| **D-04** | Frecuencia de liquidación, día de pago y banco para dispersión | Finanzas | Semanal, pago el martes | Fase 1 |
| **D-05** | **Pasarela de pagos** y métodos locales (Nequi, PSE, Bre-B...). Confirmar tokenización, preautorización, reembolsos y webhooks | Finanzas + Tecnología | Comparar al menos tres pasarelas colombianas con esos criterios | Fase 1 |
| **D-06** | Retenciones e impuestos sobre los pagos a conductores (retención en la fuente, ICA, IVA sobre la comisión) y si se exige RUT al conductor | Contabilidad | Definir con el contador antes de la primera liquidación | Fase 1 |
| **D-07** | Categorías de vehículo y requisitos de cada una | Negocio | *Económico* y *Confort* | Fase 1 |
| **D-08** | Ciudad de lanzamiento | Negocio | — | Fase 0 (mapas y tarifas) |
| **D-09** | Dónde vive el portal del administrador corporativo | Producto | Sección "Empresa" dentro de la App Pasajero, para mantener la App Operación solo interna | Fase 3 |
| **D-10** | Precio cerrado vs. precio recalculado al final | Negocio | Precio cerrado con excepciones (RN-012) | Fase 1 |
| **D-11** | Mostrar o no el destino al conductor antes de aceptar | Negocio | Mostrar zona aproximada y distancia total, no la dirección exacta | Fase 1 |
| **D-12** | Valores de cancelación, espera y pasajero ausente | Negocio | Valores de RN-041 a RN-043 | Fase 1 |
| **D-13** | Proveedor de SMS / WhatsApp para OTP | Tecnología | WhatsApp como canal principal y SMS como respaldo | Fase 0 |
| **D-14** | Requisitos mínimos del vehículo (antigüedad, características) | Negocio + Legal | Antigüedad máxima de 10 años | Fase 1 |
| **D-15** | Seguros: pólizas de responsabilidad civil y seguro de accidentes para pasajeros | Legal | Depende de D-01 | Fase 1 |
| **D-16** | Nombre comercial y dominio: el repositorio usa *transportaya* y la empresa *Transporteya* | Negocio | Unificar antes de publicar las apps | Lanzamiento |
| **D-17** | Protocolo de atención de emergencias (SOS) y horario de la torre de control | Operación | Torre de control 24/7 desde el lanzamiento si se opera de noche | Fase 1 |
| **D-18** | Proveedor de nube y región | Tecnología | Elegir por latencia desde Colombia y cumplimiento de la Ley 1581 | Fase 0 |

## Riesgos

Escala: **Alto / Medio / Bajo** para probabilidad e impacto.

| Código | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| **R-01** | **Regulatorio:** el transporte de pasajeros por plataformas con vehículos particulares tiene un marco legal discutido en Colombia; puede haber sanciones a conductores o a la empresa, o cambios de ley | Alta | Alto | Concepto legal (D-01) antes de construir; diseñar tarifas, documentos y servicios configurables para adaptarse a cambios |
| **R-02** | **Laboral:** que los conductores independientes sean considerados empleados | Media | Alto | No imponer turnos, no sancionar rechazos (RN-035), libertad de conexión; revisar reglamentos y contratos con Legal |
| **R-03** | **PWA del conductor:** pérdida de ubicación u ofertas con la pantalla apagada o en segundo plano | Alta | Alto | Prueba técnica en Fase 0, pantalla activa, estado `sin_senal`, plan B con Capacitor (ADR-0003) |
| **R-04** | **Búsqueda de direcciones con OpenStreetMap** de baja calidad en algunas zonas de Colombia | Alta | Medio | Intérprete de nomenclatura colombiana, capa propia de lugares, pin en el mapa, prueba de calidad en Fase 0 (ADR-0002) |
| **R-05** | **Deuda de conductores** por comisiones de viajes en efectivo | Media | Medio | Límite de deuda con compensación automática por viajes electrónicos (RN-063) |
| **R-06** | **Fraude:** cuentas falsas, GPS falso, viajes ficticios, tarjetas robadas, conductor y pasajero coludidos | Media | Medio | Verificación documental, validación de ubicaciones, reglas de detección (RNF-50), límites para cuentas nuevas |
| **R-07** | **Seguridad física** de pasajeros y conductores | Media | Alto | SOS, PIN, viaje compartido, alertas automáticas, torre de control, verificación de antecedentes |
| **R-08** | **Costo y mantenimiento** de los servicios de mapas autoalojados | Media | Medio | Automatizar la actualización mensual; interfaces para cambiar a un proveedor comercial |
| **R-09** | **Notificaciones en iOS** solo con la PWA instalada | Alta | Bajo | Guiar la instalación; conexión en tiempo real mientras la app está abierta |
| **R-10** | **Facturación electrónica** no prevista en el alcance | Media | Medio | Resolver D-02 en la Fase 0 |
| **R-11** | **Concentración en una pasarela de pagos** (caídas o cambios de condiciones) | Baja | Medio | Interfaz de pagos desacoplada; evaluar una segunda pasarela en F2 |
