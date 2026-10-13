"""Prueba real de Mi Contabilidad 0.2.0 instalada (Windows), sin claves.

Usa el programa instalado desde la versión publicada, tal como lo usaría una persona:
crea una empresa, va al paso 1, presiona «Ingresar al SII» y fotografía la página real
del SII que abre el programa. No escribe ninguna clave.
"""

import base64
import glob
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contasii import navegador  # noqa: E402

APP = "http://127.0.0.1:8799/"
SAL = sys.argv[1]
os.makedirs(SAL, exist_ok=True)
resultados = []


def p(*a):
    print(*a, flush=True)


def registrar(nombre, ok, detalle=""):
    resultados.append((nombre, ok, detalle))
    p(("OK   " if ok else "FALLA"), nombre, "-", detalle)


def api(ruta, cuerpo=None):
    h = {"Content-Type": "application/json", "X-Contasii": "1"}
    r = urllib.request.Request(APP + "api/" + ruta, headers=h,
                               data=None if cuerpo is None else json.dumps(cuerpo).encode())
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


def foto(nav, tid, nombre, ancho=1100, alto=900, completa=True):
    nav.en_pestana(tid, "Emulation.setDeviceMetricsOverride", {"width": ancho, "height": alto, "deviceScaleFactor": 1, "mobile": False})
    if completa:
        h = nav.evaluar(tid, "Math.max(document.documentElement.scrollHeight, 600)")
        nav.en_pestana(tid, "Emulation.setDeviceMetricsOverride", {"width": ancho, "height": min(int(h), 3000), "deviceScaleFactor": 1, "mobile": False})
    r = nav.en_pestana(tid, "Page.captureScreenshot", {"format": "png"})
    with open(os.path.join(SAL, nombre), "wb") as f:
        f.write(base64.b64decode(r["data"]))
    nav.en_pestana(tid, "Emulation.clearDeviceMetricsOverride", {})


def esperar(fn, seg=60, desc=""):
    lim = time.monotonic() + seg
    ultimo = None
    while time.monotonic() < lim:
        try:
            ultimo = fn()
            if ultimo:
                return ultimo
        except Exception as e:  # noqa: BLE001
            ultimo = repr(e)
        time.sleep(0.5)
    raise SystemExit(f"TIEMPO AGOTADO esperando {desc}: {ultimo}")


class Proceso:
    def poll(self):
        return None


def conectar_existente(puerto, ruta_ws):
    """Se conecta, solo para observar y fotografiar, a la ventana que abrió el programa."""
    n = navegador.Navegador.__new__(navegador.Navegador)
    import itertools
    import threading
    n.ids, n.lock, n.sesiones, n.puerto, n.proc = itertools.count(1), threading.RLock(), {}, puerto, Proceso()
    n.ws = navegador.WebSocket("127.0.0.1", puerto, ruta_ws)
    return n


# 0. El programa instalado responde
esperar(lambda: api("ping").get("app") == "contasii", 60, "el programa")
registrar("Programa instalado abierto", True, APP)

# 1. Interfaz del programa (Edge sin ventana, solo para manejar la pantalla)
ui = navegador.Navegador(APP, headless=True)
tid = esperar(lambda: next((x["targetId"] for x in ui.pestanas() if x["url"].startswith(APP)), None), 30, "pestaña UI")
js = lambda x, t=30: ui.evaluar(tid, x, timeout=t)  # noqa: E731
esperar(lambda: js("!!document.querySelector('#fNueva')"), 30, "formulario de empresa")
js("""document.querySelector('#nRut').value='76.111.111-6'; document.querySelector('#nNombre').value='EMPRESA DE PRUEBA (FICTICIA)';
document.querySelector('#nReg').value='14D8'; document.querySelector('#fNueva').requestSubmit(); 1""")
esperar(lambda: js("!!document.querySelector('#selMes')"), 30, "inicio del mes")
js("document.querySelector('#selMes').value='10'; document.querySelector('#selAnio').value='2026'; document.querySelector('#selMes').dispatchEvent(new Event('change')); 1")
esperar(lambda: js("document.querySelector('h1').textContent.includes('Octubre 2026')"), 30, "octubre 2026")
js("document.querySelector('[data-ir=archivos]').click(); 1")
esperar(lambda: js("!!document.querySelector('#siiIr')"), 30, "botón Ingresar al SII")
foto(ui, tid, "1_programa_paso1.png")
registrar("Paso 1 muestra «Ingresar al SII»", True)

# 2. «Ingresar al SII»: el programa abre Edge (con ventana) en la página oficial
js("document.querySelector('#siiIr').click(); 1")
texto = esperar(lambda: (lambda t: t if ("Ingrese al SII" in t or "No encontré" in t or "No se pudo" in t) else None)(
    js("document.querySelector('#siiEstado').innerText")), 60, "respuesta al ingresar")
foto(ui, tid, "2_programa_esperando_ingreso.png")
registrar("El programa pide ingresar en la ventana del SII", "Ingrese al SII" in texto, texto.replace("\n", " ")[:160])

archivo = esperar(lambda: glob.glob(os.path.join(os.environ["TEMP"], "micontabilidad-sii-*", "DevToolsActivePort")), 30, "ventana del SII")[0]
with open(archivo) as f:
    puerto, ruta_ws = f.read().split()[:2]
sii = conectar_existente(int(puerto), ruta_ws)
perfil = os.path.dirname(archivo)
p("Ventana del SII: perfil temporal", perfil)


def pagina_ingreso():
    for x in sii.pestanas():
        if "/AUT2000/" in x["url"]:
            v = sii.evaluar(x["targetId"], "[document.readyState, location.href, document.title, ['#rutcntr','#clave','#bt_ingresar','#myHref'].map(s => !!document.querySelector(s))]", timeout=10)
            if v and v[0] == "complete" and "/AUT2000/" in v[1]:
                return x["targetId"], v
    return None


stid, info = esperar(pagina_ingreso, 60, "página de ingreso del SII")
p("Pestañas de la ventana del SII:", [x["url"] for x in sii.pestanas()])
foto(sii, stid, "3_sii_pagina_de_ingreso_real.png", 1100, 800, completa=False)
registrar("La ventana muestra la página oficial de ingreso del SII", all(info[3]),
          f"{info[1]} | título «{info[2]}» | RUT, clave, Ingresar, Clave Única: {info[3]}")

# 3. Antes de ingresar, «Traer» no descarga nada y lo explica
est = api("sii-portal/estado", {})
registrar("Estado antes de ingresar = esperando", est.get("estado") == "esperando", est.get("estado"))
emp = api("empresas")["empresas"][0]["archivo"]
traer = api(f"e/{emp}/sii-traer", {"periodo": "2026-10"})
msgs = [r.get("error", "") for r in traer.get("resultados", [])]
registrar("Traer sin haber ingresado pide terminar el ingreso", all("Termine de ingresar" in m for m in msgs) and msgs, " / ".join(msgs))

# 4. Botón de Clave Única (no se ingresa ninguna clave) (desde el SII)
sii.evaluar(stid, "document.querySelector('#myHref').click(); 1")
time.sleep(6)
u = next((x for x in sii.pestanas() if x["targetId"] == stid), {})
foto(sii, stid, "4_clave_unica.png", 1100, 800, completa=False)
registrar("El botón de Clave Única lleva a claveunica.gob.cl", "claveunica.gob.cl" in u.get("url", ""),
          f"{u.get('url', '')[:90]}… | título «{u.get('title', '')}»")

# 5. Desconectar: se cierra la ventana y se borra el perfil temporal
sii.ws.cerrar()
js("document.querySelector('#siiSalir').click(); 1")
esperar(lambda: js("!!document.querySelector('#siiIr')"), 30, "desconectado")
time.sleep(2)
foto(ui, tid, "5_programa_desconectado.png")
registrar("Desconectar cierra la ventana y borra el perfil temporal", not os.path.exists(perfil), perfil)
ui.cerrar()

p("\n================ RESUMEN ================")
for n, ok, d in resultados:
    p(("OK   " if ok else "FALLA"), n)
sys.exit(0 if all(ok for _, ok, _ in resultados) else 1)
