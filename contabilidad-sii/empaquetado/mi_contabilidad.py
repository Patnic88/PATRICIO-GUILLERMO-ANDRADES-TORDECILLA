"""Punto de entrada del programa empaquetado (MiContabilidad.exe)."""

import sys

from contasii import web

if __name__ == "__main__":
    sys.exit(web.main())
