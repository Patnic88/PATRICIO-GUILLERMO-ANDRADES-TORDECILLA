@echo off
REM ============================================================
REM  Descargar SII (Windows) - doble clic para ejecutar.
REM ============================================================
setlocal
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] No se encontro Node.js. Instalalo desde https://nodejs.org ^(version LTS^)
  echo      y vuelve a hacer doble clic en este archivo.
  echo.
  pause
  exit /b 1
)

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
call npm start
echo.
echo  Proceso terminado. Revisa la carpeta "descargas".
pause
endlocal
