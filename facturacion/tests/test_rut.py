import unittest

from facturador import rut


class PruebasRut(unittest.TestCase):
    def test_digito_verificador(self):
        self.assertEqual(rut.digito_verificador("12345678"), "5")
        self.assertEqual(rut.digito_verificador("11111111"), "1")
        self.assertEqual(rut.digito_verificador("76086428"), "5")
        self.assertEqual(rut.digito_verificador("7775363"), "K")
        self.assertEqual(rut.digito_verificador("6"), "K")
        self.assertEqual(rut.digito_verificador("14"), "0")

    def test_validos(self):
        self.assertTrue(rut.es_valido("12.345.678-5"))
        self.assertTrue(rut.es_valido("12345678-5"))
        self.assertTrue(rut.es_valido("123456785"))
        self.assertTrue(rut.es_valido("7.775.363-k"))
        self.assertTrue(rut.es_valido("14-0"))

    def test_invalidos(self):
        self.assertFalse(rut.es_valido("12.345.678-6"))
        self.assertFalse(rut.es_valido(""))
        self.assertFalse(rut.es_valido(None))
        self.assertFalse(rut.es_valido("abc"))
        self.assertFalse(rut.es_valido("123456789-0"))  # más de 8 dígitos

    def test_formato(self):
        self.assertEqual(rut.formatear("123456785"), "12.345.678-5")
        self.assertEqual(rut.formatear("7775363k"), "7.775.363-K")
        self.assertEqual(rut.normalizar("12.345.678-5"), "12345678-5")
        self.assertEqual(rut.formatear(""), "")


if __name__ == "__main__":
    unittest.main()
