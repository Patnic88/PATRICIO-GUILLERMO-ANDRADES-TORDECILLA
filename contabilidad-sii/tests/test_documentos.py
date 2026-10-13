"""Borrar documentos y boletas importados: contra-asiento, F29, controles, re-importación y rutas."""

import base64
import io
import json
import os
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from contextlib import redirect_stdout

from contasii import cli, controles, db, documentos, honorarios, impuestos, operaciones, rcv, sii_dte, web
from contasii.libro import Asiento, ErrorContable, Libro, Linea
from contasii.parametros import Parametros

EJ = os.path.join(os.path.dirname(__file__), "..", "ejemplos")
COMPRAS = os.path.join(EJ, "rcv_compras_2026-10.csv")
VENTAS = os.path.join(EJ, "rcv_ventas_2026-10.csv")
HONORARIOS = os.path.join(EJ, "honorarios_recibidos_2026-10.csv")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "76999999-K.db")
        self.lib = Libro(self.db)
        self.lib.inicializar("76999999-K", "EMPRESA PRUEBA", "empresa", "14D3")
        self.params = Parametros(2026)

    def tearDown(self):
        self.lib.con.close()
        self.tmp.cleanup()

    def doc(self, libro, folio):
        return self.lib.con.execute("SELECT * FROM documento WHERE libro=? AND folio=? ORDER BY id DESC",
                                    (libro, folio)).fetchone()

    def f29(self, clave):
        p = impuestos.propuesta_f29(self.lib, self.params, "2026-10")
        return dict((k, v) for k, _, v in p.lineas)[clave]

    def controles_ok(self):
        return {n: ok for n, ok, _ in controles.controles(self.lib, "2026-10")}


class TestEliminar(Base):
    def test_compra_se_anula_y_sale_del_f29(self):
        r = rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        self.assertEqual(len(r.documentos), 4)
        credito_antes = self.f29("credito_fiscal")
        d = self.doc("compra", "1001")
        n_orig = self.lib.con.execute("SELECT DISTINCT asiento FROM linea WHERE documento=?", (d["id"],)).fetchone()[0]

        res = documentos.eliminar(self.lib, [d["id"]], "  importado   por error ")
        self.assertEqual(res["eliminados"], 1)
        contra = res["contra_asientos"][0]
        a = self.lib.con.execute("SELECT * FROM asiento WHERE numero=?", (contra,)).fetchone()
        orig = self.lib.con.execute("SELECT * FROM asiento WHERE numero=?", (n_orig,)).fetchone()
        self.assertEqual((a["anula_a"], a["fecha"], a["periodo"]), (n_orig, orig["fecha"], "2026-10"))
        self.assertIn("Documento borrado: importado por error", a["glosa"])

        d = self.doc("compra", "1001")
        self.assertTrue(d["eliminado"])
        self.assertEqual((d["motivo_eliminado"], d["asiento_eliminado"]), ("importado por error", contra))
        self.assertEqual(self.f29("credito_fiscal"), credito_antes - 190000)
        ok = self.controles_ok()
        self.assertTrue(ok["IVA de compras"])
        self.assertTrue(ok["Integridad del libro"])
        self.assertEqual(self.lib.verificar_integridad(), [])
        # El saldo de proveedores del RUT queda como si no se hubiera importado
        saldo = self.lib.con.execute("SELECT COALESCE(SUM(debe-haber),0) FROM linea WHERE documento=?",
                                     (d["id"],)).fetchone()[0]
        self.assertEqual(saldo, 0)
        self.assertIn("eliminar_documento", [x[0] for x in self.lib.con.execute("SELECT accion FROM bitacora")])

        # Ni la consulta de estado al SII ni el Excel lo incluyen
        self.assertNotIn(d["id"], [x["id"] for x in sii_dte.documentos_consultables(self.lib, "2026-10")])

        # Borrarlo otra vez no hace nada más
        with self.assertRaises(ErrorContable) as cm:
            documentos.eliminar(self.lib, [d["id"]], "otra vez")
        self.assertIn("ya estaba borrada", str(cm.exception))

    def test_reimportar_lo_registra_de_nuevo(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        credito = self.f29("credito_fiscal")
        ids = [d["id"] for d in self.lib.con.execute("SELECT id FROM documento")]
        documentos.eliminar(self.lib, ids, "importación deshecha")
        self.assertEqual(self.f29("credito_fiscal"), 0)
        r = rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        self.assertEqual((r.importados, r.duplicados), (4, 0))
        self.assertEqual(sorted(r.documentos), sorted(ids))  # misma fila, vuelve a estar vigente
        self.assertEqual(self.f29("credito_fiscal"), credito)
        self.assertTrue(self.controles_ok()["IVA de compras"])
        self.assertEqual(self.lib.verificar_integridad(), [])
        r = rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        self.assertEqual((r.importados, r.duplicados), (0, 4))
        # y se puede volver a borrar
        documentos.eliminar(self.lib, ids, "otra vez")
        self.assertEqual(self.f29("credito_fiscal"), 0)

    def test_boleta_de_honorarios(self):
        r = honorarios.importar(self.lib, HONORARIOS, "recibido", "2026-10", self.params)
        self.assertEqual(len(r["documentos"]), 2)
        self.assertEqual(self.f29("retencion_honorarios"), 76250 + 45750)
        b45 = self.doc("honorario_recibido", "45")
        documentos.eliminar(self.lib, [b45["id"]], "boleta de otro cliente")
        self.assertEqual(self.f29("retencion_honorarios"), 45750)
        r = honorarios.importar(self.lib, HONORARIOS, "recibido", "2026-10", self.params)
        self.assertEqual((r["importados"], r["duplicados"]), (1, 1))
        self.assertEqual(self.f29("retencion_honorarios"), 76250 + 45750)
        self.assertEqual(self.lib.verificar_integridad(), [])

    def test_anulada_despues_de_borrada_no_avisa(self):
        t = os.path.join(self.tmp.name, "b.csv")
        enc = "N° Boleta;Fecha;Estado;Rut;Nombre o Razón Social;Brutos;Retenido;Pagado\n"
        with open(t, "w", encoding="utf-8") as f:
            f.write(enc + "47;10/10/2026;VIGENTE CON SOLICITUD DE ANULACION PENDIENTE;12345678-5;P;100000;15250;84750\n")
        honorarios.importar(self.lib, t, "recibido", "2026-10", self.params)
        with open(t, "w", encoding="utf-8") as f:
            f.write(enc + "47;10/10/2026;ANULADA;12345678-5;P;100000;15250;84750\n")
        r = honorarios.importar(self.lib, t, "recibido", "2026-10", self.params)
        self.assertTrue(any("bórrela en «Libros» → «Documentos»" in a for a in r["alertas"]), r["alertas"])
        documentos.eliminar(self.lib, [self.doc("honorario_recibido", "47")["id"]], "anulada en el SII")
        r = honorarios.importar(self.lib, t, "recibido", "2026-10", self.params)
        self.assertFalse(any("ANULADA" in a for a in r["alertas"]), r["alertas"])

    def test_errores(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        d = self.doc("compra", "1001")["id"]
        for ids, motivo, texto in (([d], "  ", "motivo"), ([], "x", "No eligió"), ([999], "x", "No existe"),
                                   (["a"], "x", "no válidos"), (None, "x", "No eligió")):
            with self.subTest(ids=ids, motivo=motivo):
                with self.assertRaises(ErrorContable) as cm:
                    documentos.eliminar(self.lib, ids, motivo)
                self.assertIn(texto, str(cm.exception))
        self.assertIsNone(self.doc("compra", "1001")["eliminado"])

    def test_f29_registrado_bloquea(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        rcv.importar(self.lib, VENTAS, "venta", "2026-10")
        p = impuestos.propuesta_f29(self.lib, self.params, "2026-10")
        n = impuestos.contabilizar_f29(self.lib, p)
        d = self.doc("compra", "1001")["id"]
        with self.assertRaises(ErrorContable) as cm:
            documentos.eliminar(self.lib, [d], "x")
        self.assertIn(f"asiento N° {n}", str(cm.exception))
        self.lib.anular(n, "2026-10-31", "rectificar")
        documentos.eliminar(self.lib, [d], "x")
        self.assertIsNotNone(self.doc("compra", "1001")["eliminado"])

    def test_mes_cerrado_bloquea(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        self.lib.cerrar_periodo("2026-10")
        with self.assertRaises(ErrorContable) as cm:
            documentos.eliminar(self.lib, [self.doc("compra", "1001")["id"]], "x")
        self.assertIn("cerrado", str(cm.exception))

    def test_centralizado_no_se_borra_solo(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10", modo="centralizado")
        with self.assertRaises(ErrorContable) as cm:
            documentos.eliminar(self.lib, [self.doc("compra", "1001")["id"]], "x")
        self.assertIn("centralización", str(cm.exception))

    def test_asiento_ya_anulado_a_mano_no_se_anula_dos_veces(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        d = self.doc("compra", "303")["id"]
        n = self.lib.con.execute("SELECT DISTINCT asiento FROM linea WHERE documento=?", (d,)).fetchone()[0]
        m = self.lib.anular(n, "2026-10-12", "a mano")
        total = self.lib.con.execute("SELECT COUNT(*) FROM asiento").fetchone()[0]
        r = documentos.eliminar(self.lib, [d], "x")
        self.assertEqual(r["contra_asientos"], [m])
        self.assertEqual(self.lib.con.execute("SELECT COUNT(*) FROM asiento").fetchone()[0], total)

    def test_asiento_compartido_se_borra_junto(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        a, b = self.doc("compra", "1001")["id"], self.doc("compra", "303")["id"]
        # Un asiento hecho a mano que apunta a los dos documentos
        self.lib.registrar(Asiento("2026-10-15", "ajuste", lineas=[
            Linea("1.1.02", debe=10, documento=a), Linea("1.1.02", haber=10, documento=b)]))
        with self.assertRaises(ErrorContable) as cm:
            documentos.eliminar(self.lib, [a], "x")
        self.assertIn("bórrelos juntos", str(cm.exception))
        self.assertIsNone(self.doc("compra", "1001")["eliminado"])
        r = documentos.eliminar(self.lib, [a, b], "x")
        self.assertEqual(r["eliminados"], 2)
        self.assertEqual(len(r["contra_asientos"]), 3)  # los dos asientos de las facturas y el ajuste
        self.assertEqual(self.lib.verificar_integridad(), [])

    def test_todo_o_nada(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        a = self.doc("compra", "1001")["id"]
        antes = self.lib.con.execute("SELECT COUNT(*) FROM asiento").fetchone()[0]
        with self.assertRaises(ErrorContable):
            documentos.eliminar(self.lib, [a, 999], "x")
        self.assertEqual(self.lib.con.execute("SELECT COUNT(*) FROM asiento").fetchone()[0], antes)
        self.assertIsNone(self.doc("compra", "1001")["eliminado"])

    def test_avisa_pagos_del_mismo_rut(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        d = self.doc("compra", "303")
        operaciones.registrar(self.lib, "pago_proveedor", "2026-10-20", 150000, "banco", "", d["rut_contraparte"])
        r = documentos.eliminar(self.lib, [d["id"]], "x")
        self.assertEqual(len(r["alertas"]), 1)
        self.assertIn(d["rut_contraparte"], r["alertas"][0])

    def test_excel_no_incluye_borrados(self):
        try:
            import openpyxl
        except ImportError:
            self.skipTest("sin openpyxl")
        from contasii import reportes
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        documentos.eliminar(self.lib, [self.doc("compra", "1001")["id"]], "x")
        ruta = os.path.join(self.tmp.name, "x.xlsx")
        reportes.exportar_excel(self.lib, ruta, "2026-10-01", "2026-10-31")
        wb = openpyxl.load_workbook(ruta)
        folios = [r[4] for r in wb["Compras"].iter_rows(min_row=2, values_only=True)]
        wb.close()
        self.assertNotIn("1001", [str(f) for f in folios])
        self.assertIn("2002", [str(f) for f in folios])


class TestMigracion(unittest.TestCase):
    def test_base_antigua_recibe_las_columnas(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "vieja.db")
            con = sqlite3.connect(ruta)
            esquema = db.ESQUEMA.replace("    eliminado       TEXT,                    -- fecha y hora en que se borró (NULL = vigente)\n", "")
            esquema = esquema.replace("    motivo_eliminado TEXT,\n", "")
            esquema = esquema.replace("    asiento_eliminado INTEGER,               -- contra-asiento que anuló su registro\n", "")
            self.assertNotIn("eliminado", esquema)
            con.executescript(esquema)
            con.close()
            lib = Libro(ruta)
            try:
                cols = {r[1] for r in lib.con.execute("PRAGMA table_info(documento)")}
                self.assertTrue({"eliminado", "motivo_eliminado", "asiento_eliminado"} <= cols)
                lib.inicializar("76999999-K", "X", "empresa", "14D3")
                rcv.importar(lib, COMPRAS, "compra", "2026-10")
                d = lib.con.execute("SELECT id FROM documento LIMIT 1").fetchone()[0]
                documentos.eliminar(lib, [d], "x")
            finally:
                lib.con.close()
            Libro(ruta).con.close()  # abrirla otra vez no vuelve a migrar


class TestCLI(Base):
    def test_listar_y_borrar(self):
        self.lib.con.close()
        def correr(*args):
            out = io.StringIO()
            with redirect_stdout(out):
                codigo = cli.main(["--db", self.db, *args])
            return codigo, out.getvalue()
        self.assertEqual(correr("importar-rcv", COMPRAS, "--libro", "compra", "--periodo", "2026-10")[0], 0)
        codigo, texto = correr("documentos", "2026-10")
        self.assertEqual(codigo, 0)
        primera = texto.strip().splitlines()[0]
        doc_id = int(primera.split()[0])
        codigo, texto = correr("borrar-documento", str(doc_id), "--motivo", "prueba")
        self.assertEqual(codigo, 0)
        self.assertIn("1 documento(s) borrado(s)", texto)
        self.assertNotIn(f"{doc_id:>6} ", correr("documentos", "2026-10")[1])
        self.assertIn("BORRADO", correr("documentos", "2026-10", "--borrados")[1])
        self.lib = Libro(self.db)


class TestRutasWeb(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.srv, self.puerto = web.servidor(self.tmp.name, 18940)
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

    def test_deshacer_importacion_y_documentos(self):
        st, r = self.req("empresa", {"rut": "76.999.999-K", "nombre": "DEMO", "regimen": "14D3"})
        e = "e/" + r["archivo"]
        with open(COMPRAS, "rb") as f:
            c = base64.b64encode(f.read()).decode()
        st, x = self.req(e + "/importar", {"contenido": c, "nombre": "compras.csv", "periodo": "2026-10"})
        self.assertEqual((st, len(x["documentos"])), (200, 4))

        # «Anular» en Pagos y cobros no sirve para un documento: hay que borrarlo
        st, d = self.req(e + "/diario?periodo=2026-10")
        a = d["asientos"][0]
        self.assertTrue(a["de_documento"])
        st, r = self.req(e + "/anular", {"numero": a["numero"], "motivo": "x"})
        self.assertEqual(st, 400)
        self.assertIn("Documentos", r["error"])

        st, r = self.req(e + "/documentos-eliminar", {"ids": x["documentos"], "motivo": ""})
        self.assertEqual(st, 400)
        st, r = self.req(e + "/documentos-eliminar", {"ids": "1", "motivo": "x"})
        self.assertEqual(st, 400)
        st, r = self.req(e + "/documentos-eliminar", {"ids": x["documentos"], "motivo": "Importación deshecha: compras.csv"})
        self.assertEqual((st, r["eliminados"]), (200, 4), r)
        st, d = self.req(e + "/documentos?periodo=2026-10")
        self.assertEqual((d["documentos"], len(d["eliminados"]), d["cerrado"], d["f29_asiento"]), ([], 4, False, None))
        self.assertEqual(d["eliminados"][0]["motivo"], "Importación deshecha: compras.csv")
        st, res = self.req(e + "/resumen?periodo=2026-10")
        self.assertNotIn("compra", res["documentos"])
        st, rv = self.req(e + "/revision?periodo=2026-10")
        self.assertTrue(all(c["ok"] for c in rv["controles"] if c["nombre"] != "Documentos con RUT válido"), rv)

        # Boleta a mano: la respuesta trae su número interno para poder borrarla
        st, b = self.req(e + "/boleta", {"periodo": "2026-10", "sentido": "recibido", "folio": "9", "fecha": "2026-10-05",
                                         "rut": "12.345.678-5", "nombre": "P", "bruto": 100000, "retenido": 15250})
        self.assertEqual((st, len(b["documentos"])), (200, 1))
        st, r = self.req(e + "/documentos-eliminar", {"ids": b["documentos"], "motivo": "a mano por error"})
        self.assertEqual(st, 200)
        st, f = self.req(e + "/f29?periodo=2026-10")
        self.assertEqual({l["clave"]: l["monto"] for l in f["lineas"]}["retencion_honorarios"], 0)


if __name__ == "__main__":
    unittest.main()
