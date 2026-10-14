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
        self.lib.con.execute("INSERT INTO estado_sii (documento, ambiente, estado) VALUES (?, 'produccion', 'DOK')",
                             (ids[0],))
        self.lib.con.commit()
        documentos.eliminar(self.lib, ids, "importación deshecha")
        self.assertEqual(self.f29("credito_fiscal"), 0)
        r = rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        self.assertEqual((r.importados, r.duplicados), (4, 0))
        self.assertEqual(sum("estaba borrada (importación deshecha)" in a for a in r.alertas), 4, r.alertas)
        self.assertEqual(sii_dte.ultimos_estados(self.lib, "2026-10"), {})  # el estado era de los datos anteriores
        self.assertEqual(sorted(r.documentos), sorted(ids))  # misma fila, vuelve a estar vigente
        self.assertEqual(self.f29("credito_fiscal"), credito)
        self.assertTrue(self.controles_ok()["IVA de compras"])
        self.assertEqual(self.lib.verificar_integridad(), [])
        r = rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        self.assertEqual((r.importados, r.duplicados), (0, 4))
        # y se puede volver a borrar: solo se anulan los registros nuevos
        r2 = documentos.eliminar(self.lib, ids[:2], "otra vez")
        self.assertEqual(len(r2["contra_asientos"]), 2)
        self.assertEqual(self.lib.verificar_integridad(), [])
        self.assertTrue(self.controles_ok()["IVA de compras"])

    def test_revivido_en_otro_mes_con_el_mes_viejo_cerrado(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        d = self.doc("compra", "1001")["id"]
        documentos.eliminar(self.lib, [d], "mes equivocado")
        self.lib.cerrar_periodo("2026-10")
        r = rcv.importar(self.lib, COMPRAS, "compra", "2026-11")
        self.assertIn(d, r.documentos)
        self.assertEqual(self.doc("compra", "1001")["periodo"], "2026-11")
        res = documentos.eliminar(self.lib, [d], "tampoco era de noviembre")
        a = self.lib.con.execute("SELECT periodo FROM asiento WHERE numero=?", (res["contra_asientos"][0],)).fetchone()
        self.assertEqual(a[0], "2026-11")

    def test_borrado_no_revive_en_centralizacion(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        d = self.doc("compra", "1001")["id"]
        documentos.eliminar(self.lib, [d], "x")
        antes = self.lib.con.execute("SELECT COUNT(*) FROM asiento").fetchone()[0]
        with self.assertRaises(ErrorContable) as cm:
            rcv.importar(self.lib, COMPRAS, "compra", "2026-10", modo="centralizado")
        self.assertIn("impórtela por documento", str(cm.exception))
        self.assertEqual(self.lib.con.execute("SELECT COUNT(*) FROM asiento").fetchone()[0], antes)
        self.assertIsNotNone(self.doc("compra", "1001")["eliminado"])

    def test_ya_borrados_se_saltan(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        a, b = self.doc("compra", "1001")["id"], self.doc("compra", "303")["id"]
        documentos.eliminar(self.lib, [a], "x")
        r = documentos.eliminar(self.lib, [a, b], "deshacer importación")
        self.assertEqual((r["eliminados"], r["ya_borrados"]), (1, 1))

    def test_ids_estrictos(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        for ids in ([True], [2.9], [10 ** 30], [float("inf")], [0], [-1], ["1a"], "1", {"a": 1}, ["²"], ["1" * 5000]):
            with self.subTest(ids=ids):
                with self.assertRaises(ErrorContable):
                    documentos.eliminar(self.lib, ids, "x")
        with self.assertRaises(ErrorContable):
            documentos.eliminar(self.lib, [1], {"a": 1})
        self.assertEqual(documentos.eliminar(self.lib, ["1"], "x")["eliminados"], 1)

    def test_importado_despues_del_f29_se_puede_deshacer(self):
        rcv.importar(self.lib, VENTAS, "venta", "2026-10")
        n = impuestos.contabilizar_f29(self.lib, impuestos.propuesta_f29(self.lib, self.params, "2026-10"))
        r = rcv.importar(self.lib, COMPRAS, "compra", "2026-10")  # por error, después del F29
        self.assertTrue(any(f"ya está registrado (N° {n})" in a and "bórrelos" in a for a in r.alertas), r.alertas)
        self.assertEqual({documentos.entro_en_f29(self.lib, x) for x in self.lib.con.execute(
            "SELECT * FROM documento WHERE libro='compra'")}, {False})
        self.assertEqual({documentos.entro_en_f29(self.lib, x) for x in self.lib.con.execute(
            "SELECT * FROM documento WHERE libro='venta'")}, {True})
        res = documentos.eliminar(self.lib, r.documentos, "importación deshecha")
        self.assertEqual(res["eliminados"], 4)
        venta = self.lib.con.execute("SELECT id FROM documento WHERE libro='venta' LIMIT 1").fetchone()[0]
        with self.assertRaises(ErrorContable) as cm:
            documentos.eliminar(self.lib, [venta], "x")  # esta sí entró en el F29
        self.assertIn(f"asiento N° {n}", str(cm.exception))
        # Revivir un documento borrado en un mes con el F29 registrado avisa y se puede deshacer
        r = rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        self.assertTrue(any("ya está registrado" in a for a in r.alertas))
        self.assertEqual(documentos.eliminar(self.lib, r.documentos, "otra vez")["eliminados"], 4)

    def test_pago_del_f29_posterior_avisa(self):
        rcv.importar(self.lib, VENTAS, "venta", "2026-10")
        impuestos.contabilizar_f29(self.lib, impuestos.propuesta_f29(self.lib, self.params, "2026-10"))
        r = honorarios.importar(self.lib, HONORARIOS, "recibido", "2026-10", self.params)
        operaciones.registrar_pago_f29(self.lib, "2026-11-12", "2026-10", {"retencion_honorarios": 122000})
        res = documentos.eliminar(self.lib, r["documentos"], "x")
        self.assertTrue(any("pago del F29" in a for a in res["alertas"]), res["alertas"])

    def test_legado_con_centralizacion_no_salta_el_f29(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        d = self.doc("compra", "1001")["id"]
        n = self.lib.con.execute("SELECT DISTINCT asiento FROM linea WHERE documento=?", (d,)).fetchone()[0]
        self.lib.anular(n, "2026-10-03", "a mano, versión anterior")
        rcv.importar(self.lib, VENTAS, "venta", "2026-10")
        impuestos.contabilizar_f29(self.lib, impuestos.propuesta_f29(self.lib, self.params, "2026-10"))
        otro = os.path.join(self.tmp.name, "otras.csv")
        with open(COMPRAS, encoding="utf-8") as f:
            lineas = f.read().splitlines()
        with open(otro, "w", encoding="utf-8") as f:  # otras compras del mes, importadas centralizadas
            f.write("\n".join([lineas[0]] + [l.replace(";1001;", ";9001;").replace(";2002;", ";9002;")
                                               .replace(";303;", ";9303;").replace(";55;", ";9055;") for l in lineas[1:]]))
        rcv.importar(self.lib, otro, "compra", "2026-10", modo="centralizado")
        self.assertFalse(documentos.entro_en_f29(self.lib, self.doc("compra", "9001")))
        self.assertTrue(documentos.entro_en_f29(self.lib, self.doc("compra", "1001")))
        centralizados = [x[0] for x in self.lib.con.execute("SELECT id FROM documento WHERE folio LIKE '9%'")]
        with self.assertRaises(ErrorContable):
            documentos.eliminar(self.lib, centralizados + [d], "x")
        self.assertEqual(documentos.eliminar(self.lib, centralizados, "x")["eliminados"], 4)

    def test_f29_con_anulacion_anulada_sigue_registrado(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        rcv.importar(self.lib, VENTAS, "venta", "2026-10")
        n = impuestos.contabilizar_f29(self.lib, impuestos.propuesta_f29(self.lib, self.params, "2026-10"))
        r = self.lib.anular(n, "2026-10-31", "x")
        self.lib.anular(r, "2026-10-31", "era correcto")
        self.assertEqual(documentos.f29_registrado(self.lib, "2026-10"), n)
        with self.assertRaises(ErrorContable):
            documentos.eliminar(self.lib, [self.doc("compra", "1001")["id"]], "x")

    def test_centralizacion_se_borra_entera(self):
        r = rcv.importar(self.lib, COMPRAS, "compra", "2026-10", modo="centralizado")
        ids = [x[0] for x in self.lib.con.execute("SELECT id FROM documento")]
        with self.assertRaises(ErrorContable) as cm:
            documentos.eliminar(self.lib, ids[:2], "x")
        self.assertIn("se borran todas juntas", str(cm.exception))
        res = documentos.eliminar(self.lib, ids, "importada en la empresa equivocada")
        self.assertEqual((res["eliminados"], res["contra_asientos"]), (4, [r.asientos[0] + 1]))
        self.assertEqual(self.f29("credito_fiscal"), 0)
        self.assertTrue(self.controles_ok()["IVA de compras"])
        self.assertEqual(self.lib.verificar_integridad(), [])

    def test_control_de_f29_contado_dos_veces(self):
        rcv.importar(self.lib, VENTAS, "venta", "2026-10")
        n = impuestos.contabilizar_f29(self.lib, impuestos.propuesta_f29(self.lib, self.params, "2026-10"))
        self.assertTrue(self.controles_ok()["F29 registrado una sola vez"])
        self.lib.anular(n, "2026-11-15", "anulado con la fecha de hoy (versión anterior)")
        impuestos.contabilizar_f29(self.lib, impuestos.propuesta_f29(self.lib, self.params, "2026-10"))
        self.assertFalse(self.controles_ok()["F29 registrado una sola vez"])

    def test_avisos_de_f29_confirmado_o_pagado(self):
        honorarios.importar(self.lib, HONORARIOS, "recibido", "2026-10", self.params)
        impuestos.guardar_remanente(self.lib, "2026-10", 0)  # F29 confirmado sin asiento (solo retenciones)
        operaciones.registrar_pago_f29(self.lib, "2026-11-12", "2026-10", {"retencion_honorarios": 122000})
        r = documentos.eliminar(self.lib, [self.doc("honorario_recibido", "45")["id"]], "x")
        self.assertTrue(any("ya se había confirmado y pagado" in a for a in r["alertas"]), r["alertas"])

    def test_aviso_de_f29_siguiente(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        rcv.importar(self.lib, VENTAS, "venta", "2026-11")
        impuestos.guardar_remanente(self.lib, "2026-10", 551000)
        impuestos.contabilizar_f29(self.lib, impuestos.propuesta_f29(self.lib, self.params, "2026-11"))
        r = documentos.eliminar(self.lib, [self.doc("compra", "2002")["id"]], "x")
        self.assertTrue(any("2026-11" in a and "remanente" in a for a in r["alertas"]), r["alertas"])

    def test_boleta_de_honorarios(self):
        r = honorarios.importar(self.lib, HONORARIOS, "recibido", "2026-10", self.params)
        self.assertEqual(len(r["documentos"]), 2)
        self.assertEqual(self.f29("retencion_honorarios"), 76250 + 45750)
        b45 = self.doc("honorario_recibido", "45")
        documentos.eliminar(self.lib, [b45["id"]], "boleta de otro cliente")
        self.assertEqual(self.f29("retencion_honorarios"), 45750)
        r = honorarios.importar(self.lib, HONORARIOS, "recibido", "2026-10", self.params)
        self.assertEqual((r["importados"], r["duplicados"]), (1, 1))
        self.assertTrue(any("Boleta 45 de 12345678-5: estaba borrada (boleta de otro cliente)" in a for a in r["alertas"]))
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
        self.assertEqual((r["contra_asientos"], r["alertas"]), ([], []))
        self.assertEqual(self.lib.con.execute("SELECT asiento_eliminado FROM documento WHERE id=?", (d,)).fetchone()[0], m)
        self.assertEqual(self.lib.con.execute("SELECT COUNT(*) FROM asiento").fetchone()[0], total)

    def test_anulado_a_mano_en_otro_mes_avisa(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        d = self.doc("compra", "303")["id"]
        n = self.lib.con.execute("SELECT DISTINCT asiento FROM linea WHERE documento=?", (d,)).fetchone()[0]
        self.lib.anular(n, "2026-11-15", "a mano, versión anterior")
        r = documentos.eliminar(self.lib, [d], "x")
        self.assertTrue(any("otro mes" in a for a in r["alertas"]), r["alertas"])

    def test_cadena_de_anulaciones(self):
        # Asiento anulado y su anulación anulada (posible en versiones anteriores): el asiento vuelve a estar
        # vigente; al borrar se anula de nuevo y el control de IVA cuadra con toda la cadena.
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        d = self.doc("compra", "1001")["id"]
        n = self.lib.con.execute("SELECT DISTINCT asiento FROM linea WHERE documento=?", (d,)).fetchone()[0]
        r = self.lib.anular(n, "2026-10-03", "x")
        self.lib.anular(r, "2026-10-03", "era correcto")
        self.assertIsNone(self.lib.anulado_por(n))
        res = documentos.eliminar(self.lib, [d], "x")
        self.assertEqual(len(res["contra_asientos"]), 1)
        self.assertEqual(self.lib.anulado_por(n), res["contra_asientos"][0])
        self.assertTrue(self.controles_ok()["IVA de compras"])
        self.assertEqual(self.lib.verificar_integridad(), [])

    def test_no_se_anulan_sueltos(self):
        rcv.importar(self.lib, COMPRAS, "compra", "2026-10")
        d = self.doc("compra", "1001")["id"]
        n = self.lib.con.execute("SELECT DISTINCT asiento FROM linea WHERE documento=?", (d,)).fetchone()[0]
        self.assertIn("Documentos", documentos.motivo_no_anulable(self.lib, n))
        r = documentos.eliminar(self.lib, [d], "x")["contra_asientos"][0]
        self.assertIn("anulación", documentos.motivo_no_anulable(self.lib, r))
        c = rcv.importar(self.lib, VENTAS, "venta", "2026-10", modo="centralizado").asientos[0]
        self.assertIn("centraliza", documentos.motivo_no_anulable(self.lib, c))
        p = operaciones.registrar(self.lib, "gasto_sin_factura", "2026-10-20", 1000, "caja")
        self.assertIsNone(documentos.motivo_no_anulable(self.lib, p))

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


class TestMigracionConcurrente(unittest.TestCase):
    def test_varias_aperturas_a_la_vez(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "vieja.db")
            con = sqlite3.connect(ruta)
            con.executescript("\n".join(l for l in db.ESQUEMA.splitlines() if "eliminado" not in l))
            con.close()
            errores = []

            def abrir():
                for _ in range(15):
                    try:
                        Libro(ruta).con.close()
                    except Exception as e:  # noqa: BLE001
                        errores.append(repr(e))
            hilos = [threading.Thread(target=abrir) for _ in range(4)]
            for h in hilos:
                h.start()
            for h in hilos:
                h.join()
            self.assertEqual([e for e in errores if "duplicate column" in e], [])


class TestCLI(Base):
    def test_listar_y_borrar(self):
        self.lib.con.close()
        def correr(*args):
            out = io.StringIO()
            with redirect_stdout(out):
                codigo = cli.main(["--db", self.db, *args])
            return codigo, out.getvalue()
        self.assertEqual(correr("importar-rcv", COMPRAS, "--libro", "compra", "--periodo", "2026-10")[0], 0)
        self.assertIn("Números internos (para borrar-documento): 1 2 3 4",
                      correr("importar-rcv", VENTAS, "--libro", "venta", "--periodo", "2026-10")[1].replace("5 6 7 8", "1 2 3 4"))
        codigo, texto = correr("documentos", "2026-10")
        self.assertEqual(codigo, 0)
        primera = texto.strip().splitlines()[0]
        doc_id = int(primera.split()[0])
        codigo, texto = correr("borrar-documento", str(doc_id), "--motivo", "prueba")
        self.assertEqual(codigo, 0)
        self.assertIn("1 documento(s) borrado(s)", texto)
        self.assertNotIn(f"{doc_id:>6} ", correr("documentos", "2026-10")[1])
        self.assertIn("BORRADO", correr("documentos", "2026-10", "--borrados")[1])
        otro = int(correr("documentos", "2026-10")[1].strip().splitlines()[0].split()[0])
        self.assertIn("1 ya estaban borrados", correr("borrar-documento", str(doc_id), str(otro), "--motivo", "x")[1])
        # «anular» de la línea de comandos tampoco deja anular sueltos los registros de documentos
        n = cli.Libro(self.db)
        try:
            vigente = n.con.execute("SELECT DISTINCT l.asiento FROM linea l JOIN documento d ON d.id=l.documento "
                                    "WHERE d.eliminado IS NULL").fetchone()[0]
        finally:
            n.con.close()
        self.assertEqual(correr("anular", str(vigente), "--fecha", "2026-10-31", "--motivo", "x")[0], 1)
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
        self.assertFalse(a["anulable"])
        st, r = self.req(e + "/anular", {"numero": a["numero"], "motivo": "x"})
        self.assertEqual(st, 400)
        self.assertIn("Documentos", r["error"])

        st, r = self.req(e + "/documentos-eliminar", {"ids": x["documentos"], "motivo": ""})
        self.assertEqual(st, 400)
        for malo in ({"ids": "1", "motivo": "x"}, {"ids": [True], "motivo": "x"}, {"ids": [10 ** 30], "motivo": "x"},
                     {"ids": [1], "motivo": {"a": 1}}):
            st, r = self.req(e + "/documentos-eliminar", malo)
            self.assertEqual(st, 400, malo)
        for crudo in (b'{"ids":[1e400],"motivo":"x"}', b'[1]', b'{"ids":[' + b"1" * 5000 + b'],"motivo":"x"}'):
            r = urllib.request.Request(f"http://127.0.0.1:{self.puerto}/api/{e}/documentos-eliminar", data=crudo,
                                       headers={"Content-Type": "application/json", "X-Contasii": "1"})
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen(r)
            self.assertEqual(cm.exception.code, 400)
        for numero in (True, 10 ** 30, "x", "²", "1" * 5000):
            self.assertEqual(self.req(e + "/anular", {"numero": numero, "motivo": "x"})[0], 400)
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

    def test_corregir_el_f29_como_indica_la_pantalla(self):
        # Mes pasado con F29 registrado: anularlo en «Pagos y cobros», borrar y volver a confirmar deja un
        # solo F29 en el mes (la anulación se fecha en el mes del F29, no hoy).
        st, r = self.req("empresa", {"rut": "76.999.999-K", "nombre": "DEMO", "regimen": "14D3"})
        e = "e/" + r["archivo"]
        for ruta, nombre in ((COMPRAS, "c.csv"), (VENTAS, "v.csv")):
            with open(ruta, "rb") as f:
                self.req(e + "/importar", {"contenido": base64.b64encode(f.read()).decode(), "nombre": nombre,
                                           "periodo": "2026-09"})
        st, r = self.req(e + "/f29-confirmar", {"periodo": "2026-09"})
        n = r["numero"]
        st, d = self.req(e + "/documentos?periodo=2026-09")
        self.assertEqual(d["f29_asiento"], n)
        st, a = self.req(e + "/anular", {"numero": n, "motivo": "corregir el F29"})
        self.assertEqual(st, 200, a)
        st, dia = self.req(e + "/diario?periodo=2026-09")
        self.assertIn(a["numero"], [x["numero"] for x in dia["asientos"]])  # quedó en septiembre
        compra = [x["id"] for x in d["documentos"] if x["libro"] == "compra"][0]
        self.assertEqual(self.req(e + "/documentos-eliminar", {"ids": [compra], "motivo": "x"})[0], 200)
        st, r = self.req(e + "/f29-confirmar", {"periodo": "2026-09"})
        self.assertEqual(st, 200)
        st, rv = self.req(e + "/revision?periodo=2026-09")
        ok = {c["nombre"]: c["ok"] for c in rv["controles"]}
        self.assertTrue(ok["F29 registrado una sola vez"] and ok["IVA de compras"] and ok["IVA de ventas"], rv)


if __name__ == "__main__":
    unittest.main()
