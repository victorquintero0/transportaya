# 16 · Pruebas de las apps en un teléfono real

> **Implementado.** Cómo probar la App Pasajero y la App Conductor, instaladas como PWA, en un teléfono Android y en un iPhone usando el mismo Wi-Fi que el computador de desarrollo.

## Por qué hace falta HTTPS

Una dirección como `http://192.168.1.20:5171` **no es un contexto seguro**. Sin HTTPS, Chrome y Safari bloquean justo lo que se quiere probar:

| Función | Con `http://` por Wi-Fi | Con HTTPS de confianza |
|---|---|---|
| Ubicación (GPS) | Bloqueada | Funciona |
| Service worker (modo sin conexión) | No se registra | Funciona |
| Instalar la app en la pantalla de inicio | No se ofrece | Funciona |
| Mantener la pantalla encendida (conductor) | Bloqueado | Funciona |

Un certificado «autofirmado» tampoco sirve: el navegador deja ver la página, pero **no registra el service worker** si no confía en el certificado. Por eso se usa [mkcert](https://github.com/FiloSottile/mkcert): crea una autoridad propia y un certificado para la IP del computador, y esa autoridad se instala **una vez** en cada teléfono.

El comando `pnpm movil` hace el resto: compila las dos apps, las sirve con HTTPS en toda la red y publica una página para instalar el certificado desde el teléfono. **La API sigue corriendo solo en el computador**: las apps llegan a ella a través de su propio servidor (`/v1` y `/socket.io`), así que no se expone nada más y no hay que cambiar CORS.

## Paso 1 · Preparar el computador (una sola vez)

En PowerShell, en la carpeta del proyecto, una línea a la vez:

1. Instalar mkcert y su autoridad local:

   ```
   winget install FiloSottile.mkcert
   ```
   ```
   mkcert -install
   ```

   Cierra y abre PowerShell si `mkcert` no se reconoce.

2. Averiguar la IP del computador en el Wi-Fi (la dirección IPv4 del adaptador «Wi-Fi»):

   ```
   ipconfig
   ```

3. Crear el certificado con esa IP (cambia `192.168.1.20` por la tuya):

   ```
   mkdir .certs
   ```
   ```
   mkcert -cert-file .certs/movil.pem -key-file .certs/movil-key.pem 192.168.1.20 localhost 127.0.0.1
   ```

   La carpeta `.certs/` no se sube al repositorio. Si el router le cambia la IP al computador, hay que repetir este paso (`pnpm movil` lo avisa).

4. Permitir los puertos en el firewall de Windows (PowerShell **como administrador**, una vez):

   ```
   New-NetFirewallRule -DisplayName "TransporteYa movil" -Direction Inbound -Protocol TCP -LocalPort 4171,4172,8099 -Action Allow -Profile Private
   ```

   La red Wi-Fi debe estar marcada como **Privada** (Configuración → Red e Internet → Wi-Fi → tu red → Tipo de perfil de red).

## Paso 2 · Cada sesión de pruebas

Tres terminales, en este orden:

1. **Base de datos:**

   ```
   docker start transportaya-db
   ```

2. **API** (la variable hay que ponerla en cada terminal):

   ```
   $env:DATABASE_URL = "postgres://transportaya:transportaya@localhost:5433/transportaya"
   ```
   ```
   pnpm --filter @transportaya/api dev
   ```

3. **Apps para el teléfono:**

   ```
   pnpm movil
   ```

   La primera vez compila (un minuto). Después, `pnpm movil --sin-build` arranca al instante. Al terminar muestra las direcciones y si la API responde.

> Estas apps son la **compilación** de producción (así es como existe el service worker), no el servidor de desarrollo: si cambias código hay que volver a correr `pnpm movil`.

## Paso 3 · Instalar el certificado en el teléfono (una vez por teléfono)

Con el teléfono en el **mismo Wi-Fi**, abre en su navegador `http://192.168.1.20:8099` (tu IP) y toca **Descargar el certificado**.

**Android (Chrome)**

1. Ajustes → Seguridad y privacidad → Más seguridad → Cifrado y credenciales → **Instalar un certificado → Certificado de CA**. (La ruta cambia un poco según la marca; también sirve buscar «certificado» en Ajustes.)
2. Acepta el aviso y elige el archivo `transporteya-ca.crt` descargado.

**iPhone (Safari)**

1. Toca **Permitir** cuando pregunte si descargas el perfil.
2. Ajustes → **Perfil descargado → Instalar**.
3. Ajustes → General → Información → **Ajustes de certificados de confianza** y activa el interruptor de «mkcert».

## Paso 4 · Probar la app

Abre en el teléfono `https://192.168.1.20:4171` (App Pasajero) o `:4172` (App Conductor).

1. Entra a **Cuenta → Diagnóstico del teléfono** (en el conductor, **Perfil**). Debe salir en verde: *Conexión segura*, *Funciona sin conexión* y *Mantener la pantalla encendida*. Toca **Probar ubicación** y acepta el permiso.
2. Instala la app:
   - **Android:** en **Cuenta** (o **Perfil**) toca **Instalar**, o menú ⋮ → *Instalar app*.
   - **iPhone:** en Safari, Compartir → *Añadir a pantalla de inicio* (la tarjeta **Cómo instalar en iPhone** lo explica).
3. Abre la app desde el **ícono nuevo**: debe verse a pantalla completa, sin la barra del navegador, y arrancar con la animación del logo.
4. Activa el **modo avión**: aparece la franja «Sin conexión: reintentando…» y la app no se cierra; al volver el internet dice «Conexión recuperada».

### Lista de pruebas con el teléfono

**App Pasajero**

- [ ] Se instala y se abre desde el ícono (pantalla completa, barra de estado oscura).
- [ ] El código de entrada simulado funciona y la sesión sigue al cerrar y abrir la app.
- [ ] «Usar mi ubicación» pone el origen en donde estás (con el GPS real).
- [ ] El mapa de calles se ve y se mueve con fluidez; la animación de búsqueda no se traba.
- [ ] Pedir un viaje con un conductor de prueba (la demo del simulador) y verlo en vivo.
- [ ] Teclado: el campo no queda tapado y la hoja inferior se acomoda.
- [ ] Modo sin conexión: avión durante un viaje y volver.
- [ ] iPhone: los botones respetan la zona segura inferior (la barra de gestos).

**App Conductor**

- [ ] Se instala; en **Perfil** apaga **GPS simulado** para usar el GPS real.
- [ ] Al conectarse, la pantalla **no se apaga** (Wake Lock).
- [ ] La oferta suena y vibra (Android) con el volumen del teléfono.
- [ ] Abrir Waze o Google Maps y volver: la ubicación se recupera.
- [ ] **Prueba de GPS continuo (ADR-0003):** en el diagnóstico, **Iniciar**; 10 minutos con la pantalla encendida y 10 con la pantalla apagada o en otra app; **Terminar**. Si la pérdida supera el 5 %, se activa el plan B con Capacitor.
- [ ] Batería: anotar el porcentaje al empezar y al terminar 1 hora conectado.

> **Dos teléfonos:** lo ideal es el conductor en uno y el pasajero en otro, o el pasajero en el computador. Con el simulador activo se puede hacer un viaje completo.

## Lo que más ayuda al reportar un problema

Desde **Diagnóstico del teléfono → Copiar informe** se copia un texto con todo lo que el teléfono permite (HTTPS, service worker, GPS, pantalla encendida, vibración, navegador). Pégalo en el mensaje junto con lo que viste.

## Si algo no funciona

| Síntoma | Causa y solución |
|---|---|
| El teléfono no abre ninguna página | Firewall o red: repite el paso 1.4, revisa que el perfil de red sea Privado y que ambos estén en el mismo Wi-Fi (no «invitados»). |
| Aviso de certificado no confiable | No se instaló la autoridad (paso 3) o, en iPhone, falta activar su confianza. |
| Diagnóstico: «Conexión segura: No» | Se abrió con `http://` o por una IP que no está en el certificado. Usa `https://` y la IP que muestra `pnpm movil`. |
| «Funciona sin conexión: Casi» | El service worker se registró pero aún no controla la página: recarga una vez. |
| `pnpm movil` dice que el certificado no incluye la IP | El router cambió la IP del computador: repite el paso 1.3. |
| «La API NO responde» | Falta el paso 2.2, o la variable `DATABASE_URL` no está puesta en esa terminal. |
| No aparece «Instalar» en Android | Chrome ofrece instalar solo con HTTPS de confianza y cuando ya pasó un momento desde la primera visita; usa el menú ⋮ → *Instalar app*. |
| iPhone sin vibración ni notificaciones | Safari no permite vibrar desde la web; las notificaciones solo funcionan con la app instalada (iOS 16.4 o superior). |

## Cómo está hecho

- `scripts/movil.mjs` (`pnpm movil`): compila Pasajero y Conductor, sirve ambas con `vite preview` por HTTPS (`EXPONER_RED=1`, `HTTPS_CERT`, `HTTPS_KEY` en cada `vite.config.ts`) y publica en el puerto 8099 una página, solo por HTTP y solo en la red local, para bajar el certificado raíz.
- `PantallaDiagnostico`, `InstalarApp` y `AvisoSinConexion` viven en `packages/ui` y son comunes a las dos apps.
- Las pruebas automáticas (`apps/e2e/tests/pwa.spec.ts`, con `E2E_PWA=1`) verifican el manifest, el service worker y que la app abra sin internet sobre la compilación.
