#!/bin/bash
# ============================================================
#  Descargar SII (Linux) - ejecuta:  ./descargar-sii.sh
# ============================================================
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  [!] No se encontró Node.js. Instálalo (ej: sudo apt install nodejs npm)"
  echo "      o desde https://nodejs.org y vuelve a ejecutar."
  echo
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "  Instalando dependencias por primera vez (puede tardar unos minutos)..."
  npm install || { echo "  [!] Falló la instalación."; exit 1; }
fi

echo
echo "  Iniciando descarga del SII..."
echo
npm start
