"""Automatización: generación de documentos desde planes recurrentes,
vencimientos y resumen del panel."""

import calendar
import datetime as dt

from . import db
from .calculos import TIPOS_DOCUMENTO


def meses_entre(periodo_a, periodo_b):
    """Meses transcurridos de periodo_a ('AAAA-MM') a periodo_b."""
    a_anio, a_mes = (int(x) for x in periodo_a.split("-"))
    b_anio, b_mes = (int(x) for x in periodo_b.split("-"))
    return (b_anio - a_anio) * 12 + (b_mes - a_mes)


def sumar_meses(periodo, n):
    anio, mes = (int(x) for x in periodo.split("-"))
    indice = anio * 12 + (mes - 1) + n
    return f"{indice // 12:04d}-{indice % 12 + 1:02d}"


def plan_corresponde(plan, periodo):
    """True si el plan debe generar un documento en el período dado."""
    if not plan["activo"]:
        return False
    if periodo < plan["mes_inicio"]:
        return False
    if plan["mes_fin"] and periodo > plan["mes_fin"]:
        return False
    cada = db.PERIODICIDADES[plan["periodicidad"]]
    return meses_entre(plan["mes_inicio"], periodo) % cada == 0


def fecha_emision_plan(plan, periodo):
    anio, mes = (int(x) for x in periodo.split("-"))
    ultimo = calendar.monthrange(anio, mes)[1]
    dia = min(int(plan["dia_emision"]), ultimo)
    return dt.date(anio, mes, dia).isoformat()


def planes_pendientes(conn, periodo):
    """Planes que corresponden al período y aún no tienen documento (no anulado)."""
    pendientes = []
    for plan in db.listar_planes(conn, solo_activos=True):
        if not plan_corresponde(plan, periodo):
            continue
        existe = db.fila(conn.execute(
            "SELECT id FROM documentos WHERE plan_id = ? AND periodo = ? AND estado <> 'ANULADA'",
            (plan["id"], periodo)))
        if existe:
            continue
        plan = dict(plan)
        plan["fecha_emision"] = fecha_emision_plan(plan, periodo)
        plan["tipo_nombre"] = TIPOS_DOCUMENTO.get(plan["tipo_documento"], plan["tipo_documento"])
        pendientes.append(plan)
    return pendientes


def nombre_periodo(periodo):
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    anio, mes = (int(x) for x in periodo.split("-"))
    return f"{meses[mes - 1]} {anio}"


def generar_periodo(conn, periodo, emitir=False, plan_ids=None):
    """Crea los documentos de los planes pendientes del período.

    emitir=True los deja EMITIDOS con folio; si no, quedan en BORRADOR para revisión.
    plan_ids limita la generación a esos planes.
    Devuelve la lista de documentos creados.
    """
    creados = []
    for plan in planes_pendientes(conn, periodo):
        if plan_ids and plan["id"] not in plan_ids:
            continue
        descripcion = f"{plan['descripcion']} - {nombre_periodo(periodo)}"
        doc = db.crear_documento(conn, {
            "tipo": plan["tipo_documento"],
            "cliente_id": plan["cliente_id"],
            "fecha_emision": plan["fecha_emision"],
            "lineas": [{"descripcion": descripcion, "cantidad": 1,
                        "precio_unitario": plan["monto"], "exento": 0}],
            "observaciones": plan.get("notas") or "",
            "plan_id": plan["id"],
            "periodo": periodo,
        }, emitir=emitir)
        creados.append(doc)
    return creados


def resumen(conn, periodo=None):
    """Cifras del panel: mes actual, por cobrar, vencidos, pendientes de generar."""
    periodo = periodo or db.hoy()[:7]
    desde = periodo + "-01"
    hasta = periodo + "-31"
    hoy = db.hoy()

    def suma(sql, params=()):
        return db.fila(conn.execute(sql, params))["s"] or 0

    def cuenta(sql, params=()):
        return db.fila(conn.execute(sql, params))["n"] or 0

    emitido_mes = suma(
        "SELECT COALESCE(SUM(total),0) AS s FROM documentos WHERE estado IN ('EMITIDA','PAGADA') "
        "AND fecha_emision BETWEEN ? AND ?", (desde, hasta))
    docs_mes = cuenta(
        "SELECT COUNT(*) AS n FROM documentos WHERE estado IN ('EMITIDA','PAGADA') "
        "AND fecha_emision BETWEEN ? AND ?", (desde, hasta))
    cobrado_mes = suma(
        "SELECT COALESCE(SUM(monto),0) AS s FROM pagos WHERE fecha BETWEEN ? AND ?",
        (desde, hasta))
    por_cobrar = suma(
        "SELECT COALESCE(SUM(d.total - COALESCE((SELECT SUM(monto) FROM pagos p "
        "WHERE p.documento_id = d.id),0)),0) AS s FROM documentos d WHERE d.estado = 'EMITIDA'")
    docs_por_cobrar = cuenta("SELECT COUNT(*) AS n FROM documentos WHERE estado = 'EMITIDA'")
    vencido = suma(
        "SELECT COALESCE(SUM(d.total - COALESCE((SELECT SUM(monto) FROM pagos p "
        "WHERE p.documento_id = d.id),0)),0) AS s FROM documentos d "
        "WHERE d.estado = 'EMITIDA' AND d.fecha_vencimiento < ?", (hoy,))
    docs_vencidos = cuenta(
        "SELECT COUNT(*) AS n FROM documentos WHERE estado = 'EMITIDA' AND fecha_vencimiento < ?",
        (hoy,))
    borradores = cuenta("SELECT COUNT(*) AS n FROM documentos WHERE estado = 'BORRADOR'")
    pendientes = planes_pendientes(conn, periodo)
    return {
        "periodo": periodo,
        "periodo_nombre": nombre_periodo(periodo),
        "emitido_mes": emitido_mes,
        "docs_mes": docs_mes,
        "cobrado_mes": cobrado_mes,
        "por_cobrar": por_cobrar,
        "docs_por_cobrar": docs_por_cobrar,
        "vencido": vencido,
        "docs_vencidos": docs_vencidos,
        "borradores": borradores,
        "planes_pendientes": len(pendientes),
        "monto_planes_pendientes": sum(p["monto"] for p in pendientes),
        "clientes_activos": cuenta("SELECT COUNT(*) AS n FROM clientes WHERE activo = 1"),
        "planes_activos": cuenta("SELECT COUNT(*) AS n FROM planes WHERE activo = 1"),
    }
