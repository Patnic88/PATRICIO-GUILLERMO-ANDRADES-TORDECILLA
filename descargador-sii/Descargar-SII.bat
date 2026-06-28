@echo off
REM ============================================================
REM  Descargar SII (Windows) - doble clic para ejecutar.
REM  Si la carpeta trae "runtime\node.exe", NO necesitas instalar nada.
REM ============================================================
setlocal
cd /d "%~dp0"
chcp 65001 >nul

REM 1) Elegir Node: primero el incluido en la carpeta, si existe.
set "NODE=node"
if exist "runtime\node.exe" set "NODE=runtime\node.exe"

REM 2) Si no hay Node incluido, verificar que exista uno en el sistema.
if not exist "runtime\node.exe" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo.
    echo  [!] No se encontro Node.js. Usa el paquete portatil ^(que trae Node^)
    echo      o instala Node desde https://nodejs.org ^(version LTS^).
    echo.
    pause
    exit /b 1
  )
)

REM 3) Instalar dependencias solo si no vienen incluidas.
if not exist "node_modules" (
  echo  Instalando dependencias por primera vez ^(puede tardar unos minutos^)...
  call npm install
  if errorlevel 1 (
    echo  [!] Fallo la instalacion de dependencias.
    pause
    exit /b 1
  )
)

echo.
echo  Iniciando descarga del SII...
echo.
"%NODE%" src\index.js
echo.
echo  Proceso terminado. Revisa la carpeta "descargas".
pause
endlocal
