"""Segunda lectura temporal: guarda el contenido CRUDO (HTML/JS/XML) de algunas fuentes oficiales,
para revisar el código del simulador del SII y el texto legal en LeyChile. Sin credenciales."""
import datetime, hashlib, os, re, time, urllib.error, urllib.parse, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}
os.makedirs("fuentes_crudas", exist_ok=True)
indice = []


def bajar(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            return r.status, r.geturl(), r.read()
    except urllib.error.HTTPError as e:
        return e.code, url, e.read()
    except Exception as e:  # noqa: BLE001
        return None, url, repr(e).encode()


def guardar(url, estado, final, crudo, ext):
    nombre = hashlib.sha1(url.encode()).hexdigest()[:10] + ext
    leido = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    with open(f"fuentes_crudas/{nombre}", "wb") as f:
        f.write(crudo)
    indice.append(f"{nombre}\t{estado}\t{len(crudo)}\t{leido}\t{url}\t{final}")
    print(nombre, estado, len(crudo), url)


pendientes = [u.strip() for u in open("diag/urls_crudas.txt") if u.strip() and not u.startswith("#")]
vistos = set()
while pendientes:
    url = pendientes.pop(0)
    if url in vistos:
        continue
    vistos.add(url)
    estado, final, crudo = bajar(url)
    for espera in (30, 90):  # LeyChile responde 429 si se consulta seguido
        if estado != 429:
            break
        time.sleep(espera)
        estado, final, crudo = bajar(url)
    time.sleep(15)
    ext = ".xml" if "obtxml" in url else (".js" if url.split("?")[0].endswith(".js") else ".html")
    guardar(url, estado, final, crudo, ext)
    # En las páginas del SII, seguir los <script src> del mismo sitio (código del simulador).
    if ext == ".html" and "sii.cl" in url:
        texto = crudo.decode("utf-8", "replace")
        for src in re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', texto, re.I):
            js = urllib.parse.urljoin(final, src)
            if "sii.cl" in urllib.parse.urlparse(js).netloc:
                pendientes.append(js)
open("fuentes_crudas/INDICE.tsv", "w", encoding="utf-8").write("\n".join(indice) + "\n")
