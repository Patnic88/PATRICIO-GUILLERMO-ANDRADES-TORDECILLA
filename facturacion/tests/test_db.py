import datetime as dt
import unittest

from facturador import db, automatizacion, documentos
from facturador.db import ErrorValidacion


def cliente_base(**extra):
    datos = {"rut": "76.086.428-5", "razon_social": "Empresa de Prueba SpA",
             "giro": "Servicios", "email": "contacto@prueba.cl"}
    datos.update(extra)
    return datos


class PruebasBase(unittest.TestCase):
    def setUp(self):
        self.conn = db.conectar(":memory:")
        db.guardar_config(self.conn, {"emisor_razon_social": "Estudio A&A",
                                      "emisor_rut": "12.345.678-5", "dias_plazo_pago": "30"})

    def tearDown(self):
        self.conn.close()


class PruebasClientes(PruebasBase):
    def test_crear_y_listar(self):
        c = db.crear_cliente(self.conn, cliente_base())
        self.assertEqual(c["rut"], "76086428-5")
        self.assertEqual(len(db.listar_clientes(self.conn)), 1)
        self.assertEqual(db.listar_clientes(self.conn, buscar="Prueba")[0]["id"], c["id"])

    def test_rut_invalido(self):
        with self.assertRaises(ErrorValidacion):
            db.crear_cliente(self.conn, cliente_base(rut="76.086.428-6"))

    def test_rut_duplicado(self):
        db.crear_cliente(self.conn, cliente_base())
        with self.assertRaises(ErrorValidacion):
            db.crear_cliente(self.conn, cliente_base(razon_social="Otra"))

    def test_actualizar(self):
        c = db.crear_cliente(self.conn, cliente_base())
        c2 = db.actualizar_cliente(self.conn, c["id"], {"razon_social": "Nueva Razón", "activo": "0"})
        self.assertEqual(c2["razon_social"], "Nueva Razón")
        self.assertEqual(c2["activo"], 0)
        self.assertEqual(c2["rut"], "76086428-5")

    def test_no_eliminar_con_documentos(self):
        c = db.crear_cliente(self.conn, cliente_base())
        db.crear_documento(self.conn, {"tipo": "FACTURA", "cliente_id": c["id"],
                                       "lineas": [{"descripcion": "x", "cantidad": 1,
                                                   "precio_unitario": 10}]})
        with self.assertRaises(ErrorValidacion):
            db.eliminar_cliente(self.conn, c["id"])

    def test_importar_csv(self):
        texto = "RUT;Razón social;Giro;Email\n76.086.428-5;Importada SpA;Asesorías;a@b.cl\n"
        registros = documentos.leer_csv_clientes(texto)
        self.assertEqual(registros[0]["razon_social"], "Importada SpA")
        self.assertEqual(registros[0]["email"], "a@b.cl")
        c = db.crear_cliente(self.conn, registros[0])
        self.assertEqual(c["giro"], "Asesorías")


class PruebasDocumentos(PruebasBase):
    def setUp(self):
        super().setUp()
        self.cliente = db.crear_cliente(self.conn, cliente_base())

    def crear(self, **extra):
        datos = {"tipo": "FACTURA", "cliente_id": self.cliente["id"],
                 "fecha_emision": "2026-10-06",
                 "lineas": [{"descripcion": "Asesoría", "cantidad": 1, "precio_unitario": 100000}]}
        datos.update(extra)
        return db.crear_documento(self.conn, datos)

    def test_borrador_sin_folio_y_totales(self):
        d = self.crear()
        self.assertEqual(d["estado"], "BORRADOR")
        self.assertIsNone(d["folio"])
        self.assertEqual(d["iva"], 19000)
        self.assertEqual(d["total"], 119000)
        self.assertEqual(d["fecha_vencimiento"], "2026-11-05")
        self.assertEqual(d["saldo"], 119000)

    def test_emitir_asigna_folios_consecutivos(self):
        d1 = db.emitir_documento(self.conn, self.crear()["id"])
        d2 = db.emitir_documento(self.conn, self.crear()["id"])
        d3 = db.emitir_documento(self.conn, self.crear(tipo="FACTURA_EXENTA")["id"])
        self.assertEqual((d1["folio"], d2["folio"], d3["folio"]), (1, 2, 1))
        self.assertEqual(db.obtener_config(self.conn)["folio_siguiente_FACTURA"], "3")
        with self.assertRaises(ErrorValidacion):
            db.emitir_documento(self.conn, d1["id"])

    def test_folio_configurado(self):
        db.guardar_config(self.conn, {"folio_siguiente_FACTURA": "250"})
        d = db.emitir_documento(self.conn, self.crear()["id"])
        self.assertEqual(d["folio"], 250)

    def test_editar_borrador_recalcula(self):
        d = self.crear()
        d2 = db.actualizar_documento(self.conn, d["id"], {
            "lineas": [{"descripcion": "A", "cantidad": 2, "precio_unitario": 50000},
                       {"descripcion": "B", "cantidad": 1, "precio_unitario": 10000, "exento": 1}]})
        self.assertEqual(d2["neto"], 100000)
        self.assertEqual(d2["exento"], 10000)
        self.assertEqual(d2["total"], 129000)
        self.assertEqual(len(d2["lineas"]), 2)

    def test_emitido_solo_campos_administrativos(self):
        d = db.emitir_documento(self.conn, self.crear()["id"])
        d2 = db.actualizar_documento(self.conn, d["id"], {
            "folio_sii": "1234", "lineas": [{"descripcion": "Z", "cantidad": 1, "precio_unitario": 1}]})
        self.assertEqual(d2["folio_sii"], "1234")
        self.assertEqual(d2["total"], 119000)

    def test_pagos_y_estado(self):
        d = db.emitir_documento(self.conn, self.crear()["id"])
        d = db.registrar_pago(self.conn, d["id"], {"monto": 50000, "fecha": "2026-10-10"})
        self.assertEqual(d["estado"], "EMITIDA")
        self.assertEqual(d["saldo"], 69000)
        d = db.registrar_pago(self.conn, d["id"], {"monto": 69000})
        self.assertEqual(d["estado"], "PAGADA")
        self.assertEqual(d["saldo"], 0)
        d = db.eliminar_pago(self.conn, d["pagos"][0]["id"])
        self.assertEqual(d["estado"], "EMITIDA")

    def test_no_pagar_borrador(self):
        d = self.crear()
        with self.assertRaises(ErrorValidacion):
            db.registrar_pago(self.conn, d["id"], {"monto": 10})

    def test_anular_y_eliminar(self):
        d = db.emitir_documento(self.conn, self.crear()["id"])
        with self.assertRaises(ErrorValidacion):
            db.eliminar_documento(self.conn, d["id"])
        d = db.anular_documento(self.conn, d["id"], "error en monto")
        self.assertEqual(d["estado"], "ANULADA")
        self.assertEqual(d["saldo"], 0)
        b = self.crear()
        db.eliminar_documento(self.conn, b["id"])
        self.assertIsNone(db.obtener_documento(self.conn, b["id"]))

    def test_listar_vencidas(self):
        pasado = (dt.date.today() - dt.timedelta(days=60)).isoformat()
        d = db.emitir_documento(self.conn, self.crear(fecha_emision=pasado)["id"])
        vencidas = db.listar_documentos(self.conn, estado="VENCIDA")
        self.assertEqual([v["id"] for v in vencidas], [d["id"]])
        self.assertTrue(vencidas[0]["vencida"])

    def test_boleta_honorarios(self):
        d = self.crear(tipo="BOLETA_HONORARIOS",
                       lineas=[{"descripcion": "Honorarios", "cantidad": 1, "precio_unitario": 400000}])
        self.assertEqual(d["retencion"], 61000)
        self.assertEqual(d["total"], 339000)

    def test_render_y_csv(self):
        d = db.emitir_documento(self.conn, self.crear()["id"])
        html = documentos.render_documento(d, db.obtener_config(self.conn))
        self.assertIn("Empresa de Prueba SpA", html)
        self.assertIn("76.086.428-5", html)
        self.assertIn("$ 119.000", html)
        self.assertIn("N° 1", html)
        csv_texto = documentos.csv_documentos(db.listar_documentos(self.conn))
        self.assertIn("Empresa de Prueba SpA", csv_texto)
        self.assertTrue(csv_texto.startswith("﻿"))
        texto = documentos.texto_recordatorio(d, db.obtener_config(self.conn))
        self.assertIn("$ 119.000", texto)

    def test_validaciones(self):
        with self.assertRaises(ErrorValidacion):
            self.crear(lineas=[])
        with self.assertRaises(ErrorValidacion):
            self.crear(lineas=[{"descripcion": "", "cantidad": 1, "precio_unitario": 1}])
        with self.assertRaises(ErrorValidacion):
            self.crear(fecha_vencimiento="2026-01-01")
        with self.assertRaises(ErrorValidacion):
            self.crear(tipo="OTRO")


class PruebasAutomatizacion(PruebasBase):
    def setUp(self):
        super().setUp()
        self.c1 = db.crear_cliente(self.conn, cliente_base())
        self.c2 = db.crear_cliente(self.conn, cliente_base(rut="12.345.678-5", razon_social="Segundo"))
        self.p1 = db.crear_plan(self.conn, {"cliente_id": self.c1["id"], "descripcion": "Asesoría contable",
                                            "monto": 150000, "tipo_documento": "FACTURA",
                                            "periodicidad": "MENSUAL", "dia_emision": 5,
                                            "mes_inicio": "2026-01"})
        self.p2 = db.crear_plan(self.conn, {"cliente_id": self.c2["id"], "descripcion": "Honorarios",
                                            "monto": 300000, "tipo_documento": "BOLETA_HONORARIOS",
                                            "periodicidad": "TRIMESTRAL", "dia_emision": 31,
                                            "mes_inicio": "2026-02", "mes_fin": "2026-08"})

    def test_corresponde(self):
        self.assertTrue(automatizacion.plan_corresponde(self.p1, "2026-10"))
        self.assertFalse(automatizacion.plan_corresponde(self.p1, "2025-12"))
        self.assertTrue(automatizacion.plan_corresponde(self.p2, "2026-02"))
        self.assertFalse(automatizacion.plan_corresponde(self.p2, "2026-03"))
        self.assertTrue(automatizacion.plan_corresponde(self.p2, "2026-05"))
        self.assertTrue(automatizacion.plan_corresponde(self.p2, "2026-08"))
        self.assertFalse(automatizacion.plan_corresponde(self.p2, "2026-11"))

    def test_fecha_emision_ajusta_fin_de_mes(self):
        self.assertEqual(automatizacion.fecha_emision_plan(self.p2, "2026-02"), "2026-02-28")
        self.assertEqual(automatizacion.fecha_emision_plan(self.p1, "2026-10"), "2026-10-05")

    def test_generar_sin_duplicar(self):
        pendientes = automatizacion.planes_pendientes(self.conn, "2026-05")
        self.assertEqual({p["id"] for p in pendientes}, {self.p1["id"], self.p2["id"]})
        creados = automatizacion.generar_periodo(self.conn, "2026-05")
        self.assertEqual(len(creados), 2)
        self.assertEqual(creados[0]["estado"], "BORRADOR")
        self.assertIn("mayo 2026", creados[0]["lineas"][0]["descripcion"])
        self.assertEqual(automatizacion.generar_periodo(self.conn, "2026-05"), [])
        self.assertEqual(automatizacion.planes_pendientes(self.conn, "2026-05"), [])

    def test_generar_emitiendo(self):
        creados = automatizacion.generar_periodo(self.conn, "2026-06", emitir=True)
        self.assertEqual(len(creados), 1)
        self.assertEqual(creados[0]["estado"], "EMITIDA")
        self.assertEqual(creados[0]["folio"], 1)
        self.assertEqual(creados[0]["total"], 178500)

    def test_anulado_permite_regenerar(self):
        creados = automatizacion.generar_periodo(self.conn, "2026-06", emitir=True)
        db.anular_documento(self.conn, creados[0]["id"], "error")
        self.assertEqual(len(automatizacion.planes_pendientes(self.conn, "2026-06")), 1)

    def test_resumen(self):
        automatizacion.generar_periodo(self.conn, "2026-05", emitir=True)
        r = automatizacion.resumen(self.conn, "2026-05")
        self.assertEqual(r["docs_mes"], 2)
        self.assertEqual(r["emitido_mes"], 178500 + 300000 - 45750)
        self.assertEqual(r["planes_pendientes"], 0)
        r2 = automatizacion.resumen(self.conn, "2026-07")
        self.assertEqual(r2["planes_pendientes"], 1)
        self.assertEqual(r2["monto_planes_pendientes"], 150000)

    def test_plan_invalido(self):
        with self.assertRaises(ErrorValidacion):
            db.crear_plan(self.conn, {"cliente_id": self.c1["id"], "descripcion": "x", "monto": 0})
        with self.assertRaises(ErrorValidacion):
            db.crear_plan(self.conn, {"cliente_id": self.c1["id"], "descripcion": "x", "monto": 10,
                                      "mes_inicio": "2026-13"})


if __name__ == "__main__":
    unittest.main()
