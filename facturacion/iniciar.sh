#!/usr/bin/env bash
# Inicia el Facturador A&A desde el código fuente (requiere Python 3.9+).
cd "$(dirname "$0")"
exec python3 facturacion.py "$@"
