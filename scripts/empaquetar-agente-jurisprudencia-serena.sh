#!/usr/bin/env bash
# Arma el agente descargable de Jurisprudencia C.A. La Serena (skill de Claude).
#
# USO:
#   bash scripts/empaquetar-agente-jurisprudencia-serena.sh [carpeta-destino]
#
# Genera <carpeta-destino>/agente-jurisprudencia-serena.zip (por defecto dist/) con:
#   jurisprudencia-ca-la-serena/SKILL.md              instrucciones para Claude
#   jurisprudencia-ca-la-serena/reporte.mjs           ejecutor (lee pjud.cl y arma el reporte)
#   jurisprudencia-ca-la-serena/jurisprudencia.mjs    lógica (filtro, fichas, puntaje, reporte)
#   jurisprudencia-ca-la-serena/validar-carrusel.mjs  validador de carruseles
#
# Para instalarlo: claude.ai → Configuración → Capacidades → Skills → subir el .zip.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="${1:-$REPO_ROOT/dist}"
mkdir -p "$DESTINO"
DESTINO="$(cd "$DESTINO" && pwd)"
ZIP="$DESTINO/agente-jurisprudencia-serena.zip"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/jurisprudencia-ca-la-serena"
cp "$REPO_ROOT/agente-jurisprudencia-serena/SKILL.md" \
   "$REPO_ROOT/agente-jurisprudencia-serena/reporte.mjs" \
   "$REPO_ROOT/agente-jurisprudencia-serena/jurisprudencia.mjs" \
   "$REPO_ROOT/agente-jurisprudencia-serena/validar-carrusel.mjs" \
   "$TMP/jurisprudencia-ca-la-serena/"

rm -f "$ZIP"
(cd "$TMP" && zip -qr -X "$ZIP" jurisprudencia-ca-la-serena)
echo "✅ $ZIP"
