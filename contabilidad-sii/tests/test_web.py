import base64
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from contasii import web

EJ = os.path.join(os.path.dirname(__file__), "..", "ejemplos")


class TestWeb(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.srv, cls.puerto = web.servidor(cls.tmp.name, 18765)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.tmp.cleanup()

    def req(self, ruta, cuerpo=None, cabeceras=None, crudo=False):
        h = {"Content-Type": "application/json"}
        if cuerpo is not None:
            h["X-Contasii"] = "1"
        h.update(cabeceras or {})
        r = urllib.request.Request(f"http://127.0.0.1:{self.puerto}{ruta}", headers=h,
                                   data=None if cuerpo is None else json.dumps(cuerpo).encode())
        try:
            with urllib.request.urlopen(r) as resp:
                data = resp.read()
                return resp.status, (data if crudo else json.loads(data))
        except urllib.error.HTTPError as e:
            data = e.read()
            try:
                return e.code, json.loads(data)
            except json.JSONDecodeError:
                return e.code, data

    @staticmethod
    def b64(nombre):
        with open(os.path.join(EJ, nombre), "rb") as f:
            return base64.b64encode(f.read()).decode()

    def test_flujo_completo(self):
        st, r = self.req("/api/empresa", {"rut": "76111111-5", "nombre": "X", "regimen": "14D3"})
        self.assertEqual(st, 400)  # RUT inválido
        st, r = self.req("/api/empresa", {"rut": "76.111.111-6", "nombre": "DEMO", "regimen": "14D3"})
        self.assertEqual(st, 200)
        e = "/api/e/" + r["archivo"]

        st, r = self.req(e + "/analizar", {"contenido": self.b64("rcv_ventas_2026-10.csv")})
        self.assertEqual((r["tipo"], r["documentos"], r["mes_sugerido"]), ("venta", 4, "2026-10"))
        st, r = self.req(e + "/analizar", {"contenido": self.b64("honorarios_recibidos_2026-10.csv")})
        self.assertEqual((r["tipo"], r["documentos"]), ("honorario_recibido", 2))  # la anulada no cuenta
        for f in ("rcv_compras_2026-10.csv", "rcv_ventas_2026-10.csv", "honorarios_recibidos_2026-10.csv"):
            st, r = self.req(e + "/importar", {"contenido": self.b64(f), "periodo": "2026-10", "nombre": f})
            self.assertEqual(st, 200, r)

        st, r = self.req(e + "/movimiento", {"operacion": "cobro_cliente", "fecha": "2026-10-28", "monto": 5950000,
                                             "medio": "banco", "rut": "77444444-0"})
        self.assertEqual(st, 200, r)
        st, r = self.req(e + "/movimiento", {"operacion": "cobro_cliente", "fecha": "2026-10-28", "monto": 0})
        self.assertEqual(st, 400)

        st, r = self.req(e + "/f29?periodo=2026-10")
        self.assertEqual(r["total"], 874000 + 9875 + 122000)
        self.assertEqual(r["vencimiento"], "2026-11-20")
        st, r = self.req(e + "/f29-confirmar", {"periodo": "2026-10"})
        self.assertEqual(st, 200)
        st, r = self.req(e + "/f29-confirmar", {"periodo": "2026-10"})
        self.assertEqual(st, 400)  # no se registra dos veces

        st, r = self.req(e + "/catalogo")
        pend = {x["clave"]: x["pendiente"] for x in r["pago_f29"]}
        self.assertEqual(pend["iva_por_pagar"], 874000)
        st, r = self.req(e + "/movimiento", {"operacion": "pago_f29", "fecha": "2026-11-15", "periodo": "2026-10",
                                             "montos": pend, "medio": "banco"})
        self.assertEqual(st, 200, r)

        st, r = self.req(e + "/resumen?periodo=2026-10")
        self.assertEqual(r["banco"], 5950000 - (874000 + 9875 + 122000))
        self.assertTrue(r["f29_registrado"])
        st, r = self.req(e + "/revision?periodo=2026-10")
        self.assertTrue(all(c["ok"] for c in r["controles"]))
        st, r = self.req(e + "/cerrar", {"periodo": "2026-10"})
        self.assertEqual(st, 200)
        st, r = self.req(e + "/movimiento", {"operacion": "retiro", "fecha": "2026-10-30", "monto": 1})
        self.assertEqual(st, 400)  # mes cerrado

        st, data = self.req(e + "/excel?periodo=2026-10", crudo=True)
        self.assertEqual(st, 200)
        self.assertEqual(data[:2], b"PK")  # archivo xlsx (zip)

    def test_seguridad(self):
        st, _ = self.req("/api/empresa", {"rut": "1-9"}, {"X-Contasii": ""})
        self.assertEqual(st, 403)  # POST sin cabecera propia (otro sitio web)
        st, _ = self.req("/api/empresas", cabeceras={"Host": "atacante.com"})
        self.assertEqual(st, 403)  # DNS rebinding
        st, r = self.req("/api/e/..%2F..%2Fetc.db/resumen")
        self.assertIn(st, (400, 404))

    def test_archivo_desconocido(self):
        st, r = self.req("/api/empresa", {"rut": "12345678-5", "nombre": "P", "regimen": "PN_HONORARIOS",
                                          "tipo": "persona_natural"})
        e = "/api/e/" + r["archivo"]
        st, r = self.req(e + "/analizar", {"contenido": base64.b64encode(b"a;b\n1;2\n").decode()})
        self.assertEqual(st, 400)
        self.assertIn("No reconozco", r["error"])


if __name__ == "__main__":
    unittest.main()
