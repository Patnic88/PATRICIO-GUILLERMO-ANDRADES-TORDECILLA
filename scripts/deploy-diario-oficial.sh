#!/usr/bin/env bash
# Subida automatizada del agente "Diario Oficial" a Google Apps Script.
#
# REQUISITOS (una sola vez):
#   1. Activa la Apps Script API en https://script.google.com/home/usersettings
#      (interruptor "Apps Script API: ON").
#   2. Haz `npx -y @google/clasp@2.4.2 login` (abre el navegador y pide
#      permiso a tu cuenta de Google).
#
# USO:
#   bash scripts/deploy-diario-oficial.sh
#
# Qué hace este script:
#   • Crea el proyecto Apps Script "Diario Oficial - Patricio Andrades"
#     si todavía no existe (es un proyecto aparte del Estado Diario).
#   • Sube el código de diario-oficial.gs + appsscript.json.
#
# No despliega Web App: este agente sólo necesita su activador horario.
# Después de la primera subida, abre el editor y ejecuta una vez
# `instalarAgente` (Google pide autorizar los permisos en ese momento).

set -euo pipefail

CLASP="npx -y @google/clasp@2.4.2"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS_DIR="$REPO_ROOT/apps-script-diario-oficial"
SRC_GS="$REPO_ROOT/diario-oficial.gs"

cd "$REPO_ROOT"

# 1. Verificar clasp login
if ! $CLASP login --status >/dev/null 2>&1; then
  cat <<'EOF' >&2
❌ No estás logueado en clasp. Ejecuta primero:

   npx -y @google/clasp@2.4.2 login

(se abrirá el navegador para que autorices con tu cuenta de Google)
EOF
  exit 1
fi
echo "✅ clasp login OK"

# 2. Copiar el código al directorio del proyecto
mkdir -p "$APPS_DIR"
cp "$SRC_GS" "$APPS_DIR/diario-oficial.js"   # clasp espera extensión .js
echo "✅ Código copiado a apps-script-diario-oficial/diario-oficial.js"

cd "$APPS_DIR"

# 3. Crear proyecto si no existe
if [ ! -f .clasp.json ]; then
  echo "📝 Creando proyecto Apps Script..."
  $CLASP create --title "Diario Oficial - Patricio Andrades" --type standalone --rootDir . >/dev/null
  echo "✅ Proyecto creado"
fi
SCRIPT_ID=$(node -e "console.log(require('./.clasp.json').scriptId)")
echo "✅ Proyecto (scriptId=${SCRIPT_ID:0:12}...)"

# 4. Push del código
echo "⬆️  Subiendo código..."
$CLASP push --force >/dev/null
echo "✅ Push completo"

echo ""
echo "🎉 Código subido. Falta un paso manual (sólo la primera vez):"
echo "   1. Abre el editor: https://script.google.com/d/${SCRIPT_ID}/edit"
echo "   2. Ejecuta diagnosticarDiarioOficial y autoriza los permisos."
echo "      En el registro, cada sección debería decir 'estado: ok'."
echo "   3. Ejecuta instalarAgente (deja el activador horario programado)."
echo "   4. (Opcional) Ejecuta enviarReporteAhora para recibir el reporte de hoy."
