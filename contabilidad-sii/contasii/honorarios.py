"""Boletas de honorarios electrónicas: recibidas (gasto + retención) y emitidas (ingreso).

Acepta un CSV con encabezados reconocibles (folio/N° boleta, fecha, RUT,
nombre, bruto, retenido, líquido/pagado y, opcionalmente, estado). Las
boletas anuladas se omiten. La tasa de retención se toma de los parámetros
del año y solo se usa para CONTROLAR la retención informada, no para
reemplazarla.

Informes del SII (fuentes secundarias, [VERIFICAR] con un archivo real): el informe mensual
de boletas recibidas («Ver informe como planilla electrónica», informeMensualREC.xls) es una
tabla HTML con las columnas N°, Fecha, Estado, Fecha Anulación, Rut, Nombre o Razón Social,
Soc. Prof., Brutos, Retenido y Pagado, más una fila «Totales* :» y una nota al pie. El de
emitidas, en pantalla, separa la retención en «Ret. Emisor» y «Ret. Receptor» y trae
«Líquidos». Fuentes: repositorios de terceros crilam/mcp-sii (tests/fixtures) y
Erin3012/icontador (PR 15), revisados el 13-10-2026. Las filas cuyo número de boleta no es
numérico se omiten: en silencio si son totales, notas o «Sin Datos»; con una alerta si parecen
una boleta (traen un RUT válido o un monto).
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
    # «N°» se normaliza como «n» y «Nº» como «no». «Folio» va antes: si la tabla trae las dos, «N°»
    # suele ser el correlativo de la fila. «Boleta» va al final: en pantalla, el informe de
    # recibidas termina con una columna «Boleta» que es un botón, no el número.
    "folio":    ["nboleta", "nroboleta", "numeroboleta", "folio", "n", "no", "numero", "nro", "boleta"],
    "fecha":    ["fecha", "fechaboleta", "fechaemision"],
    "estado":   ["estado"],
    "rut":      ["rutemisor", "rutreceptor", "rut"],
    "nombre":   ["nombreorazonsocial", "nombre", "razonsocial"],
    "bruto":    ["brutos", "bruto", "montobruto", "honorariobruto", "totalhonorarios"],
    "retenido": ["retenido", "retencion", "montoretenido", "impuestoretenido"],
    "ret_emisor":   ["retemisor"],
    "ret_receptor": ["retreceptor"],
    "liquido":  ["pagado", "liquido", "liquidos", "montoliquido", "liquidoapagar"],
}
REQUERIDOS = ["folio", "fecha", "rut", "bruto"]  # y «retenido», o «Ret. Emisor»/«Ret. Receptor»
FOLIO_NUMERICO = re.compile(r"^\d{1,12}$")


def folio_limpio(texto: str) -> str:
    """Número de boleta como texto sin ceros a la izquierda, o '' si no es un número de boleta.

    Acepta separadores de miles («1.002») y el «.0» que agrega una planilla («45.0»), para que la
    misma boleta tenga el mismo folio venga de donde venga y el control de duplicados funcione.
    """
    t = "".join(str(texto or "").split())
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", t):
        t = t.replace(".", "")
    elif re.fullmatch(r"\d+\.0+", t):
        t = t.split(".")[0]
    if not FOLIO_NUMERICO.match(t) or int(t) == 0:
        return ""
    return str(int(t))


def parece_boleta(rut: str, bruto: str, folio: str) -> bool:
    """Una fila sin folio válido que trae un RUT válido o un monto no es un total ni una nota."""
    if _norm(folio).startswith("total"):
        return False
    if rutmod.es_valido(rut or ""):
        return True
    try:
        return _entero(bruto) != 0
    except ErrorContable:
        return False


def anulada(estado: str) -> bool:
    """True si la boleta está anulada. «Vigente con solicitud de anulación pendiente» (VCA) sigue vigente."""
    e = _norm(estado)
    if not e or any(p in e for p in ("vigente", "solicitud", "pendiente")):
        return False
    return "anul" in e or e == "nula"


def es_vca(estado: str) -> bool:
    e = _norm(estado)
    return "anul" in e and any(p in e for p in ("solicitud", "pendiente"))


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
    if not ({"retenido", "ret_emisor", "ret_receptor"} & set(mapa)):
        faltan.append("retenido")
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
    res = {"importados": 0, "duplicados": 0, "anuladas": 0, "omitidas": 0, "asientos": [], "alertas": [],
           "documentos": []}
    if tasa is None:
        res["alertas"].append("Sin tasa de retención verificada en parámetros: no se controló el monto retenido.")

    with lib.con:
        for f in filas:
            g = lambda c: (f.get(mapa[c]) or "").strip() if c in mapa else ""
            folio = folio_limpio(g("folio"))
            if not folio:
                if parece_boleta(g("rut"), g("bruto"), g("folio")):
                    res["omitidas"] += 1
                    res["alertas"].append(f"Fila omitida: el número de boleta {g('folio')!r} no es un número "
                                          f"(RUT {g('rut') or '—'}, bruto {g('bruto') or '—'}). Si es una boleta, "
                                          f"regístrela a mano.")
                continue  # totales, notas al pie, «Sin Datos»
            rut_txt = g("rut")
            r = rutmod.normalizar(rut_txt) if rutmod.es_valido(rut_txt) else ""
            if anulada(g("estado")):
                res["anuladas"] += 1
                _avisar_si_registrada(lib, res, libro_doc, r, folio)
                continue
            if es_vca(g("estado")):
                res["alertas"].append(f"Boleta {folio}: vigente con solicitud de anulación pendiente; se registró. "
                                      f"Si la anulación se confirma, bórrela en «Libros» → «Documentos».")
            if not r:
                if sentido == "emitido":
                    # El informe de emitidas muestra «EMITIDA SIN RECEPTOR» cuando no se identificó al cliente.
                    res["alertas"].append(f"Boleta {folio}: emitida sin RUT de receptor ({rut_txt or g('nombre')!r}); "
                                          f"se registró sin cliente asociado.")
                else:
                    raise ErrorContable(f"Boleta {folio}: RUT inválido {rut_txt!r}.")
            bruto = _entero(g("bruto"))
            ret_emisor = _entero(g("ret_emisor")) if "ret_emisor" in mapa else 0
            if "retenido" in mapa:
                ret = _entero(g("retenido"))
                liq = _entero(g("liquido")) if "liquido" in mapa and g("liquido") else bruto - ret
            else:
                # Informe de emitidas: se registra lo que retuvo quien recibió la boleta. La retención a
                # cargo del emisor no la descuenta el cliente: queda como alerta para revisarla.
                ret = _entero(g("ret_receptor")) if "ret_receptor" in mapa else 0
                liq = bruto - ret
            if ret_emisor:
                res["alertas"].append(f"Boleta {folio}: tiene retención a cargo del emisor ({ret_emisor}). El programa "
                                      f"no la registró; revise con su contador cómo declararla [VERIFICAR].")
            if bruto - ret != liq:
                res["alertas"].append(f"Boleta {folio}: bruto − retenido ≠ líquido ({bruto} − {ret} ≠ {liq}).")
            if tasa is not None and ret and abs(ret - round(bruto * tasa)) > 1:
                res["alertas"].append(f"Boleta {folio}: retención {ret} difiere de {tasa:.2%} × {bruto}.")
            if ret == 0 and sentido == "recibido":
                res["alertas"].append(f"Boleta {folio} de {r}: sin retención; verificar si correspondía retener.")
            fecha = _fecha_iso(g("fecha"))
            if lib.con.execute("SELECT 1 FROM documento WHERE libro=? AND rut_contraparte=? AND folio=? "
                               "AND eliminado IS NULL", (libro_doc, r, folio)).fetchone():
                res["duplicados"] += 1
                continue
            borrada = lib.con.execute("SELECT motivo_eliminado FROM documento WHERE libro=? AND rut_contraparte=? "
                                      "AND folio=? AND eliminado IS NOT NULL ORDER BY id DESC", (libro_doc, r, folio)).fetchone()
            if borrada:
                res["alertas"].append(f"Boleta {folio}{' de ' + r if r else ''}: estaba borrada ({borrada[0]}) y se "
                                      f"registró de nuevo.")
            cur = lib.con.execute(
                "INSERT INTO documento (libro, tipo_dte, rut_contraparte, razon_social, folio, fecha, periodo, bruto,"
                " retencion, total, fuente) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (libro_doc, None, r, g("nombre"), folio, fecha, periodo, bruto, ret, liq, ruta))
            fecha_as = fecha if fecha[:7] == periodo else fin
            if sentido == "recibido":
                a = Asiento(fecha_as, f"Boleta de honorarios N°{folio} {g('nombre')}".strip(), origen="honorarios")
                a.lineas = [Linea(A("honorarios_gasto"), debe=bruto, rut_aux=r, documento=cur.lastrowid),
                            Linea(A("honorarios_por_pagar"), haber=liq, rut_aux=r, documento=cur.lastrowid)]
                if ret:
                    a.lineas.append(Linea(A("retencion_honorarios"), haber=ret, rut_aux=r, documento=cur.lastrowid))
            else:
                a = Asiento(fecha_as, f"Boleta de honorarios emitida N°{folio} a {g('nombre')}".strip(),
                            origen="honorarios")
                a.lineas = [Linea(A("clientes"), debe=liq, rut_aux=r, documento=cur.lastrowid),
                            Linea(A("ingresos_honorarios"), haber=bruto, rut_aux=r, documento=cur.lastrowid)]
                if ret:
                    a.lineas.append(Linea(A("ppm_por_recuperar"), debe=ret, rut_aux=r, documento=cur.lastrowid))
            a.lineas = [l for l in a.lineas if l.debe or l.haber]
            res["asientos"].append(lib.registrar(a, _transaccion=False))
            res["importados"] += 1
            res["documentos"].append(cur.lastrowid)
    return res


def _avisar_si_registrada(lib: Libro, res, libro_doc: str, rut: str, folio: str):
    """Una boleta que ya se registró (por ejemplo, cuando estaba con solicitud de anulación) y ahora
    figura anulada no se quita sola: se avisa para que no siga contando sin que nadie lo note."""
    doc = lib.con.execute("SELECT id, periodo FROM documento WHERE libro=? AND rut_contraparte=? AND folio=? "
                          "AND eliminado IS NULL", (libro_doc, rut, folio)).fetchone()
    if not doc:
        return
    asientos = [x[0] for x in lib.con.execute(
        "SELECT DISTINCT l.asiento FROM linea l WHERE l.documento=? AND l.asiento NOT IN "
        "(SELECT anula_a FROM asiento WHERE anula_a IS NOT NULL) ORDER BY l.asiento", (doc[0],))]
    donde = f" (asiento N° {', '.join(map(str, asientos))})" if asientos else ""
    res["alertas"].append(
        f"Boleta {folio}{' de ' + rut if rut else ''}: ya estaba registrada en {doc[1]}{donde} y ahora el SII la "
        f"informa ANULADA. El programa no la quitó sola: sigue contando en el F29 de ese mes. Para quitarla, "
        f"bórrela en «Libros» → «Documentos» de {doc[1]}.")
