#!/usr/bin/env bash
# Despliega (o actualiza) la demostracion de TransporteYa en este servidor.
#   ./desplegar.sh          construye y levanta todo
#   ./desplegar.sh parar    detiene los contenedores (los datos se conservan)
#   ./desplegar.sh logs     sigue los registros de la API
set -euo pipefail
cd "$(dirname "$0")"

accion="${1:-desplegar}"

if [ ! -f .env ]; then
  echo "Falta infra/demo/.env. Copia .env.example como .env y completalo." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

mkdir -p generado

case "$accion" in
  parar)
    docker compose down
    exit 0
    ;;
  logs)
    exec docker compose logs -f --tail=100 api
    ;;
  desplegar) ;;
  *)
    echo "Uso: $0 [desplegar|parar|logs]" >&2
    exit 1
    ;;
esac

# Usuario y clave del nginx de la demostracion (si no se definen, queda abierta).
if [ -n "${DEMO_USUARIO:-}" ] && [ -n "${DEMO_CLAVE:-}" ]; then
  printf '%s:%s\n' "$DEMO_USUARIO" "$(openssl passwd -apr1 "$DEMO_CLAVE")" > generado/htpasswd
  printf 'auth_basic "TransporteYa demo";\nauth_basic_user_file /etc/nginx/htpasswd;\n' > generado/auth.conf
  echo "Acceso protegido con usuario y clave (usuario: $DEMO_USUARIO)."
else
  : > generado/htpasswd
  printf 'auth_basic off;\n' > generado/auth.conf
  echo "AVISO: sin DEMO_USUARIO/DEMO_CLAVE la demostracion queda abierta a cualquiera." >&2
fi

docker compose up -d --build

echo "Esperando que la API responda..."
for _ in $(seq 1 60); do
  if curl -fsS -m 5 -H "Host: ${HOST_PASAJERO}" "http://127.0.0.1:${PUERTO_WEB:-8085}/v1/salud" > /dev/null 2>&1; then
    echo "Listo. TransporteYa responde en el puerto ${PUERTO_WEB:-8085} de este servidor."
    echo "  Pasajero   https://${HOST_PASAJERO}"
    echo "  Conductor  https://${HOST_CONDUCTOR}"
    echo "  Operacion  https://${HOST_OPERACION}"
    exit 0
  fi
  sleep 3
done
echo "La API no respondio a tiempo. Revisa:  ./desplegar.sh logs" >&2
exit 1
