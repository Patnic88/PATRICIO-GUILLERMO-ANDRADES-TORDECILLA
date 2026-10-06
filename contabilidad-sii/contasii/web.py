"""Interfaz gráfica local: un pequeño servidor que abre la contabilidad en el navegador.

Uso:  python -m contasii.web            (o doble clic en "Abrir contabilidad")

- Escucha solo en 127.0.0.1: nadie fuera del computador puede conectarse.
- Las empresas se guardan en la carpeta `mis_empresas/` (un archivo .db por RUT),
  junto a la UTM que el usuario ingresa (parametros_locales.json).
- No usa internet ni librerías externas (openpyxl solo para exportar a Excel).
"""

import base64
import collections
import json
import os
import re
import sys
import tempfile
import threading
import traceback
import webbrowser
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import controles, honorarios, impuestos, obligaciones, operaciones, rcv, reportes
from . import rut as rutmod
from .libro import REGIMENES, Asiento, ErrorContable, Libro, Linea
from .parametros import ParametroFaltante, Parametros, guardar_utm_local

AQUI = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(AQUI, "web", "index.html")
NOMBRE_DB = re.compile(r"^[0-9]{1,8}-[0-9K]\.db$")
PERIODO = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")

REGIMEN_SIMPLE = {
    "14D8": "Pro Pyme Transparente (14 D N°8): la mayoría de las pymes pequeñas",
    "14D3": "Pro Pyme General (14 D N°3)",
    "14A": "Régimen General (14 A): empresas grandes",
    "PN_HONORARIOS": "Persona que emite boletas de honorarios",
}


class ErrorUsuario(Exception):
    """Error que se muestra tal cual al usuario."""


# ------------------------------------------------------------------ archivos del SII
def detectar_archivo(texto: str):
    """Reconoce qué archivo del SII es y resume su contenido, sin importarlo."""
    primera = texto.lstrip("﻿").splitlines()[0] if texto.strip() else ""
    enc = {rcv._norm(h) for h in re.split(r"[;,\t]", primera)}
    if "rutproveedor" in enc:
        tipo = "compra"
    elif "rutcliente" in enc:
        tipo = "venta"
    elif enc & {"brutos", "bruto", "montobruto", "honorariobruto"} and enc & {"retenido", "retencion", "montoretenido"}:
        tipo = "honorario_emitido" if "rutreceptor" in enc else "honorario_recibido"
    else:
        raise ErrorUsuario(
            "No reconozco este archivo. Debe ser el detalle de compras o de ventas del Registro de Compras y "
            "Ventas (RCV), o el informe de boletas de honorarios, descargado desde sii.cl en formato CSV.")
    if tipo in ("compra", "venta"):
        mapa, filas = rcv.leer_csv(texto)
        fechas = [rcv._fecha_iso(f.get(mapa["fecha"], "")) for f in filas if f.get(mapa["fecha"])]
        total = sum(rcv._entero(f.get(mapa["total"])) * (-1 if rcv._entero(f.get(mapa["tipo_dte"])) in rcv.NOTAS_CREDITO else 1)
                    for f in filas)
    else:
        mapa, filas = honorarios.leer(texto)
        filas = [f for f in filas if (f.get(mapa["folio"]) or "").strip()
                 and "anul" not in (f.get(mapa.get("estado", ""), "") or "").lower()]
        fechas = [rcv._fecha_iso(f.get(mapa["fecha"], "")) for f in filas if f.get(mapa["fecha"])]
        total = sum(rcv._entero(f.get(mapa["bruto"])) for f in filas)
    meses = collections.Counter(f[:7] for f in fechas)
    return {"tipo": tipo, "documentos": len(filas), "total": total,
            "mes_sugerido": meses.most_common(1)[0][0] if meses else None}


def decodificar(b64: str) -> str:
    crudo = base64.b64decode(b64)
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return crudo.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ErrorUsuario("No se pudo leer el archivo.")


# ------------------------------------------------------------------ aplicación
class App:
    def __init__(self, carpeta: str):
        self.carpeta = os.path.abspath(carpeta)
        os.makedirs(self.carpeta, exist_ok=True)
        self.local = os.path.join(self.carpeta, "parametros_locales.json")
        self.lock = threading.Lock()

    def params(self, periodo):
        return Parametros(int(periodo[:4]), local=self.local)

    def libro(self, archivo) -> Libro:
        if not NOMBRE_DB.match(archivo or ""):
            raise ErrorUsuario("Empresa no válida.")
        ruta = os.path.join(self.carpeta, archivo)
        if not os.path.exists(ruta):
            raise ErrorUsuario("No encuentro esa empresa.")
        return Libro(ruta)

    def ping(self, q, b):
        return {"app": "contasii"}

    def info_carpeta(self, q, b):
        return {"carpeta": self.carpeta}

    # ---- empresas
    def empresas(self, q, b):
        out = []
        for nombre in sorted(os.listdir(self.carpeta)):
            if NOMBRE_DB.match(nombre):
                lib = Libro(os.path.join(self.carpeta, nombre))
                c = lib.contribuyente()
                if c:
                    out.append({"archivo": nombre, "rut": rutmod.formatear(c["rut"]), "nombre": c["razon_social"],
                                "regimen": c["regimen"], "regimen_texto": REGIMEN_SIMPLE.get(c["regimen"], ""),
                                "tipo": c["tipo"]})
                lib.con.close()
        return {"empresas": out, "regimenes": REGIMEN_SIMPLE}

    def crear_empresa(self, q, b):
        rut = (b.get("rut") or "").strip()
        if not rutmod.es_valido(rut):
            raise ErrorUsuario("El RUT no es válido. Revise el número y el dígito verificador.")
        nombre = (b.get("nombre") or "").strip()
        if not nombre:
            raise ErrorUsuario("Escriba el nombre o razón social.")
        if b.get("regimen") not in REGIMENES:
            raise ErrorUsuario("Elija el régimen tributario.")
        tipo = "persona_natural" if b.get("tipo") == "persona_natural" else "empresa"
        archivo = rutmod.normalizar(rut) + ".db"
        ruta = os.path.join(self.carpeta, archivo)
        if os.path.exists(ruta):
            raise ErrorUsuario("Ya existe una contabilidad para ese RUT.")
        lib = Libro(ruta)
        lib.inicializar(rut, nombre, tipo, b["regimen"], (b.get("giro") or "").strip())
        lib.con.close()
        return {"archivo": archivo}

    # ---- resumen de una empresa
    def resumen(self, lib, q, b):
        c = lib.contribuyente()
        A = lib.cuenta_auto
        periodo = q.get("periodo")
        saldos = {s["codigo"]: s["debe"] - s["haber"] for s in lib.saldos()}
        docs = {}
        if periodo:
            for r in lib.con.execute("SELECT libro, COUNT(*) n, SUM(total) t FROM documento WHERE periodo=? "
                                     "GROUP BY libro", (periodo,)):
                docs[r["libro"]] = {"n": r["n"], "total": r["t"]}
        periodos = [r[0] for r in lib.con.execute(
            "SELECT periodo FROM asiento UNION SELECT periodo FROM documento ORDER BY 1 DESC")]
        utm = None
        if periodo:
            try:
                utm = self.params(periodo).utm(periodo)
            except ParametroFaltante:
                pass
        return {
            "rut": rutmod.formatear(c["rut"]), "nombre": c["razon_social"], "regimen": c["regimen"],
            "regimen_texto": REGIMEN_SIMPLE.get(c["regimen"], ""), "tipo": c["tipo"],
            "banco": saldos.get(A("banco"), 0), "caja": saldos.get(A("caja"), 0),
            "por_cobrar": saldos.get(A("clientes"), 0), "por_pagar": -saldos.get(A("proveedores"), 0),
            "documentos": docs, "periodos": periodos, "cerrado": lib.periodo_cerrado(periodo) if periodo else False,
            "asientos_mes": lib.con.execute("SELECT COUNT(*) FROM asiento WHERE periodo=?", (periodo,)).fetchone()[0]
            if periodo else 0,
            "utm": utm,
            "f29_registrado": bool(periodo and lib.con.execute(
                "SELECT 1 FROM asiento WHERE origen='f29' AND periodo=? AND numero NOT IN "
                "(SELECT anula_a FROM asiento WHERE anula_a IS NOT NULL)", (periodo,)).fetchone()),
        }

    # ---- importar
    def analizar(self, lib, q, b):
        return detectar_archivo(decodificar(b.get("contenido", "")))

    def importar(self, lib, q, b):
        periodo = b.get("periodo", "")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes al que corresponde el archivo.")
        texto = decodificar(b.get("contenido", ""))
        tipo = b.get("tipo") or detectar_archivo(texto)["tipo"]
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as f:
            f.write(texto)
            tmp = f.name
        try:
            if tipo in ("compra", "venta"):
                r = rcv.importar(lib, tmp, tipo, periodo, b.get("modo") or "documento")
                res = {"importados": r.importados, "duplicados": r.duplicados, "alertas": r.alertas}
            elif tipo in ("honorario_recibido", "honorario_emitido"):
                r = honorarios.importar(lib, tmp, tipo.split("_")[1], periodo, self.params(periodo))
                res = {"importados": r["importados"], "duplicados": r["duplicados"], "alertas": r["alertas"],
                       "anuladas": r["anuladas"]}
            else:
                raise ErrorUsuario("Tipo de archivo no reconocido.")
        finally:
            os.unlink(tmp)
        lib.con.execute("UPDATE documento SET fuente=? WHERE fuente=?", (b.get("nombre") or "archivo", tmp))
        lib.con.commit()
        return res

    # ---- movimientos
    def catalogo(self, lib, q, b):
        return {
            "operaciones": [{"clave": k, "titulo": v[0], "ayuda": v[1], "pide_rut": v[3]}
                            for k, v in operaciones.OPERACIONES.items()],
            "medios": operaciones.MEDIOS,
            "pago_f29": [{"clave": k, "nombre": n, "pendiente": m}
                         for k, n, m in operaciones.sugerencia_pago_f29(lib)],
            "cuentas": [{"codigo": c["codigo"], "nombre": c["nombre"], "tipo": c["tipo"]}
                        for c in lib.cuentas() if c["imputable"] and c["activa"]],
        }

    def movimiento(self, lib, q, b):
        fecha = b.get("fecha", "")
        if not FECHA.match(fecha):
            raise ErrorUsuario("Indique la fecha.")
        op = b.get("operacion")
        rut = (b.get("rut") or "").strip()
        if rut and not rutmod.es_valido(rut):
            raise ErrorUsuario("El RUT indicado no es válido.")
        if op == "pago_f29":
            n = operaciones.registrar_pago_f29(lib, fecha, b.get("periodo") or fecha[:7], b.get("montos") or {},
                                               b.get("medio", "banco"))
        elif op == "avanzado":
            a = Asiento(fecha, (b.get("glosa") or "").strip() or "Asiento manual", tipo="traspaso", origen="manual")
            for l in b.get("lineas") or []:
                a.lineas.append(Linea(l.get("cuenta", ""), debe=int(l.get("debe") or 0),
                                      haber=int(l.get("haber") or 0)))
            n = lib.registrar(a)
        else:
            n = operaciones.registrar(lib, op, fecha, int(b.get("monto") or 0), b.get("medio", "banco"),
                                      (b.get("detalle") or "").strip(), rut)
        return {"numero": n}

    def anular(self, lib, q, b):
        motivo = (b.get("motivo") or "").strip()
        if not motivo:
            raise ErrorUsuario("Indique el motivo de la anulación.")
        return {"numero": lib.anular(int(b.get("numero")), date.today().isoformat(), motivo)}

    # ---- F29
    def _propuesta(self, lib, q):
        periodo = q.get("periodo", "")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes.")
        params = self.params(periodo)

        def num(k, conv):
            v = q.get(k)
            return conv(v) if v not in (None, "") else None

        p = impuestos.propuesta_f29(lib, params, periodo, impuesto_unico_mes=num("impuesto_unico", int) or 0,
                                    tasa_ppm=num("tasa_ppm", lambda x: float(x) / 100),
                                    factor_uso_comun=num("factor_uso_comun", lambda x: float(x) / 100),
                                    remanente_anterior=num("remanente_anterior", int))
        venc, notas = impuestos.vencimiento_f29(params, periodo, electronico=q.get("papel") != "1")
        p.alertas += notas
        p.verificar = params.advertencias()
        return p, venc, params

    def f29(self, lib, q, b):
        p, venc, params = self._propuesta(lib, q)
        cod = {k: v.split(" ")[0] for k, v in impuestos.codigos_f29(params).items() if not k.startswith("_")}
        ya = lib.con.execute("SELECT 1 FROM asiento WHERE origen='f29' AND periodo=? AND numero NOT IN "
                             "(SELECT anula_a FROM asiento WHERE anula_a IS NOT NULL)", (q["periodo"],)).fetchone()
        return {"lineas": [{"clave": c, "texto": d, "monto": m, "codigo": cod.get(c, "")} for c, d, m in p.lineas],
                "total": p.total_a_pagar, "remanente_siguiente": p.remanente_siguiente,
                "vencimiento": venc.isoformat(), "alertas": p.alertas, "verificar": p.verificar,
                "contabilizado": bool(ya)}

    def f29_confirmar(self, lib, q, b):
        if lib.periodo_cerrado(b.get("periodo", "")):
            raise ErrorUsuario("El mes está cerrado.")
        if self.f29(lib, b, {})["contabilizado"]:
            raise ErrorUsuario("El impuesto de este mes ya fue registrado. Si necesita corregirlo, anule ese "
                               "movimiento en «Pagos y cobros» y vuelva a confirmar.")
        p, _, _ = self._propuesta(lib, b)
        impuestos.guardar_remanente(lib, p.periodo, p.remanente_siguiente)
        try:
            n = impuestos.contabilizar_f29(lib, p)
        except ErrorContable:
            n = None
        return {"numero": n}

    # ---- revisión y cierre
    def revision(self, lib, q, b):
        periodo = q.get("periodo", "")
        c = lib.contribuyente()
        return {"controles": [{"nombre": n, "ok": ok, "detalle": d} for n, ok, d in controles.controles(lib, periodo)],
                "cerrado": lib.periodo_cerrado(periodo),
                "obligaciones": [{"texto": t, "norma": n, "estado": e} for t, n, e in obligaciones.listar(c["regimen"])]}

    def cerrar(self, lib, q, b):
        periodo = b.get("periodo", "")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes.")
        lib.cerrar_periodo(periodo)
        return {"ok": True}

    # ---- libros
    def _rango(self, q):
        periodo = q.get("periodo")
        if periodo and PERIODO.match(periodo):
            y, m = map(int, periodo.split("-"))
            from calendar import monthrange
            return f"{periodo}-01", f"{periodo}-{monthrange(y, m)[1]:02d}"
        if q.get("anio", "").isdigit():
            return f"{q['anio']}-01-01", f"{q['anio']}-12-31"
        return "0000-00-00", "9999-12-31"

    def diario(self, lib, q, b):
        desde, hasta = self._rango(q)
        anulados = {r[0] for r in lib.con.execute("SELECT anula_a FROM asiento WHERE anula_a IS NOT NULL")}
        return {"asientos": [{"numero": a["numero"], "fecha": a["fecha"], "glosa": a["glosa"], "origen": a["origen"],
                              "tipo": a["tipo"], "anulado": a["numero"] in anulados,
                              "lineas": [{"cuenta": l["cuenta"], "nombre": l["nombre"], "debe": l["debe"],
                                          "haber": l["haber"], "rut": l["rut_aux"] or ""} for l in ls]}
                             for a, ls in lib.libro_diario(desde, hasta)]}

    def mayor(self, lib, q, b):
        desde, hasta = self._rango(q)
        ini, filas = lib.libro_mayor(q.get("cuenta", ""), desde, hasta)
        return {"inicial": ini, "movimientos": filas}

    def balance(self, lib, q, b):
        desde, hasta = self._rango(q)
        filas, tot, res = lib.balance_8_columnas(hasta, desde)
        return {"filas": [{"codigo": c, "nombre": n, "v": v} for c, n, v in filas], "totales": tot, "resultado": res}

    def resultados(self, lib, q, b):
        desde, hasta = self._rango(q)
        det, ing, gas, res = lib.estado_resultados(desde, hasta)
        return {"detalle": [{"codigo": c, "nombre": n, "tipo": t, "monto": v} for c, n, t, v in det],
                "ingresos": ing, "gastos": gas, "resultado": res}

    def documentos(self, lib, q, b):
        rows = lib.con.execute("SELECT * FROM documento WHERE periodo=? ORDER BY libro, fecha, folio",
                               (q.get("periodo", ""),)).fetchall()
        return {"documentos": [{k: r[k] for k in ("libro", "tipo_dte", "rut_contraparte", "razon_social", "folio",
                                                    "fecha", "neto", "exento", "iva", "bruto", "retencion", "total")}
                               for r in rows], "tipos": rcv.TIPOS_DTE}

    def excel(self, lib, q, b):
        desde, hasta = self._rango(q)
        prop = codigos = None
        if q.get("periodo"):
            params = self.params(q["periodo"])
            prop = impuestos.propuesta_f29(lib, params, q["periodo"])
            codigos = {k: v.split(" ")[0] for k, v in impuestos.codigos_f29(params).items() if not k.startswith("_")}
        fd, tmp = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        try:
            reportes.exportar_excel(lib, tmp, desde, hasta, prop, codigos)
        except RuntimeError as e:
            os.unlink(tmp)
            raise ErrorUsuario(str(e))
        with open(tmp, "rb") as f:
            data = f.read()
        os.unlink(tmp)
        return data

    # ---- ajustes
    def utm(self, q, b):
        periodo, valor = b.get("periodo", ""), b.get("valor")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes de la UTM.")
        try:
            valor = int(str(valor).replace(".", "").strip())
        except ValueError:
            raise ErrorUsuario("Escriba la UTM como número, por ejemplo 72151.")
        if not 10000 <= valor <= 1000000:
            raise ErrorUsuario("Ese valor de UTM no parece correcto. Cópielo desde sii.cl > Valores y fechas.")
        guardar_utm_local(self.local, periodo, valor)
        return {"ok": True}

    def integridad(self, lib, q, b):
        return {"problemas": lib.verificar_integridad()}


GLOBAL = {"ping": ("GET", "ping"), "carpeta": ("GET", "info_carpeta"), "empresas": ("GET", "empresas"), "empresa": ("POST", "crear_empresa"), "utm": ("POST", "utm")}
POR_EMPRESA = {
    "resumen": ("GET", "resumen"), "analizar": ("POST", "analizar"), "importar": ("POST", "importar"),
    "catalogo": ("GET", "catalogo"), "movimiento": ("POST", "movimiento"), "anular": ("POST", "anular"),
    "f29": ("GET", "f29"), "f29-confirmar": ("POST", "f29_confirmar"), "revision": ("GET", "revision"),
    "cerrar": ("POST", "cerrar"), "diario": ("GET", "diario"), "mayor": ("GET", "mayor"),
    "balance": ("GET", "balance"), "resultados": ("GET", "resultados"), "documentos": ("GET", "documentos"),
    "excel": ("GET", "excel"), "integridad": ("GET", "integridad"),
}


def crear_manejador(app: App, puerto_ref: list):
    class Manejador(BaseHTTPRequestHandler):
        server_version = "contasii"

        def log_message(self, *a):
            pass

        def _host_ok(self):
            host = (self.headers.get("Host") or "").split(":")[0]
            return host in ("127.0.0.1", "localhost")

        def _enviar(self, codigo, cuerpo: bytes, tipo="application/json; charset=utf-8", extra=None):
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(cuerpo)

        def _json(self, codigo, obj):
            self._enviar(codigo, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

        def _manejar(self, metodo):
            if not self._host_ok():
                return self._enviar(403, b"forbidden", "text/plain")
            url = urlparse(self.path)
            if metodo == "GET" and url.path in ("/", "/index.html"):
                with open(HTML, "rb") as f:
                    return self._enviar(200, f.read(), "text/html; charset=utf-8",
                                        {"Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                                                                    "script-src 'self' 'unsafe-inline'; img-src 'self' data:"})
            if not url.path.startswith("/api/"):
                return self._enviar(404, b"no encontrado", "text/plain")
            if metodo == "POST" and self.headers.get("X-Contasii") != "1":
                return self._enviar(403, b"forbidden", "text/plain")  # evita envíos desde otros sitios
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            b = {}
            if metodo == "POST":
                largo = int(self.headers.get("Content-Length") or 0)
                if largo > 30 * 1024 * 1024:
                    return self._json(413, {"error": "El archivo es demasiado grande."})
                try:
                    b = json.loads(self.rfile.read(largo) or b"{}")
                except json.JSONDecodeError:
                    return self._json(400, {"error": "Solicitud inválida."})
            partes = url.path.strip("/").split("/")[1:]  # sin 'api'
            try:
                with app.lock:
                    if len(partes) == 1 and partes[0] in GLOBAL and GLOBAL[partes[0]][0] == metodo:
                        res = getattr(app, GLOBAL[partes[0]][1])(q, b)
                    elif len(partes) == 3 and partes[0] == "e" and partes[2] in POR_EMPRESA \
                            and POR_EMPRESA[partes[2]][0] == metodo:
                        lib = app.libro(partes[1])
                        try:
                            res = getattr(app, POR_EMPRESA[partes[2]][1])(lib, q, b)
                        finally:
                            lib.con.close()
                    else:
                        return self._json(404, {"error": "Ruta no encontrada."})
                if isinstance(res, bytes):
                    nombre = f"contabilidad_{partes[1].replace('.db', '')}_{q.get('periodo') or 'todo'}.xlsx"
                    return self._enviar(200, res, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                        {"Content-Disposition": f'attachment; filename="{nombre}"'})
                return self._json(200, res)
            except (ErrorUsuario, ErrorContable, ParametroFaltante, rutmod.RutInvalido) as e:
                return self._json(400, {"error": str(e)})
            except Exception as e:  # error inesperado: se informa sin detener el programa
                traceback.print_exc()
                return self._json(500, {"error": f"Error inesperado: {e}"})

        def do_GET(self):
            self._manejar("GET")

        def do_POST(self):
            self._manejar("POST")

    return Manejador


def servidor(carpeta: str, puerto: int = 8765):
    app = App(carpeta)
    ref = [puerto]
    for p in range(puerto, puerto + 20):
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", p), crear_manejador(app, ref))
            ref[0] = p
            return srv, p
        except OSError:
            continue
    raise OSError("No hay un puerto libre entre 8765 y 8784.")


def carpeta_por_defecto() -> str:
    """Donde se guardan las empresas.

    En el programa instalado (.exe) va a Documentos\\Mi Contabilidad, fuera de la
    carpeta del programa, para que sobreviva a actualizaciones y desinstalaciones.
    Ejecutado desde el código fuente, queda en contabilidad-sii/mis_empresas.
    """
    if getattr(sys, "frozen", False):
        return os.path.join(os.path.expanduser("~"), "Documents", "Mi Contabilidad")
    return os.path.join(os.path.dirname(AQUI), "mis_empresas")


def ya_abierto(puerto: int) -> bool:
    """True si ya hay un programa de contabilidad respondiendo en ese puerto."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{puerto}/api/ping", timeout=1) as r:
            return json.loads(r.read()).get("app") == "contasii"
    except Exception:
        return False


def main(argv=None):
    import argparse
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="Abre la contabilidad en el navegador")
    ap.add_argument("--carpeta", default=carpeta_por_defecto(), help="carpeta donde se guardan las empresas")
    ap.add_argument("--puerto", type=int, default=8765)
    ap.add_argument("--no-abrir", action="store_true", help="no abrir el navegador automáticamente")
    a = ap.parse_args(argv)
    if ya_abierto(a.puerto):
        # Doble clic con el programa ya abierto: solo se muestra de nuevo en el navegador.
        if not a.no_abrir:
            webbrowser.open(f"http://127.0.0.1:{a.puerto}/")
        print("La contabilidad ya estaba abierta; se mostró en su navegador.")
        return 0
    srv, p = servidor(a.carpeta, a.puerto)
    url = f"http://127.0.0.1:{p}/"
    print("=" * 60)
    print(" MI CONTABILIDAD - abierta en su navegador")
    print(f" Si no se abrio sola, copie esta direccion en el navegador: {url}")
    print(f" Sus datos se guardan en: {os.path.abspath(a.carpeta)}")
    print(" NO CIERRE esta ventana mientras trabaja. Para salir, cierrela.")
    print("=" * 60)
    if not a.no_abrir:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
