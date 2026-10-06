@echo off
REM Inicia el Facturador A&A desde el codigo fuente (requiere Python 3.9+ instalado).
cd /d "%~dp0"
python facturacion.py %*
pause
