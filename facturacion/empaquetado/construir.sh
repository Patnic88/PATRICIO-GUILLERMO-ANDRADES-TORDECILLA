#!/usr/bin/env bash
# Genera el ejecutable para el sistema operativo actual (Linux o macOS).
# Requiere Python 3.9+ y pip. Resultado: facturacion/dist/FacturadorAA
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m pip install --upgrade pyinstaller
python3 -m PyInstaller --clean --noconfirm empaquetado/facturador.spec
echo
echo "Listo: $(pwd)/dist/FacturadorAA"
