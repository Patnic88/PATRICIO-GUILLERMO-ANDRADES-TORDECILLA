@echo off
REM Genera el ejecutable para Windows. Requiere Python 3.9+ (python.org, marcando "Add to PATH").
REM Resultado: facturacion\dist\FacturadorAA.exe
cd /d "%~dp0\.."
python -m pip install --upgrade pyinstaller
python -m PyInstaller --clean --noconfirm empaquetado\facturador.spec
echo.
echo Listo: %cd%\dist\FacturadorAA.exe
pause
