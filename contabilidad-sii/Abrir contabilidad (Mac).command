#!/bin/bash
# Doble clic en macOS para abrir la contabilidad en el navegador.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
  echo
  echo "Para usar el programa falta instalar Python 3.10 o superior."
  echo "Se abrirá la página de descarga. Instálelo y vuelva a hacer doble clic aquí."
  open "https://www.python.org/downloads/" 2>/dev/null || xdg-open "https://www.python.org/downloads/" 2>/dev/null
  read -r -p "Presione Enter para cerrar esta ventana."
  exit 1
fi
python3 -c "import openpyxl" 2>/dev/null || { echo "Instalando el complemento para Excel (solo la primera vez)..."; python3 -m pip install --user --quiet openpyxl; }
echo "Abriendo la contabilidad en su navegador..."
python3 -m contasii.web
