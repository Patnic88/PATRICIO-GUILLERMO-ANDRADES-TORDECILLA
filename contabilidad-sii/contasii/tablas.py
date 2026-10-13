"""Convierte planillas y tablas al texto CSV (separado por ';') que leen los importadores.

Acepta:
- CSV o texto separado por ';', ',' o tabuladores. Incluye una tabla copiada desde el
  navegador (por ejemplo, desde la página del SII) y pegada en el programa.
- Páginas HTML guardadas y archivos .xls que en realidad son una tabla HTML.
- Excel .xlsx (con openpyxl).

Busca la fila de encabezados: la primera con al menos tres columnas que algún importador
reconoce. Descarta los títulos que haya antes y las filas de totales. No interpreta montos
ni fechas; eso lo hace cada importador, que valida y se detiene ante lo que no entiende.
Un Excel antiguo (.xls binario) no se puede leer sin librerías externas: se pide guardarlo
como .xlsx o .csv.
"""

import csv
import io
from datetime import date, datetime
from html.parser import HTMLParser

from . import honorarios, rcv

FIRMA_XLSX = b"PK\x03\x04"
FIRMA_XLS = b"\xd0\xcf\x11\xe0"
CONOCIDOS = {a for alias in list(rcv.ALIAS.values()) + list(honorarios.ALIAS.values()) for a in alias}
# Encabezados demasiado genéricos para decidir solos que una fila es de encabezados.
GENERICOS = {"n", "no", "numero", "nro", "fecha", "rut", "nombre", "total", "estado", "boleta", "folio", "iva", "neto", "exento"}


class ErrorTabla(Exception):
    """Error que se muestra tal cual al usuario."""


def _texto(datos: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return datos.decode(enc)
        except UnicodeDecodeError:
            continue
    return datos.decode("utf-8", "replace")


def _celda(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        v = v.date()
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return " ".join(str(v).split())


class _Tablas(HTMLParser):
    """Extrae las tablas de un HTML como listas de filas de texto."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tablas, self._pila = [], []

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._pila.append({"filas": [], "fila": None, "celda": None})
        elif not self._pila:
            return
        elif tag == "tr":
            self._pila[-1]["fila"] = []
        elif tag in ("td", "th"):
            t = self._pila[-1]
            if t["fila"] is None:
                t["fila"] = []
            t["celda"] = []
        elif tag == "br" and self._pila[-1]["celda"] is not None:
            self._pila[-1]["celda"].append(" ")

    def handle_endtag(self, tag):
        if not self._pila:
            return
        t = self._pila[-1]
        if tag in ("td", "th") and t["celda"] is not None:
            t["fila"].append(" ".join("".join(t["celda"]).split()))
            t["celda"] = None
        elif tag == "tr" and t["fila"] is not None:
            if t["celda"] is not None:  # celda sin cierre
                t["fila"].append(" ".join("".join(t["celda"]).split()))
                t["celda"] = None
            t["filas"].append(t["fila"])
            t["fila"] = None
        elif tag == "table":
            self.tablas.append(self._pila.pop()["filas"])

    def handle_data(self, data):
        if self._pila and self._pila[-1]["celda"] is not None:
            self._pila[-1]["celda"].append(data)


def _puntaje(fila) -> int:
    """Cuántas columnas de la fila son encabezados que algún importador reconoce."""
    normas = {rcv._norm(c) for c in fila if c}
    especificos = normas & (CONOCIDOS - GENERICOS)
    return len(normas & CONOCIDOS) if especificos else 0


def _encabezado(filas):
    """Índice de la fila de encabezados, o None si ninguna se reconoce."""
    for i, fila in enumerate(filas[:60]):
        if _puntaje(fila) >= 3:
            return i
    return None


def _desde_html(texto: str):
    p = _Tablas()
    p.feed(texto)
    p.close()
    candidatas = [(t, _encabezado(t)) for t in p.tablas if t]
    for t, i in candidatas:
        if i is not None:
            return t
    if not candidatas:
        raise ErrorTabla("El archivo no contiene ninguna tabla.")
    return max((t for t, _ in candidatas), key=len)


def _desde_xlsx(datos: bytes):
    try:
        import openpyxl
    except ImportError:
        raise ErrorTabla("Para leer archivos Excel (.xlsx) falta el complemento openpyxl. Guarde el archivo como CSV "
                         "desde Excel y súbalo de nuevo.")
    try:
        libro = openpyxl.load_workbook(io.BytesIO(datos), read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001 - archivo dañado o no es Excel
        raise ErrorTabla(f"No se pudo abrir el archivo Excel: {e}")
    try:
        mejor = None
        for hoja in libro.worksheets:
            filas = [[_celda(v) for v in fila] for fila in hoja.iter_rows(values_only=True)]
            if _encabezado(filas) is not None:
                return filas
            mejor = mejor or filas
        return mejor or []
    finally:
        libro.close()


def _desde_texto(texto: str):
    lineas = [l for l in texto.splitlines() if l.strip()]
    if not lineas:
        raise ErrorTabla("El archivo está vacío.")
    muestra = "\n".join(lineas[:20])
    try:
        sep = csv.Sniffer().sniff(muestra, delimiters=";\t,").delimiter
    except csv.Error:
        sep = max(";\t,", key=lambda c: muestra.count(c))
    return [[" ".join(c.split()) for c in fila] for fila in csv.reader(io.StringIO("\n".join(lineas)), delimiter=sep)]


def _es_total(fila) -> bool:
    primera = next((c for c in fila if c.strip()), "")
    return rcv._norm(primera).startswith("total")


def a_csv(nombre: str, datos: bytes) -> str:
    """Devuelve el contenido como texto CSV con ';', listo para los importadores."""
    if datos.startswith(FIRMA_XLS):
        raise ErrorTabla("Este archivo es de Excel antiguo (.xls). Ábralo en Excel y use «Guardar como» → «Libro de "
                         "Excel (.xlsx)» o «CSV (delimitado por punto y coma)», y súbalo de nuevo.")
    if datos.startswith(FIRMA_XLSX):
        filas = _desde_xlsx(datos)
    else:
        texto = _texto(datos)
        inicio = texto.lstrip()[:2000].lower()
        if "<table" in texto.lower() and (inicio.startswith("<") or "<html" in inicio):
            filas = _desde_html(texto)
        else:
            primera = texto.lstrip("﻿").splitlines()[0] if texto.strip() else ""
            if ";" in primera and _encabezado([primera.split(";")]) == 0:
                return texto.lstrip("﻿")  # CSV del SII tal cual: no se toca
            filas = _desde_texto(texto)
    i = _encabezado(filas)
    if i is None:
        # Sin encabezados reconocibles: se entrega igual y el importador explica qué columnas faltan.
        i = 0
    encabezado = _sin_repetidos(filas[i]) if filas else []
    minimo = 2 if len(encabezado) >= 3 else 1  # una sola celda con texto es una nota o «Sin Datos»
    cuerpo = [f for f in filas[i + 1:] if sum(1 for c in f if c.strip()) >= minimo and not _es_total(f)]
    salida = io.StringIO()
    w = csv.writer(salida, delimiter=";", lineterminator="\n")
    w.writerow(encabezado)
    w.writerows(cuerpo)
    return salida.getvalue()


def _sin_repetidos(encabezado):
    """Numera los encabezados repetidos («Fecha», «Fecha 2»): el lector de CSV se quedaría solo con el último."""
    vistos, out = {}, []
    for c in encabezado:
        n = vistos.get(c, 0) + 1
        vistos[c] = n
        out.append(c if n == 1 or not c else f"{c} {n}")
    return out
