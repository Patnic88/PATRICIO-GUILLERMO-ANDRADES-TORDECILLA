import base64
import html
import json
import os
import re
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from contasii import rcv, sii_dte, sii_ws, web
from contasii.libro import Libro

try:
    from test_sii_ws import HAY_CRYPTO, SIISimulado, certificado_prueba, respuesta_soap
except ImportError:  # ejecutado como paquete
    from tests.test_sii_ws import HAY_CRYPTO, SIISimulado, certificado_prueba, respuesta_soap

EJ = os.path.join(os.path.dirname(__file__), "..", "ejemplos")


class SIIConEstado(SIISimulado):
    """Añade QueryEstDte: responde DOK salvo folios terminados en 2 (FAU) o 4 (MMC); token fijo."""
    consultas = []

    def do_POST(self):
        if not self.path.endswith("QueryEstDte.jws"):
            return super().do_POST()
        cuerpo = self.rfile.read(int(self.headers["Content-Length"])).decode()
        p = dict(re.findall(r"<(\w+) xsi:type=\"xsd:string\">(.*?)</\1>", cuerpo))
        SIIConEstado.consultas.append(p)
        if p.get("Token") != "ABCDEFGHIJ12":
            hdr = "<ESTADO>001</ESTADO><GLOSA>TOKEN NO EXISTE</GLOSA>"
        else:
            estado = {"2": "FAU", "4": "MMC"}.get(p["FolioDte"][-1], "DOK")
            hdr = (f"<ESTADO>{estado}</ESTADO><GLOSA>DTE Recibido</GLOSA><ERR_CODE>0</ERR_CODE>"
                   f"<GLOSA_ERR>x</GLOSA_ERR><NUM_ATENCION>532   ( 2026/10/12 10:00:00)</NUM_ATENCION>")
        interno = f'<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR>{hdr}</SII:RESP_HDR></SII:RESPUESTA>'
        datos = respuesta_soap("getEstDte", interno).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/xml")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)


@unittest.skipUnless(HAY_CRYPTO, "requiere la librería cryptography")
class TestEstadoDTE(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pfx, _, _ = certificado_prueba()
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), SIIConEstado)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.ambientes = dict(sii_ws.AMBIENTES)
        sii_ws.AMBIENTES["certificacion"] = f"http://127.0.0.1:{cls.srv.server_address[1]}/DTEWS"

    @classmethod
    def tearDownClass(cls):
        sii_ws.AMBIENTES.clear()
        sii_ws.AMBIENTES.update(cls.ambientes)
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self):
        SIIConEstado.consultas = []
        self.tmp = tempfile.TemporaryDirectory()
        self.lib = Libro(os.path.join(self.tmp.name, "t.db"))
        self.lib.inicializar("76111111-6", "EMPRESA", "empresa", "14D3")
        rcv.importar(self.lib, os.path.join(EJ, "rcv_compras_2026-10.csv"), "compra", "2026-10")
        rcv.importar(self.lib, os.path.join(EJ, "rcv_ventas_2026-10.csv"), "venta", "2026-10")

    def tearDown(self):
        self.lib.con.close()
        self.tmp.cleanup()

    def test_consulta_unitaria_parametros(self):
        r = sii_dte.consultar("ABCDEFGHIJ12", "11.111.111-1", "77444444-0", "76111111-6", 33, "501",
                              "2026-10-05", 5950000)
        self.assertEqual((r["estado"], r["nivel"]), ("DOK", "ok"))
        p = SIIConEstado.consultas[-1]
        self.assertEqual((p["RutConsultante"], p["DvConsultante"], p["RutCompania"], p["DvCompania"]),
                         ("11111111", "1", "77444444", "0"))
        self.assertEqual((p["RutReceptor"], p["TipoDte"], p["FolioDte"], p["MontoDte"]), ("76111111", "33", "501", "5950000"))
        self.assertEqual(p["FechaEmisionDte"], "05102026")  # DDMMAAAA, según el manual

    def test_token_rechazado(self):
        with self.assertRaises(sii_dte.ErrorConsulta) as e:
            sii_dte.consultar("MALO", "11111111-1", "77444444-0", "76111111-6", 33, "1", "2026-10-05", 1)
        self.assertIn("TOKEN NO EXISTE", str(e.exception))

    def test_emisor_y_receptor_segun_libro(self):
        docs = {(d["libro"], d["folio"]): d for d in sii_dte.documentos_consultables(self.lib, "2026-10")}
        venta, compra = docs[("venta", "501")], docs[("compra", "1001")]
        self.assertEqual((venta["emisor"], venta["receptor"]), ("76111111-6", "77444444-0"))
        self.assertEqual((compra["emisor"], compra["receptor"]), ("76111111-6", "76111111-6"))  # proveedor ficticio = mismo RUT
        self.assertEqual(len(docs), 8)

    def test_consulta_periodo_guarda_historial(self):
        r = sii_dte.consultar_periodo(self.lib, "2026-10", self.pfx, "clave123", "11111111-1", libro_doc="venta")
        estados = {d["folio"]: d["estado"] for d in r["resultados"]}
        self.assertEqual(estados, {"501": "DOK", "502": "FAU", "503": "DOK", "504": "MMC"})
        self.assertEqual(r["resumen"], {"ok": 2, "revisar": 1, "problema": 1, "error": 0})
        ult = sii_dte.ultimos_estados(self.lib, "2026-10")
        self.assertEqual(len(ult), 4)
        self.assertEqual(self.lib.verificar_integridad(), [])  # la consulta no toca la contabilidad

    def test_rut_consultante_invalido(self):
        with self.assertRaises(sii_dte.ErrorConsulta):
            sii_dte.consultar_periodo(self.lib, "2026-10", self.pfx, "clave123", "11111111-2")

    def test_endpoint_web(self):
        carpeta = tempfile.TemporaryDirectory()
        srv, puerto = web.servidor(carpeta.name, 18965)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            def req(ruta, cuerpo=None):
                h = {"Content-Type": "application/json", "X-Contasii": "1"}
                r = urllib.request.Request(f"http://127.0.0.1:{puerto}/api/{ruta}", headers=h,
                                           data=None if cuerpo is None else json.dumps(cuerpo).encode())
                try:
                    with urllib.request.urlopen(r) as x:
                        return x.status, json.loads(x.read())
                except urllib.error.HTTPError as e:
                    return e.code, json.loads(e.read())
            st, r = req("empresa", {"rut": "76111111-6", "nombre": "E", "regimen": "14D3"})
            e = f"e/{r['archivo']}"
            for f, libro in (("rcv_ventas_2026-10.csv", "venta"),):
                with open(os.path.join(EJ, f), "rb") as fh:
                    req(f"{e}/importar", {"contenido": base64.b64encode(fh.read()).decode(), "periodo": "2026-10",
                                          "tipo": libro})
            cuerpo = {"periodo": "2026-10", "pfx": base64.b64encode(self.pfx).decode(), "clave": "clave123",
                      "rut_consultante": "11111111-1", "ambiente": "certificacion"}
            st, r = req(f"{e}/sii-estado", cuerpo)
            self.assertEqual(st, 200, r)
            self.assertEqual(r["resumen"]["ok"], 2)
            st, r = req(f"{e}/sii-estados?periodo=2026-10")
            self.assertEqual(len(r["estados"]), 4)
            st, r = req(f"{e}/sii-estado", {**cuerpo, "periodo": "2026-09"})
            self.assertEqual(st, 400)  # sin documentos en ese mes
        finally:
            srv.shutdown()
            srv.server_close()
            carpeta.cleanup()


if __name__ == "__main__":
    unittest.main()
