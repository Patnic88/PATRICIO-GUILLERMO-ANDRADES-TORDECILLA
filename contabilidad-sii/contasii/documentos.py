"""Borrar documentos importados (facturas, notas y boletas de honorarios).

Un documento no se borra de la base: las líneas de su asiento lo apuntan y forman parte de la
cadena de hashes. «Borrar» significa:

1. Anular con un contra-asiento, fechado igual que el original, cada asiento propio del
   documento que siga vigente, para que el mes del documento quede como si no se hubiera
   registrado.
2. Marcar el documento como eliminado (fecha, motivo y número del contra-asiento). Desde ese
   momento no cuenta en el F29, en los libros, en los controles ni en la consulta al SII.
3. Dejar constancia en la bitácora.

No se puede borrar si el mes está cerrado o si el documento entró en el F29 registrado del mes
(hay que anularlo primero, igual que para corregir el impuesto); un documento importado después
de registrar el F29 sí se puede borrar, porque no está en él. Los documentos de una
centralización mensual se borran todos juntos. Si el F29 del mes o de meses siguientes ya se
confirmó de otra forma, se avisa.

Los registros que vienen de documentos no se anulan sueltos con «Anular» (ver motivo_no_anulable):
el documento seguiría contando en el F29.
"""

import re

from . import db
from .libro import ErrorContable, Libro

NOMBRE_LIBRO = {"compra": "compra", "venta": "venta", "honorario_recibido": "boleta recibida",
                "honorario_emitido": "boleta emitida"}
ORIGENES_DE_DOCUMENTOS = ("rcv-compra", "rcv-venta", "honorarios")
MAX_ID = 2 ** 63 - 1


def _vigentes(lib: Libro, sql: str, args) -> list:
    """Números de asiento de la consulta que siguen vigentes (considera toda la cadena de anulaciones)."""
    return [r[0] for r in lib.con.execute(sql, args).fetchall() if lib.anulado_por(r[0]) is None]


def f29_registrado(lib: Libro, periodo: str):
    """Número del asiento del F29 vigente del período (el último, si hubiera más de uno), o None."""
    v = _vigentes(lib, "SELECT numero FROM asiento WHERE origen='f29' AND periodo=? ORDER BY numero", (periodo,))
    return v[-1] if v else None


def _pago_f29(lib: Libro, periodo: str):
    v = _vigentes(lib, "SELECT numero FROM asiento WHERE origen='operacion' AND glosa=? ORDER BY numero",
                  (f"Pago F29 período {periodo}",))
    return v[-1] if v else None


def _nombre(d) -> str:
    return f"{NOMBRE_LIBRO.get(d['libro'], d['libro'])} N° {d['folio']}"


def _asientos_propios(lib: Libro, doc_id: int) -> list:
    """Asientos (no contra-asientos) cuyas líneas apuntan al documento."""
    return [r[0] for r in lib.con.execute(
        "SELECT DISTINCT l.asiento FROM linea l JOIN asiento a ON a.numero=l.asiento "
        "WHERE l.documento=? AND a.anula_a IS NULL ORDER BY l.asiento", (doc_id,))]


def _periodo(lib: Libro, numero: int) -> str:
    return lib.con.execute("SELECT periodo FROM asiento WHERE numero=?", (numero,)).fetchone()[0]


def _centralizacion_de(lib: Libro, libro: str, periodo: str) -> list:
    origen = "honorarios" if libro.startswith("honorario") else f"rcv-{libro}"
    return _vigentes(lib, "SELECT numero FROM asiento a WHERE origen=? AND periodo=? AND anula_a IS NULL AND "
                          "NOT EXISTS (SELECT 1 FROM linea l WHERE l.asiento=a.numero AND l.documento IS NOT NULL)",
                     (origen, periodo))


def asientos_de(lib: Libro, d) -> list:
    """Asientos vigentes que registran el documento: los propios o, si se importó centralizado, la
    centralización de su libro y mes. Vacío si sus asientos propios ya estaban anulados."""
    propios = _asientos_propios(lib, d["id"])
    if propios:
        return [n for n in propios if lib.anulado_por(n) is None]
    return _centralizacion_de(lib, d["libro"], d["periodo"])


def entro_en_f29(lib: Libro, d) -> bool:
    """True si el F29 registrado del mes se calculó con este documento (su registro es anterior)."""
    n = f29_registrado(lib, d["periodo"])
    ref = asientos_de(lib, d)
    return bool(n and (not ref or min(ref) < n))


def motivo_no_anulable(lib: Libro, numero: int):
    """Por qué un asiento no se puede anular suelto, o None si se puede."""
    a = lib.con.execute("SELECT * FROM asiento WHERE numero=?", (numero,)).fetchone()
    if not a:
        return None
    if a["anula_a"] is not None or a["tipo"] == "anulacion":
        return ("Este registro es una anulación: no se anula. Si algo se anuló por error, regístrelo de nuevo.")
    if lib.con.execute("SELECT 1 FROM linea WHERE asiento=? AND documento IS NOT NULL", (numero,)).fetchone():
        return ("Este registro viene de una factura o boleta importada. Para quitarlo, bórrela en «Libros» → "
                "«Documentos»: así también deja de contar en el F29.")
    if a["origen"] in ORIGENES_DE_DOCUMENTOS:
        return ("Este registro centraliza documentos importados del mes: si se anula solo, los documentos siguen "
                "contando en el F29. Para quitarlo, borre todos esos documentos juntos en «Libros» → «Documentos».")
    return None


def _ids(ids) -> list:
    """Números internos de documento: solo enteros positivos (o texto con solo dígitos)."""
    if not isinstance(ids, (list, tuple)):
        raise ErrorContable("No eligió documentos para borrar.")
    out = set()
    for i in ids:
        if isinstance(i, str) and re.fullmatch(r"[0-9]{1,19}", i.strip()):
            i = int(i.strip())
        if isinstance(i, bool) or not isinstance(i, int) or not 1 <= i <= MAX_ID:
            raise ErrorContable("Documentos no válidos.")
        out.add(i)
    if not out:
        raise ErrorContable("No eligió documentos para borrar.")
    return sorted(out)


def eliminar(lib: Libro, ids, motivo) -> dict:
    """Borra los documentos indicados, todos o ninguno. Los que ya estaban borrados se informan y
    se saltan. Devuelve un resumen con alertas."""
    if not isinstance(motivo, str):
        raise ErrorContable("Indique el motivo para borrar.")
    motivo = " ".join(motivo.split())
    if not motivo:
        raise ErrorContable("Indique el motivo para borrar.")
    ids = _ids(ids)

    docs, ya_borrados = [], []
    for i in ids:
        d = lib.con.execute("SELECT * FROM documento WHERE id=?", (i,)).fetchone()
        if not d:
            raise ErrorContable(f"No existe el documento {i}.")
        (ya_borrados if d["eliminado"] else docs).append(d)
    if not docs:
        d = ya_borrados[0]
        raise ErrorContable(f"La {_nombre(d)} ya estaba borrada." if len(ya_borrados) == 1
                            else "Esos documentos ya estaban borrados.")

    for per in sorted({d["periodo"] for d in docs}):
        if lib.periodo_cerrado(per):
            raise ErrorContable(f"El mes {per} está cerrado: no se pueden borrar sus documentos.")

    alertas = []
    # Asientos propios de cada documento que siguen vigentes: esos se anulan. Los que ya estaban
    # anulados (por un borrado anterior o a mano en versiones previas) no se tocan.
    por_asiento, vigentes_doc = {}, {}
    for d in docs:
        propios = _asientos_propios(lib, d["id"])
        vigentes = [n for n in propios if not lib.anulado_por(n)]
        if not vigentes and propios:
            # Todos sus asientos ya estaban anulados: el documento se marca borrado sin otro contra-asiento.
            for n in propios:
                r = lib.anulado_por(n)
                if _periodo(lib, r) != _periodo(lib, n):
                    alertas.append(f"El registro N° {n} de la {_nombre(d)} ({_periodo(lib, n)}) se había anulado en otro "
                                   f"mes ({_periodo(lib, r)}, N° {r}): los controles de esos dos meses pueden quedar "
                                   f"descuadrados. Revíselo con su contador.")
        vigentes_doc[d["id"]] = vigentes
        for n in vigentes:
            por_asiento.setdefault(n, set()).add(d["id"])
    centralizados = [d for d in docs if not _asientos_propios(lib, d["id"])]
    centralizaciones = _centralizaciones(lib, centralizados, {d["id"] for d in docs})
    for d in docs:
        # El F29 registrado del mes se calculó con los documentos que ya estaban: esos no se borran sin
        # anularlo primero. Uno importado después (su asiento es posterior) no entró en él.
        if entro_en_f29(lib, d):
            n = f29_registrado(lib, d["periodo"])
            raise ErrorContable(f"El F29 de {d['periodo']} ya está registrado en la contabilidad (asiento N° {n}) e "
                                f"incluye la {_nombre(d)}. Si necesita corregirlo, anule primero ese registro y después "
                                f"borre los documentos.")
    for ns in centralizaciones.values():
        for n in ns:
            por_asiento.setdefault(n, set())
    a_borrar = {d["id"] for d in docs}
    for n in sorted(por_asiento):
        otros = {r[0] for r in lib.con.execute(
            "SELECT DISTINCT documento FROM linea WHERE asiento=? AND documento IS NOT NULL", (n,))} - a_borrar
        if otros:
            raise ErrorContable(f"El asiento N° {n} registra también otros documentos: bórrelos juntos.")
        if lib.periodo_cerrado(_periodo(lib, n)):
            raise ErrorContable(f"El asiento N° {n} está en un mes cerrado ({_periodo(lib, n)}).")

    contra = {}
    with lib.con:  # todo o nada
        for n in sorted(por_asiento):
            fecha = lib.con.execute("SELECT fecha FROM asiento WHERE numero=?", (n,)).fetchone()[0]
            contra[n] = lib.anular(n, fecha, f"Documento borrado: {motivo}", _transaccion=False)
        for d in docs:
            if vigentes_doc[d["id"]]:
                anulado_por = max(contra[n] for n in vigentes_doc[d["id"]])
            elif _asientos_propios(lib, d["id"]):
                anulado_por = max(lib.anulado_por(n) for n in _asientos_propios(lib, d["id"]))
            else:  # centralizado: lo anuló el contra-asiento de su centralización
                anulado_por = max(contra[n] for n in centralizaciones[(d["libro"], d["periodo"])])
            lib.con.execute("UPDATE documento SET eliminado=datetime('now','localtime'), motivo_eliminado=?, "
                            "asiento_eliminado=? WHERE id=?", (motivo, anulado_por, d["id"]))
            db.registrar_bitacora(
                lib.con, "eliminar_documento",
                f"{d['id']}: {d['libro']} tipo {d['tipo_dte']} folio {d['folio']} RUT {d['rut_contraparte']} "
                f"período {d['periodo']} total {d['total']} (asiento N° {anulado_por}): {motivo}")

    alertas += _avisos_f29(lib, docs, {d["id"]: min(vigentes_doc[d["id"]] or
                                                     centralizaciones.get((d["libro"], d["periodo"]), [0]))
                                       for d in docs})
    for rut in sorted({d["rut_contraparte"] for d in docs if d["rut_contraparte"]}):
        pagos = len(_vigentes(lib, "SELECT DISTINCT l.asiento FROM linea l JOIN asiento a ON a.numero=l.asiento "
                                   "WHERE l.rut_aux=? AND l.documento IS NULL AND a.anula_a IS NULL "
                                   "AND a.origen NOT IN ('rcv-compra','rcv-venta','honorarios')", (rut,)))
        if pagos:
            alertas.append(f"Hay {pagos} pago(s) o cobro(s) registrados con el RUT {rut}. Revise si alguno "
                           f"correspondía a un documento borrado: esos movimientos no se anularon.")
    return {"eliminados": len(docs), "ya_borrados": len(ya_borrados), "contra_asientos": sorted(contra.values()),
            "alertas": alertas}


def _avisos_f29(lib: Libro, docs, primer_asiento: dict) -> list:
    """El F29 del mes confirmado sin asiento, pagado, o los F29 siguientes que usaron su remanente."""
    out = []
    for per in sorted({d["periodo"] for d in docs}):
        if f29_registrado(lib, per):
            # Se borraron documentos importados después de ese F29: el mes vuelve a lo registrado. Pero un
            # pago del F29 posterior a ellos pudo incluir su retención (la toma del saldo de la cuenta).
            pago = _pago_f29(lib, per)
            desde = min(primer_asiento[d["id"]] for d in docs if d["periodo"] == per)
            if pago and pago > desde:
                out.append(f"El pago del F29 de {per} (N° {pago}) se registró después de importar estos documentos y "
                           f"pudo incluir su retención o IVA retenido: revise ese pago.")
            continue
        rem = lib.con.execute("SELECT monto FROM remanente_iva WHERE periodo=?", (per,)).fetchone()
        pago = _pago_f29(lib, per)
        if rem is not None or pago:
            pagado = f" y pagado (N° {pago})" if pago else ""
            out.append(f"El F29 de {per} ya se había confirmado{pagado}: con este borrado su propuesta cambia. Vuelva a "
                       f"confirmarlo en «Calcular el impuesto del mes (F29)»; si ya lo declaró, deberá rectificarlo.")
        if any(d["libro"] in ("compra", "venta") for d in docs if d["periodo"] == per):
            siguientes = sorted({r[0] for r in lib.con.execute("SELECT periodo FROM remanente_iva WHERE periodo>?", (per,))}
                                | {p for p in {r[0] for r in lib.con.execute(
                                    "SELECT DISTINCT periodo FROM asiento WHERE origen='f29' AND periodo>?", (per,))}
                                   if f29_registrado(lib, p)})
            if siguientes:
                out.append(f"El F29 de {', '.join(siguientes)} ya se confirmó con el remanente de IVA de los meses "
                           f"anteriores, que cambia con este borrado: revíselo.")
    return out


def _centralizaciones(lib: Libro, centralizados, elegidos: set) -> dict:
    """{(libro, período): [asientos de centralización vigentes]} de los documentos sin asiento propio.

    Una centralización mensual registra en un solo asiento todos los documentos del libro y el mes que
    se importaron así: no se sabe qué parte es de cada uno, por lo que se borran todos juntos.
    """
    out = {}
    for libro, per in sorted({(d["libro"], d["periodo"]) for d in centralizados}):
        todos = {r[0] for r in lib.con.execute(
            "SELECT d.id FROM documento d WHERE d.libro=? AND d.periodo=? AND d.eliminado IS NULL AND NOT EXISTS "
            "(SELECT 1 FROM linea l JOIN asiento a ON a.numero=l.asiento WHERE l.documento=d.id AND a.anula_a IS NULL)",
            (libro, per))}
        nombre = {"compra": "compras", "venta": "ventas"}.get(libro, "boletas")
        if not todos <= elegidos:
            raise ErrorContable(f"Las {nombre} de {per} que se registraron en una centralización mensual "
                                f"({len(todos)} documentos) se borran todas juntas: elíjalas todas.")
        asientos = _centralizacion_de(lib, libro, per)
        if not asientos:
            raise ErrorContable(f"No encuentro la centralización de {nombre} de {per}: revísela con su contador.")
        out[(libro, per)] = asientos
    return out


def avisos_importacion(lib: Libro, periodo: str) -> list:
    """Al importar documentos en un mes cuyo F29 ya se registró o confirmó: cambian su propuesta."""
    n = f29_registrado(lib, periodo)
    if n:
        return [f"El F29 de {periodo} ya está registrado (N° {n}) y no incluye estos documentos: su propuesta cambia. "
                f"Si fue un error, bórrelos (no entraron en ese F29, así que se pueden borrar sin anularlo); si no, "
                f"corrija el F29."]
    pago = _pago_f29(lib, periodo)
    if pago or lib.con.execute("SELECT 1 FROM remanente_iva WHERE periodo=?", (periodo,)).fetchone():
        return [f"El F29 de {periodo} ya se había confirmado: estos documentos cambian su propuesta. Vuelva a "
                f"confirmarlo; si ya lo declaró, deberá rectificarlo."]
    return []
