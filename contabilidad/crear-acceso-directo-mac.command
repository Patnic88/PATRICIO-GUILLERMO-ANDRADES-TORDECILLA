#!/bin/bash
# ============================================================
#  Crea un acceso directo a la app de Contabilidad
#  en el Escritorio de macOS.
#  USO: doble clic. Si no abre, dale permisos con:
#       chmod +x crear-acceso-directo-mac.command
# ============================================================

APPDIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$APPDIR/index.html"
SHORTCUT="$HOME/Desktop/Contabilidad.webloc"

if [ ! -f "$TARGET" ]; then
  echo "No se encontró index.html junto a este script."
  read -n 1 -s -r -p "Pulsa una tecla para salir..."
  exit 1
fi

cat > "$SHORTCUT" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>URL</key>
  <string>file://$TARGET</string>
</dict>
</plist>
EOF

echo ""
echo "  Listo: se creó \"Contabilidad\" en tu Escritorio."
echo "  Haz doble clic en ese ícono para abrir la app."
echo ""
read -n 1 -s -r -p "Pulsa una tecla para cerrar..."
