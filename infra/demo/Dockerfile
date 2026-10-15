# Despliegue de demostracion de TransporteYa: API + base de datos + las tres apps compiladas detras de un nginx.
# Se construye desde la raiz del repositorio:  docker build -f infra/demo/Dockerfile --target api .

ARG NODE_IMAGE=node:22-slim
ARG NGINX_IMAGE=nginx:1.27-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV CI=true
RUN corepack enable
WORKDIR /app

# ---- Dependencias y compilacion de paquetes y apps
FROM base AS construir
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @transportaya/dominio build \
 && pnpm --filter @transportaya/db build \
 && pnpm --filter @transportaya/pasajero build \
 && pnpm --filter @transportaya/conductor build \
 && pnpm --filter @transportaya/operacion build

# ---- API (corre con tsx, igual que en desarrollo: es una demostracion con el simulador activo)
FROM construir AS api
COPY infra/demo/entrada-api.sh /usr/local/bin/entrada-api.sh
RUN chmod +x /usr/local/bin/entrada-api.sh
EXPOSE 3000
CMD ["/usr/local/bin/entrada-api.sh"]

# ---- Web: las tres apps como archivos estaticos y el proxy hacia la API
FROM ${NGINX_IMAGE} AS web
COPY --from=construir /app/apps/pasajero/dist /usr/share/nginx/pasajero
COPY --from=construir /app/apps/conductor/dist /usr/share/nginx/conductor
COPY --from=construir /app/apps/operacion/dist /usr/share/nginx/operacion
COPY infra/demo/nginx/app.conf /etc/nginx/snippets/app.conf
COPY infra/demo/nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=^HOST_
