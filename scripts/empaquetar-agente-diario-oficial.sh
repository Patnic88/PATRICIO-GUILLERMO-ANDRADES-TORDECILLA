#!/usr/bin/env bash
# Arma el agente descargable del Diario Oficial (skill de Claude).
#
# USO:
#   bash scripts/empaquetar-agente-diario-oficial.sh [carpeta-destino]
#
# Genera <carpeta-destino>/agente-diario-oficial.zip (por defecto dist/) con:
#   diario-oficial/SKILL.md          instrucciones para Claude
#   diario-oficial/reporte.mjs       ejecutor (lee el sitio y arma el correo)
#   diario-oficial/diario-oficial.gs lógica compartida con el Apps Script
#
# Para instalarlo: claude.ai → Configuración → Capacidades → Skills → subir el .zip.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="${1:-$REPO_ROOT/dist}"
mkdir -p "$DESTINO"
DESTINO="$(cd "$DESTINO" && pwd)"
ZIP="$DESTINO/agente-diario-oficial.zip"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/diario-oficial"
cp "$REPO_ROOT/agente-diario-oficial/SKILL.md" \
   "$REPO_ROOT/agente-diario-oficial/reporte.mjs" \
   "$REPO_ROOT/diario-oficial.gs" \
   "$TMP/diario-oficial/"

rm -f "$ZIP"
(cd "$TMP" && zip -qr -X "$ZIP" diario-oficial)
echo "✅ $ZIP"
