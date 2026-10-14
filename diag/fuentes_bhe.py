"""Lectura directa (sin credenciales) de páginas oficiales sobre boletas de honorarios.
Guarda el texto de cada página en fuentes/ con la URL, el estado HTTP y la fecha de lectura."""
import datetime, hashlib, html, os, re, subprocess, urllib.error, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}
os.makedirs("fuentes", exist_ok=True)
indice = []


def texto_html(crudo: bytes) -> str:
    for enc in ("utf-8", "latin-1"):
        try:
            t = crudo.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
    t = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d|td|th)>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return "\n".join(" ".join(l.split()) for l in t.splitlines() if l.strip())


for url in [u.strip() for u in open("diag/urls_fuentes.txt") if u.strip()]:
    nombre = hashlib.sha1(url.encode()).hexdigest()[:10]
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
            estado, final, crudo, tipo = r.status, r.geturl(), r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        estado, final, crudo, tipo = e.code, url, e.read(), ""
    except Exception as e:  # noqa: BLE001
        estado, final, crudo, tipo = None, url, repr(e).encode(), "error"
    if url.lower().endswith(".pdf") or "pdf" in tipo:
        open(f"fuentes/{nombre}.pdf", "wb").write(crudo)
        try:
            texto = subprocess.run(["pdftotext", "-layout", f"fuentes/{nombre}.pdf", "-"], capture_output=True,
                                   text=True, timeout=60).stdout
        except Exception as e:  # noqa: BLE001
            texto = f"[no se pudo extraer texto del PDF: {e}]"
        os.remove(f"fuentes/{nombre}.pdf")
    elif url.lower().endswith(".doc"):
        texto = "[documento .doc no convertido]"
    else:
        texto = texto_html(crudo)
    leido = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    with open(f"fuentes/{nombre}.txt", "w", encoding="utf-8") as f:
        f.write(f"URL: {url}\nURL final: {final}\nEstado HTTP: {estado}\nLeído: {leido}\n\n{texto}")
    indice.append(f"{nombre}\t{estado}\t{len(texto)}\t{url}")
    print(nombre, estado, len(texto), url)
open("fuentes/INDICE.tsv", "w", encoding="utf-8").write("\n".join(indice) + "\n")
