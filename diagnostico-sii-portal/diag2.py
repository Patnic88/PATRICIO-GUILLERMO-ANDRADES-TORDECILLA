"""Diagnóstico 2 (sin credenciales): control de Edge en Windows sobre la página oficial del SII."""
import json, os, re, sys, tempfile, time, urllib.request, ssl
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contasii import navegador

URL_RCV = "https://www4.sii.cl/consdcvinternetui/"
URL_INGRESO = "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?" + URL_RCV

def p(*a):
    print(*a, flush=True)

# A. Función autenticado() y referencias a cookies en AutAll.js
js = urllib.request.urlopen(urllib.request.Request("https://zeusr.sii.cl/AUT2000/js/AutAll.js", headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read().decode("latin-1")
i = js.find("function autenticado")
p("=== A. AutAll.js autenticado():\n", js[i:i + 1500])
p("=== nombres de cookie mencionados:", sorted(set(re.findall(r"['\"]([A-Z_]{3,20})['\"]", js)))[:80])

# B. Redirección de Clave Única
class NoRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None
op = urllib.request.build_opener(NoRedir)
try:
    r = op.open(urllib.request.Request("https://zeusr.sii.cl/cgi_AUT2000/InitClaveUnicaP.cgi?code=411&REF=" + URL_RCV, headers={"User-Agent": "Mozilla/5.0"}), timeout=30)
    p("=== B. InitClaveUnicaP estado", r.status, r.read()[:1500])
except urllib.error.HTTPError as e:
    loc = e.headers.get("Location", "")
    p("=== B. InitClaveUnicaP estado", e.code, "Location:", re.sub(r"(state|nonce)=[^&]+", r"\1=…", loc))
    p("    cuerpo:", e.read()[:800])

# C. Edge real controlado por el módulo navegador
p("=== C. candidatos:", navegador.candidatos())
ruta = navegador.buscar_navegador()
p("navegador:", ruta)
t = time.time()
nav = navegador.Navegador(URL_INGRESO, headless=True)
p("abierto en %.1fs, puerto %s" % (time.time() - t, nav.puerto))
descargas = tempfile.mkdtemp()
try:
    nav.comando("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": descargas})
    p("setDownloadBehavior: OK")
except navegador.ErrorNavegador as e:
    p("setDownloadBehavior: ERROR", e)
for _ in range(40):
    ps = nav.pestanas()
    if ps and ps[0]["url"].startswith("https://zeusr") :
        break
    time.sleep(0.5)
time.sleep(3)
ps = nav.pestanas()
p("pestañas:", [(x["url"], x["title"]) for x in ps])
tid = ps[0]["targetId"]
p("readyState:", nav.evaluar(tid, "document.readyState"))
p("campos:", nav.evaluar(tid, "JSON.stringify(['#rutcntr','#clave','#bt_ingresar','#myHref','#referencia'].map(s=>[s, !!document.querySelector(s)]))"))
p("referencia tras validaAut? valor inicial:", nav.evaluar(tid, "document.querySelector('#referencia') && document.querySelector('#referencia').value"))
p("cookies antes de ingresar:", [(c["name"], c["domain"], c["httpOnly"]) for c in nav.cookies()])
# Ir al RCV sin sesión: debe volver a la página de ingreso
nav.navegar(tid, URL_RCV)
time.sleep(2)
p("tras abrir el RCV sin sesión:", [x["url"] for x in nav.pestanas()])
# Botón de Clave Única: debe llevar a claveunica.gob.cl
nav.evaluar(tid, "document.querySelector('#myHref') ? (callOne(), 'ok') : 'sin botón'")
for _ in range(30):
    time.sleep(1)
    u = nav.pestanas()[0]["url"]
    if "claveunica" in u:
        break
u = nav.pestanas()[0]["url"]
p("tras botón Clave Única:", re.sub(r"(state|nonce|code_challenge)=[^&]+", r"\1=…", u))
p("título:", nav.pestanas()[0]["title"])
p("campos Clave Única:", nav.evaluar(tid, "JSON.stringify([...document.querySelectorAll('input')].map(i=>[i.name,i.type]).slice(0,12))"))
perfil = nav.perfil
nav.cerrar()
p("cerrado; vivo:", nav.vivo(), "perfil borrado:", not os.path.exists(perfil))
