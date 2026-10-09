# 0009 · Mapa de calles con MapLibre y proveedor configurable desde la App Operación

- **Estado:** Aceptada (complementa el ADR-0002; el mapa esquemático del ADR-0007 queda como respaldo)
- **Fecha:** 2026-10-08

## Contexto

Las tres apps mostraban un mapa esquemático (una cuadrícula con la inclinación de las calles de Manizales). Sirve para demostrar el flujo, pero no para
salir al público: hay que ver las calles. Tampoco queremos que cambiar de proveedor de mapas (por precio, cupo o calidad) exija tocar código y publicar
versiones nuevas de tres apps.

## Decisión

- **MapLibre GL** dibuja el mapa en las tres apps (pasajero, conductor y operación). Es de código abierto y funciona con cualquier proveedor que entregue
  un «estilo» (`style.json`).
- **OpenFreeMap por defecto** (`https://tiles.openfreemap.org/styles/positron`): gratis, sin clave ni tarjeta, datos de OpenStreetMap. Sirve para arrancar y
  para volumen bajo; si el servicio no alcanza se cambia de proveedor o se aloja uno propio (ADR-0002).
- **El proveedor se elige en la App Operación** (Configuración → Mapa de las apps; permiso `config.editar`, con motivo y auditoría). Opciones:
  OpenFreeMap (con tres estilos), MapTiler (con clave), «otro proveedor» (cualquier `style.json`, con `{clave}` si pide clave) y el mapa esquemático.
  Se guarda en el parámetro `mapa.config`; la clave se cifra (AES-256-GCM) y nunca aparece en la auditoría.
- **Las apps leen la configuración al abrir** (`GET /v1/mapa/config`, público, con caché de un minuto), así que el cambio rige sin publicar nada.
  La dirección que reciben ya lleva la clave puesta: una clave de mapa en el navegador es pública por naturaleza y se protege **restringiéndola por dominio
  en el panel del proveedor**.
- **El mapa esquemático nunca se quita.** Se dibuja de inmediato y mientras carga; si no hay internet, el estilo no responde, no hay WebGL o el proveedor
  se configuró como «esquemático», las apps se quedan con él. La librería (~1 MB) se descarga bajo demanda, solo si hay un proveedor configurado.
- **Los marcadores siguen siendo propios** (HTML sobre el mapa, proyectados con `map.project`): el carro, el origen, el destino y las líneas se ven y se
  animan igual con el mapa real o con el esquemático.
- **Tema oscuro:** si el proveedor da un estilo oscuro se usa; si no, el claro se oscurece con un filtro.
- **Solo URL seguras:** `https://` (o `http://localhost` en desarrollo); se rechazan otros esquemas y espacios.

## Consecuencias

- Ver las calles no cuesta ni exige cuentas con OpenFreeMap; cambiar a otro proveedor es un formulario, no una versión nueva.
- OpenFreeMap no tiene garantía de servicio ni cupo contractual: antes de operar a escala hay que decidir entre un plan de pago o el mapa autoalojado (D-27).
- La atribución del proveedor (por ejemplo «OpenFreeMap © OpenMapTiles, datos de OpenStreetMap») la dibuja MapLibre en la esquina del mapa y no debe ocultarse.
- Las rutas por calles, el buscador de direcciones real y el cálculo de recorridos siguen pendientes: el mapa solo pone las calles de fondo.
- Los mosaicos y estilos no se pueden verificar desde el entorno de desarrollo sin salida a internet; las pruebas usan un estilo falso mínimo.
