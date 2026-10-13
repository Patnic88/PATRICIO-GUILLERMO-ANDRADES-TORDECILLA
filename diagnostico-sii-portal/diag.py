"""Diagnóstico informativo (sin credenciales) del portal del SII.

Lee páginas y código públicos del SII para documentar, antes de programar:
1. Cómo es la página de ingreso (RUT + clave tributaria / Clave Única).
2. Qué servicios usa la aplicación del Registro de Compras y Ventas (RCV) y con
   qué datos los llama, en especial la descarga del detalle en CSV.
No envía ninguna clave ni consulta datos de contribuyentes.
"""

import gzip
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0 Safari/537.36 Edg/126.0")
CTX = ssl.create_default_context()


def get(url, data=None, headers=None, timeout=40):
    h = {"User-Agent": UA, "Accept-Language": "es-CL,es;q=0.9", "Accept-Encoding": "gzip"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            cuerpo = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                cuerpo = gzip.decompress(cuerpo)
            return r.status, r.geturl(), dict(r.headers), cuerpo
    except urllib.error.HTTPError as e:
        cuerpo = e.read()
        if e.headers.get("Content-Encoding") == "gzip":
            cuerpo = gzip.decompress(cuerpo)
        return e.code, url, dict(e.headers), cuerpo
    except Exception as e:  # noqa: BLE001
        return None, url, {}, repr(e).encode()


def texto(b):
    for enc in ("utf-8", "latin-1"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode("utf-8", "replace")


class Formularios(HTMLParser):
    def __init__(self):
        super().__init__()
        self.forms, self.scripts, self.links, self.iframes = [], [], [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "form":
            self.forms.append({"action": a.get("action"), "method": a.get("method"), "id": a.get("id"),
                               "name": a.get("name"), "inputs": []})
        elif tag in ("input", "select", "button") and self.forms:
            self.forms[-1]["inputs"].append({k: a.get(k) for k in ("tag", "type", "name", "id", "value") if a.get(k)}
                                            | {"tag": tag})
        elif tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        elif tag == "a" and a.get("href"):
            self.links.append((a.get("href"), a.get("id"), a.get("class")))
        elif tag == "iframe":
            self.iframes.append(a.get("src"))


def contextos(t, patron, n=4, ancho=350, titulo=None):
    print(f"\n--- «{titulo or patron}»: ", end="")
    ms = list(re.finditer(patron, t))
    print(f"{len(ms)} coincidencias")
    vistos = set()
    k = 0
    for m in ms:
        ini = max(0, m.start() - ancho)
        frag = t[ini:m.end() + ancho].replace("\n", " ")
        clave = frag[ancho - 40:ancho + 80]
        if clave in vistos:
            continue
        vistos.add(clave)
        print(f"  [{m.start()}] …{frag}…")
        k += 1
        if k >= n:
            break


def seccion(t):
    print("\n" + "=" * 100 + f"\n{t}\n" + "=" * 100)


def pagina(url, extra_patrones=()):
    st, final, hdr, cuerpo = get(url)
    t = texto(cuerpo)
    print(f"GET {url}\n  estado={st} final={final} largo={len(cuerpo)}")
    print("  cookies:", [c.split("=")[0] for c in (hdr.get("Set-Cookie") or "").split(", ") if "=" in c])
    p = Formularios()
    try:
        p.feed(t)
    except Exception as e:  # noqa: BLE001
        print("  (HTML no analizable)", e)
    print("  formularios:", json.dumps(p.forms, ensure_ascii=False, indent=1))
    print("  scripts:", p.scripts)
    print("  iframes:", p.iframes)
    print("  enlaces relevantes:", [l for l in p.links if re.search(r"(?i)clave|unica|aut|login|ingres", " ".join(map(str, l)))][:30])
    for pat in extra_patrones:
        contextos(t, pat, n=6, ancho=250)
    return final, t, p


def main():
    seccion("1. Página de ingreso al SII con RUT y clave (referencia: aplicación RCV)")
    final, t, p = pagina("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?"
                         "https://www4.sii.cl/consdcvinternetui/",
                         (r"CAutInicio", r"(?i)claveunica|clave\s*[úu]nica", r"(?i)recaptcha|captcha",
                          r"(?i)referencia", r"name=\"?rut", r"(?i)\.submit\(\)"))
    print("\n  HTML (primeros 6000):\n", t[:6000])
    for s in p.scripts:
        u = urljoin(final, s)
        if "sii.cl" not in u:
            continue
        st, _, _, c = get(u)
        js = texto(c)
        print(f"\n  JS {u} estado={st} largo={len(c)}")
        for pat in (r"CAutInicio", r"(?i)claveunica", r"(?i)recaptcha", r"rutcntr", r"referencia", r"\.action\s*="):
            contextos(js, pat, n=3, ancho=250)

    seccion("2. Aplicación del Registro de Compras y Ventas (RCV)")
    final, t, p = pagina("https://www4.sii.cl/consdcvinternetui/")
    print("\n  HTML (primeros 3000):\n", t[:3000])
    srcs = [urljoin(final, s) for s in p.scripts]
    if not srcs:
        srcs = [urljoin(final, m) for m in re.findall(r'src="([^"]+\.js)"', t)]
    endpoints = set()
    for u in srcs:
        st, _, _, c = get(u)
        js = texto(c)
        print(f"\n  JS {u} estado={st} largo={len(c)}")
        endpoints |= set(re.findall(r"facadeService/(\w+)", js))
        endpoints |= set(re.findall(r"services/data/(\w+/\w+)", js))
        if len(js) < 2000:
            continue
        for pat, n in ((r"services/data", 6), (r"facadeService", 6), (r"namespace", 6), (r"conversationId", 6),
                       (r"transactionId", 3), (r"\"TOKEN\"|'TOKEN'|TOKEN", 6), (r"(?i)recaptcha", 8),
                       (r"Export", 10), (r"ptributario", 4), (r"estadoContab", 4), (r"codTipoDoc", 4),
                       (r"rutEmisor", 4), (r"new Blob", 6), (r"(?i)text/csv|\.csv", 6), (r"(?i)document\.cookie", 4),
                       (r"(?i)getCookie|cookieService", 4), (r"busquedaInicial|getResumen", 4), (r"respEstado", 4),
                       (r"codRespuesta", 4), (r"(?i)msgeRespuesta|mensaje", 2), (r"(?i)login|autentic|CAutInicio", 4)):
            contextos(js, pat, n=n, ancho=300)
    print("\n  SERVICIOS ENCONTRADOS:", sorted(endpoints))

    seccion("3. Respuesta de los servicios de exportación SIN sesión (solo para ver el formato del error)")
    for ep in sorted(e for e in endpoints if "Export" in e)[:4]:
        u = f"https://www4.sii.cl/consdcvinternetui/services/data/facadeService/{ep}" if "/" not in ep else \
            f"https://www4.sii.cl/consdcvinternetui/services/data/{ep}"
        st, final, hdr, c = get(u, data=b"{}", headers={"Content-Type": "application/json"})
        print(f"POST {u}\n  estado={st} tipo={hdr.get('Content-Type')} cuerpo={texto(c)[:600]!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
