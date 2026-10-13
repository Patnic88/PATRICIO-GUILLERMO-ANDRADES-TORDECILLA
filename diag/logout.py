"""Diagnóstico (sin credenciales): ¿qué dirección usa el propio SII para «Cerrar sesión»?"""
import re, ssl, urllib.request, urllib.error
from urllib.parse import urljoin
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r:
            return r.status, r.geturl(), r.read().decode("latin-1")
    except urllib.error.HTTPError as e:
        return e.code, u, e.read().decode("latin-1")
    except Exception as e:
        return None, u, repr(e)
vistos, cola = set(), ["https://www.sii.cl/", "https://zeusr.sii.cl/AUT2000/js/loadBarra.js", "https://zeusr.sii.cl/AUT2000/js/AutAll.js",
                       "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://misiir.sii.cl/cgi_misii/siihome.cgi"]
pat = re.compile(r"(?i)(autTermino|Inwor|CAutFin|cerrar\s*sesi|cierre\s*de\s*sesi|logout|salir)")
while cola and len(vistos) < 25:
    u = cola.pop(0)
    if u in vistos: continue
    vistos.add(u)
    st, final, t = get(u)
    print(f"\n=== {u} -> {st} {final} ({len(t)} car.)")
    for m in list(pat.finditer(t))[:8]:
        print("   …", t[max(0, m.start()-160):m.end()+160].replace("\n", " "), "…")
    for src in re.findall(r'(?:src|href)=["\']([^"\']+\.js[^"\']*)["\']', t)[:15]:
        v = urljoin(final, src)
        if "sii.cl" in v and v not in vistos: cola.append(v)
for u in ["https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi", "https://zeusr.sii.cl/cgi_AUT2000/CAutInwor498.cgi?https://www.sii.cl"]:
    st, final, t = get(u)
    print(f"\n=== SIN SESIÓN {u} -> {st} {final}\n   {' '.join(t.split())[:400]}")
