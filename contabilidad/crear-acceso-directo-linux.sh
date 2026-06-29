#!/bin/bash
# ============================================================
#  Crea un acceso directo a la app de Contabilidad
#  en el Escritorio de Linux (estándar freedesktop).
#  USO: ./crear-acceso-directo-linux.sh
#       (o dale permisos con: chmod +x crear-acceso-directo-linux.sh)
# ============================================================

APPDIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$APPDIR/index.html"

# Ubicación del Escritorio (respeta xdg si está disponible)
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
[ -d "$DESKTOP_DIR" ] || DESKTOP_DIR="$HOME/Escritorio"
[ -d "$DESKTOP_DIR" ] || DESKTOP_DIR="$HOME"

SHORTCUT="$DESKTOP_DIR/Contabilidad.desktop"

if [ ! -f "$TARGET" ]; then
  echo "No se encontró index.html junto a este script."
  exit 1
fi

cat > "$SHORTCUT" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Contabilidad
Comment=Control de ingresos y gastos
Exec=xdg-open "$TARGET"
Icon=accessories-calculator
Terminal=false
Categories=Office;Finance;
EOF

chmod +x "$SHORTCUT"
# En GNOME hace falta marcarlo como confiable
gio set "$SHORTCUT" metadata::trusted true 2>/dev/null

echo ""
echo "  Listo: se creó \"Contabilidad\" en $DESKTOP_DIR"
echo "  Haz doble clic en ese ícono para abrir la app."
echo ""
