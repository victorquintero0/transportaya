# 0003 · App de conductores como PWA, con Capacitor como plan B

- **Estado:** Aceptada, sujeta a la prueba técnica de la Fase 0
- **Fecha:** 2026-10-06

## Contexto

Negocio quiere una **PWA** para conductores: sin tiendas de aplicaciones, actualizaciones inmediatas y el mismo
código web que el resto del sistema. Pero la app del conductor tiene necesidades que la web cubre mal:

- Enviar la ubicación de forma **continua**, también cuando el conductor usa Waze o Google Maps o apaga la pantalla.
  Los navegadores **suspenden la geolocalización** cuando la página no está visible.
- Avisar con **sonido** de una oferta aunque la app no esté al frente.
- En iOS, las notificaciones push solo funcionan con la PWA instalada.

## Decisión

1. Construir la App Conductor como **PWA** (React + Vite + `vite-plugin-pwa`), con Android como plataforma prioritaria.
2. Mientras el conductor está en línea:
   - mantener la pantalla encendida con la **Screen Wake Lock API**;
   - recomendar uso con soporte y cargador, y la app al frente;
   - si el conductor abre Waze o Google Maps, la app lo detecta (página oculta), avisa a la operación si hay un
     viaje en curso y le pide volver; en Android se evalúa el modo de pantalla dividida.
3. Si el servidor no recibe ubicación en `[60 s]`, el conductor pasa a `sin_senal`: deja de recibir ofertas y,
   si está en un viaje, se genera una alerta en la torre de control.
4. Diseñar la app de modo que pueda **empaquetarse con Capacitor** sin reescribir la interfaz: el acceso a
   ubicación, notificaciones y sonido pasa por una capa propia (`servicios/dispositivo`) con una implementación
   web y, si hace falta, una nativa.
5. **Prueba técnica en la Fase 0** en teléfonos Android de gama baja y media, midiendo: porcentaje de
   ubicaciones recibidas, ofertas que sonaron a tiempo, consumo de batería y de datos por hora.

## Criterio para activar el plan B

Si en la prueba técnica o en el piloto se pierde más del `[5 %]` de las ubicaciones esperadas durante viajes,
o más del `[2 %]` de las ofertas no llega al conductor a tiempo, se empaqueta la app con **Capacitor** para Android
(ubicación en segundo plano con servicio en primer plano y notificación persistente) y se distribuye por Play Store
o como APK.

## Alternativas consideradas

- **App nativa desde el inicio (Kotlin/Swift):** mejor acceso al dispositivo, pero dos bases de código nuevas y
  publicación en tiendas. Contradice la preferencia de negocio.
- **React Native:** buena opción para una app nativa, pero no reutiliza directamente los componentes web ni encaja
  con la decisión de PWA.

## Consecuencias

- Lanzamiento más rápido y actualizaciones sin pasar por tiendas.
- Riesgo real de pérdida de ubicación (R-03); se mide desde la Fase 0 y existe un camino de salida sin reescribir.
- La pantalla siempre encendida aumenta el consumo de batería; hay que comunicarlo a los conductores.
