@echo off
rem Doble clic para arrancar TransporteYa (Docker, API y las tres apps). Argumentos: -SinNavegador, -Reconstruir, -Detener
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*
pause
