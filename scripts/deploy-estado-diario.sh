#!/usr/bin/env bash
# Despliegue automatizado del agente "Estado Diario" en Google Apps Script.
#
# REQUISITOS (una sola vez):
#   1. Activa la Apps Script API en https://script.google.com/home/usersettings
#      (interruptor "Apps Script API: ON").
#   2. Haz `npx -y @google/clasp@2.4.2 login` (abre el navegador y pide
#      permiso a tu cuenta de Google).
#
# USO:
#   bash scripts/deploy-estado-diario.sh
#
# Qué hace este script (todo automatizado):
#   • Crea el proyecto Apps Script "Estado Diario - Patricio Andrades"
#     si todavía no existe.
#   • Sube el código de estado-diario.gs + appsscript.json.
#   • Despliega una versión nueva como Aplicación Web (ejecuta como TÚ,
#     accesible para cualquiera anónimo — sólo devuelve los hilos
#     que ya están en tu Gmail, no expone más).
#   • Escribe la URL /exec en config.js -> window.COURT_SYNC_URL.
#   • Hace `git add` + commit + push (en la rama actual) si hay cambios.
#
# El trigger diario de las 08:00 se crea solo la primera vez que se
# invoca el Web App (ver ensureDailyTrigger en estado-diario.gs).

set -euo pipefail

CLASP="npx -y @google/clasp@2.4.2"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS_DIR="$REPO_ROOT/apps-script"
CONFIG_FILE="$REPO_ROOT/config.js"
SRC_GS="$REPO_ROOT/estado-diario.gs"

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

# 2. Asegurar que apps-script/ está poblado
mkdir -p "$APPS_DIR"
cp "$SRC_GS" "$APPS_DIR/estado-diario.js"   # clasp espera extensión .js
echo "✅ Código copiado a apps-script/estado-diario.js"

cd "$APPS_DIR"

# 3. Crear proyecto si no existe
if [ ! -f .clasp.json ]; then
  echo "📝 Creando proyecto Apps Script..."
  $CLASP create --title "Estado Diario - Patricio Andrades" --type standalone --rootDir . >/dev/null
  echo "✅ Proyecto creado"
else
  SCRIPT_ID=$(node -e "console.log(require('./.clasp.json').scriptId)")
  echo "✅ Reusando proyecto existente (scriptId=${SCRIPT_ID:0:12}...)"
fi

# 4. Push del código
echo "⬆️  Subiendo código..."
$CLASP push --force >/dev/null
echo "✅ Push completo"

# 5. Deploy como Web App
echo "🚀 Desplegando como Aplicación Web..."
DEPLOY_DESC="auto-deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEPLOY_OUT=$($CLASP deploy --description "$DEPLOY_DESC" 2>&1)
echo "$DEPLOY_OUT"

# Extraer deployment ID (formato: AKfycb...)
DEPLOY_ID=$(echo "$DEPLOY_OUT" | grep -oE 'AKfycb[A-Za-z0-9_-]+' | head -1 || true)
if [ -z "$DEPLOY_ID" ]; then
  echo "❌ No se pudo extraer el deployment ID del output de clasp." >&2
  echo "   Salida cruda arriba. Despliega manualmente desde el editor si esto persiste." >&2
  exit 2
fi

WEB_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"
echo "🌐 URL del Web App: $WEB_URL"

# 6. Escribir la URL en config.js
cd "$REPO_ROOT"
node - <<NODE
const fs = require('fs');
const path = '${CONFIG_FILE}';
let cfg = fs.readFileSync(path, 'utf8');
const re = /window\.COURT_SYNC_URL\s*=\s*"[^"]*"/;
if (!re.test(cfg)) {
  console.error('❌ No encontré window.COURT_SYNC_URL en config.js');
  process.exit(3);
}
cfg = cfg.replace(re, 'window.COURT_SYNC_URL = "${WEB_URL}"');
fs.writeFileSync(path, cfg);
console.log('✅ config.js actualizado');
NODE

# 7. Calentar el Web App (primer GET dispara ensureDailyTrigger)
echo "🔥 Calentando el Web App para que instale el trigger diario..."
curl -fsSL "${WEB_URL}?dias=1" -o /dev/null && \
  echo "✅ Web App responde (trigger diario instalado)" || \
  echo "⚠️  El Web App respondió con error; revisa la autorización OAuth en el editor."

# 8. Commit + push (opcional)
if [ -n "$(git status --porcelain config.js)" ]; then
  echo "📦 Commit + push de la URL en config.js..."
  git add config.js
  git commit -m "Activar agente Estado Diario: COURT_SYNC_URL apunta al Web App desplegado"
  git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
fi

echo ""
echo "🎉 Listo. El agente queda corriendo en tu cuenta de Google."
echo "   - Web App:        $WEB_URL"
echo "   - Trigger diario: 08:00 (zona America/Santiago)"
echo "   - Para probar:    abre estado-diario.html y verás los movimientos reales."
