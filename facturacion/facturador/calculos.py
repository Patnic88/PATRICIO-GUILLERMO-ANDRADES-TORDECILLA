"""Cálculos tributarios y de formato monetario.

Todos los montos se trabajan en pesos chilenos enteros (sin decimales), como
exige el SII para los documentos tributarios electrónicos.

Parámetros tributarios (editables en Configuración; se guardan en la BD):
- IVA: 19 % (DL 825, art. 14).
- Retención de boletas de honorarios: tasa anual según calendario de la
  Ley 21.133. El valor por defecto debe verificarse en sii.cl para el año en
  curso antes de usarlo.
"""

from decimal import Decimal, ROUND_HALF_UP

TIPOS_DOCUMENTO = {
    "FACTURA": "Factura electrónica (afecta a IVA)",
    "FACTURA_EXENTA": "Factura exenta",
    "BOLETA_HONORARIOS": "Boleta de honorarios",
    "NOTA_COBRO": "Nota de cobro (no tributaria)",
}

ESTADOS = ("BORRADOR", "EMITIDA", "PAGADA", "ANULADA")

# Calendario de retención Ley 21.133 (art. 3° transitorio). Referencial:
# el programa usa la tasa guardada en Configuración, no este diccionario.
RETENCION_REFERENCIAL = {
    2020: Decimal("10.75"),
    2021: Decimal("11.5"),
    2022: Decimal("12.25"),
    2023: Decimal("13"),
    2024: Decimal("13.75"),
    2025: Decimal("14.5"),
    2026: Decimal("15.25"),
    2027: Decimal("16"),
    2028: Decimal("17"),
}


def redondear(valor):
    """Redondea a peso entero (mitad hacia arriba)."""
    return int(Decimal(str(valor)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def porcentaje(monto, tasa):
    """monto * tasa / 100, redondeado a pesos."""
    return redondear(Decimal(str(monto)) * Decimal(str(tasa)) / Decimal(100))


def totalizar(lineas, tipo, tasa_iva=19, tasa_retencion=0):
    """Calcula neto, exento, IVA, retención y total de un documento.

    lineas: lista de dicts con cantidad, precio_unitario, exento (0/1).
    tipo: clave de TIPOS_DOCUMENTO.
    Devuelve dict con montos enteros y las líneas con su subtotal calculado.
    """
    lineas_calc = []
    neto = 0
    exento = 0
    for linea in lineas:
        cantidad = Decimal(str(linea.get("cantidad", 1) or 0))
        precio = Decimal(str(linea.get("precio_unitario", 0) or 0))
        subtotal = redondear(cantidad * precio)
        es_exento = bool(linea.get("exento")) or tipo != "FACTURA"
        if es_exento:
            exento += subtotal
        else:
            neto += subtotal
        nueva = dict(linea)
        nueva["subtotal"] = subtotal
        nueva["exento"] = 1 if es_exento else 0
        lineas_calc.append(nueva)

    iva = porcentaje(neto, tasa_iva) if tipo == "FACTURA" else 0
    retencion = 0
    if tipo == "BOLETA_HONORARIOS":
        retencion = porcentaje(exento, tasa_retencion)

    bruto = neto + exento + iva
    total = bruto - retencion
    return {
        "lineas": lineas_calc,
        "neto": neto,
        "exento": exento,
        "iva": iva,
        "bruto": bruto,
        "retencion": retencion,
        "total": total,
    }


def formato_clp(monto):
    """$ 1.234.567 (sin decimales, separador de miles con punto)."""
    monto = redondear(monto or 0)
    signo = "-" if monto < 0 else ""
    cifra = f"{abs(monto):,}".replace(",", ".")
    return f"{signo}$ {cifra}"


def formato_fecha(iso):
    """'2026-10-06' -> '06-10-2026'. Si viene vacío, ''."""
    if not iso:
        return ""
    partes = str(iso)[:10].split("-")
    if len(partes) != 3:
        return str(iso)
    return f"{partes[2]}-{partes[1]}-{partes[0]}"
