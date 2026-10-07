# 0006 · App del conductor con React y modo demostración

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

La app del conductor debe ser atractiva y fácil de usar con una mano, funcionar con redes intermitentes y poder probarse completa
antes de tener proveedor de OTP, mapas propios, pasarela de pagos o un pasajero real. El taxímetro (D-24) mide con el GPS del
teléfono y el servidor debe poder repetir el cálculo.

## Decisión

- **Pila:** React 19, Vite, Tailwind v4 con los *tokens* de marca de `packages/ui`, zustand para el estado local, TanStack Query para
  los datos del servidor, `motion` para animaciones y `canvas-confetti`. Socket.IO para los avisos en tiempo real.
- **Una sola lógica de tarifa y taxímetro:** la app importa `Taximetro` y `calcularTarifaUrbana` de `packages/dominio`, los mismos que usa el
  servidor para verificar el viaje. No hay una segunda implementación que pueda divergir.
- **Estado del viaje en el servidor:** la app guarda solo lo que se perdería sin conexión (lecturas del taxímetro y posiciones por enviar).
  Al abrirla o reconectar, recupera oferta y viaje por REST; los eventos del WebSocket son avisos.
- **Sonidos sintetizados** con WebAudio: sin archivos que descargar y funcionan sin conexión.
- **Modo demostración:** la API, con `SIMULADOR=true`, expone `/v1/dev/*` (pasajero de mentira, cierre a demanda, banco, pago por Bre-B) y
  la app puede usar un GPS simulado que se mueve hacia la recogida y el destino con paradas de semáforo. El OTP simulado va detrás de la misma
  interfaz que tendrá el proveedor real. La configuración **impide arrancar en producción** con el simulador activo.
- **Pruebas de punta a punta** con Playwright en `apps/e2e`, contra una base PostgreSQL/PostGIS nueva, la API real y la app; se ejecutan en CI.

## Alternativas consideradas

- **Capacitor desde el inicio:** daría ubicación en segundo plano, pero se mantiene el plan B del ADR-0003 hasta medir en teléfonos reales.
- **Maquetas sin backend:** no probarían el taxímetro, el cierre ni el bloqueo por deuda, que son lo difícil.
- **Mapa propio ahora:** depende del ADR-0002; mientras tanto la app muestra un radar y abre Waze o Google Maps (D-27).

## Consecuencias

- Se puede demostrar y probar toda la jornada del conductor sin otros teléfonos ni terceros.
- Hay que **retirar los simuladores** de los entornos reales y conectar OTP, pagos y mapas cuando existan (D-25, D-26, D-27).
- El logo se usa como imagen PNG; falta el SVG original (D-28).
