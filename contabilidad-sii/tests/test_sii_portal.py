"""Ingreso al portal del SII y descarga del RCV.

Las pruebas con navegador usan Edge o Chrome reales (sin ventana) contra un SII simulado
en 127.0.0.1 que reproduce lo verificado del SII real: la página de ingreso con la
dirección de retorno después de «?», las cookies RUT_NS/DV_NS tras ingresar y la
redirección del RCV a la página de ingreso cuando no hay sesión. Si el computador no
tiene Edge ni Chrome, esas pruebas se omiten.
"""

import base64
import json
import os
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from contasii import navegador, sii_portal, web

EJ = os.path.join(os.path.dirname(__file__), "..", "ejemplos")
TOKEN = "tok-123"


def leer(nombre):
    with open(os.path.join(EJ, nombre), encoding="utf-8") as f:
        return f.read()


class SIISimulado(BaseHTTPRequestHandler):
    pedidos = []

    def log_message(self, *a):
        pass

    def _cookies(self):
        out = {}
        for parte in (self.headers.get("Cookie") or "").split(";"):
            if "=" in parte:
                k, v = parte.strip().split("=", 1)
                out[k] = v
        return out

    def _enviar(self, codigo, cuerpo=b"", tipo="text/html; charset=utf-8", extra=()):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        u = urlparse(self.path)
        base = f"http://{self.headers['Host']}"
        if u.path == "/AUT2000/InicioAutenticacion/IngresoRutClave.html":
            html = """<html><body><form id="myform" method="post" action="/cgi_AUT2000/CAutInicio.cgi">
              <input type="hidden" id="referencia" name="referencia"><input id="rutcntr" name="rutcntr">
              <input id="clave" name="clave" type="password"><button id="bt_ingresar">Ingresar</button></form>
              <script>document.getElementById('referencia').value = location.search.slice(1);</script></body></html>"""
            return self._enviar(200, html.encode())
        if u.path == "/misii":
            return self._enviar(200, b"<html><body>Mi SII</body></html>")
        if u.path == "/consdcvinternetui/":
            if not self._cookies().get("RUT_NS"):
                return self._enviar(302, extra=[("Location", f"{base}/AUT2000/InicioAutenticacion/IngresoRutClave.html?"
                                                             f"{base}/consdcvinternetui/")])
            return self._enviar(200, b'<html><body>RCV <a id="desc" href="/consdcvinternetui/descarga">'
                                     b'Descargar Detalles</a></body></html>')
        if u.path == "/consdcvinternetui/descarga":
            return self._enviar(200, leer("rcv_compras_2026-10.csv").encode("latin-1"), "text/csv",
                                [("Content-Disposition", 'attachment; filename="RCV_COMPRA_REGISTRO_202610.csv"')])
        self._enviar(404, b"no")

    def do_POST(self):
        u = urlparse(self.path)
        largo = int(self.headers.get("Content-Length") or 0)
        crudo = self.rfile.read(largo)
        if u.path == "/cgi_AUT2000/CAutInicio.cgi":
            f = {k: v[0] for k, v in parse_qs(crudo.decode()).items()}
            if f.get("clave") != "buena":
                return self._enviar(200, b"<html><body>Clave incorrecta</body></html>")
            return self._enviar(302, extra=[("Location", unquote(f["referencia"])), ("Set-Cookie", "RUT_NS=76111111; Path=/"),
                                            ("Set-Cookie", "DV_NS=6; Path=/"),
                                            ("Set-Cookie", f"TOKEN={TOKEN}; Path=/; HttpOnly")])
        if u.path.startswith("/consdcvinternetui/services/data/facadeService/"):
            servicio = u.path.rsplit("/", 1)[1]
            cuerpo = json.loads(crudo)
            type(self).pedidos.append((servicio, cuerpo, self._cookies()))
            if self._cookies().get("TOKEN") != TOKEN or cuerpo["metaData"]["conversationId"] != TOKEN:
                return self._enviar(401, b'{"respEstado":{"codRespuesta":99}}', "application/json")
            if cuerpo["data"]["rutEmisor"] == "99999999":
                r = {"respEstado": {"codRespuesta": 2, "msgeRespuesta": "Sin acceso a la empresa"}, "data": None}
                return self._enviar(200, json.dumps(r).encode(), "application/json")
            if servicio == "getDetalleCompraExport":
                r = {"respEstado": {"codRespuesta": 0}, "data": leer("rcv_compras_2026-10.csv").splitlines()}
                return self._enviar(200, json.dumps(r).encode(), "application/json")
            if servicio == "getDetalleVentaExport":
                texto = leer("rcv_ventas_2026-10.csv").replace("CLIENTE UNO", "CLIENTE ÑANDÚ")
                return self._enviar(200, texto.encode("latin-1"), "text/csv")
        self._enviar(404, b"no")


def respuesta(cuerpo, estado=200, url=sii_portal.URL_RCV + "x"):
    if isinstance(cuerpo, (dict, list)):
        cuerpo = json.dumps(cuerpo)
    if isinstance(cuerpo, str):
        cuerpo = cuerpo.encode("utf-8")
    return {"estado": estado, "url": url, "b64": base64.b64encode(cuerpo).decode()}


class TestInterpretar(unittest.TestCase):
    def test_json_con_lineas(self):
        csv = sii_portal.interpretar(respuesta({"respEstado": {"codRespuesta": 0}, "data": ["A;B", "1;2", ""]}))
        self.assertEqual(csv, "A;B\n1;2\n")

    def test_csv_directo_latin1(self):
        csv = sii_portal.interpretar(respuesta("Razón;Folio\r\nÑandú;1\r\n".encode("latin-1")))
        self.assertEqual(csv, "Razón;Folio\nÑandú;1\n")

    def test_sin_documentos(self):
        self.assertIsNone(sii_portal.interpretar(respuesta({"respEstado": {"codRespuesta": 0}, "data": []})))
        self.assertIsNone(sii_portal.interpretar(respuesta({"respEstado": {"codRespuesta": 0}, "data": None})))
        self.assertIsNone(sii_portal.interpretar(respuesta("Nro;Tipo Doc\n")))

    def test_errores(self):
        casos = [
            (respuesta({"respEstado": {"codRespuesta": 3, "msgeRespuesta": "Error X"}, "data": None}), "Error X"),
            (respuesta("{}", 401), "sesión expiró"),
            (respuesta("x", 500), "500"),
            (respuesta("<html>ingrese</html>"), "página"),
            (respuesta("A;B\n1;2", url="https://zeusr.sii.cl/AUT2000/x"), "sesión del SII se cerró"),
            (respuesta({"respEstado": {"codRespuesta": 0}, "data": [{"a": 1}]}), "formato"),
            (respuesta("solo texto\nsin separador"), "CSV"),
        ]
        for resp, texto in casos:
            with self.subTest(texto=texto), self.assertRaises(sii_portal.ErrorPortal) as cm:
                sii_portal.interpretar(resp)
            self.assertIn(texto, str(cm.exception))

    def test_cuerpo_exportacion(self):
        servicio, c = sii_portal.cuerpo_exportacion("T", "76.111.111-6", "2026-10", "venta")
        self.assertEqual(servicio, "getDetalleVentaExport")
        self.assertEqual(c["metaData"]["conversationId"], "T")
        self.assertEqual(c["metaData"]["namespace"], sii_portal.NAMESPACE + "/getDetalleVentaExport")
        self.assertEqual(c["data"], {"rutEmisor": "76111111", "dvEmisor": "6", "ptributario": "202610",
                                     "operacion": "VENTA", "estadoContab": "REGISTRO",
                                     "tokenRecaptcha": "t-o-k-e-n-web", "accionRecaptcha": "RCV_DETV"})
        with self.assertRaises(sii_portal.ErrorPortal):
            sii_portal.cuerpo_exportacion("T", "76111111-6", "2026-10", "honorario")


def hay_navegador():
    try:
        navegador.buscar_navegador()
        return True
    except navegador.ErrorNavegador:
        return False


@unittest.skipUnless(hay_navegador(), "no hay Edge ni Chrome en este computador")
class TestPortalConNavegador(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), SIISimulado)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def portal(self, retorno):
        p = sii_portal.PortalSII(url_ingreso=f"{self.base}/AUT2000/InicioAutenticacion/IngresoRutClave.html?{retorno}",
                                 url_rcv=f"{self.base}/consdcvinternetui/", dominio="127.0.0.1", headless=True)
        self.addCleanup(p.desconectar)
        return p

    def esperar(self, p, estado, segundos=30):
        limite = time.monotonic() + segundos
        archivos = []
        while time.monotonic() < limite:
            e = p.estado()
            archivos += e["archivos"]
            if e["estado"] == estado:
                e["archivos"] = archivos
                return e
            time.sleep(0.3)
        self.fail(f"No se llegó al estado {estado}: {e}")

    def ingresar(self, p, clave):
        tid = p._pestanas()[0]["targetId"]
        p.nav.navegar(tid, p.url_ingreso)  # espera a que cargue la página de ingreso
        p.nav.evaluar(tid, f"document.getElementById('rutcntr').value='76111111-6';"
                           f"document.getElementById('clave').value={json.dumps(clave)};"
                           f"document.getElementById('myform').submit(); 1")

    def test_flujo_completo(self):
        SIISimulado.pedidos.clear()
        p = self.portal(f"{self.base}/consdcvinternetui/")
        self.assertEqual(p.estado()["estado"], "desconectado")
        with self.assertRaises(sii_portal.ErrorPortal):
            p.descargar("76111111-6", "2026-10", "compra")
        self.assertIn(p.conectar()["estado"], ("esperando", "conectado"))
        perfil = p.nav.perfil
        self.assertEqual(self.esperar(p, "esperando")["estado"], "esperando")
        with self.assertRaises(sii_portal.ErrorPortal) as cm:
            p.descargar("76111111-6", "2026-10", "compra")
        self.assertIn("Termine de ingresar", str(cm.exception))

        self.ingresar(p, "mala")  # clave incorrecta: sigue esperando
        time.sleep(1)
        self.assertEqual(p.estado()["estado"], "esperando")

        self.ingresar(p, "buena")
        e = self.esperar(p, "conectado")
        self.assertEqual(e["usuario"], "76.111.111-6")
        self.assertEqual(p.conectar()["estado"], "conectado")  # volver a pulsar no abre otra ventana

        compras = p.descargar("76.111.111-6", "2026-10", "compra")
        self.assertEqual(web.detectar_archivo(compras)["tipo"], "compra")
        self.assertEqual(compras.strip().splitlines(), leer("rcv_compras_2026-10.csv").strip().splitlines())
        servicio, cuerpo, cookies = SIISimulado.pedidos[-1]
        self.assertEqual((servicio, cuerpo["data"]["ptributario"], cookies["TOKEN"]),
                         ("getDetalleCompraExport", "202610", TOKEN))
        ventas = p.descargar("76111111-6", "2026-10", "venta")
        self.assertIn("CLIENTE ÑANDÚ", ventas)
        self.assertEqual(web.detectar_archivo(ventas)["documentos"], 4)
        with self.assertRaises(sii_portal.ErrorPortal) as cm:
            p.descargar("99999999-9", "2026-10", "compra")
        self.assertIn("Sin acceso a la empresa", str(cm.exception))

        # Vía asistida: lo que la persona descarga en la ventana llega al programa
        tid = p._pestana_rcv()
        p.nav.evaluar(tid, "document.getElementById('desc').click(); 1")
        limite, archivos = time.monotonic() + 30, []
        while time.monotonic() < limite and not archivos:
            archivos = p.estado()["archivos"]
            time.sleep(0.3)
        self.assertEqual([a["nombre"] for a in archivos], ["RCV_COMPRA_REGISTRO_202610.csv"])
        self.assertEqual(web.detectar_archivo(web.decodificar(archivos[0]["contenido"]))["documentos"], 4)
        self.assertEqual(p.estado()["archivos"], [])  # se entrega una sola vez

        # La persona recorre otra página del SII en la ventana: sigue conectada y no se la devuelve al RCV;
        # la descarga automática abre el RCV en una pestaña aparte.
        p.nav.navegar(tid, f"{self.base}/misii")
        for _ in range(3):
            self.assertEqual(p.estado()["estado"], "conectado")
            time.sleep(0.3)
        # (Edge abre además su pestaña interna de descargas, que el programa ignora)
        self.assertEqual([x["url"] for x in p._pestanas()], [f"{self.base}/misii"])
        self.assertIsNotNone(p.descargar("76111111-6", "2026-10", "compra"))
        self.assertEqual(len(p._pestanas()), 2)

        p.desconectar()
        self.assertEqual(p.estado()["estado"], "desconectado")
        self.assertFalse(os.path.exists(perfil))

    def test_ingreso_que_termina_en_otra_pagina(self):
        # Como puede pasar con Clave Única: tras ingresar, el SII muestra otra página; el programa abre el RCV.
        p = self.portal(f"{self.base}/misii")
        p.conectar()
        self.ingresar(p, "buena")
        self.assertEqual(self.esperar(p, "conectado", 40)["estado"], "conectado")

    def test_ventana_cerrada_por_la_persona(self):
        p = self.portal(f"{self.base}/consdcvinternetui/")
        p.conectar()
        p.nav.cerrar()
        e = self.esperar(p, "desconectado")
        self.assertIn("Se cerró la ventana", e["mensaje"])


class PortalFalso:
    def __init__(self):
        self.estado_actual = "desconectado"
        self.pedidos = []

    def conectar(self):
        self.estado_actual = "esperando"
        return self.estado()

    def estado(self):
        return {"estado": self.estado_actual, "mensaje": "", "archivos": []}

    def desconectar(self):
        self.estado_actual = "desconectado"
        return self.estado()

    def descargar(self, rut, periodo, libro):
        self.pedidos.append((rut, periodo, libro))
        if libro == "compra":
            return leer("rcv_compras_2026-10.csv")
        raise sii_portal.ErrorPortal("No encontré la sesión del Registro de Compras y Ventas (cookie TOKEN).")


class TestRutasWeb(unittest.TestCase):
    def test_rutas(self):
        import tempfile
        import urllib.error
        import urllib.request
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        falso = PortalFalso()
        srv, puerto = web.servidor(tmp.name, 18900, portal=falso)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)

        def req(ruta, cuerpo=None, cabecera=True):
            h = {"Content-Type": "application/json"}
            if cabecera:
                h["X-Contasii"] = "1"
            r = urllib.request.Request(f"http://127.0.0.1:{puerto}/api/{ruta}", headers=h,
                                       data=None if cuerpo is None else json.dumps(cuerpo).encode())
            try:
                with urllib.request.urlopen(r) as resp:
                    return resp.status, json.loads(resp.read())
            except urllib.error.HTTPError as e:
                return e.code, e.read()

        self.assertEqual(req("sii-portal/estado", {}, cabecera=False)[0], 403)  # sin la cabecera del programa
        self.assertEqual(req("sii-portal/estado")[0], 404)  # GET no permitido
        self.assertEqual(req("sii-portal/conectar", {}), (200, {"estado": "esperando", "mensaje": "", "archivos": []}))
        st, r = req("empresa", {"rut": "76.111.111-6", "nombre": "DEMO", "regimen": "14D3"})
        e = f"e/{r['archivo']}/sii-traer"
        self.assertEqual(req(e, {"periodo": "2026-13"})[0], 400)
        st, r = req(e, {"periodo": "2026-10"})
        self.assertEqual(st, 200)
        compra, venta = r["resultados"]
        self.assertEqual((compra["libro"], compra["analisis"]["tipo"], compra["analisis"]["documentos"]), ("compra", "compra", 4))
        self.assertEqual(web.decodificar(compra["contenido"]).splitlines()[0].split(";")[0], "Nro")
        self.assertIn("TOKEN", venta["error"])
        self.assertEqual(falso.pedidos, [("76111111-6", "2026-10", "compra"), ("76111111-6", "2026-10", "venta")])
        self.assertEqual(req("sii-portal/desconectar", {})[1]["estado"], "desconectado")


if __name__ == "__main__":
    unittest.main()
