<#
.SYNOPSIS
  Arranca TransporteYa en Windows: Docker (base de datos), la API y las tres apps.

.DESCRIPTION
  1. Abre Docker Desktop si no esta corriendo y levanta el contenedor de la base de datos (lo crea si no existe).
  2. Instala dependencias y reconstruye el paquete de dominio solo si hace falta, y aplica las migraciones.
  3. Abre una ventana por cada proceso: API (3000), Pasajero (5171), Conductor (5172) y Operacion (5173).
  4. Cuando todo responde, abre las apps en el navegador.

  Para cerrar todo: .\scripts\iniciar.ps1 -Detener

.EXAMPLE
  .\scripts\iniciar.ps1
  .\scripts\iniciar.ps1 -SinNavegador
  .\scripts\iniciar.ps1 -Reconstruir
  .\scripts\iniciar.ps1 -Detener
  .\scripts\iniciar.ps1 -Detener -DejarDocker
#>
[CmdletBinding()]
param(
  # No abre el navegador al terminar.
  [switch]$SinNavegador,
  # Fuerza instalar dependencias y reconstruir el paquete de dominio.
  [switch]$Reconstruir,
  # No aplica las migraciones de la base de datos.
  [switch]$SinMigrar,
  # Cierra las ventanas que abrio este script y detiene el contenedor.
  [switch]$Detener,
  # Con -Detener: deja el contenedor de la base de datos corriendo.
  [switch]$DejarDocker,
  # Puerto del equipo donde escucha la base de datos (el 5432 suele estar ocupado, por ejemplo por Laragon).
  [int]$PuertoBd = 5433,
  [string]$Contenedor = 'transportaya-db'
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$urlBd = "postgres://transportaya:transportaya@localhost:$PuertoBd/transportaya"
$archivoPids = Join-Path $env:TEMP 'transportaya-iniciar.json'

$servicios = @(
  @{ Nombre = 'API';       Puerto = 3000; Filtro = 'api';       Url = 'http://localhost:3000/v1/salud' },
  @{ Nombre = 'Pasajero';  Puerto = 5171; Filtro = 'pasajero';  Url = 'http://localhost:5171' },
  @{ Nombre = 'Conductor'; Puerto = 5172; Filtro = 'conductor'; Url = 'http://localhost:5172' },
  @{ Nombre = 'Operacion'; Puerto = 5173; Filtro = 'operacion'; Url = 'http://localhost:5173' }
)

# ------------------------------------------------------------------ ayudas

function Paso([string]$texto) { Write-Host ''; Write-Host "==> $texto" -ForegroundColor Cyan }
function Bien([string]$texto) { Write-Host "    [OK] $texto" -ForegroundColor Green }
function Aviso([string]$texto) { Write-Host "    [!]  $texto" -ForegroundColor Yellow }
function Fallo([string]$texto) { Write-Host "    [X]  $texto" -ForegroundColor Red }

function Salir-Con-Error([string]$texto) {
  Fallo $texto
  exit 1
}

# Ejecuta un programa nativo sin que el texto que escribe por stderr se vuelva una excepcion de PowerShell.
function Ejecutar-Nativo([scriptblock]$bloque) {
  $anterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $bloque } finally { $ErrorActionPreference = $anterior }
}

function Puerto-Abierto([int]$puerto) {
  $cliente = New-Object System.Net.Sockets.TcpClient
  try {
    $tarea = $cliente.ConnectAsync('127.0.0.1', $puerto)
    return ($tarea.Wait(600) -and $cliente.Connected)
  } catch {
    return $false
  } finally {
    $cliente.Close()
  }
}

function Responde-Url([string]$url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Esperar-Url([string]$url, [int]$segundos) {
  $limite = (Get-Date).AddSeconds($segundos)
  while ((Get-Date) -lt $limite) {
    if (Responde-Url $url) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Docker-Listo {
  Ejecutar-Nativo { docker info *> $null }
  return ($LASTEXITCODE -eq 0)
}

# ------------------------------------------------------------------ detener

if ($Detener) {
  Paso 'Cerrando TransporteYa'
  if (Test-Path $archivoPids) {
    $guardados = Get-Content $archivoPids -Raw | ConvertFrom-Json
    foreach ($g in @($guardados)) {
      Ejecutar-Nativo { taskkill /PID $g.Pid /T /F *> $null }
      Bien "Cerrado: $($g.Nombre)"
    }
    Remove-Item $archivoPids -Force
  } else {
    Aviso 'No hay ventanas registradas por este script (quiza las abriste a mano).'
  }
  if (-not $DejarDocker) {
    if (Get-Command docker -ErrorAction SilentlyContinue) {
      if (Docker-Listo) {
        Ejecutar-Nativo { docker stop $Contenedor *> $null }
        Bien "Base de datos detenida ($Contenedor)"
      }
    }
  }
  Write-Host ''
  exit 0
}

# ------------------------------------------------------------------ requisitos

Paso 'Revisando requisitos'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Salir-Con-Error 'No encuentro Node.js. Instalalo desde https://nodejs.org y vuelve a abrir la terminal.' }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Salir-Con-Error 'No encuentro pnpm. Instalalo con: npm install -g pnpm' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Salir-Con-Error 'No encuentro Docker. Instala Docker Desktop desde https://www.docker.com/products/docker-desktop' }
Bien ("Node " + (node --version) + ", pnpm " + (pnpm --version))

# ------------------------------------------------------------------ Docker

Paso 'Docker y base de datos'
if (-not (Docker-Listo)) {
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $exe) {
    Aviso 'Docker Desktop no esta corriendo. Lo abro (puede tardar un minuto)...'
    Start-Process $exe
  } else {
    Salir-Con-Error 'Docker no esta corriendo y no encuentro Docker Desktop. Abrelo a mano y vuelve a ejecutar el script.'
  }
  $limite = (Get-Date).AddSeconds(180)
  while (-not (Docker-Listo)) {
    if ((Get-Date) -gt $limite) { Salir-Con-Error 'Docker no respondio en 3 minutos. Revisa Docker Desktop y vuelve a intentar.' }
    Start-Sleep -Seconds 3
  }
}
Bien 'Docker listo'

$estado = (Ejecutar-Nativo { docker ps -a --filter "name=^/$Contenedor$" --format "{{.Status}}" } | Out-String).Trim()
$contenedorNuevo = $false
if ([string]::IsNullOrWhiteSpace($estado)) {
  Aviso "El contenedor $Contenedor no existe: lo creo con PostGIS en el puerto $PuertoBd."
  Ejecutar-Nativo {
    docker run -d --name $Contenedor `
      -e POSTGRES_USER=transportaya -e POSTGRES_PASSWORD=transportaya -e POSTGRES_DB=transportaya `
      -p "${PuertoBd}:5432" -v transportaya-datos:/var/lib/postgresql/data `
      postgis/postgis:16-3.4 *> $null
  }
  if ($LASTEXITCODE -ne 0) { Salir-Con-Error 'No pude crear el contenedor de la base de datos.' }
  $contenedorNuevo = $true
  Bien 'Contenedor creado'
} elseif ($estado -like 'Up*') {
  Bien "$Contenedor ya estaba corriendo"
} else {
  Ejecutar-Nativo { docker start $Contenedor *> $null }
  if ($LASTEXITCODE -ne 0) { Salir-Con-Error "No pude iniciar $Contenedor." }
  Bien "$Contenedor iniciado"
}

$limite = (Get-Date).AddSeconds(90)
$listaBd = $false
while ((Get-Date) -lt $limite) {
  Ejecutar-Nativo { docker exec $Contenedor pg_isready -U transportaya -d transportaya *> $null }
  if ($LASTEXITCODE -eq 0) { $listaBd = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $listaBd) { Salir-Con-Error 'La base de datos no quedo lista en 90 segundos. Mira los registros con: docker logs transportaya-db' }
Bien "PostgreSQL acepta conexiones (puerto $PuertoBd)"

# ------------------------------------------------------------------ dependencias, dominio y migraciones

Paso 'Dependencias y paquete de dominio'
$env:DATABASE_URL = $urlBd

$marca = Join-Path $raiz 'node_modules\.modules.yaml'
$bloqueo = Join-Path $raiz 'pnpm-lock.yaml'
$instalar = $Reconstruir -or -not (Test-Path $marca)
if (-not $instalar) {
  if ((Get-Item $bloqueo).LastWriteTime -gt (Get-Item $marca).LastWriteTime) { $instalar = $true }
}
if ($instalar) {
  Aviso 'Instalando dependencias (pnpm install)...'
  Ejecutar-Nativo { pnpm install }
  if ($LASTEXITCODE -ne 0) { Salir-Con-Error 'pnpm install fallo.' }
} else {
  Bien 'Dependencias al dia'
}

$dist = Join-Path $raiz 'packages\dominio\dist\index.js'
$reconstruirDominio = $Reconstruir -or -not (Test-Path $dist)
if (-not $reconstruirDominio) {
  $masNuevo = Get-ChildItem (Join-Path $raiz 'packages\dominio\src') -Recurse -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($masNuevo -and $masNuevo.LastWriteTime -gt (Get-Item $dist).LastWriteTime) { $reconstruirDominio = $true }
}
if ($reconstruirDominio) {
  Aviso 'Reconstruyendo el paquete de dominio...'
  Ejecutar-Nativo { pnpm --filter '@transportaya/dominio' build }
  if ($LASTEXITCODE -ne 0) { Salir-Con-Error 'No pude reconstruir el paquete de dominio.' }
} else {
  Bien 'Paquete de dominio al dia'
}

if (-not $SinMigrar) {
  Paso 'Migraciones de la base de datos'
  Ejecutar-Nativo { pnpm --filter '@transportaya/db' migrar }
  if ($LASTEXITCODE -ne 0) { Salir-Con-Error 'Fallaron las migraciones. Revisa el mensaje de arriba.' }
  if ($contenedorNuevo) {
    Aviso 'Base nueva: cargo los datos de Manizales (tarifa, rutas y catalogo de vehiculos)...'
    Ejecutar-Nativo { pnpm --filter '@transportaya/db' semilla }
    if ($LASTEXITCODE -ne 0) { Salir-Con-Error 'Fallo la carga inicial de datos.' }
  }
  Bien 'Base de datos al dia'
}

# ------------------------------------------------------------------ API y apps

Paso 'API y apps'
$abiertos = @()
foreach ($s in $servicios) {
  if (Puerto-Abierto $s.Puerto) {
    Aviso "$($s.Nombre): el puerto $($s.Puerto) ya esta en uso, lo dejo como esta."
    continue
  }
  $titulo = "TransporteYa - $($s.Nombre) (:$($s.Puerto))"
  $comando = @"
`$Host.UI.RawUI.WindowTitle = '$titulo'
Set-Location '$raiz'
`$env:DATABASE_URL = '$urlBd'
pnpm --filter '@transportaya/$($s.Filtro)' dev
"@
  $codificado = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($comando))
  $p = Start-Process powershell -PassThru `
    -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $codificado)
  $abiertos += [pscustomobject]@{ Nombre = $s.Nombre; Pid = $p.Id }
  Bien "$($s.Nombre): ventana abierta"
}
if ($abiertos.Count -gt 0) {
  $abiertos | ConvertTo-Json | Set-Content -Path $archivoPids -Encoding UTF8
}

Paso 'Esperando que respondan'
$todoListo = $true
foreach ($s in $servicios) {
  $espera = 120
  if ($s.Nombre -ne 'API') { $espera = 90 }
  if (Esperar-Url $s.Url $espera) {
    Bien "$($s.Nombre) responde en $($s.Url)"
  } else {
    Fallo "$($s.Nombre) no respondio en $espera segundos. Mira su ventana para ver el error."
    $todoListo = $false
  }
}

# ------------------------------------------------------------------ resumen

Write-Host ''
if ($todoListo) {
  Write-Host 'TransporteYa esta corriendo:' -ForegroundColor Green
} else {
  Write-Host 'TransporteYa arranco con problemas (ver arriba):' -ForegroundColor Yellow
}
Write-Host '  Pasajero   http://localhost:5171'
Write-Host '  Conductor  http://localhost:5172'
Write-Host '  Operacion  http://localhost:5173   (en modo demostracion entra con un clic por rol)'
Write-Host '  API        http://localhost:3000/v1/salud'
Write-Host ''
Write-Host 'Para cerrar todo:  .\scripts\iniciar.ps1 -Detener'
Write-Host ''

if ($todoListo -and -not $SinNavegador) {
  Start-Process 'http://localhost:5171'
  Start-Process 'http://localhost:5172'
  Start-Process 'http://localhost:5173'
}
