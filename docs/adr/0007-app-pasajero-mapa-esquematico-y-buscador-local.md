# 0007 · App del pasajero: mapa esquemático y buscador local mientras llega OpenStreetMap

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

La app del pasajero necesita mapa, búsqueda de destino y seguimiento del conductor. El servicio propio con OpenStreetMap (ADR-0002: PMTiles,
Photon, OSRM) no existe todavía, y depender de un proveedor externo de mapas para una prueba contradice esa decisión y cuesta por consulta.
Se quiere poder probar y mostrar el flujo completo ahora, sin cambiar los contratos cuando llegue el servicio real.

## Decisión

- **Mapa esquemático.** Un componente dibuja la cuadrícula de Manizales con su inclinación real, ubica los puntos con la proporción correcta
  (un grado de longitud mide menos que uno de latitud), traza una curva sugerida entre dos puntos y mueve el carro del conductor.
  No dibuja calles ni calcula rutas. Se reemplazará por MapLibre con las teselas propias sin tocar las pantallas, que solo entregan puntos.
- **Buscador y direcciones en el servidor.** `GET /v1/pasajero/lugares/buscar` y `/inversa` resuelven contra un listado de lugares conocidos y una
  cuadrícula aproximada para direcciones al estilo colombiano. Cada resultado dice si es **aproximado**. El contrato es el de Photon, así que el
  cambio será interno.
- **Distancia y tiempo estimados** con línea recta por un factor de rodeo (1,35) y velocidades medias, los mismos supuestos del despacho. El precio
  final siempre lo da el taxímetro (D-10).
- **Destino visible para el conductor:** el texto de dirección que se guarda en el viaje termina en el barrio. Es lo único del destino que el
  conductor ve antes de aceptar (D-11).
- **Ubicación del teléfono** solo cuando el pasajero va a fijar su recogida, y si ya había dado el permiso, sin volver a preguntar.

## Alternativas consideradas

- **Google Maps o Mapbox ahora:** resolvería calles y direcciones, pero añade un tercero, costo por consulta y una migración después.
- **Mapa de OpenStreetMap con teselas públicas:** su política de uso no permite el tráfico de una aplicación en producción.
- **Esperar a tener el mapa propio:** bloquearía la prueba del flujo, que es lo que más riesgo tiene.

## Consecuencias

- Se puede demostrar y probar todo el flujo del pasajero, pero **no se puede salir al público** sin el mapa de calles y las direcciones reales (D-27).
- Las direcciones se ubican con error de decenas a cientos de metros: la recogida debe afinarse con el pin del mapa cuando exista.
- Los destinos pequeños de las rutas con tarifa fija no se ofrecen hasta tener su ubicación (D-29).
