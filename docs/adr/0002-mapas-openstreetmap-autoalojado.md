# 0002 · Mapas, rutas y direcciones con OpenStreetMap autoalojado

- **Estado:** Aceptada
- **Fecha:** 2026-10-06

## Contexto

Las tres apps necesitan mapa base, cálculo de rutas y tiempos (cotización, ETA, despacho, distancia real) y
búsqueda de direcciones. Con proveedores comerciales el costo crece con cada viaje (varias llamadas de rutas,
matrices de ETA y autocompletado por solicitud). Negocio prefirió **OpenStreetMap autoalojado** para controlar
costos y no depender de un proveedor.

## Decisión

| Necesidad | Componente |
|---|---|
| Datos | Extracto de Colombia de OpenStreetMap (Geofabrik), actualizado mensualmente con un proceso automatizado |
| Mapa base | Teselas vectoriales en formato **PMTiles**, servidas desde almacenamiento de objetos + CDN |
| Visualización | **MapLibre GL JS** en las tres apps |
| Rutas, ETA, matrices, ajuste de trayectorias | **OSRM** con perfil de automóvil |
| Autocompletado de direcciones | **Photon** |
| Dirección a partir de coordenadas | **Nominatim** |
| Direcciones colombianas | **Intérprete propio** de nomenclatura + capa propia de lugares y direcciones confirmadas |

Todo el acceso se hace a través de las interfaces `ProveedorRutas` y `ProveedorGeocodificacion`.

### El problema de las direcciones

La debilidad conocida de OpenStreetMap en Colombia es la **búsqueda de direcciones**: muchas placas no están
cargadas y la nomenclatura (`Calle 45 # 12-30`, `Cra. 7 Bis # 32-16 Sur`, `Av. Calle 26`, `Diagonal`,
`Transversal`) no la entienden bien los geocodificadores genéricos. Mitigación:

1. **Intérprete de nomenclatura**: separa tipo de vía, número, letra/bis, cuadrante, vía generadora y placa;
   busca el cruce de la vía principal con la vía generadora y ubica la placa según la distancia en metros.
2. **Capa propia de lugares**: puntos de interés curados por la operación (aeropuertos, terminales, centros
   comerciales, clínicas, universidades, conjuntos residenciales).
3. **Aprendizaje de direcciones**: cuando un pasajero ajusta el pin y el viaje se completa, esa dirección y su
   coordenada se guardan para futuras búsquedas.
4. **Pin en el mapa** siempre disponible como respaldo.
5. **Prueba de calidad en la Fase 0**: medir aciertos con un set de `[300]` direcciones reales de la ciudad de
   lanzamiento. Si el acierto queda por debajo de `[85 %]`, evaluar un geocodificador comercial **solo para
   búsqueda de direcciones**, manteniendo mapa y rutas en OSM.

## Alternativas consideradas

- **Google Maps Platform:** mejor calidad de direcciones y tráfico, pero costo por uso alto a escala y
  dependencia del proveedor.
- **Mapbox:** buena calidad y personalización; costo intermedio, también por uso.
- **Híbrido** (OSM para mapa y rutas, comercial para direcciones): queda como salida si falla la prueba del punto 5.

## Consecuencias

- Costo variable de mapas casi nulo; a cambio, costo fijo de servidores y mantenimiento (OSRM necesita memoria
  suficiente para el grafo de Colombia).
- **OSRM no tiene tráfico en tiempo real**: los ETA serán menos precisos en horas pico. Se corrige con
  **factores de ajuste por franja horaria y zona**, calculados con los tiempos reales de los viajes propios (F3).
- Hay que construir y mantener el intérprete de direcciones y la capa de lugares.
- El equipo debe automatizar la regeneración de PMTiles, OSRM y Photon cuando se actualicen los datos.
- Se debe mostrar la atribución "© OpenStreetMap contributors" en los mapas, como exige la licencia ODbL.
