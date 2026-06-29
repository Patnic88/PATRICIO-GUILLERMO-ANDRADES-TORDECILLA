#!/usr/bin/env bash
# Runner único: unit tests + E2E.
#
# Uso:  bash tests/run.sh
#
# Levanta un servidor HTTP local en :8765 si no hay uno corriendo, corre los
# tests unitarios del extractor del agente y la prueba E2E con Playwright
# (Chromium pre-instalado en /opt/pw-browsers/), apaga el servidor y devuelve
# código 0 si todo pasó.

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-8765}"
NODE="${NODE:-node}"
export NODE_PATH="${NODE_PATH:-/opt/node22/lib/node_modules}"
export E2E_BASE="http://127.0.0.1:${PORT}"

# 1. Tests unitarios del .gs (cero dependencias, rapidísimos)
echo "→ Unit tests"
$NODE tests/extract.test.mjs

# 2. Servidor local
if ! curl -sf -o /dev/null "$E2E_BASE/index.html" 2>/dev/null; then
  echo "→ Levantando servidor HTTP en :$PORT"
  python3 -m http.server "$PORT" >/tmp/court-e2e-server.log 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
  # Esperar a que responda
  for i in 1 2 3 4 5; do
    sleep 0.4
    curl -sf -o /dev/null "$E2E_BASE/index.html" && break
  done
fi

# 3. E2E con Playwright
echo "→ E2E tests"
$NODE tests/e2e.test.mjs

echo "✅ Todo verde."
