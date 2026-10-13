"""Diagnóstico informativo del ingreso al portal del SII (sin credenciales).

Abre el SII real con el mismo módulo que usa el programa (Edge o Chrome sin ventana) y
comprueba que sigue vigente lo verificado el 13-10-2026: la página de ingreso con su
formulario y el botón de Clave Única, la cookie RUT_NS como señal de ingreso en AutAll.js
y la redirección del Registro de Compras y Ventas a la página de ingreso sin sesión.
Sirve para detectar cambios del SII en cada compilación. No ingresa con ninguna clave.
"""

import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from contasii import sii_portal  # noqa: E402


def main():
    ok = True
    js = urllib.request.urlopen(urllib.request.Request("https://zeusr.sii.cl/AUT2000/js/AutAll.js",
                                                       headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read()
    js = js.decode("latin-1")
    i = js.find("function autenticado")
    senal = i >= 0 and "'RUT_NS'" in js[i:i + 400]
    print("AutAll.js: autenticado() revisa la cookie RUT_NS:", senal)
    ok &= senal

    p = sii_portal.PortalSII(headless=True)
    try:
        print("Abrir ventana:", p.conectar()["estado"])
        tid = p.nav.pestanas()[0]["targetId"]
        campos = None
        limite = time.monotonic() + 40
        while time.monotonic() < limite:
            try:
                campos = p.nav.evaluar(tid, "[document.readyState, location.href, "
                                            "['#rutcntr','#clave','#bt_ingresar','#myHref']"
                                            ".map(s => !!document.querySelector(s))]", timeout=10)
                if campos and campos[0] == "complete":
                    break
            except Exception as e:  # noqa: BLE001
                campos = repr(e)
            time.sleep(1)
        print("Página de ingreso (estado, dirección, [RUT, clave, botón Ingresar, botón Clave Única]):", campos)
        ok &= bool(campos) and isinstance(campos, list) and all(campos[2])
        estado = p.estado()
        print("Estado sin ingresar:", estado["estado"])
        ok &= estado["estado"] == "esperando"
        p.nav.navegar(tid, sii_portal.URL_RCV)
        time.sleep(2)
        url = p.nav.pestanas()[0]["url"]
        print("RCV sin sesión redirige a:", url)
        ok &= "/AUT2000/" in url
    finally:
        p.desconectar()
    print("RESULTADO:", "sin cambios en el SII" if ok else "REVISAR: algo cambió en el SII")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
