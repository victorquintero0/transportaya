# Datos iniciales

Archivos de datos que alimentan la configuración de la plataforma. **Son borradores** que Negocio debe validar
antes de cargarlos en producción.

## `tarifas-rutas-manizales-2026.csv`

Tarifas fijas **desde Manizales** a cada destino (193 filas), tomadas de la imagen "Tarifas sugeridas 2026"
que entregó Negocio. Alimentan las **rutas con tarifa fija** de la [regla RN-090](../03-reglas-de-negocio.md).

| Columna | Descripción |
|---|---|
| `destino` | Nombre del destino tal como aparece en la tabla |
| `modalidad` | `solo_ida` o `ida_y_vuelta`. La tabla solo marca la modalidad en Nevado del Ruiz y Termales del Ruiz; **se asumió `solo_ida` para el resto** |
| `tarifa_cop` | Valor en pesos colombianos |

Ajuste aplicado por Negocio: **Pereira** pasó de $280.000 (en la imagen) a **$240.000**.

**Para validar** (valores que parecen atípicos o dudosos en la transcripción de la imagen):

- `Samaria` = $25.200 es muy bajo frente al resto de la tabla.
- `Santa Rosa Dde Cabal` = $252.000 y `Varsovia` = $252.000 son mayores que Pereira ($240.000), aunque Santa Rosa de Cabal queda más cerca de Manizales.
- `Miranda Valle` = $1.272.000 es mayor que Cali ($846.000), siendo Miranda un municipio cercano a Cali.
- Hay nombres con posibles errores de digitación en la fuente (`Salaento`, `Santa Rosa Dde Cabal`, `Villarca Tolima`, `Villa Vieja Touma`, `Alban`).
- La tabla es solo desde Manizales. Faltan las tarifas desde otras ciudades del Eje Cafetero, o si es el mismo valor en sentido contrario.
- No se sabe si el valor aplica a todas las categorías (Media, Media Alta, Alta) o a una sola (ver D-19).

## `catalogo-vehiculos.csv`

Catálogo inicial de vehículos que circulan en Colombia, con la categoría propuesta. Ver [14 · Catálogo de vehículos](../14-catalogo-de-vehiculos.md).
