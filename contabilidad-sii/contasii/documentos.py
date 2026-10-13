"""Borrar documentos importados (facturas, notas y boletas de honorarios).

Un documento no se borra de la base: las líneas de su asiento lo apuntan y forman parte de la
cadena de hashes. «Borrar» significa:

1. Anular su asiento con un contra-asiento fechado igual que el original, para que el mes del
   documento quede como si no se hubiera registrado.
2. Marcar el documento como eliminado (fecha, motivo y número del contra-asiento). Desde ese
   momento no cuenta en el F29, en los libros, en los controles ni en la consulta al SII.
3. Dejar constancia en la bitácora.

No se puede borrar si el mes está cerrado o si su F29 ya está registrado en la contabilidad: en
ese caso hay que anular primero ese registro, igual que para corregir el impuesto.

Si el mismo documento se vuelve a importar después, se registra de nuevo (ver rcv.importar y
honorarios.importar).
"""

from . import db
from .libro import ErrorContable, Libro

NOMBRE_LIBRO = {"compra": "compra", "venta": "venta", "honorario_recibido": "boleta recibida",
                "honorario_emitido": "boleta emitida"}


def f29_registrado(lib: Libro, periodo: str):
    """Número del asiento del F29 vigente del período, o None."""
    r = lib.con.execute("SELECT numero FROM asiento WHERE origen='f29' AND periodo=? AND numero NOT IN "
                        "(SELECT anula_a FROM asiento WHERE anula_a IS NOT NULL) ORDER BY numero", (periodo,)).fetchone()
    return r[0] if r else None


def _nombre(d) -> str:
    return f"{NOMBRE_LIBRO.get(d['libro'], d['libro'])} N° {d['folio']}"


def _asientos_originales(lib: Libro, doc_id: int) -> list:
    """Asientos (no contra-asientos) cuyas líneas apuntan al documento."""
    return [r[0] for r in lib.con.execute(
        "SELECT DISTINCT l.asiento FROM linea l JOIN asiento a ON a.numero=l.asiento "
        "WHERE l.documento=? AND a.anula_a IS NULL ORDER BY l.asiento", (doc_id,))]


def eliminar(lib: Libro, ids, motivo: str) -> dict:
    """Borra los documentos indicados, todos o ninguno. Devuelve un resumen con alertas."""
    motivo = " ".join(str(motivo or "").split())
    if not motivo:
        raise ErrorContable("Indique el motivo para borrar.")
    try:
        ids = sorted({int(i) for i in (ids or [])})
    except (TypeError, ValueError):
        raise ErrorContable("Documentos no válidos.")
    if not ids:
        raise ErrorContable("No eligió documentos para borrar.")

    docs = []
    for i in ids:
        d = lib.con.execute("SELECT * FROM documento WHERE id=?", (i,)).fetchone()
        if not d:
            raise ErrorContable(f"No existe el documento {i}.")
        if d["eliminado"]:
            raise ErrorContable(f"La {_nombre(d)} ya estaba borrada.")
        docs.append(d)

    for per in sorted({d["periodo"] for d in docs}):
        if lib.periodo_cerrado(per):
            raise ErrorContable(f"El mes {per} está cerrado: no se pueden borrar sus documentos.")
        n = f29_registrado(lib, per)
        if n:
            raise ErrorContable(f"El F29 de {per} ya está registrado en la contabilidad (asiento N° {n}). Si necesita "
                                f"corregirlo, anule primero ese registro y después borre los documentos.")

    # Cada asiento a anular debe registrar solo documentos que se están borrando.
    por_asiento = {}
    for d in docs:
        originales = _asientos_originales(lib, d["id"])
        if not originales:
            raise ErrorContable(f"La {_nombre(d)} no tiene un asiento propio (se registró en una centralización "
                                f"mensual): no se puede borrar sola.")
        for n in originales:
            por_asiento.setdefault(n, set()).add(d["id"])
    for n in sorted(por_asiento):
        otros = {r[0] for r in lib.con.execute(
            "SELECT DISTINCT documento FROM linea WHERE asiento=? AND documento IS NOT NULL", (n,))} - set(ids)
        if otros:
            raise ErrorContable(f"El asiento N° {n} registra también otros documentos: bórrelos juntos.")
        a = lib.con.execute("SELECT periodo FROM asiento WHERE numero=?", (n,)).fetchone()
        if lib.periodo_cerrado(a["periodo"]):
            raise ErrorContable(f"El asiento N° {n} está en un mes cerrado ({a['periodo']}).")

    contra = {}
    with lib.con:  # todo o nada
        for n in sorted(por_asiento):
            ya = lib.con.execute("SELECT numero FROM asiento WHERE anula_a=?", (n,)).fetchone()
            if ya:
                contra[n] = ya[0]  # alguien ya lo había anulado a mano: no se anula dos veces
                continue
            fecha = lib.con.execute("SELECT fecha FROM asiento WHERE numero=?", (n,)).fetchone()[0]
            contra[n] = lib.anular(n, fecha, f"Documento borrado: {motivo}", _transaccion=False)
        for d in docs:
            anulado_por = max(contra[n] for n, ds in por_asiento.items() if d["id"] in ds)
            lib.con.execute("UPDATE documento SET eliminado=datetime('now','localtime'), motivo_eliminado=?, asiento_eliminado=? "
                            "WHERE id=?", (motivo, anulado_por, d["id"]))
            db.registrar_bitacora(
                lib.con, "eliminar_documento",
                f"{d['id']}: {d['libro']} tipo {d['tipo_dte']} folio {d['folio']} RUT {d['rut_contraparte']} "
                f"período {d['periodo']} total {d['total']} (asiento N° {anulado_por}): {motivo}")

    alertas = []
    for rut in sorted({d["rut_contraparte"] for d in docs if d["rut_contraparte"]}):
        pagos = lib.con.execute(
            "SELECT COUNT(DISTINCT l.asiento) FROM linea l JOIN asiento a ON a.numero=l.asiento "
            "WHERE l.rut_aux=? AND l.documento IS NULL AND a.anula_a IS NULL AND a.numero NOT IN "
            "(SELECT anula_a FROM asiento WHERE anula_a IS NOT NULL)", (rut,)).fetchone()[0]
        if pagos:
            alertas.append(f"Hay {pagos} pago(s) o cobro(s) registrados con el RUT {rut}. Revise si alguno "
                           f"correspondía a un documento borrado: esos movimientos no se anularon.")
    return {"eliminados": len(docs), "contra_asientos": sorted(set(contra.values())), "alertas": alertas}
