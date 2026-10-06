"""Importación de documentos descargados a mano desde los sitios oficiales.

Es la vía que funciona hoy para todas las fuentes. Dos formas:

1. Carpeta + manifiesto CSV (recomendado), con columnas:
   archivo,fuente,tipo,identificador,fecha,url,titulo
2. Carpeta sin manifiesto: se indica --fuente y --tipo; el identificador se toma
   del "Rol N° ..." del texto (sentencias) o del nombre del archivo.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Iterator

from .clasificar import extraer_rol
from .modelo import Documento, TIPOS
from .texto import html_a_texto, pdf_a_texto

EXTENSIONES = {".pdf", ".html", ".htm", ".txt"}
_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def leer_archivo(ruta: Path) -> str:
    ext = ruta.suffix.lower()
    if ext == ".pdf":
        return pdf_a_texto(ruta.read_bytes())
    contenido = ruta.read_text(encoding="utf-8", errors="replace")
    return html_a_texto(contenido) if ext in (".html", ".htm") else contenido.strip()


def _validar_fecha(fecha: str, archivo: str) -> str:
    fecha = (fecha or "").strip()
    if fecha and not _FECHA.match(fecha):
        raise ValueError(f"{archivo}: fecha '{fecha}' debe tener formato AAAA-MM-DD")
    return fecha


def desde_manifiesto(carpeta: Path, manifiesto: Path) -> Iterator[Documento]:
    with manifiesto.open(encoding="utf-8-sig", newline="") as f:
        for i, fila in enumerate(csv.DictReader(f), start=2):
            ruta = carpeta / fila["archivo"]
            if not ruta.exists():
                raise FileNotFoundError(f"Línea {i} del manifiesto: no existe {ruta}")
            fuente, tipo = fila["fuente"].strip(), fila["tipo"].strip()
            if tipo not in TIPOS.get(fuente, []):
                raise ValueError(f"Línea {i}: tipo '{tipo}' no válido para fuente '{fuente}'")
            texto = leer_archivo(ruta)
            yield Documento(
                fuente=fuente, tipo=tipo,
                identificador=fila.get("identificador", "").strip() or extraer_rol(texto) or ruta.stem,
                fecha=_validar_fecha(fila.get("fecha", ""), fila["archivo"]),
                url=fila.get("url", "").strip(), titulo=fila.get("titulo", "").strip(),
                texto=texto, origen=f"importacion:{fila['archivo']}",
            )


def desde_carpeta(carpeta: Path, fuente: str, tipo: str) -> Iterator[Documento]:
    if tipo not in TIPOS.get(fuente, []):
        raise ValueError(f"Tipo '{tipo}' no válido para fuente '{fuente}'")
    for ruta in sorted(carpeta.iterdir()):
        if ruta.suffix.lower() not in EXTENSIONES:
            continue
        texto = leer_archivo(ruta)
        ident = (extraer_rol(texto) if fuente in ("cs", "tc") else "") or ruta.stem
        yield Documento(fuente=fuente, tipo=tipo, identificador=ident, texto=texto,
                        titulo=ruta.stem, origen=f"importacion:{ruta.name}")
