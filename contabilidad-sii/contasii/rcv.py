"""Importación del Registro de Compras y Ventas (RCV) descargado desde sii.cl.

El archivo CSV del RCV usa ';' como separador. Los encabezados se reconocen
por nombre normalizado (sin tildes, mayúsculas ni puntuación), no por
posición, para tolerar cambios menores de formato. Si una columna requerida
no aparece, la importación se detiene con un error explícito: nunca se
suponen montos.

Cada documento se guarda en la tabla `documento` (auxiliar de compras y
ventas) y genera contabilización automática, por documento o centralizada
por período. Los casos que requieren criterio del contador se devuelven como
alertas en vez de resolverse en silencio.
"""

import csv
import io
import re
import unicodedata
from calendar import monthrange
from dataclasses import dataclass, field

from . import rut as rutmod
from .libro import Asiento, ErrorContable, Libro

# Tipos de documento tributario electrónico (código SII -> descripción).
TIPOS_DTE = {
    29: "Factura de inicio", 30: "Factura", 32: "Factura no afecta o exenta",
    33: "Factura electrónica", 34: "Factura no afecta o exenta electrónica",
    35: "Boleta", 38: "Boleta exenta", 39: "Boleta electrónica", 41: "Boleta exenta electrónica",
    43: "Liquidación factura electrónica", 45: "Factura de compra", 46: "Factura de compra electrónica",
    48: "Comprobante de pago electrónico", 55: "Nota de débito", 56: "Nota de débito electrónica",
    60: "Nota de crédito", 61: "Nota de crédito electrónica",
    110: "Factura de exportación electrónica", 111: "Nota de débito de exportación electrónica",
    112: "Nota de crédito de exportación electrónica", 914: "Declaración de ingreso (DIN)",
}
NOTAS_CREDITO = {60, 61, 112}
FACTURAS_COMPRA = {45, 46}
BOLETAS = {35, 38, 39, 41, 48}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


# campo interno -> posibles encabezados (normalizados) del CSV del SII
ALIAS = {
    "tipo_dte":    ["tipodoc", "tipodocumento", "tipodte"],
    "rut":         ["rutproveedor", "rutcliente", "rut", "rutcontraparte", "rutemisor", "rutreceptor"],
    "razon":       ["razonsocial", "nombre", "nombreorazonsocial"],
    "folio":       ["folio", "nrodocumento", "numero"],
    "fecha":       ["fechadocto", "fechadocumento", "fechaemision", "fecha"],
    "exento":      ["montoexento", "exento"],
    "neto":        ["montoneto", "neto"],
    "iva":         ["montoivarecuperable", "montoiva", "iva"],
    "iva_no_rec":  ["montoivanorecuperable"],
    "iva_uso_comun": ["ivausocomun"],
    "neto_af":     ["montonetoactivofijo"],
    "iva_af":      ["ivaactivofijo"],
    "sin_credito": ["imptosinderechoacredito"],
    "otro_imp":    ["valorotroimpuesto", "valorotroimp"],
    "iva_ret_total":   ["ivaretenidototal"],
    "iva_ret_parcial": ["ivaretenidoparcial"],
    "total":       ["montototal", "total"],
}
REQUERIDOS = ["tipo_dte", "rut", "folio", "fecha", "neto", "iva", "total"]


@dataclass
class ResultadoImportacion:
    libro: str
    periodo: str
    importados: int = 0
    duplicados: int = 0
    asientos: list = field(default_factory=list)
    alertas: list = field(default_factory=list)


def _entero(v) -> int:
    v = str(v or "").strip()
    if not v:
        return 0
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+(,\d+)?", v):  # formato chileno 1.234.567,89
        v = v.replace(".", "").replace(",", ".")
    else:
        v = v.replace(",", ".")
    try:
        return int(round(float(v)))
    except ValueError:
        raise ErrorContable(f"Monto no numérico en el RCV: {v!r}")


def _fecha_iso(v: str) -> str:
    v = str(v).strip()
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})", v)
    if m:
        d, mth, y = m.groups()
        return f"{y}-{int(mth):02d}-{int(d):02d}"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", v)
    if m:
        return m.group(0)
    raise ErrorContable(f"Fecha no reconocida en el RCV: {v!r}")


def leer_csv(texto: str):
    """Devuelve (mapa campo->encabezado, filas como dict) a partir del texto del CSV."""
    texto = texto.lstrip("﻿")
    lector = csv.DictReader(io.StringIO(texto), delimiter=";")
    encabezados = {_norm(h): h for h in (lector.fieldnames or []) if h}
    mapa = {}
    for campo, alias in ALIAS.items():
        for a in alias:
            if a in encabezados:
                mapa[campo] = encabezados[a]
                break
    faltan = [c for c in REQUERIDOS if c not in mapa]
    if faltan:
        raise ErrorContable(
            "El archivo no parece un detalle del RCV: faltan columnas " + ", ".join(faltan)
            + f". Encabezados leídos: {list(encabezados.values())}")
    filas = [f for f in lector if any((v or "").strip() for v in f.values() if isinstance(v, str))]
    return mapa, filas


def _leer_archivo(ruta: str) -> str:
    with open(ruta, "rb") as f:
        crudo = f.read()
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return crudo.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ErrorContable(f"No se pudo leer {ruta}")


def _doc(libro_tipo, fila, mapa):
    g = lambda c: fila.get(mapa[c], "") if c in mapa else ""
    tipo = _entero(g("tipo_dte"))
    rut_txt = g("rut").strip()
    d = {
        "libro": libro_tipo, "tipo_dte": tipo, "folio": g("folio").strip(),
        "fecha": _fecha_iso(g("fecha")), "razon_social": g("razon").strip(),
        "exento": _entero(g("exento")), "neto": _entero(g("neto")), "iva": _entero(g("iva")),
        "iva_no_rec": _entero(g("iva_no_rec")), "iva_uso_comun": _entero(g("iva_uso_comun")),
        "neto_af": _entero(g("neto_af")), "iva_af": _entero(g("iva_af")),
        "otros_imp": _entero(g("otro_imp")) + _entero(g("sin_credito")),
        "iva_retenido": _entero(g("iva_ret_total")) + _entero(g("iva_ret_parcial")),
        "total": _entero(g("total")),
    }
    d["rut_valido"] = rutmod.es_valido(rut_txt)
    d["rut_contraparte"] = rutmod.normalizar(rut_txt) if d["rut_valido"] else (rut_txt or "SIN-RUT")
    return d


def _fecha_contable(fecha_doc: str, periodo: str) -> str:
    """El asiento va en el período del RCV; si el documento es de otro mes, se fecha al último día del período."""
    if fecha_doc[:7] == periodo:
        return fecha_doc
    y, m = map(int, periodo.split("-"))
    return f"{periodo}-{monthrange(y, m)[1]:02d}"


def _lineas_compra(lib: Libro, d, alertas):
    """Lista de (cuenta, debe, haber) para una compra, antes de aplicar signo por nota de crédito."""
    A = lib.cuenta_auto
    neto_af = min(d["neto_af"], d["neto"])
    if d["iva_af"] and d["iva_af"] > d["iva"]:
        alertas.append(f"Compra {d['tipo_dte']}-{d['folio']}: IVA activo fijo mayor que IVA recuperable; revisar.")
    debitos = [
        (A("compras_afectas"), d["neto"] - neto_af),
        (A("activo_fijo"), neto_af),
        (A("compras_exentas"), d["exento"]),
        (A("iva_cf"), d["iva"]),
        (A("iva_cf_uso_comun"), d["iva_uso_comun"]),
        (A("iva_no_rec_gasto"), d["iva_no_rec"]),
        (A("otros_impuestos"), d["otros_imp"]),
    ]
    suma = sum(m for _, m in debitos)
    if suma != d["total"]:
        alertas.append(
            f"Compra {d['tipo_dte']}-{d['folio']} ({d['rut_contraparte']}): componentes suman {suma} "
            f"y 'Monto Total' es {d['total']}. Se contabilizó por la suma de componentes; revisar.")
    lineas = [(c, m, 0) for c, m in debitos if m]
    lineas.append((A("proveedores"), 0, suma))
    if d["iva_uso_comun"]:
        alertas.append(
            f"Compra {d['tipo_dte']}-{d['folio']}: IVA de uso común {d['iva_uso_comun']} quedó en cuenta transitoria; "
            "aplicar proporcionalidad del crédito fiscal antes de declarar.")
    return lineas


def _lineas_venta(lib: Libro, d, alertas):
    A = lib.cuenta_auto
    creditos = [
        (A("ventas_afectas"), d["neto"]),
        (A("ventas_exentas"), d["exento"]),
        (A("iva_df"), d["iva"]),
        (A("otros_impuestos_pagar"), d["otros_imp"]),
    ]
    suma = sum(m for _, m in creditos)
    if suma != d["total"]:
        alertas.append(
            f"Venta {d['tipo_dte']}-{d['folio']}: componentes suman {suma} y 'Monto Total' es {d['total']}; revisar.")
    if d["iva_retenido"]:
        alertas.append(
            f"Venta {d['tipo_dte']}-{d['folio']}: informa IVA retenido {d['iva_retenido']} por el comprador; "
            "el asiento no lo descuenta del cliente: ajustar según el cambio de sujeto aplicado.")
    return [(A("clientes"), suma, 0)] + [(c, 0, m) for c, m in creditos if m]


def _lineas_factura_compra(lib: Libro, d, alertas):
    """Factura de compra emitida por el contribuyente (aparece en su registro de ventas)."""
    A = lib.cuenta_auto
    alertas.append(
        f"Factura de compra {d['tipo_dte']}-{d['folio']}: se contabilizó como compra con IVA retenido "
        f"{d['iva_retenido'] or d['iva']}; verificar tratamiento del crédito fiscal y de la retención en el F29.")
    retenido = d["iva_retenido"] or d["iva"]
    lineas = [(A("compras_afectas"), d["neto"], 0), (A("compras_exentas"), d["exento"], 0),
              (A("iva_cf"), d["iva"], 0),
              (A("proveedores"), 0, d["neto"] + d["exento"] + d["iva"] - retenido),
              (A("iva_retenido_pagar"), 0, retenido)]
    return [l for l in lineas if l[1] or l[2]]


def _signo(lineas, d):
    if d["tipo_dte"] in NOTAS_CREDITO:
        return [(c, h, de) for c, de, h in lineas]
    return lineas


def importar(lib: Libro, ruta: str, libro_tipo: str, periodo: str, modo: str = "documento") -> ResultadoImportacion:
    """Importa un CSV de detalle del RCV ('compra' o 'venta') del período AAAA-MM.

    modo='documento' genera un asiento por documento; modo='centralizado'
    genera un único asiento resumen del período (centralización mensual),
    manteniendo el detalle en el auxiliar de documentos.
    """
    if libro_tipo not in ("compra", "venta"):
        raise ErrorContable("libro_tipo debe ser 'compra' o 'venta'.")
    if not re.match(r"^\d{4}-\d{2}$", periodo):
        raise ErrorContable("El período debe tener formato AAAA-MM.")
    if modo not in ("documento", "centralizado"):
        raise ErrorContable("modo debe ser 'documento' o 'centralizado'.")
    if lib.periodo_cerrado(periodo):
        raise ErrorContable(f"El período {periodo} está cerrado.")

    mapa, filas = leer_csv(_leer_archivo(ruta))
    res = ResultadoImportacion(libro_tipo, periodo)
    acumulado = {}  # para modo centralizado: cuenta -> [debe, haber]

    docs = sorted((_doc(libro_tipo, fila, mapa) for fila in filas), key=lambda d: (d["fecha"], d["folio"]))
    with lib.con:  # todo o nada
        for d in docs:
            if not d["rut_valido"] and d["tipo_dte"] not in BOLETAS:
                res.alertas.append(f"{libro_tipo} {d['tipo_dte']}-{d['folio']}: RUT inválido {d['rut_contraparte']!r}.")
            if d["tipo_dte"] not in TIPOS_DTE:
                res.alertas.append(f"{libro_tipo} folio {d['folio']}: tipo de documento {d['tipo_dte']} no reconocido.")
            existe = lib.con.execute(
                "SELECT id FROM documento WHERE libro=? AND tipo_dte=? AND rut_contraparte=? AND folio=?",
                (libro_tipo, d["tipo_dte"], d["rut_contraparte"], d["folio"])).fetchone()
            if existe:
                res.duplicados += 1
                continue
            cur = lib.con.execute(
                "INSERT INTO documento (libro, tipo_dte, rut_contraparte, razon_social, folio, fecha, periodo, exento,"
                " neto, iva, iva_no_rec, iva_uso_comun, iva_retenido, otros_imp, total, fuente)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (libro_tipo, d["tipo_dte"], d["rut_contraparte"], d["razon_social"], d["folio"], d["fecha"], periodo,
                 d["exento"], d["neto"], d["iva"], d["iva_no_rec"], d["iva_uso_comun"], d["iva_retenido"],
                 d["otros_imp"], d["total"], ruta))
            doc_id = cur.lastrowid
            res.importados += 1

            if libro_tipo == "compra":
                lineas = _lineas_compra(lib, d, res.alertas)
            elif d["tipo_dte"] in FACTURAS_COMPRA:
                lineas = _lineas_factura_compra(lib, d, res.alertas)
            else:
                lineas = _lineas_venta(lib, d, res.alertas)
            lineas = _signo(lineas, d)

            if modo == "documento":
                aux = d["rut_contraparte"] if d["rut_valido"] else ""
                desc = TIPOS_DTE.get(d["tipo_dte"], f"DTE {d['tipo_dte']}")
                a = Asiento(_fecha_contable(d["fecha"], periodo),
                            f"{'Compra' if libro_tipo == 'compra' else 'Venta'}: {desc} N°{d['folio']} {d['razon_social']}".strip(),
                            tipo="traspaso", origen=f"rcv-{libro_tipo}")
                for c, de, h in lineas:
                    a.lineas.append(_linea(c, de, h, aux, doc_id))
                res.asientos.append(lib.registrar(a, _transaccion=False))
            else:
                for c, de, h in lineas:
                    acc = acumulado.setdefault(c, [0, 0])
                    acc[0] += de
                    acc[1] += h

        if modo == "centralizado" and acumulado:
            y, m = map(int, periodo.split("-"))
            a = Asiento(f"{periodo}-{monthrange(y, m)[1]:02d}",
                        f"Centralización registro de {libro_tipo}s {periodo} ({res.importados} documentos)",
                        origen=f"rcv-{libro_tipo}")
            for c, (de, h) in sorted(acumulado.items()):
                neto = de - h
                if neto > 0:
                    a.lineas.append(_linea(c, neto, 0))
                elif neto < 0:
                    a.lineas.append(_linea(c, 0, -neto))
            if len(a.lineas) >= 2:
                res.asientos.append(lib.registrar(a, _transaccion=False))
    return res


def _linea(cuenta, debe, haber, rut_aux="", documento=None):
    from .libro import Linea
    return Linea(cuenta, debe=debe, haber=haber, rut_aux=rut_aux, documento=documento)
