import os
import sqlite3
import tempfile
import unittest

from contasii import honorarios, impuestos, rcv
from contasii.libro import Asiento, ErrorContable, Libro
from contasii.parametros import ParametroFaltante, Parametros
from contasii.rut import calcular_dv, es_valido, formatear, normalizar

EJ = os.path.join(os.path.dirname(__file__), "..", "ejemplos")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "t.db")
        self.lib = Libro(self.db)
        self.lib.inicializar("76111111-6", "EMPRESA PRUEBA", "empresa", "14D3")
        self.params = Parametros(2026)

    def tearDown(self):
        self.lib.con.close()
        self.tmp.cleanup()

    def importar_todo(self):
        rcv.importar(self.lib, os.path.join(EJ, "rcv_compras_2026-10.csv"), "compra", "2026-10")
        rcv.importar(self.lib, os.path.join(EJ, "rcv_ventas_2026-10.csv"), "venta", "2026-10")
        honorarios.importar(self.lib, os.path.join(EJ, "honorarios_recibidos_2026-10.csv"), "recibido", "2026-10",
                            self.params)


class TestRut(unittest.TestCase):
    def test_dv(self):
        self.assertEqual(calcular_dv("76999999"), "K")
        self.assertTrue(es_valido("12.345.678-5"))
        self.assertFalse(es_valido("12.345.678-4"))
        self.assertEqual(normalizar("12.345.678-5"), "12345678-5")
        self.assertEqual(formatear("123456785"), "12.345.678-5")


class TestLibro(Base):
    def test_descuadrado_rechazado(self):
        a = Asiento("2026-10-01", "x").cargar("1.1.02", 100).abonar("3.1.01", 90)
        with self.assertRaises(ErrorContable):
            self.lib.registrar(a)

    def test_cuenta_no_imputable(self):
        a = Asiento("2026-10-01", "x").cargar("1.1", 100).abonar("3.1.01", 100)
        with self.assertRaises(ErrorContable):
            self.lib.registrar(a)

    def test_periodo_cerrado_y_anulacion(self):
        n = self.lib.registrar(Asiento("2026-09-01", "capital").cargar("1.1.02", 100).abonar("3.1.01", 100))
        self.lib.cerrar_periodo("2026-09")
        with self.assertRaises(ErrorContable):
            self.lib.registrar(Asiento("2026-09-15", "x").cargar("1.1.02", 1).abonar("3.1.01", 1))
        m = self.lib.anular(n, "2026-10-01", "error de digitación")
        self.assertEqual(m, n + 1)
        with self.assertRaises(ErrorContable):
            self.lib.anular(n, "2026-10-01", "otra vez")
        ini, filas = self.lib.libro_mayor("1.1.02")
        self.assertEqual(filas[-1]["saldo"], 0)

    def test_alteracion_detectada(self):
        self.lib.registrar(Asiento("2026-10-01", "capital").cargar("1.1.02", 100).abonar("3.1.01", 100))
        self.assertEqual(self.lib.verificar_integridad(), [])
        con = sqlite3.connect(self.db)
        con.execute("UPDATE linea SET debe=999 WHERE debe=100")
        con.execute("UPDATE linea SET haber=999 WHERE haber=100")
        con.commit()
        con.close()
        self.assertTrue(any("hash" in p for p in self.lib.verificar_integridad()))


class TestImportacion(Base):
    def test_rcv_y_f29(self):
        self.importar_todo()
        r = rcv.importar(self.lib, os.path.join(EJ, "rcv_ventas_2026-10.csv"), "venta", "2026-10")
        self.assertEqual((r.importados, r.duplicados), (0, 4))
        p = impuestos.propuesta_f29(self.lib, self.params, "2026-10", remanente_anterior=0)
        self.assertEqual(p.monto("debito_fiscal"), 950000 + 570000 - 95000)
        self.assertEqual(p.monto("credito_fiscal"), 190000 + 380000 - 19000)
        self.assertEqual(p.monto("base_ppm"), 5000000 + 3000000 + 400000 - 500000)
        self.assertEqual(p.monto("ppm"), round(7900000 * 0.00125))
        self.assertEqual(p.monto("retencion_honorarios"), 76250 + 45750)
        self.assertEqual(p.total_a_pagar, 874000 + 9875 + 122000)
        self.assertTrue(p.verificar)  # parámetros no verificados directamente quedan listados
        n = impuestos.contabilizar_f29(self.lib, p)
        self.assertGreater(n, 0)
        filas, tot, res = self.lib.balance_8_columnas()
        self.assertEqual(tot[0], tot[1])
        self.assertEqual(tot[2], tot[3])
        self.assertEqual(self.lib.verificar_integridad(), [])
        # IVA CF y DF quedan saldados tras la centralización (sin remanente)
        saldos = {s["codigo"]: s["debe"] - s["haber"] for s in self.lib.saldos()}
        self.assertEqual(saldos["1.1.04"], 0)
        self.assertEqual(saldos["2.1.02"], 0)
        self.assertEqual(saldos["2.1.11"], -874000)

    def test_remanente(self):
        rcv.importar(self.lib, os.path.join(EJ, "rcv_compras_2026-10.csv"), "compra", "2026-10")
        p = impuestos.propuesta_f29(self.lib, self.params, "2026-10", remanente_anterior=0)
        self.assertEqual(p.remanente_siguiente, 551000)
        self.assertEqual(p.monto("iva_determinado"), -551000)

    def test_centralizado(self):
        r = rcv.importar(self.lib, os.path.join(EJ, "rcv_ventas_2026-10.csv"), "venta", "2026-10", "centralizado")
        self.assertEqual(len(r.asientos), 1)
        lineas = {l["cuenta"]: (l["debe"], l["haber"]) for l in self.lib.lineas_de(r.asientos[0])}
        self.assertEqual(lineas["2.1.02"], (0, 1425000))

    def test_honorarios_anulada_omitida(self):
        r = honorarios.importar(self.lib, os.path.join(EJ, "honorarios_recibidos_2026-10.csv"), "recibido",
                                "2026-10", self.params)
        self.assertEqual((r["importados"], r["anuladas"]), (2, 1))
        self.assertEqual(r["alertas"], [])  # retenciones de ejemplo cuadran con 15,25%

    def test_csv_invalido(self):
        ruta = os.path.join(self.tmp.name, "malo.csv")
        with open(ruta, "w") as f:
            f.write("a;b;c\n1;2;3\n")
        with self.assertRaises(ErrorContable):
            rcv.importar(self.lib, ruta, "compra", "2026-10")


class TestImpuestos(unittest.TestCase):
    def setUp(self):
        self.params = Parametros(2026)

    def test_iusc(self):
        utm, tabla = self.params.utm("2026-10"), self.params.tabla_iusc()
        self.assertEqual(impuestos.impuesto_unico(900000, utm, tabla), 0)
        # equivalente al factor 4% menos rebaja 0,54 UTM
        self.assertEqual(impuestos.impuesto_unico(1500000, utm, tabla), round(1500000 * 0.04 - 0.54 * utm))
        # tramo 40%: rebaja 38,82 UTM
        self.assertEqual(impuestos.impuesto_unico(30000000, utm, tabla), round(30000000 * 0.40 - 38.82 * utm))

    def test_utm_faltante(self):
        with self.assertRaises(ParametroFaltante):
            self.params.utm("2026-11")

    def test_ppm_14A_no_inventado(self):
        with self.assertRaises(ParametroFaltante):
            self.params.valor("ppm_14A")

    def test_vencimiento(self):
        f, _ = impuestos.vencimiento_f29(self.params, "2026-10")
        self.assertEqual(f.isoformat(), "2026-11-20")
        f, _ = impuestos.vencimiento_f29(self.params, "2026-10", electronico=False)
        self.assertEqual(f.isoformat(), "2026-11-12")


if __name__ == "__main__":
    unittest.main()
