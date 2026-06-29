@echo off
REM ============================================================
REM  Crea un acceso directo a la app de Contabilidad
REM  en el Escritorio de Windows.
REM  USO: haz doble clic en este archivo.
REM ============================================================
setlocal

REM Carpeta donde está este script (y el index.html)
set "APPDIR=%~dp0"
set "TARGET=%APPDIR%index.html"
set "SHORTCUT=%USERPROFILE%\Desktop\Contabilidad.url"

if not exist "%TARGET%" (
  echo No se encontro index.html junto a este script.
  pause
  exit /b 1
)

REM Un acceso directo .url abre el archivo en el navegador por defecto
(
  echo [InternetShortcut]
  echo URL=file:///%TARGET:\=/%
  echo IconFile=%SystemRoot%\System32\SHELL32.dll
  echo IconIndex=43
) > "%SHORTCUT%"

echo.
echo  Listo: se creo "Contabilidad" en tu Escritorio.
echo  Haz doble clic en ese icono para abrir la app.
echo.
pause
endlocal
