#!/usr/bin/env python3
"""Facturador A&A: punto de entrada.

Uso:
    python facturacion.py                 # abre la interfaz en el navegador
    python facturacion.py --puerto 8765   # puerto fijo
    python facturacion.py --datos RUTA    # carpeta de datos distinta
    python facturacion.py --sin-navegador # solo deja el servidor corriendo
    python facturacion.py --restaurar respaldo.sql  # recupera un respaldo descargado
"""

import argparse
import sys
import threading
import webbrowser
from pathlib import Path

# Permite ejecutar el archivo directamente (sin instalar el paquete).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from facturador import VERSION  # noqa: E402
from facturador import servidor as servidor_mod  # noqa: E402


def restaurar(archivo_sql, ruta_bd=None):
    """Recrea la base de datos a partir de un respaldo .sql descargado desde el programa."""
    import datetime as dt
    import sqlite3
    from facturador import db as db_mod

    if not archivo_sql.is_file():
        print(f"No se encuentra el archivo {archivo_sql}")
        return 1
    if ruta_bd is None:
        carpeta = db_mod.ruta_datos_por_defecto()
        carpeta.mkdir(parents=True, exist_ok=True)
        ruta_bd = carpeta / "facturador.db"
    if ruta_bd.exists():
        marca = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        respaldo_previo = ruta_bd.with_name(f"facturador.antes-{marca}.db")
        ruta_bd.rename(respaldo_previo)
        print(f"Base de datos anterior conservada en {respaldo_previo}")
    conn = sqlite3.connect(str(ruta_bd))
    try:
        conn.executescript(archivo_sql.read_text(encoding="utf-8"))
        conn.commit()
    finally:
        conn.close()
    db_mod.conectar(ruta_bd).close()  # aplica el esquema actual si el respaldo es antiguo
    print(f"Respaldo restaurado en {ruta_bd}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Facturador A&A: facturación y cobranza local")
    parser.add_argument("--puerto", type=int, default=8765, help="puerto local (0 = automático)")
    parser.add_argument("--datos", help="carpeta donde guardar la base de datos")
    parser.add_argument("--sin-navegador", action="store_true", help="no abrir el navegador")
    parser.add_argument("--verbose", action="store_true", help="mostrar cada petición")
    parser.add_argument("--restaurar", metavar="ARCHIVO.sql",
                        help="restaura un respaldo (.sql) y termina; la BD actual se conserva renombrada")
    parser.add_argument("--version", action="version", version=f"Facturador A&A {VERSION}")
    args = parser.parse_args(argv)

    ruta_bd = Path(args.datos) / "facturador.db" if args.datos else None
    if args.restaurar:
        return restaurar(Path(args.restaurar), ruta_bd)
    app = servidor_mod.Aplicacion(ruta_bd)
    try:
        servidor, puerto = servidor_mod.iniciar(app, args.puerto)
    except OSError:
        # El puerto preferido está ocupado: se toma uno libre.
        servidor, puerto = servidor_mod.iniciar(app, 0)
    url = f"http://127.0.0.1:{puerto}/"
    print(f"Facturador A&A {VERSION}")
    print(f"Datos: {ruta_bd or 'carpeta FacturadorAA en tu carpeta personal'}")
    print(f"Interfaz: {url}")
    print("Cierra esta ventana o pulsa Ctrl+C para detener el programa.")
    if not args.sin_navegador:
        threading.Timer(0.6, webbrowser.open, args=(url,)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()
        app.conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
