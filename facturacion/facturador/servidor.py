"""Servidor HTTP local (solo 127.0.0.1) que sirve la interfaz y la API JSON."""

import json
import mimetypes
import shutil
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import VERSION, automatizacion, db, documentos
from .calculos import TIPOS_DOCUMENTO, ESTADOS
from .db import ErrorValidacion


def carpeta_static():
    """Carpeta de archivos estáticos (funciona también empaquetado con PyInstaller)."""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return Path(base) / "facturador" / "static"
    return Path(__file__).parent / "static"


class Aplicacion:
    """Estado compartido: conexión a la BD y cerrojo para accesos concurrentes."""

    def __init__(self, ruta_bd=None):
        self.conn = db.conectar(ruta_bd)
        self.ruta_bd = ruta_bd
        self.cerrojo = threading.RLock()
        self.servidor = None


def crear_manejador(app):
    class Manejador(BaseHTTPRequestHandler):
        server_version = f"FacturadorAA/{VERSION}"

        # ---------------------------------------------------------- utilidades
        def log_message(self, formato, *args):  # silencia el log por defecto
            if "--verbose" in sys.argv:
                super().log_message(formato, *args)

        def _host_permitido(self):
            host = (self.headers.get("Host") or "").split(":")[0]
            return host in ("127.0.0.1", "localhost", "[::1]", "::1")

        def _json(self, datos, codigo=200):
            cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(cuerpo)

        def _texto(self, texto, tipo="text/html; charset=utf-8", codigo=200, nombre=None):
            cuerpo = texto.encode("utf-8") if isinstance(texto, str) else texto
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(cuerpo)))
            if nombre:
                self.send_header("Content-Disposition", f'attachment; filename="{nombre}"')
            self.end_headers()
            self.wfile.write(cuerpo)

        def _cuerpo(self):
            largo = int(self.headers.get("Content-Length") or 0)
            if largo <= 0:
                return {}
            crudo = self.rfile.read(largo)
            try:
                return json.loads(crudo.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                raise ErrorValidacion("Cuerpo JSON inválido")

        def _ruta(self):
            partes = urllib.parse.urlsplit(self.path)
            consulta = {k: v[0] for k, v in urllib.parse.parse_qs(partes.query).items()}
            return partes.path, consulta

        def _estatico(self, nombre):
            archivo = (carpeta_static() / nombre).resolve()
            if not str(archivo).startswith(str(carpeta_static().resolve())) or not archivo.is_file():
                return self._texto("No encontrado", "text/plain; charset=utf-8", 404)
            tipo = mimetypes.guess_type(str(archivo))[0] or "application/octet-stream"
            if tipo.startswith("text/") or tipo in ("application/javascript", "application/json"):
                tipo += "; charset=utf-8"
            self._texto(archivo.read_bytes(), tipo)

        # ------------------------------------------------------------- rutas
        def do_GET(self):
            self._despachar("GET")

        def do_POST(self):
            self._despachar("POST")

        def do_PUT(self):
            self._despachar("PUT")

        def do_DELETE(self):
            self._despachar("DELETE")

        def _despachar(self, metodo):
            if not self._host_permitido():
                return self._texto("Acceso denegado", "text/plain; charset=utf-8", 403)
            ruta, consulta = self._ruta()
            try:
                with app.cerrojo:
                    resultado = self._manejar(metodo, ruta, consulta)
                if resultado is not None:
                    self._json(resultado)
            except ErrorValidacion as e:
                self._json({"error": str(e)}, 400)
            except Exception as e:  # noqa: BLE001 - se informa al usuario
                import traceback
                traceback.print_exc()
                self._json({"error": f"Error interno: {e}"}, 500)

        def _manejar(self, metodo, ruta, consulta):
            conn = app.conn
            segmentos = [s for s in ruta.split("/") if s]

            # ---- interfaz y estáticos
            if metodo == "GET" and ruta == "/":
                return self._estatico("index.html")
            if metodo == "GET" and segmentos[:1] == ["static"] and len(segmentos) == 2:
                return self._estatico(segmentos[1])
            if metodo == "GET" and segmentos[:1] == ["documento"] and len(segmentos) == 3 \
                    and segmentos[2] == "imprimir":
                doc = db.obtener_documento(conn, int(segmentos[1]))
                if not doc:
                    return self._texto("Documento no encontrado", "text/plain; charset=utf-8", 404)
                return self._texto(documentos.render_documento(doc, db.obtener_config(conn)))

            if segmentos[:1] != ["api"]:
                return self._texto("No encontrado", "text/plain; charset=utf-8", 404)
            api = segmentos[1:]

            # ---- estado general
            if metodo == "GET" and api == ["estado"]:
                return {
                    "version": VERSION,
                    "configuracion": db.obtener_config(conn),
                    "resumen": automatizacion.resumen(conn, consulta.get("periodo")),
                    "tipos_documento": TIPOS_DOCUMENTO,
                    "estados": list(ESTADOS),
                    "periodicidades": list(db.PERIODICIDADES),
                    "hoy": db.hoy(),
                    "ruta_datos": str(app.ruta_bd or db.ruta_datos_por_defecto() / "facturador.db"),
                }
            if api == ["configuracion"]:
                if metodo == "GET":
                    return db.obtener_config(conn)
                if metodo == "PUT":
                    return db.guardar_config(conn, self._cuerpo())

            # ---- clientes
            if api[:1] == ["clientes"]:
                if len(api) == 1 and metodo == "GET":
                    return db.listar_clientes(conn, solo_activos=consulta.get("activos") == "1",
                                              buscar=consulta.get("buscar", ""))
                if len(api) == 1 and metodo == "POST":
                    return db.crear_cliente(conn, self._cuerpo())
                if len(api) == 2 and api[1] == "importar" and metodo == "POST":
                    texto = self._cuerpo().get("csv", "")
                    creados, errores = 0, []
                    for registro in documentos.leer_csv_clientes(texto):
                        try:
                            db.crear_cliente(conn, registro)
                            creados += 1
                        except ErrorValidacion as e:
                            errores.append(f"{registro.get('razon_social') or registro.get('rut')}: {e}")
                    return {"creados": creados, "errores": errores}
                if len(api) == 2:
                    cliente_id = int(api[1])
                    if metodo == "GET":
                        c = db.obtener_cliente(conn, cliente_id)
                        if not c:
                            raise ErrorValidacion("Cliente no encontrado")
                        return c
                    if metodo == "PUT":
                        return db.actualizar_cliente(conn, cliente_id, self._cuerpo())
                    if metodo == "DELETE":
                        db.eliminar_cliente(conn, cliente_id)
                        return {"ok": True}

            # ---- servicios
            if api[:1] == ["servicios"]:
                if len(api) == 1 and metodo == "GET":
                    return db.listar_servicios(conn, solo_activos=consulta.get("activos") == "1")
                if len(api) == 1 and metodo == "POST":
                    return db.crear_servicio(conn, self._cuerpo())
                if len(api) == 2:
                    if metodo == "PUT":
                        return db.actualizar_servicio(conn, int(api[1]), self._cuerpo())
                    if metodo == "DELETE":
                        db.eliminar_servicio(conn, int(api[1]))
                        return {"ok": True}

            # ---- planes (automatización)
            if api[:1] == ["planes"]:
                if len(api) == 1 and metodo == "GET":
                    return db.listar_planes(conn, solo_activos=consulta.get("activos") == "1")
                if len(api) == 1 and metodo == "POST":
                    return db.crear_plan(conn, self._cuerpo())
                if len(api) == 2:
                    if metodo == "PUT":
                        return db.actualizar_plan(conn, int(api[1]), self._cuerpo())
                    if metodo == "DELETE":
                        db.eliminar_plan(conn, int(api[1]))
                        return {"ok": True}

            if api[:1] == ["automatizacion"]:
                periodo = consulta.get("periodo") or db.hoy()[:7]
                if api[1:] == ["pendientes"] and metodo == "GET":
                    db._validar_periodo(periodo, "Período")
                    return {"periodo": periodo,
                            "periodo_nombre": automatizacion.nombre_periodo(periodo),
                            "planes": automatizacion.planes_pendientes(conn, periodo)}
                if api[1:] == ["generar"] and metodo == "POST":
                    cuerpo = self._cuerpo()
                    periodo = cuerpo.get("periodo") or periodo
                    db._validar_periodo(periodo, "Período")
                    ids = cuerpo.get("plan_ids") or None
                    creados = automatizacion.generar_periodo(
                        conn, periodo, emitir=bool(cuerpo.get("emitir")),
                        plan_ids=set(int(i) for i in ids) if ids else None)
                    return {"creados": creados, "cantidad": len(creados)}

            # ---- documentos
            if api[:1] == ["documentos"]:
                if len(api) == 1 and metodo == "GET":
                    return db.listar_documentos(
                        conn, estado=consulta.get("estado"), tipo=consulta.get("tipo"),
                        cliente_id=consulta.get("cliente_id"), desde=consulta.get("desde"),
                        hasta=consulta.get("hasta"), buscar=consulta.get("buscar", ""))
                if len(api) == 1 and metodo == "POST":
                    cuerpo = self._cuerpo()
                    return db.crear_documento(conn, cuerpo, emitir=bool(cuerpo.get("emitir")))
                if len(api) >= 2:
                    documento_id = int(api[1])
                    accion = api[2] if len(api) > 2 else None
                    if accion is None and metodo == "GET":
                        d = db.obtener_documento(conn, documento_id)
                        if not d:
                            raise ErrorValidacion("Documento no encontrado")
                        return d
                    if accion is None and metodo == "PUT":
                        return db.actualizar_documento(conn, documento_id, self._cuerpo())
                    if accion is None and metodo == "DELETE":
                        db.eliminar_documento(conn, documento_id)
                        return {"ok": True}
                    if accion == "emitir" and metodo == "POST":
                        return db.emitir_documento(conn, documento_id)
                    if accion == "anular" and metodo == "POST":
                        return db.anular_documento(conn, documento_id, self._cuerpo().get("motivo"))
                    if accion == "pagos" and metodo == "POST":
                        return db.registrar_pago(conn, documento_id, self._cuerpo())
                    if accion == "recordatorio" and metodo == "GET":
                        d = db.obtener_documento(conn, documento_id)
                        if not d:
                            raise ErrorValidacion("Documento no encontrado")
                        return {"texto": documentos.texto_recordatorio(d, db.obtener_config(conn)),
                                "email": d.get("cliente_email", "")}

            if api[:1] == ["pagos"] and len(api) == 2 and metodo == "DELETE":
                return db.eliminar_pago(conn, int(api[1]))

            # ---- exportaciones y respaldo
            if api[:1] == ["exportar"] and metodo == "GET":
                if api[1:] == ["documentos.csv"]:
                    docs = db.listar_documentos(conn, estado=consulta.get("estado"),
                                                tipo=consulta.get("tipo"),
                                                desde=consulta.get("desde"),
                                                hasta=consulta.get("hasta"))
                    return self._texto(documentos.csv_documentos(docs),
                                       "text/csv; charset=utf-8", nombre="documentos.csv")
                if api[1:] == ["clientes.csv"]:
                    return self._texto(documentos.csv_clientes(db.listar_clientes(conn)),
                                       "text/csv; charset=utf-8", nombre="clientes.csv")
            if api == ["respaldo"] and metodo == "GET":
                import sqlite3
                memoria = sqlite3.connect(":memory:")
                conn.backup(memoria)
                datos = b"".join(f"{linea}\n".encode("utf-8") for linea in memoria.iterdump())
                memoria.close()
                nombre = f"respaldo-facturador-{db.hoy()}.sql"
                return self._texto(datos, "application/sql", nombre=nombre)

            if api == ["salir"] and metodo == "POST":
                threading.Thread(target=app.servidor.shutdown, daemon=True).start()
                return {"ok": True}

            return self._texto("No encontrado", "text/plain; charset=utf-8", 404)

    return Manejador


def iniciar(app, puerto=0, host="127.0.0.1"):
    """Crea el servidor (sin bloquear). Devuelve (servidor, puerto)."""
    servidor = ThreadingHTTPServer((host, puerto), crear_manejador(app))
    servidor.daemon_threads = True
    app.servidor = servidor
    return servidor, servidor.server_address[1]
