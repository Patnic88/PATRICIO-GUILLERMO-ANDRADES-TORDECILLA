"""Extracción de texto y enlaces desde HTML y PDF (solo biblioteca estándar + pypdf opcional)."""
from __future__ import annotations

import io
import re
from html.parser import HTMLParser
from urllib.parse import urljoin


class _Texto(HTMLParser):
    OMITIR = {"script", "style", "noscript", "head"}
    BLOQUE = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.partes: list[str] = []
        self._omitir = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.OMITIR:
            self._omitir += 1
        elif tag in self.BLOQUE:
            self.partes.append("\n")

    def handle_endtag(self, tag):
        if tag in self.OMITIR and self._omitir:
            self._omitir -= 1
        elif tag in self.BLOQUE:
            self.partes.append("\n")

    def handle_data(self, data):
        if not self._omitir:
            self.partes.append(data)


def html_a_texto(html: str) -> str:
    p = _Texto()
    p.feed(html)
    texto = "".join(p.partes)
    lineas = (" ".join(l.split()) for l in texto.splitlines())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lineas)).strip()


class _Enlaces(HTMLParser):
    def __init__(self, base: str):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.enlaces: list[tuple[str, str]] = []
        self._href = None
        self._texto: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self._href, self._texto = urljoin(self.base, href), []

    def handle_data(self, data):
        if self._href is not None:
            self._texto.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.enlaces.append((self._href, " ".join("".join(self._texto).split())))
            self._href = None


def extraer_enlaces(html: str, base: str) -> list[tuple[str, str]]:
    """Lista de (url absoluta, texto del enlace)."""
    p = _Enlaces(base)
    p.feed(html)
    return p.enlaces


def pdf_a_texto(datos: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("Para leer PDF instale pypdf: pip install pypdf") from e
    lector = PdfReader(io.BytesIO(datos))
    return "\n".join((pag.extract_text() or "") for pag in lector.pages).strip()
