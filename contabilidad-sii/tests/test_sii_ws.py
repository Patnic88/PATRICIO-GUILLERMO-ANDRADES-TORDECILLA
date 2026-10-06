import base64
import datetime
import hashlib
import html
import json
import re
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509.oid import NameOID
    HAY_CRYPTO = True
except ImportError:
    HAY_CRYPTO = False

from contasii import sii_ws, web


def certificado_prueba(dias=365):
    """Certificado autofirmado SOLO para pruebas (el SII no lo aceptaría)."""
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    n = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "PERSONA DE PRUEBA"),
                   x509.NameAttribute(NameOID.SERIAL_NUMBER, "11111111-1")])
    ahora = datetime.datetime.now(datetime.timezone.utc)
    c = (x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(1)
         .not_valid_before(ahora - datetime.timedelta(days=1)).not_valid_after(ahora + datetime.timedelta(days=dias))
         .sign(k, hashes.SHA256()))
    pfx = pkcs12.serialize_key_and_certificates(b"prueba", k, c, None,
                                                serialization.BestAvailableEncryption(b"clave123"))
    return pfx, k, c


def respuesta_soap(operacion, interno):
    return (f'<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">'
            f'<soapenv:Body><ns1:{operacion}Response xmlns:ns1="urn"><ns1:{operacion}Return>{html.escape(interno)}'
            f'</ns1:{operacion}Return></ns1:{operacion}Response></soapenv:Body></soapenv:Envelope>')


class SIISimulado(BaseHTTPRequestHandler):
    """Imita CrSeed y GetTokenFromSeed: verifica la firma recibida antes de entregar el token."""
    rechazar = False

    def log_message(self, *a):
        pass

    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers["Content-Length"])).decode()
        if self.path.endswith("CrSeed.jws"):
            interno = ('<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_BODY><SEMILLA>033878794660'
                       '</SEMILLA></SII:RESP_BODY><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR></SII:RESPUESTA>')
            out = respuesta_soap("getSeed", interno)
        else:
            xml = html.unescape(re.search(r"<pszXml[^>]*>(.*)</pszXml>", cuerpo, re.S).group(1))
            ok = "<Semilla>033878794660</Semilla>" in xml and "<SignatureValue>" in xml and not self.rechazar
            interno = ('<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_BODY><TOKEN>ABCDEFGHIJ12</TOKEN>'
                       '</SII:RESP_BODY><SII:RESP_HDR><ESTADO>00</ESTADO><GLOSA>Token Creado</GLOSA></SII:RESP_HDR></SII:RESPUESTA>'
                       if ok else
                       '<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR><ESTADO>-07</ESTADO>'
                       '<GLOSA>Certificado no reconocido</GLOSA></SII:RESP_HDR></SII:RESPUESTA>')
            out = respuesta_soap("getToken", interno)
        datos = out.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/xml")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)


@unittest.skipUnless(HAY_CRYPTO, "requiere la librería cryptography")
class TestSII(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pfx, cls.k, cls.c = certificado_prueba()
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), SIISimulado)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.ambientes = dict(sii_ws.AMBIENTES)
        sii_ws.AMBIENTES["certificacion"] = f"http://127.0.0.1:{cls.srv.server_address[1]}/DTEWS"

    @classmethod
    def tearDownClass(cls):
        sii_ws.AMBIENTES.clear()
        sii_ws.AMBIENTES.update(cls.ambientes)
        cls.srv.shutdown()
        cls.srv.server_close()

    def test_cargar_pfx(self):
        llave, cert = sii_ws.cargar_pfx(self.pfx, "clave123")
        info = sii_ws.info_certificado(cert)
        self.assertEqual(info["titular"], "PERSONA DE PRUEBA")
        self.assertTrue(info["vigente"])
        with self.assertRaises(sii_ws.ErrorSII):
            sii_ws.cargar_pfx(self.pfx, "otra")
        with self.assertRaises(sii_ws.ErrorSII):
            sii_ws.cargar_pfx(b"no es un pfx", "clave123")

    def test_firma_valida(self):
        xml = sii_ws.firmar_semilla("033878794660", self.k, self.c)
        doc = sii_ws.documento_semilla("033878794660")
        digest = re.search(r"<DigestValue>(.*?)</DigestValue>", xml).group(1)
        self.assertEqual(digest, base64.b64encode(hashlib.sha1(doc.encode()).digest()).decode())
        firma = base64.b64decode(re.search(r"<SignatureValue>(.*?)</SignatureValue>", xml).group(1))
        self.c.public_key().verify(firma, sii_ws._signed_info(digest, True).encode(), padding.PKCS1v15(), hashes.SHA1())
        try:  # verificación con la implementación de referencia, si está instalada
            import xmlsec
            from lxml import etree
        except ImportError:
            return
        nodo = xmlsec.tree.find_node(etree.fromstring(xml.encode()), xmlsec.constants.NodeSignature)
        ctx = xmlsec.SignatureContext()
        ctx.key = xmlsec.Key.from_memory(self.c.public_bytes(serialization.Encoding.PEM),
                                         xmlsec.constants.KeyDataFormatCertPem)
        ctx.verify(nodo)

    def test_semilla_invalida(self):
        with self.assertRaises(sii_ws.ErrorSII):
            sii_ws.documento_semilla("12<x>")

    def test_semilla_y_token(self):
        self.assertEqual(sii_ws.obtener_semilla()["semilla"], "033878794660")
        r = sii_ws.probar_certificado(self.pfx, "clave123")
        self.assertEqual(r["token_parcial"], "ABCD…12")
        self.assertEqual(r["certificado"]["titular"], "PERSONA DE PRUEBA")

    def test_token_rechazado(self):
        SIISimulado.rechazar = True
        try:
            with self.assertRaises(sii_ws.ErrorSII) as e:
                sii_ws.probar_certificado(self.pfx, "clave123")
            self.assertIn("Certificado no reconocido", str(e.exception))
        finally:
            SIISimulado.rechazar = False

    def test_sin_conexion(self):
        sii_ws.AMBIENTES["produccion_falsa"] = "http://127.0.0.1:9/DTEWS"
        try:
            with self.assertRaises(sii_ws.ErrorSII):
                sii_ws.obtener_semilla("produccion_falsa", timeout=3)
        finally:
            del sii_ws.AMBIENTES["produccion_falsa"]

    def test_pantalla_web(self):
        tmp = tempfile.TemporaryDirectory()
        srv, puerto = web.servidor(tmp.name, 18865)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            def post(ruta, cuerpo):
                req = urllib.request.Request(f"http://127.0.0.1:{puerto}/api/{ruta}", data=json.dumps(cuerpo).encode(),
                                             headers={"Content-Type": "application/json", "X-Contasii": "1"})
                try:
                    with urllib.request.urlopen(req) as r:
                        return r.status, json.loads(r.read())
                except urllib.error.HTTPError as e:
                    return e.code, json.loads(e.read())
            b64 = base64.b64encode(self.pfx).decode()
            st, r = post("sii-certificado", {"pfx": b64, "clave": "clave123"})
            self.assertEqual((st, r["titular"]), (200, "PERSONA DE PRUEBA"))
            st, r = post("sii-certificado", {"pfx": b64, "clave": "mala"})
            self.assertEqual(st, 400)
            st, r = post("sii-semilla", {"ambiente": "certificacion"})
            self.assertEqual((st, r["semilla"]), (200, "033878794660"))
            st, r = post("sii-token", {"pfx": b64, "clave": "clave123", "ambiente": "certificacion"})
            self.assertEqual(st, 200, r)
            st, r = post("sii-semilla", {"ambiente": "otro"})
            self.assertEqual(st, 400)
        finally:
            srv.shutdown()
            srv.server_close()
            tmp.cleanup()


if __name__ == "__main__":
    unittest.main()
