# 0008 · App Operación: aplicación web de escritorio con ingreso de doble factor y permisos por rol

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

La App Operación mueve dinero, habilita conductores, cambia tarifas y puede cancelar viajes en curso. Sus usuarios son personal interno con
roles muy distintos (monitor, soporte, cumplimiento, financiero, supervisor, administrador) y la matriz de permisos de [docs/02](../02-actores-roles-y-glosario.md)
exige doble factor, auditoría de toda acción sensible y doble aprobación de los ajustes de saldo. No hay todavía un proveedor de identidad.

## Decisión

- **Ingreso propio con doble factor.** Correo y contraseña (scrypt con sal propia) más un código **TOTP** (RFC 6238) de una app de autenticación.
  El secreto se guarda cifrado con la misma clave de columnas de los datos sensibles; un código no sirve dos veces; 5 intentos fallidos bloquean el
  correo 15 minutos; los errores no dicen qué falló. El primer ingreso entrega el secreto para configurar el dispositivo. Las sesiones internas
  duran 12 horas y reutilizan la rotación de *refresh token* de las demás apps.
- **Permisos en un solo lugar.** `@transportaya/dominio` define la matriz de permisos por rol. La API los exige con `@RequierePermiso(...)`; el guard lee
  los roles de la base **en cada petición**, así que un cambio de rol o una desactivación rige de inmediato. La app oculta lo que la persona no puede hacer,
  pero la seguridad está en la API.
- **Auditoría en la misma transacción** que el cambio: quién, qué, valores antes y después, motivo e IP. Ver un documento personal también queda registrado.
- **Dinero con doble control.** El libro del conductor es inmutable; las correcciones son *ajustes de saldo* que propone una persona y aprueba otra.
- **Tiempo real por una sala.** Quien puede ver la torre entra a la sala `operacion` del mismo servidor Socket.IO; el servidor avisa `torre:cambio` (agrupado)
  y la pantalla vuelve a pedir la foto, que es la única fuente de verdad.
- **Aplicación web de escritorio**, sin PWA instalable ni uso sin conexión: es una herramienta de oficina que depende de datos en vivo.
- **Cuentas de demostración** solo con `SIMULADOR=true`, que la configuración ya prohíbe en producción.

## Alternativas consideradas

- **Un proveedor de identidad (Auth0, Keycloak, Cognito):** mejor a largo plazo (SSO, llaves de seguridad), pero es un tercero más antes de tener usuarios; el contrato
  de la API no cambia si se reemplaza.
- **Roles dentro del token:** más rápido, pero un rol quitado seguiría valiendo hasta que venza el token.
- **OTP por SMS o WhatsApp para el personal:** es el factor más débil (cambio de SIM) y depende del proveedor que aún no existe.

## Consecuencias

- Una consulta adicional por petición interna (roles y estado de la cuenta); es despreciable frente a la ventaja de revocar al instante.
- La contraseña temporal se entrega por fuera del sistema; falta el flujo de correo para restablecerla. Las llaves de seguridad (WebAuthn) quedan como mejora.
- El mapa de la torre es esquemático como el de las apps (ADR-0007) hasta tener el mapa propio.
