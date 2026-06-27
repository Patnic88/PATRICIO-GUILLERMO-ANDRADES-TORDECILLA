#!/usr/bin/env bash
# Lanzador del Supervisor de Codex para macOS y Linux.
# Uso:
#   ./supervisor.sh "Tu instrucción para Codex"
#   ./supervisor.sh --file tareas.txt
#
# Doble función: si lo ejecutas sin argumentos, te pide la tarea por teclado.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "⛔ No encuentro Node.js. Instálalo desde https://nodejs.org y vuelve a intentar."
  exit 1
fi

if [ "$#" -eq 0 ]; then
  read -r -p "¿Qué tarea le doy a Codex? " TASK
  exec node "$DIR/supervisor.js" "$TASK"
fi

exec node "$DIR/supervisor.js" "$@"
