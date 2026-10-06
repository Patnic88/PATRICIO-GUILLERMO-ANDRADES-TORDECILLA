"""Boletas de honorarios electrónicas: recibidas (gasto + retención) y emitidas (ingreso).

Acepta un CSV con encabezados reconocibles (folio/N° boleta, fecha, RUT,
nombre, bruto, retenido, líquido/pagado y, opcionalmente, estado). Las
boletas anuladas se omiten. La tasa de retención se toma de los parámetros
del año y solo se usa para CONTROLAR la retención informada, no para
reemplazarla.
"""

import csv
import io
import re
from calendar import monthrange

from . import rut as rutmod
from .libro import Asiento, ErrorContable, Libro, Linea
from .parametros import Parametros
from .rcv import _entero, _fecha_iso, _leer_archivo, _norm

ALIAS = {
    "folio":    ["nboleta", "nroboleta", "numeroboleta", "boleta", "folio", "numero", "nro"],
    "fecha":    ["fecha", "fechaboleta", "fechaemision"],
    "estado":   ["estado"],
    "rut":      ["rutemisor", "rutreceptor", "rut"],
    "nombre":   ["nombreorazonsocial", "nombre", "razonsocial"],
    "bruto":    ["brutos", "bruto", "montobruto", "honorariobruto", "totalhonorarios"],
    "retenido": ["retenido", "retencion", "montoretenido", "impuestoretenido"],
    "liquido":  ["pagado", "liquido", "montoliquido", "liquidoapagar"],
}
REQUERIDOS = ["folio", "fecha", "rut", "bruto", "retenido"]


def leer(texto: str):
    texto = texto.lstrip("﻿")
    muestra = texto[:4096]
    try:
        dialecto = csv.Sniffer().sniff(muestra, delimiters=";,\t")
        sep = dialecto.delimiter
    except csv.Error:
        sep = ";"
    lector = csv.DictReader(io.StringIO(texto), delimiter=sep)
    enc = {_norm(h): h for h in (lector.fieldnames or []) if h}
    mapa = {}
    for campo, alias in ALIAS.items():
        for a in alias:
            if a in enc:
                mapa[campo] = enc[a]
                break
    faltan = [c for c in REQUERIDOS if c not in mapa]
    if faltan:
        raise ErrorContable(f"Faltan columnas en el archivo de honorarios: {', '.join(faltan)}. "
                            f"Encabezados leídos: {list(enc.values())}")
    return mapa, list(lector)


def importar(lib: Libro, ruta: str, sentido: str, periodo: str, params: Parametros | None = None):
    """sentido: 'recibido' (el contribuyente pagó honorarios) o 'emitido' (el contribuyente prestó servicios)."""
    if sentido not in ("recibido", "emitido"):
        raise ErrorContable("sentido debe ser 'recibido' o 'emitido'.")
    if not re.match(r"^\d{4}-\d{2}$", periodo):
        raise ErrorContable("El período debe tener formato AAAA-MM.")
    mapa, filas = leer(_leer_archivo(ruta))
    A = lib.cuenta_auto
    tasa = None
    if params is not None:
        tasa = params.valor_opcional("retencion_honorarios")
    libro_doc = f"honorario_{sentido}"
    y, m = map(int, periodo.split("-"))
    fin = f"{periodo}-{monthrange(y, m)[1]:02d}"
    res = {"importados": 0, "duplicados": 0, "anuladas": 0, "asientos": [], "alertas": []}
    if tasa is None:
        res["alertas"].append("Sin tasa de retención verificada en parámetros: no se controló el monto retenido.")

    with lib.con:
        for f in filas:
            g = lambda c: (f.get(mapa[c]) or "").strip() if c in mapa else ""
            if not g("folio"):
                continue
            if "anul" in g("estado").lower() or g("estado").upper() == "NULA":
                res["anuladas"] += 1
                continue
            rut_txt = g("rut")
            if not rutmod.es_valido(rut_txt):
                raise ErrorContable(f"Boleta {g('folio')}: RUT inválido {rut_txt!r}.")
            r = rutmod.normalizar(rut_txt)
            bruto, ret = _entero(g("bruto")), _entero(g("retenido"))
            liq = _entero(g("liquido")) if "liquido" in mapa and g("liquido") else bruto - ret
            if bruto - ret != liq:
                res["alertas"].append(f"Boleta {g('folio')}: bruto − retenido ≠ líquido ({bruto} − {ret} ≠ {liq}).")
            if tasa is not None and ret and abs(ret - round(bruto * tasa)) > 1:
                res["alertas"].append(f"Boleta {g('folio')}: retención {ret} difiere de {tasa:.2%} × {bruto}.")
            if ret == 0 and sentido == "recibido":
                res["alertas"].append(f"Boleta {g('folio')} de {r}: sin retención; verificar si correspondía retener.")
            fecha = _fecha_iso(g("fecha"))
            if lib.con.execute("SELECT 1 FROM documento WHERE libro=? AND rut_contraparte=? AND folio=?",
                               (libro_doc, r, g("folio"))).fetchone():
                res["duplicados"] += 1
                continue
            cur = lib.con.execute(
                "INSERT INTO documento (libro, tipo_dte, rut_contraparte, razon_social, folio, fecha, periodo, bruto,"
                " retencion, total, fuente) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (libro_doc, None, r, g("nombre"), g("folio"), fecha, periodo, bruto, ret, liq, ruta))
            fecha_as = fecha if fecha[:7] == periodo else fin
            if sentido == "recibido":
                a = Asiento(fecha_as, f"Boleta de honorarios N°{g('folio')} {g('nombre')}".strip(), origen="honorarios")
                a.lineas = [Linea(A("honorarios_gasto"), debe=bruto, rut_aux=r, documento=cur.lastrowid),
                            Linea(A("honorarios_por_pagar"), haber=liq, rut_aux=r, documento=cur.lastrowid)]
                if ret:
                    a.lineas.append(Linea(A("retencion_honorarios"), haber=ret, rut_aux=r, documento=cur.lastrowid))
            else:
                a = Asiento(fecha_as, f"Boleta de honorarios emitida N°{g('folio')} a {g('nombre')}".strip(),
                            origen="honorarios")
                a.lineas = [Linea(A("clientes"), debe=liq, rut_aux=r, documento=cur.lastrowid),
                            Linea(A("ingresos_honorarios"), haber=bruto, rut_aux=r, documento=cur.lastrowid)]
                if ret:
                    a.lineas.append(Linea(A("ppm_por_recuperar"), debe=ret, rut_aux=r, documento=cur.lastrowid))
            a.lineas = [l for l in a.lineas if l.debe or l.haber]
            res["asientos"].append(lib.registrar(a, _transaccion=False))
            res["importados"] += 1
    return res
