#!/bin/bash
# ============================================================
#  Descargar SII (macOS) - doble clic en Finder para ejecutar.
#  Si la carpeta trae "runtime/node", NO necesitas instalar nada.
#  La 1ª vez macOS puede bloquearlo: clic derecho > Abrir.
# ============================================================
cd "$(dirname "$0")" || exit 1

# 1) Elegir Node: primero el incluido en la carpeta, si existe.
if [ -x "runtime/node" ]; then
  NODE="runtime/node"
elif command -v node >/dev/null 2>&1; then
  NODE="node"
else
  echo
  echo "  [!] No se encontró Node.js. Usa el paquete portátil (que trae Node)"
  echo "      o instálalo desde https://nodejs.org (versión LTS)."
  echo
  read -r -p "Presiona Enter para cerrar..."
  exit 1
fi

# 2) Instalar dependencias solo si no vienen incluidas.
if [ ! -d "node_modules" ]; then
  echo "  Instalando dependencias por primera vez (puede tardar unos minutos)..."
  npm install || { echo "  [!] Falló la instalación."; read -r -p "Enter para cerrar..."; exit 1; }
fi

echo
echo "  Iniciando descarga del SII..."
echo
"$NODE" src/index.js
echo
echo "  Proceso terminado. Revisa la carpeta \"descargas\"."
read -r -p "Presiona Enter para cerrar..."
