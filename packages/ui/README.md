# @transportaya/ui

Marca y sistema de diseño compartidos por las tres apps.

- `src/tema.css`: tokens (Tailwind v4 `@theme`), tema oscuro/claro y animaciones.
- `src/marca/`: logos con fondo transparente (`logo-oscuro`, `logo-claro`, `marca-verde`, `marca-blanca`) e iconos de la PWA.

Los recursos se generaron a partir de los tres archivos del logo entregados por Negocio (PNG, sin vectorizar). **Conviene reemplazarlos
por el SVG original** cuando exista: los iconos pequeños y las pantallas de alta densidad se verán más nítidos.

| Color                                   | Valor                                             | Uso                               |
| --------------------------------------- | ------------------------------------------------- | --------------------------------- |
| Verde TransporteYa                      | `#07D507`                                         | Acciones principales, marca       |
| Fondo oscuro                            | `#101010`                                         | Tema oscuro (por defecto)         |
| Sol / Mandarina / Peligro / Cielo / Uva | `#FFD60A` `#FF8A00` `#FF3B30` `#3DA9FC` `#9B6BFF` | Apoyo: estrellas, alertas, logros |
