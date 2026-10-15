#!/bin/sh
# Prepara la base (migraciones y datos de Manizales, ambas seguras de repetir) y arranca la API.
set -e
cd /app/packages/db
node --import tsx src/cli-migrar.ts
node --import tsx src/cli-semilla.ts
cd /app/apps/api
exec node --import tsx src/main.ts
