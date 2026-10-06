import unittest

from facturador import calculos


class PruebasCalculos(unittest.TestCase):
    def test_factura_afecta(self):
        t = calculos.totalizar(
            [{"cantidad": 1, "precio_unitario": 100000},
             {"cantidad": 2, "precio_unitario": 25000}],
            "FACTURA", tasa_iva=19)
        self.assertEqual(t["neto"], 150000)
        self.assertEqual(t["exento"], 0)
        self.assertEqual(t["iva"], 28500)
        self.assertEqual(t["total"], 178500)
        self.assertEqual(t["retencion"], 0)

    def test_factura_con_linea_exenta(self):
        t = calculos.totalizar(
            [{"cantidad": 1, "precio_unitario": 100000},
             {"cantidad": 1, "precio_unitario": 30000, "exento": 1}],
            "FACTURA", tasa_iva=19)
        self.assertEqual(t["neto"], 100000)
        self.assertEqual(t["exento"], 30000)
        self.assertEqual(t["iva"], 19000)
        self.assertEqual(t["total"], 149000)

    def test_factura_exenta_no_lleva_iva(self):
        t = calculos.totalizar([{"cantidad": 1, "precio_unitario": 500000}], "FACTURA_EXENTA")
        self.assertEqual(t["neto"], 0)
        self.assertEqual(t["exento"], 500000)
        self.assertEqual(t["iva"], 0)
        self.assertEqual(t["total"], 500000)

    def test_boleta_honorarios_retencion(self):
        t = calculos.totalizar([{"cantidad": 1, "precio_unitario": 1000000}],
                               "BOLETA_HONORARIOS", tasa_retencion=15.25)
        self.assertEqual(t["exento"], 1000000)
        self.assertEqual(t["retencion"], 152500)
        self.assertEqual(t["bruto"], 1000000)
        self.assertEqual(t["total"], 847500)

    def test_redondeo_a_pesos(self):
        t = calculos.totalizar([{"cantidad": 1, "precio_unitario": 10001}], "FACTURA", 19)
        self.assertEqual(t["iva"], 1900)  # 1900.19 -> 1900
        t = calculos.totalizar([{"cantidad": 1.5, "precio_unitario": 333}], "FACTURA", 19)
        self.assertEqual(t["lineas"][0]["subtotal"], 500)  # 499.5 -> 500
        self.assertEqual(t["iva"], 95)

    def test_formato_clp(self):
        self.assertEqual(calculos.formato_clp(0), "$ 0")
        self.assertEqual(calculos.formato_clp(1234567), "$ 1.234.567")
        self.assertEqual(calculos.formato_clp(-500), "-$ 500")
        self.assertEqual(calculos.formato_clp(None), "$ 0")

    def test_formato_fecha(self):
        self.assertEqual(calculos.formato_fecha("2026-10-06"), "06-10-2026")
        self.assertEqual(calculos.formato_fecha(""), "")


if __name__ == "__main__":
    unittest.main()
