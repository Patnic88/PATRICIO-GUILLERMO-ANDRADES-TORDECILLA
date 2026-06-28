#!/bin/bash
# ============================================================
#  Descargar SII (macOS) - doble clic en Finder para ejecutar.
#  Si macOS no lo deja abrir: clic derecho > Abrir la primera vez.
# ============================================================
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  [!] No se encontró Node.js. Instálalo desde https://nodejs.org (versión LTS)"
  echo "      y vuelve a abrir este archivo."
  echo
  read -r -p "Presiona Enter para cerrar..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "  Instalando dependencias por primera vez (puede tardar unos minutos)..."
  npm install || { echo "  [!] Falló la instalación."; read -r -p "Enter para cerrar..."; exit 1; }
fi

echo
echo "  Iniciando descarga del SII..."
echo
npm start
echo
echo "  Proceso terminado. Revisa la carpeta \"descargas\"."
read -r -p "Presiona Enter para cerrar..."
