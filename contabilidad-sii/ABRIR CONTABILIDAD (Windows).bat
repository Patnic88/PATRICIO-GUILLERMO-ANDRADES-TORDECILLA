@echo off
chcp 65001 >nul
title Mi Contabilidad
cd /d "%~dp0"

set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY goto sinpython

%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
if errorlevel 1 goto sinpython

%PY% -c "import openpyxl, cryptography" >nul 2>nul
if errorlevel 1 (
  echo Instalando complementos para Excel y certificados. Solo ocurre la primera vez...
  %PY% -m pip install --user --quiet openpyxl cryptography
)

echo Abriendo la contabilidad en su navegador...
%PY% -m contasii.web
if errorlevel 1 pause
exit /b

:sinpython
echo.
echo  Para usar el programa falta instalar Python, version 3.10 o superior.
echo.
echo  1. Se abrira la pagina de descarga de Python.
echo  2. Descargue e instale. IMPORTANTE: marque la casilla "Add Python to PATH".
echo  3. Vuelva a hacer doble clic en "ABRIR CONTABILIDAD".
echo.
start "" https://www.python.org/downloads/
pause
