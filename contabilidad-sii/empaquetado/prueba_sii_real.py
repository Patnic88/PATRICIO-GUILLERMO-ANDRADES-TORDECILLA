"""Prueba contra el ambiente de certificación REAL del SII (maullin.sii.cl). Se ejecuta en GitHub Actions.

1. Pide una semilla (no requiere certificado).
2. Muestra las operaciones y parámetros del WSDL de GetTokenFromSeed, para confirmar el formato.
3. Firma la semilla con un certificado AUTOFIRMADO de prueba y la envía. El SII debe
   rechazarlo (no es un certificado reconocido); lo que interesa es su respuesta.

También deja un .pfx de prueba en la ruta indicada, para la prueba de humo del .exe.
Uso: python prueba_sii_real.py <ruta_salida_pfx>
"""

import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))

from contasii import sii_ws  # noqa: E402
from test_sii_ws import certificado_prueba  # noqa: E402

pfx, llave, cert = certificado_prueba()
if len(sys.argv) > 1:
    with open(sys.argv[1], "wb") as f:
        f.write(pfx)
    print(f"PFX de prueba guardado en {sys.argv[1]} (clave: clave123)")

print("1) Semilla del SII (certificación):", sii_ws.obtener_semilla("certificacion"))

try:
    with urllib.request.urlopen(f"{sii_ws.AMBIENTES['certificacion']}/GetTokenFromSeed.jws?WSDL", timeout=20) as r:
        wsdl = r.read().decode("utf-8", "replace")
    print("2) WSDL GetTokenFromSeed: operaciones", sorted(set(re.findall(r'operation name="(\w+)"', wsdl))),
          "| partes", sorted(set(re.findall(r'part name="(\w+)"', wsdl))))
except Exception as e:  # informativo
    print("2) No se pudo leer el WSDL:", e)

try:
    sii_ws.obtener_token(llave, cert, "certificacion")
    print("3) ATENCIÓN: el SII entregó token a un certificado autofirmado (inesperado)")
except sii_ws.ErrorSII as e:
    print("3) Respuesta del SII al certificado de prueba (se espera rechazo):", e)
