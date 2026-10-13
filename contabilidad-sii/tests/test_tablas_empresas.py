"""Carga de planillas y tablas (Excel, HTML, texto pegado), boletas a mano y eliminación de empresas."""

import base64
import io
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from contasii import rcv, tablas, web

EJ = os.path.join(os.path.dirname(__file__), "..", "ejemplos")


def leer(nombre):
    with open(os.path.join(EJ, nombre), encoding="utf-8") as f:
        return f.read()


HTML_BOLETAS = """<html><body><h1>Informe de boletas</h1>
<table><tr><td>Contribuyente: EMPRESA DEMO</td></tr></table>
<table border=1>
<tr><th>N&deg; Boleta</th><th>Fecha</th><th>Estado</th><th>Rut Emisor</th><th>Nombre o Raz&oacute;n Social</th>
<th>Brutos</th><th>Retenido</th><th>Pagado</th></tr>
<tr><td>45</td><td>08/10/2026</td><td>VIGENTE</td><td>12.345.678-5</td><td>PROFESIONAL UNO</td><td>$ 500.000</td><td>$ 76.250</td><td>$ 423.750</td></tr>
<tr><td>46</td><td>22/10/2026</td><td>ANULADA</td><td>15555555-6</td><td>PROFESIONAL DOS</td><td>300.000</td><td>45.750</td><td>254.250</td></tr>
<tr><td>Totales</td><td></td><td></td><td></td><td></td><td>$ 800.000</td><td>$ 122.000</td><td>$ 678.000</td></tr>
</table></body></html>"""


class TestTablas(unittest.TestCase):
    def test_csv_del_sii_no_se_toca(self):
        texto = leer("rcv_compras_2026-10.csv")
        self.assertEqual(tablas.a_csv("x.csv", texto.encode("utf-8")), texto)

    def test_html_con_titulo_y_totales(self):
        csv = tablas.a_csv("informe.xls", HTML_BOLETAS.encode("latin-1"))
        lineas = csv.strip().splitlines()
        self.assertEqual(lineas[0], "N° Boleta;Fecha;Estado;Rut Emisor;Nombre o Razón Social;Brutos;Retenido;Pagado")
        self.assertEqual(len(lineas), 3)  # se descartan títulos y la fila de totales
        info = web.detectar_archivo(csv)
        self.assertEqual((info["tipo"], info["documentos"], info["total"]), ("honorario_recibido", 1, 500000))

    def test_tabla_pegada_con_tabuladores_y_titulo(self):
        pegado = ("Boletas recibidas octubre 2026\n\n"
                  "N° Boleta\tFecha\tEstado\tRut Emisor\tNombre o Razón Social\tBrutos\tRetenido\tPagado\n"
                  "45\t08/10/2026\tVIGENTE\t12345678-5\tPROFESIONAL UNO\t$500.000\t$76.250\t$423.750\n")
        info = web.detectar_archivo(tablas.a_csv("Tabla pegada", pegado.encode("utf-8")))
        self.assertEqual((info["documentos"], info["total"]), (1, 500000))

    def test_xlsx(self):
        try:
            import openpyxl
        except ImportError:
            self.skipTest("sin openpyxl")
        from datetime import datetime
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Informe"])
        ws.append([])
        ws.append(["N° Boleta", "Fecha", "Estado", "Rut Emisor", "Nombre o Razón Social", "Brutos", "Retenido", "Pagado"])
        ws.append([45, datetime(2026, 10, 8), "VIGENTE", "12345678-5", "PROFESIONAL UNO", 500000, 76250, 423750])
        b = io.BytesIO()
        wb.save(b)
        csv = tablas.a_csv("boletas.xlsx", b.getvalue())
        self.assertIn("45;08/10/2026;VIGENTE;12345678-5;PROFESIONAL UNO;500000;76250;423750", csv)
        self.assertEqual(web.detectar_archivo(csv)["documentos"], 1)

    def test_excel_antiguo_pide_guardar_como(self):
        with self.assertRaises(tablas.ErrorTabla) as cm:
            tablas.a_csv("viejo.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 100)
        self.assertIn("Guardar como", str(cm.exception))

    def test_montos_con_signo_peso(self):
        self.assertEqual(rcv._entero("$ 1.234.567"), 1234567)
        self.assertEqual(rcv._entero("$500.000"), 500000)
        self.assertEqual(rcv._entero("-$ 1.000"), -1000)


# Estructura del informe mensual de boletas recibidas del SII («Ver informe como planilla
# electrónica», informeMensualREC.xls) según fuentes secundarias: Erin3012/icontador (PR 15,
# tools/test-honorarios.cjs) y crilam/mcp-sii (tests/fixtures). Tabla HTML en ISO-8859-1. [VERIFICAR]
PLANILLA_REC = """<html><body><table>
<tr><td colspan=10>Contribuyente: EMPRESA DEMO<br>RUT : 76.111.111-6<br>Informe correpondiente al mes  10 del a&ntilde;o 2026</td></tr>
<tr><td colspan=4><strong>Boleta</strong></td><td colspan=3><strong>Emisor</strong></td><td colspan=3><strong>Honorarios</strong></td></tr>
<tr><td><strong>N&deg;</strong></td><td><strong>Fecha</strong></td><td><strong>Estado</strong></td><td><strong>Fecha Anulaci&oacute;n</strong></td>
<td><strong>Rut</strong></td><td><strong>Nombre o Raz&oacute;n&nbsp;Social</strong></td><td><strong>Soc. Prof.</strong></td>
<td><strong>Brutos</strong></td><td><strong>Retenido</strong></td><td><strong>Pagado</strong></td></tr>
<tr><td>45</td><td>08/10/2026</td><td>VIGENTE</td><td></td><td>12345678-5</td><td>PROFESIONAL &Ntilde;U&Ntilde;OA</td><td>NO</td>
<td><div align=right>500000</div></td><td><div align=right>76250</div></td><td><div align=right>423750</div></td></tr>
<tr><td>46</td><td>09/10/2026</td><td>ANULADA</td><td>20/10/2026</td><td>15555555-6</td><td>PROFESIONAL DOS</td><td>NO</td>
<td>300000</td><td>45750</td><td>254250</td></tr>
<tr><td>47</td><td>10/10/2026</td><td>VIGENTE CON SOLICITUD DE ANULACION PENDIENTE</td><td></td><td>15555555-6</td><td>PROFESIONAL DOS</td><td>NO</td>
<td>100000</td><td>15250</td><td>84750</td></tr>
<tr><td colspan=7>Totales* :</td><td>600000</td><td>91500</td><td>508500</td></tr>
<tr><td colspan=10>(*) Los valores totales no consideran los montos de las boletas anuladas.</td></tr>
</table></body></html>"""

# Informe mensual de boletas EMITIDAS tal como se ve en pantalla (crilam/mcp-sii, tests/fixtures/bhe-informe-mensual.html):
# dos columnas «Fecha», «Ret. Emisor», «Ret. Receptor» y «Líquidos». [VERIFICAR]
PANTALLA_EMI = """<table><tr><td colspan=5>Boleta</td><td colspan=3>Emisión</td><td colspan=2>Receptor</td><td colspan=4>Honorarios</td></tr>
<tr><td>Ver</td><td>Mail</td><td>N°</td><td>Estado</td><td>Fecha</td><td>Usuario</td><td>Fecha</td><td>Soc. Prof.</td><td>Rut</td>
<td>Nombre o Razón Social</td><td>Brutos</td><td>Ret. Emisor</td><td>Ret. Receptor</td><td>Líquidos</td></tr>
<tr><td>ver</td><td></td><td>101</td><td>VIGENTE</td><td>05/10/2026</td><td>76111111-6</td><td>06/10/2026</td><td>NO</td><td>77444444-0</td>
<td>CLIENTE SPA</td><td>1.000.000</td><td>0</td><td>152.500</td><td>847.500</td></tr>
<tr><td>ver</td><td></td><td>102</td><td>VIGENTE</td><td>07/10/2026</td><td>76111111-6</td><td>07/10/2026</td><td>NO</td><td></td>
<td>EMITIDA SIN RECEPTOR</td><td>200.000</td><td>30.500</td><td>0</td><td>169.500</td></tr>
<tr><td colspan=10>Totales* :</td><td>1.200.000</td><td>30.500</td><td>152.500</td><td>1.017.000</td></tr></table>"""


class TestInformesSII(unittest.TestCase):
    def test_planilla_de_recibidas(self):
        csv = tablas.a_csv("informeMensualREC.xls", PLANILLA_REC.encode("latin-1"))
        info = web.detectar_archivo(csv)
        # 45 y 47 (VCA sigue vigente); 46 anulada; sin totales ni nota al pie
        self.assertEqual((info["tipo"], info["documentos"], info["total"], info["mes_sugerido"]),
                         ("honorario_recibido", 2, 600000, "2026-10"))

    def test_recibidas_en_pantalla_con_ver_y_boton_boleta(self):
        pantalla = ("Boleta\tEmisor\tHonorarios\tObservar\n"
                    "Ver\tN°\tEstado\tFecha\tRut\tNombre o Razón Social\tSoc. Prof.\tBrutos\tRetenido\tPagado\tBoleta\n"
                    "ver\t45\tVIGENTE\t08/10/2026\t12.345.678-5\tPROFESIONAL UNO\tNO\t500.000\t76.250\t423.750\tIR\n")
        info = web.detectar_archivo(tablas.a_csv("Tabla pegada", pantalla.encode("utf-8")))
        self.assertEqual((info["documentos"], info["total"]), (1, 500000))

    def test_n_ordinal(self):
        csv = tablas.a_csv("x.xls", PLANILLA_REC.replace("N&deg;", "N&ordm;").encode("latin-1"))
        self.assertEqual(web.detectar_archivo(csv)["documentos"], 2)

    def test_linea_de_comandos_con_planilla_del_sii(self):
        from contasii import cli
        from contasii.libro import Libro
        with tempfile.TemporaryDirectory() as d:
            db, xls = os.path.join(d, "e.db"), os.path.join(d, "informeMensualREC.xls")
            with open(xls, "wb") as f:
                f.write(PLANILLA_REC.encode("latin-1"))
            self.assertEqual(cli.main(["--db", db, "init", "--rut", "76111111-6", "--razon", "DEMO", "--tipo", "empresa",
                                       "--regimen", "14D3"]), 0)
            self.assertEqual(cli.main(["--db", db, "importar-honorarios", xls, "--sentido", "recibido",
                                       "--periodo", "2026-10"]), 0)
            lib = Libro(db)
            filas = lib.con.execute("SELECT folio, fuente FROM documento ORDER BY folio").fetchall()
            lib.con.close()
            self.assertEqual([(r[0], r[1]) for r in filas], [("45", xls), ("47", xls)])

    def test_sin_datos(self):
        html = PLANILLA_REC.split("<tr><td>45</td>")[0] + "<tr><td colspan=10>Sin Datos</td></tr></table></body></html>"
        self.assertEqual(web.detectar_archivo(tablas.a_csv("x.xls", html.encode("latin-1")))["documentos"], 0)


class TestWebNuevo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.srv, self.puerto = web.servidor(self.tmp.name, 18960)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        self.tmp.cleanup()

    def req(self, ruta, cuerpo=None):
        h = {"Content-Type": "application/json"}
        if cuerpo is not None:
            h["X-Contasii"] = "1"
        r = urllib.request.Request(f"http://127.0.0.1:{self.puerto}/api/{ruta}", headers=h,
                                   data=None if cuerpo is None else json.dumps(cuerpo).encode())
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def empresa(self, rut="76.111.111-6"):
        st, r = self.req("empresa", {"rut": rut, "nombre": "DEMO " + rut, "regimen": "14D3"})
        self.assertEqual(st, 200, r)
        return r["archivo"]

    def test_importar_html_y_corregir_tipo(self):
        e = "e/" + self.empresa()
        c = base64.b64encode(HTML_BOLETAS.encode("latin-1")).decode()
        st, r = self.req(e + "/analizar", {"contenido": c, "nombre": "informe.xls"})
        self.assertEqual((st, r["tipo"], r["documentos"]), (200, "honorario_recibido", 1))
        st, r = self.req(e + "/importar", {"contenido": c, "nombre": "informe.xls", "periodo": "2026-10",
                                           "tipo": "honorario_emitido"})
        self.assertEqual((st, r["importados"], r["anuladas"]), (200, 1, 1))
        st, d = self.req(e + "/documentos?periodo=2026-10")
        self.assertEqual([x["libro"] for x in d["documentos"]], ["honorario_emitido"])
        st, r = self.req(e + "/importar", {"contenido": c, "nombre": "x", "periodo": "2026-10", "tipo": "otro"})
        self.assertEqual(st, 400)

    def test_importar_planilla_y_emitidas_del_sii(self):
        e = "e/" + self.empresa()
        c = base64.b64encode(PLANILLA_REC.encode("latin-1")).decode()
        st, r = self.req(e + "/importar", {"contenido": c, "nombre": "informeMensualREC.xls", "periodo": "2026-10"})
        self.assertEqual((st, r["importados"], r["anuladas"]), (200, 2, 1), r)
        self.assertTrue(any("solicitud de anulación pendiente" in a for a in r["alertas"]))
        st, d = self.req(e + "/documentos?periodo=2026-10")
        self.assertEqual(sorted((x["folio"], x["razon_social"]) for x in d["documentos"]),
                         [("45", "PROFESIONAL ÑUÑOA"), ("47", "PROFESIONAL DOS")])

        c = base64.b64encode(PANTALLA_EMI.encode("utf-8")).decode()
        st, a = self.req(e + "/analizar", {"contenido": c, "nombre": "emitidas.html"})
        self.assertEqual((a["tipo"], a["documentos"]), ("honorario_emitido", 2))
        st, r = self.req(e + "/importar", {"contenido": c, "nombre": "emitidas.html", "periodo": "2026-10"})
        self.assertEqual((st, r["importados"]), (200, 2), r)
        self.assertTrue(any("sin RUT de receptor" in x for x in r["alertas"]))
        self.assertTrue(any("retención a cargo del emisor" in x for x in r["alertas"]))
        st, d = self.req(e + "/documentos?periodo=2026-10")
        emi = {x["folio"]: x for x in d["documentos"] if x["libro"] == "honorario_emitido"}
        self.assertEqual((emi["101"]["fecha"], emi["101"]["retencion"], emi["101"]["total"]), ("2026-10-05", 152500, 847500))
        self.assertEqual((emi["102"]["rut_contraparte"], emi["102"]["retencion"], emi["102"]["total"]), ("", 0, 200000))

    def test_boleta_manual(self):
        e = "e/" + self.empresa()
        base = {"periodo": "2026-10", "sentido": "recibido", "folio": "77", "fecha": "2026-10-15", "rut": "12.345.678-5",
                "nombre": "PROFESIONAL; UNO", "bruto": 500000, "retenido": 76250}
        st, r = self.req(e + "/boleta", base)
        self.assertEqual((st, r["importados"]), (200, 1), r)
        st, r = self.req(e + "/boleta", base)
        self.assertEqual((st, r["importados"], r["duplicados"]), (200, 0, 1))
        st, d = self.req(e + "/documentos?periodo=2026-10")
        doc = d["documentos"][0]
        self.assertEqual((doc["folio"], doc["bruto"], doc["retencion"], doc["total"], doc["razon_social"]),
                         ("77", 500000, 76250, 423750, "PROFESIONAL, UNO"))
        st, res = self.req(e + "/resumen?periodo=2026-10")
        self.assertEqual(res["documentos"]["honorario_recibido"]["n"], 1)
        malos = [({"folio": "A1"}, "número"), ({"rut": "12345678-9"}, "RUT"), ({"fecha": "2026-02-30"}, "fecha"),
                 ({"bruto": 0}, "mayor que cero"), ({"retenido": 600000}, "retención"), ({"sentido": "x"}, "recibió"),
                 ({"nombre": "  "}, "nombre")]
        for cambio, texto in malos:
            with self.subTest(cambio=cambio):
                st, r = self.req(e + "/boleta", {**base, "folio": "78", **cambio})
                self.assertEqual(st, 400)
                self.assertIn(texto, r["error"])

    def test_eliminar_restaurar_y_borrar(self):
        a = self.empresa("76.111.111-6")
        b = self.empresa("77.444.444-0")
        st, r = self.req("empresa-eliminar", {"archivo": a})
        self.assertEqual(st, 400)  # sin confirmar
        for malo in ("../x.db", "76111111-6.db/..", "otro.txt"):
            st, r = self.req("empresa-eliminar", {"archivo": malo, "confirmar": malo})
            self.assertEqual(st, 400)
        st, r = self.req("empresa-eliminar", {"archivo": a, "confirmar": a})
        self.assertEqual(st, 200)
        self.assertEqual([x["archivo"] for x in self.req("empresas")[1]["empresas"]], [b])
        st, p = self.req("papelera")
        self.assertEqual([(x["rut"], x["nombre"], x["activa"]) for x in p["papelera"]],
                         [("76.111.111-6", "DEMO 76.111.111-6", False)])
        en_pap = p["papelera"][0]["archivo"]

        # Se crea otra con el mismo RUT: no se puede restaurar encima
        self.empresa("76.111.111-6")
        st, r = self.req("papelera-restaurar", {"archivo": en_pap})
        self.assertEqual(st, 400)
        self.assertIn("activa", r["error"])
        self.req("empresa-eliminar", {"archivo": a, "confirmar": a})
        st, p = self.req("papelera")
        self.assertEqual(len(p["papelera"]), 2)
        st, r = self.req("papelera-restaurar", {"archivo": en_pap})
        self.assertEqual((st, r["archivo"]), (200, a))
        self.assertIn(a, [x["archivo"] for x in self.req("empresas")[1]["empresas"]])

        otra = [x["archivo"] for x in self.req("papelera")[1]["papelera"]][0]
        st, r = self.req("papelera-borrar", {"archivo": otra, "confirmar": "11111111-1"})
        self.assertEqual(st, 400)
        st, r = self.req("papelera-borrar", {"archivo": otra, "confirmar": "76.111.111-6"})
        self.assertEqual(st, 200)
        self.assertEqual(self.req("papelera")[1]["papelera"], [])
        for malo in ("../76111111-6.db", "76111111-6.db"):
            st, r = self.req("papelera-borrar", {"archivo": malo, "confirmar": "76111111-6"})
            self.assertEqual(st, 400)
        self.assertTrue(os.path.exists(os.path.join(self.tmp.name, a)))


if __name__ == "__main__":
    unittest.main()
