"""Diagnóstico del servicio de consulta de estado de DTE del SII (solo GitHub Actions; informativo).

Imprime, desde fuentes oficiales del SII:
1. Las operaciones y parámetros del WSDL de QueryEstDte (ambiente de certificación).
2. Las líneas de los manuales «Consulta de Estado DTE» y «Consulta Avanzada» sobre
   parámetros, estados y errores.
3. La respuesta del SII a una consulta con un token inválido (para conocer el formato).
"""

import io
import re
import urllib.request

BASE = "https://maullin.sii.cl/DTEWS"
MANUALES = [
    "https://www.sii.cl/factura_electronica/factura_mercado/estado_dte.pdf",
    "https://www.sii.cl/factura_electronica/factura_mercado/OIFE2006_QueryEstDteAv_MDE.pdf",
]


def leer(url, datos=None, cab=None, timeout=30):
    req = urllib.request.Request(url, data=datos, headers=cab or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


for servicio in ("QueryEstDte.jws", "services/QueryEstDteAv"):
    try:
        wsdl = leer(f"{BASE}/{servicio}?WSDL").decode("utf-8", "replace")
        ops = sorted(set(re.findall(r'operation name="(\w+)"', wsdl)))
        print(f"WSDL {servicio}: operaciones {ops}")
        for msg in re.findall(r'<wsdl:message name="(\w+)">(.*?)</wsdl:message>', wsdl, re.S):
            partes = re.findall(r'part name="(\w+)"', msg[1])
            print(f"   mensaje {msg[0]}: {partes}")
        tipos = re.findall(r'<(?:xsd|xs|s):element[^>]*name="(\w+)"', wsdl)
        if tipos:
            print(f"   elementos: {tipos[:60]}")
    except Exception as e:
        print(f"WSDL {servicio}: error {e}")

try:
    from pypdf import PdfReader
    for url in MANUALES:
        try:
            pdf = PdfReader(io.BytesIO(leer(url)))
            texto = "\n".join(p.extract_text() or "" for p in pdf.pages)
            print(f"\nMANUAL {url} ({len(pdf.pages)} páginas)")
            n = 0
            for linea in texto.splitlines():
                l = linea.strip()
                if re.search(r"Rut|RUT|Folio|Tipo|Fecha|Monto|Token|ESTADO|Estado|GLOSA|ERR_CODE|"
                             r"\b[A-Z]{3}\b\s|getEstDte|Consultante|Compania|Receptor|Emisor", l):
                    print("   |", l[:200])
                    n += 1
                    if n >= 170:
                        break
        except Exception as e:
            print(f"MANUAL {url}: error {e}")
except ImportError:
    print("pypdf no disponible")

sobre = ('<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope '
         'xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" '
         'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
         '<soapenv:Body><getEstDte>'
         '<RutConsultante xsi:type="xsd:string">11111111</RutConsultante><DvConsultante xsi:type="xsd:string">1</DvConsultante>'
         '<RutCompania xsi:type="xsd:string">11111111</RutCompania><DvCompania xsi:type="xsd:string">1</DvCompania>'
         '<RutReceptor xsi:type="xsd:string">11111111</RutReceptor><DvReceptor xsi:type="xsd:string">1</DvReceptor>'
         '<TipoDte xsi:type="xsd:string">33</TipoDte><FolioDte xsi:type="xsd:string">1</FolioDte>'
         '<FechaEmisionDte xsi:type="xsd:string">01102026</FechaEmisionDte><MontoDte xsi:type="xsd:string">1000</MontoDte>'
         '<Token xsi:type="xsd:string">TOKENINVALIDO</Token></getEstDte></soapenv:Body></soapenv:Envelope>')
try:
    r = leer(f"{BASE}/QueryEstDte.jws", sobre.encode(), {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""'})
    print("\nRESPUESTA con token inválido:", r.decode("utf-8", "replace")[:1500])
except urllib.error.HTTPError as e:
    print("\nRESPUESTA HTTP", e.code, e.read().decode("utf-8", "replace")[:1500])
except Exception as e:
    print("\nRESPUESTA error", e)
