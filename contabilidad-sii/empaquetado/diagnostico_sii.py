"""Diagnóstico de la autenticación con el SII (solo para GitHub Actions; no forma parte del programa).

1. Descarga el «Manual de Desarrollador Autenticación Automática» del SII y muestra las
   líneas sobre estados y errores, para interpretar las respuestas con la fuente oficial.
2. Envía variantes de la firma con un certificado autofirmado de prueba y muestra la
   respuesta del SII a cada una, para distinguir errores de formato de un rechazo del certificado.
"""

import io
import os
import re
import sys
import textwrap
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))

from contasii import sii_ws  # noqa: E402
from test_sii_ws import certificado_prueba  # noqa: E402

MANUAL = "https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf"

try:
    from pypdf import PdfReader
    with urllib.request.urlopen(MANUAL, timeout=30) as r:
        pdf = PdfReader(io.BytesIO(r.read()))
    texto = "\n".join(p.extract_text() or "" for p in pdf.pages)
    print(f"MANUAL ({len(pdf.pages)} páginas) — líneas sobre estados, errores y certificado:")
    vistas = 0
    for linea in texto.splitlines():
        if re.search(r"ESTADO|Estado|GLOSA|Glosa|Certificate|Certificado|X509|KeyInfo|Error|error", linea):
            print("   |", linea.strip()[:200])
            vistas += 1
            if vistas >= 120:
                break
except Exception as e:  # informativo
    print("No se pudo leer el manual:", e)

pfx, llave, cert = certificado_prueba()
base = sii_ws.firmar_semilla


def con_saltos(xml):
    """Variante: base64 del certificado y del módulo en líneas de 76 caracteres."""
    def partir(m):
        return f"<{m.group(1)}>" + "\n".join(textwrap.wrap(m.group(2), 76)) + f"</{m.group(1)}>"
    return re.sub(r"<(X509Certificate|Modulus)>([^<]+)</\1>", partir, xml)


def sin_keyvalue(xml):
    return re.sub(r"<KeyValue>.*?</KeyValue>", "", xml)


for nombre, transformar in (("normal", lambda x: x), ("base64 en líneas de 76", con_saltos),
                            ("sin KeyValue", sin_keyvalue)):
    try:
        semilla = sii_ws.obtener_semilla("certificacion")["semilla"]
        xml = transformar(base(semilla, llave, cert))
        soap = sii_ws._llamar(f"{sii_ws.AMBIENTES['certificacion']}/GetTokenFromSeed.jws",
                              sii_ws._sobre("getToken", "pszXml", xml), 20)
        interna = sii_ws._respuesta_interna(soap, "getTokenReturn")
        print(f"VARIANTE {nombre}: ESTADO={sii_ws._campo(interna, 'ESTADO')} GLOSA={sii_ws._campo(interna, 'GLOSA')}")
    except Exception as e:
        print(f"VARIANTE {nombre}: error {e}")
