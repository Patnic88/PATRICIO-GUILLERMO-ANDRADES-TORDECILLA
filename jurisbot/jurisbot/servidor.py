"""Servidor web mínimo (biblioteca estándar): API JSON + interfaz de búsqueda.

Pensado para pruebas y piloto con pocos usuarios. Para producción conviene
ponerlo detrás de un proxy con HTTPS (ver docs/PLAN_NEGOCIO.md).
"""
from __future__ import annotations

import json
import sqlite3
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from . import db, suscripciones as sus
from .clasificar import TAXONOMIA
from .modelo import FUENTES

WEB = Path(__file__).resolve().parent.parent / "web"


def crear_manejador(ruta_db: str):
    class Manejador(BaseHTTPRequestHandler):
        server_version = "JurisBot/0.1"

        def log_message(self, fmt, *args):  # sin ruido en consola
            pass

        def _json(self, codigo: int, cuerpo):
            datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)

        def _usuario(self, con):
            clave = self.headers.get("X-API-Key", "")
            return sus.usuario_por_clave(con, clave) if clave else None

        def do_GET(self):
            url = urlparse(self.path)
            q = parse_qs(url.query)
            uno = lambda k: (q.get(k) or [""])[0]
            if url.path in ("/", "/index.html"):
                return self._archivo(WEB / "index.html", "text/html; charset=utf-8")
            if url.path == "/api/catalogo":
                return self._json(200, {
                    "fuentes": FUENTES,
                    "materias": {k: v["nombre"] for k, v in TAXONOMIA.items()},
                    "planes": sus.PLANES,
                })
            con = db.conectar(ruta_db)
            try:
                usuario = self._usuario(con)
                if url.path.startswith("/api/") and usuario is None:
                    return self._json(401, {"error": "Falta una clave válida en el encabezado X-API-Key"})
                plan = usuario["plan"]
                if url.path == "/api/yo":
                    return self._json(200, {"email": usuario["email"], "plan": plan,
                                            "limites": usuario["limites"]})
                if url.path == "/api/buscar":
                    sus.registrar_consulta(con, usuario)
                    docs = db.buscar(con, texto=uno("q"), fuentes=q.get("fuente"),
                                     materias=q.get("materia"), desde=uno("desde"),
                                     hasta=uno("hasta"),
                                     ingresado_hasta=sus.corte_ingreso(plan),
                                     limite=min(int(uno("limite") or 50), 200))
                    return self._json(200, {"plan": plan,
                                            "resultados": [sus.recortar(d, plan) for d in docs]})
                if url.path == "/api/documento":
                    sus.registrar_consulta(con, usuario)
                    d = db.obtener(con, uno("clave"))
                    corte = sus.corte_ingreso(plan)
                    if not d or (corte and d["ingresado"] > corte):
                        return self._json(404, {"error": "No encontrado o no incluido en su plan"})
                    return self._json(200, sus.recortar(d, plan))
                if url.path == "/api/estadisticas":
                    return self._json(200, db.estadisticas(con))
                return self._json(404, {"error": "Ruta desconocida"})
            except sus.LimiteExcedido as e:
                return self._json(429, {"error": str(e)})
            except (ValueError, sqlite3.OperationalError) as e:
                return self._json(400, {"error": str(e)})
            finally:
                con.close()

        def _archivo(self, ruta: Path, tipo: str):
            datos = ruta.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)

    return Manejador


def servir(ruta_db: str, puerto: int = 8000, host: str = "127.0.0.1"):
    srv = ThreadingHTTPServer((host, puerto), crear_manejador(ruta_db))
    print(f"JurisBot en http://{host}:{puerto}  (Ctrl+C para detener)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
