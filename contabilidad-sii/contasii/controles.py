"""Controles de cuadratura de un período: auxiliar de documentos vs. Mayor, RUT e integridad."""

from .impuestos import _signo_sql
from .libro import Libro
from .rcv import FACTURAS_COMPRA
from .reportes import pesos


def controles(lib: Libro, periodo: str) -> list:
    """Devuelve una lista de (nombre, ok: bool, detalle)."""
    A = lib.cuenta_auto
    fc = ",".join(str(x) for x in sorted(FACTURAS_COMPRA))
    out = []
    for libro_doc, cuenta, nombre, signo in (("venta", A("iva_df"), "IVA de ventas", -1),
                                             ("compra", A("iva_cf"), "IVA de compras", 1)):
        doc = lib.con.execute(
            f"SELECT COALESCE(SUM(iva*{_signo_sql()}),0) FROM documento WHERE libro=? AND periodo=? "
            f"AND (tipo_dte IS NULL OR tipo_dte NOT IN ({fc}))", (libro_doc, periodo)).fetchone()[0]
        mov = lib.con.execute(
            "SELECT COALESCE(SUM(l.debe - l.haber),0) FROM linea l JOIN asiento s ON s.numero=l.asiento "
            "WHERE l.cuenta=? AND s.origen=? AND s.periodo=?", (cuenta, f"rcv-{libro_doc}", periodo)).fetchone()[0]
        mov *= signo
        out.append((nombre, doc == mov, f"documentos ${pesos(doc)} / contabilidad ${pesos(mov)}"))
    sin_rut = lib.con.execute("SELECT COUNT(*) FROM documento WHERE periodo=? AND rut_contraparte NOT LIKE '%-%'",
                              (periodo,)).fetchone()[0]
    out.append(("Documentos con RUT válido", sin_rut == 0, f"{sin_rut} sin RUT válido"))
    problemas = lib.verificar_integridad()
    out.append(("Integridad del libro", not problemas, "; ".join(problemas) or "sin alteraciones"))
    return out
