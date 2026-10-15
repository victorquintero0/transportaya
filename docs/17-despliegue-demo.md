# 17 · Despliegue de demostración en un servidor

Cómo publicar TransporteYa en un servidor propio (VPS) para mostrarlo desde cualquier lugar, por ejemplo en
`transportaya.vitasi.cloud`. Es una **demostración**: corre con el simulador activo (conductores, bancos y código de acceso
simulados) y **no es un despliegue de producción** (la API se niega a arrancar así con `NODE_ENV=production`, D-26).

## Cómo queda armado

```text
Internet ──443──▶ nginx del servidor (tu certificado wildcard) ──▶ 127.0.0.1:8085 ──▶ contenedor "web" (nginx)
                                                                                       ├─ transportaya.vitasi.cloud            → app Pasajero
                                                                                       ├─ transportaya-conductor.vitasi.cloud  → app Conductor
                                                                                       ├─ transportaya-operacion.vitasi.cloud  → App Operación
                                                                                       └─ /v1 y /socket.io → contenedor "api" ─▶ contenedor "db" (PostGIS)
```

- **Tres nombres, no uno.** Cada app es una PWA con su propio manifiesto y *service worker*; deben vivir en la raíz de su
  propio dominio. Un certificado `*.vitasi.cloud` cubre un solo nivel, por eso los nombres son
  `transportaya-conductor.vitasi.cloud` y no `conductor.transportaya.vitasi.cloud` (este último no lo cubre).
- **Sin CORS.** Cada nombre manda `/v1` y `/socket.io` a la API por el mismo dominio.
- **Solo escucha en `127.0.0.1:8085`.** El HTTPS lo entrega el nginx que ya tienes; no se abre ningún puerto nuevo al exterior.
- Los archivos están en `infra/demo/`.

## Requisitos del servidor

Docker con el plugin Compose (`docker compose version`), `git`, `openssl` y `curl`, y el nginx que ya sirve tus otras
páginas con el certificado wildcard. Unos 2 GB de memoria libres durante la construcción.

## Paso a paso

**1. DNS.** En el panel de `vitasi.cloud` crea tres registros **A** hacia la IP del servidor (si ya existe un `*` comodín
hacia esa IP, no hace falta):

| Nombre | Tipo | Valor |
|---|---|---|
| `transportaya` | A | IP del servidor |
| `transportaya-conductor` | A | IP del servidor |
| `transportaya-operacion` | A | IP del servidor |

**2. Baja el código** en el servidor:

```bash
sudo mkdir -p /opt/transportaya && sudo chown $USER /opt/transportaya
git clone https://github.com/victorquintero0/transportaya.git /opt/transportaya
cd /opt/transportaya/infra/demo
```

**3. Configura.**

```bash
cp .env.example .env
nano .env
```

Cambia `DB_CLAVE` (`openssl rand -hex 16`), `JWT_SECRET` (`openssl rand -hex 32`), y pon un `DEMO_USUARIO` y
`DEMO_CLAVE`. Si el puerto 8085 está ocupado, cambia `PUERTO_WEB`. Si usas otros nombres, cámbialos en `HOST_*`.

**4. Construye y levanta** (la primera vez tarda varios minutos):

```bash
./desplegar.sh
```

Al terminar dice «Listo». La API crea sola las tablas y carga los datos de Manizales.

**5. Conecta tu nginx.** Copia `nginx-servidor.conf.ejemplo` a la carpeta de configuración de tu nginx
(`/etc/nginx/conf.d/transportaya.conf`), pon la ruta de tu certificado wildcard y recarga:

```bash
sudo cp nginx-servidor.conf.ejemplo /etc/nginx/conf.d/transportaya.conf
sudo nano /etc/nginx/conf.d/transportaya.conf     # rutas de ssl_certificate y ssl_certificate_key
sudo nginx -t && sudo systemctl reload nginx
```

Si en lugar de nginx usas Caddy, Traefik o Nginx Proxy Manager, la idea es la misma: los tres nombres, con tu certificado,
hacia `http://127.0.0.1:8085` conservando el encabezado `Host` y permitiendo WebSocket.

**6. Prueba.**

```bash
curl -s https://transportaya.vitasi.cloud/v1/salud       # {"estado":"ok", ... "simulador":true}
```

Abre `https://transportaya.vitasi.cloud`; el navegador pide el usuario y la clave de `DEMO_USUARIO`/`DEMO_CLAVE`.
Operación está en `https://transportaya-operacion.vitasi.cloud` y entra con un clic por rol.

## Instalar las apps en el teléfono

Con el HTTPS del certificado wildcard las tres apps se pueden instalar como cualquier PWA:

- **Android (Chrome):** abre la dirección, entra con la clave de la demostración y toca **Instalar** (en Cuenta o Perfil, o en el
  menú ⋮ → «Instalar aplicación»). Queda como app en la pantalla de inicio.
- **iPhone (Safari):** abre la dirección, toca **Compartir** → **Añadir a pantalla de inicio**. Safari no permite instalar con un botón.
- Cada app se instala por separado desde su propio nombre (Pasajero, Conductor y, si quieres, Operación).
- El nginx de la demostración deja sin clave solo el manifiesto y los iconos (`/marca/`): el sistema los descarga sin
  credenciales para armar la app instalable.
- **Con la clave activa**, la app instalada puede volver a pedir usuario y clave al abrirse, sobre todo en iPhone. Si estorba
  durante una presentación, desactiva la protección un rato (deja `DEMO_USUARIO` y `DEMO_CLAVE` vacíos y vuelve a correr
  `./desplegar.sh`) y vuélvela a activar al terminar.

## Actualizar a una versión nueva

```bash
cd /opt/transportaya && git pull && cd infra/demo && ./desplegar.sh
```

Las migraciones se aplican solas. Los datos (base y archivos subidos) viven en volúmenes de Docker y se conservan.
Los teléfonos con la PWA instalada toman la versión nueva al abrirla.

## Comandos útiles

```bash
./desplegar.sh logs     # registros de la API
./desplegar.sh parar    # detiene todo (los datos se conservan)
docker compose ps       # estado de los tres contenedores
docker compose down -v  # borra TAMBIÉN la base y los archivos: vuelve a empezar de cero
```

## Seguridad: qué protege y qué no

La demostración trae cuentas de acceso con un clic y atajos de prueba pensados para un equipo cerrado. Por eso:

- **Usa siempre `DEMO_USUARIO` y `DEMO_CLAVE`.** Con ellos, el nginx de la demostración pide clave para ver las tres apps y
  para la lista de cuentas de Operación. Sin ellos cualquiera que conozca la dirección entra como administrador.
- **La API sigue abierta** (tiene su propio inicio de sesión): quien conozca la dirección puede crear cuentas de prueba de
  pasajero o conductor. No hay datos reales ni dinero real, pero no la dejes publicada más tiempo del necesario.
- `JWT_SECRET` debe ser aleatorio: de él sale el segundo factor de las cuentas de Operación.
- **No cargues datos de personas reales.** Para eso hace falta un despliegue de producción (proveedor de OTP, pagos, política
  de datos aprobada por Legal), que no es esto.
- Al terminar la demostración, `./desplegar.sh parar`.

## Si algo falla

| Síntoma | Qué revisar |
|---|---|
| `Falta infra/demo/.env` | Copia `.env.example` como `.env` |
| 502 al abrir la página | La API sigue arrancando o falló: `./desplegar.sh logs` |
| El navegador avisa de certificado | El nginx del servidor no está usando el wildcard para esos nombres |
| La página carga pero no entra | Revisa que tu nginx deje pasar WebSocket (`Upgrade`) y `Host` |
| No pide ubicación o no deja instalar | Debe abrirse por `https://`; con `http://` el navegador lo bloquea |
| Puerto 8085 ocupado | Cambia `PUERTO_WEB` en `.env` y en tu nginx |
