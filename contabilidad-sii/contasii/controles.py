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
            f"SELECT COALESCE(SUM(iva*{_signo_sql()}),0) FROM documento WHERE eliminado IS NULL AND libro=? AND periodo=? "
            f"AND (tipo_dte IS NULL OR tipo_dte NOT IN ({fc}))", (libro_doc, periodo)).fetchone()[0]
        # Cuentan también los contra-asientos que anulan esos registros (por ejemplo, al borrar un documento)
        # y, si alguno de ellos se anuló a su vez, esa anulación: toda la cadena.
        mov = lib.con.execute(
            "WITH RECURSIVE cadena(numero) AS (SELECT numero FROM asiento WHERE origen=? "
            "UNION SELECT a.numero FROM asiento a JOIN cadena c ON a.anula_a=c.numero) "
            "SELECT COALESCE(SUM(l.debe - l.haber),0) FROM linea l JOIN asiento s ON s.numero=l.asiento "
            "WHERE l.cuenta=? AND s.periodo=? AND s.numero IN cadena",
            (f"rcv-{libro_doc}", cuenta, periodo)).fetchone()[0]
        mov *= signo
        out.append((nombre, doc == mov, f"documentos ${pesos(doc)} / contabilidad ${pesos(mov)}"))
    # El F29 del mes registrado una sola vez: uno vigente como máximo, y los anulados con su anulación
    # en el mismo mes (si no, el mes queda con el impuesto contado dos veces).
    f29 = [r[0] for r in lib.con.execute("SELECT numero FROM asiento WHERE origen='f29' AND periodo=? ORDER BY numero",
                                         (periodo,))]
    vigentes = [n for n in f29 if lib.anulado_por(n) is None]
    fuera = [n for n in f29 if lib.anulado_por(n) is not None and lib.con.execute(
        "SELECT periodo FROM asiento WHERE numero=?", (lib.anulado_por(n),)).fetchone()[0] != periodo]
    detalle = ("sin registrar" if not f29 else f"N° {', '.join(map(str, vigentes))}" if vigentes else "anulado")
    if len(vigentes) > 1:
        detalle = f"hay {len(vigentes)} registros vigentes (N° {', '.join(map(str, vigentes))}): anule los que sobran"
    if fuera:
        detalle = (f"el registro N° {', '.join(map(str, fuera))} se anuló en otro mes: este mes lo sigue contando; "
                   f"revíselo con su contador")
    out.append(("F29 registrado una sola vez", len(vigentes) <= 1 and not fuera, detalle))
    sin_rut = lib.con.execute("SELECT COUNT(*) FROM documento WHERE eliminado IS NULL AND periodo=? AND rut_contraparte NOT LIKE '%-%'",
                              (periodo,)).fetchone()[0]
    out.append(("Documentos con RUT válido", sin_rut == 0, f"{sin_rut} sin RUT válido"))
    problemas = lib.verificar_integridad()
    out.append(("Integridad del libro", not problemas, "; ".join(problemas) or "sin alteraciones"))
    return out
