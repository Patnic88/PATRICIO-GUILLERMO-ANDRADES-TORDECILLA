"""Recolector genérico basado en páginas índice.

Cada fuente se describe en `fuentes.json`. La estrategia "indice_enlaces" baja una
página índice, toma los enlaces cuya URL calza con `patron_enlace` y descarga cada
documento (HTML o PDF).

Reglas de recolección responsable:
- Respeta robots.txt (si no se puede leer, no recolecta).
- Pausa configurable entre solicitudes (por defecto 3 s).
- Se identifica con un User-Agent con contacto.
- Una fuente con "verificado": false no se recolecta salvo con forzar=True:
  significa que nadie ha comprobado aún que la URL y el patrón correspondan a la
  estructura actual del sitio oficial.
"""
from __future__ import annotations

import json
import logging
import re
import time
import urllib.request
import urllib.robotparser
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterator
from urllib.parse import urlparse

from ..modelo import Documento
from ..texto import extraer_enlaces, html_a_texto, pdf_a_texto
from ..clasificar import extraer_rol

log = logging.getLogger(__name__)

CONFIG_POR_DEFECTO = Path(__file__).with_name("fuentes.json")
USER_AGENT = "JurisBot/0.1 (recolector de documentos públicos; contacto: {contacto})"


@dataclass
class ConfigFuente:
    clave: str
    nombre: str
    tipo: str
    estrategia: str                     # "indice_enlaces" o "manual"
    verificado: bool = False
    url_indice: str = ""                # admite {anio}
    patron_enlace: str = ""             # regex sobre la URL absoluta; grupo con nombre 'id'
    pausa_segundos: float = 3.0
    nota: str = ""
    sitio_oficial: str = ""

    def urls_indice(self, anios: list[int]) -> list[str]:
        if "{anio}" in self.url_indice:
            return [self.url_indice.format(anio=a) for a in anios]
        return [self.url_indice]


def cargar_config(ruta: Path | str = CONFIG_POR_DEFECTO) -> dict[str, ConfigFuente]:
    datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    return {f["clave"]: ConfigFuente(**f) for f in datos["fuentes"]}


@dataclass
class Respuesta:
    url: str
    tipo_contenido: str
    datos: bytes

    def texto(self) -> str:
        if self.datos[:5] == b"%PDF-" or "pdf" in self.tipo_contenido.lower():
            return pdf_a_texto(self.datos)
        html = self.datos.decode(_charset(self.tipo_contenido), errors="replace")
        return html_a_texto(html)

    def html(self) -> str:
        return self.datos.decode(_charset(self.tipo_contenido), errors="replace")


def _charset(tipo: str) -> str:
    m = re.search(r"charset=([\w-]+)", tipo or "")
    return m.group(1) if m else "utf-8"


def descargar_http(url: str, contacto: str, timeout: int = 30) -> Respuesta:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT.format(contacto=contacto)})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return Respuesta(url=r.geturl(), tipo_contenido=r.headers.get("Content-Type", ""), datos=r.read())


class Recolector:
    def __init__(self, config: ConfigFuente, contacto: str = "sin-contacto",
                 descargar: Callable[[str], Respuesta] | None = None,
                 permitido: Callable[[str], bool] | None = None,
                 dormir: Callable[[float], None] = time.sleep):
        self.config = config
        self.contacto = contacto
        self._descargar = descargar or (lambda u: descargar_http(u, contacto))
        self._permitido = permitido or self._robots_permite
        self._dormir = dormir
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    def _robots_permite(self, url: str) -> bool:
        p = urlparse(url)
        base = f"{p.scheme}://{p.netloc}"
        if base not in self._robots:
            rp = urllib.robotparser.RobotFileParser(base + "/robots.txt")
            try:
                rp.read()
                self._robots[base] = rp
            except OSError as e:
                log.warning("No se pudo leer %s/robots.txt (%s); no se recolecta.", base, e)
                self._robots[base] = None
        rp = self._robots[base]
        return bool(rp) and rp.can_fetch(USER_AGENT.format(contacto=self.contacto), url)

    def _bajar(self, url: str) -> Respuesta | None:
        if not self._permitido(url):
            log.warning("robots.txt no permite %s; se omite.", url)
            return None
        r = self._descargar(url)
        self._dormir(self.config.pausa_segundos)
        return r

    def enlaces(self, anios: list[int]) -> Iterator[tuple[str, str, str]]:
        """(id, url, texto del enlace) de cada documento listado en los índices."""
        patron = re.compile(self.config.patron_enlace)
        vistos = set()
        for url_indice in self.config.urls_indice(anios):
            r = self._bajar(url_indice)
            if r is None:
                continue
            for url, texto in extraer_enlaces(r.html(), r.url):
                m = patron.search(url)
                if m and url not in vistos:
                    vistos.add(url)
                    yield m.group("id"), url, texto

    def recolectar(self, anios: list[int], forzar: bool = False, limite: int | None = None,
                   omitir: Callable[[str], bool] = lambda ident: False) -> Iterator[Documento]:
        c = self.config
        if c.estrategia != "indice_enlaces":
            raise NotImplementedError(
                f"La fuente '{c.clave}' no tiene recolector automático ({c.nota}). "
                "Use 'importar' con los documentos descargados del sitio oficial.")
        if not c.verificado and not forzar:
            raise PermissionError(
                f"La configuración de '{c.clave}' no está verificada contra el sitio oficial. "
                "Revise url_indice y patron_enlace en fuentes.json, marque \"verificado\": true "
                "o ejecute con --forzar para probar.")
        n = 0
        for ident, url, texto_enlace in self.enlaces(anios):
            if omitir(ident):
                continue
            r = self._bajar(url)
            if r is None:
                continue
            cuerpo = r.texto()
            identificador = ident
            if c.clave in ("cs", "tc"):
                identificador = extraer_rol(cuerpo) or ident
            yield Documento(fuente=c.clave, tipo=c.tipo, identificador=identificador,
                            titulo=texto_enlace, url=url, texto=cuerpo,
                            origen=f"recolector:{c.clave}")
            n += 1
            if limite and n >= limite:
                return
