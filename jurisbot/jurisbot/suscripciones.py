"""Planes, usuarios, límites de uso y alertas por correo.

El cobro no está integrado: `activar_plan` es el punto donde se conecta el
webhook del proveedor de pagos que se elija (ver docs/PLAN_NEGOCIO.md).
Los precios no se fijan aquí; son decisión comercial.
"""
from __future__ import annotations

import json
import secrets
from datetime import date, datetime, timedelta, timezone

from . import db
from .modelo import FUENTES

PLANES: dict[str, dict] = {
    "gratis": {
        "nombre": "Gratis",
        "retraso_dias": 30,         # solo ve documentos ingresados hace más de 30 días
        "consultas_dia": 20,
        "texto_completo": False,    # ve ficha, materias y enlace oficial
        "resumen_ia": False,
        "alertas": 0,
        "api": False,
    },
    "profesional": {
        "nombre": "Profesional",
        "retraso_dias": 0,
        "consultas_dia": 500,
        "texto_completo": True,
        "resumen_ia": True,
        "alertas": 10,
        "api": False,
    },
    "institucional": {
        "nombre": "Institucional (municipios, estudios, empresas)",
        "retraso_dias": 0,
        "consultas_dia": 5000,
        "texto_completo": True,
        "resumen_ia": True,
        "alertas": 100,
        "api": True,
    },
}


class LimiteExcedido(Exception):
    pass


def crear_usuario(con, email: str, plan: str = "gratis") -> str:
    if plan not in PLANES:
        raise ValueError(f"Plan desconocido: {plan}")
    clave = "jb_" + secrets.token_urlsafe(24)
    con.execute("INSERT INTO usuarios (email, plan, api_key, creado) VALUES (?,?,?,?)",
                (email.strip().lower(), plan, clave, db.ahora()))
    con.commit()
    return clave


def activar_plan(con, email: str, plan: str, vigente_hasta: str):
    """Llamar al confirmar un pago. vigente_hasta en formato AAAA-MM-DD."""
    if plan not in PLANES:
        raise ValueError(f"Plan desconocido: {plan}")
    date.fromisoformat(vigente_hasta)
    cur = con.execute("UPDATE usuarios SET plan = ?, vigente_hasta = ? WHERE email = ?",
                      (plan, vigente_hasta, email.strip().lower()))
    if cur.rowcount == 0:
        raise LookupError(f"No existe el usuario {email}")
    con.commit()


def usuario_por_clave(con, api_key: str, hoy: date | None = None) -> dict | None:
    f = con.execute("SELECT * FROM usuarios WHERE api_key = ?", (api_key,)).fetchone()
    if not f:
        return None
    u = dict(f)
    hoy = hoy or date.today()
    # Un plan pagado vencido vuelve a gratis automáticamente.
    if u["plan"] != "gratis" and u["vigente_hasta"] and date.fromisoformat(u["vigente_hasta"]) < hoy:
        u["plan"] = "gratis"
    u["limites"] = PLANES[u["plan"]]
    return u


def registrar_consulta(con, usuario: dict, hoy: date | None = None):
    dia = (hoy or date.today()).isoformat()
    con.execute("INSERT INTO uso (usuario_id, dia, consultas) VALUES (?, ?, 0) "
                "ON CONFLICT(usuario_id, dia) DO NOTHING", (usuario["id"], dia))
    n = con.execute("SELECT consultas FROM uso WHERE usuario_id = ? AND dia = ?",
                    (usuario["id"], dia)).fetchone()["consultas"]
    if n >= usuario["limites"]["consultas_dia"]:
        raise LimiteExcedido(f"Límite diario de {usuario['limites']['consultas_dia']} consultas alcanzado")
    con.execute("UPDATE uso SET consultas = consultas + 1 WHERE usuario_id = ? AND dia = ?",
                (usuario["id"], dia))
    con.commit()


def corte_ingreso(plan: str, ahora: datetime | None = None) -> str:
    """Fecha de ingreso máxima visible para el plan ('' = sin restricción)."""
    dias = PLANES[plan]["retraso_dias"]
    if not dias:
        return ""
    ahora = ahora or datetime.now(timezone.utc)
    return (ahora - timedelta(days=dias)).isoformat(timespec="seconds")


def recortar(doc: dict, plan: str) -> dict:
    """Quita lo que el plan no incluye."""
    lim = PLANES[plan]
    d = dict(doc)
    if not lim["texto_completo"]:
        d.pop("texto", None)
    if not lim["resumen_ia"]:
        d["resumen"] = ""
    return d


# --- Alertas -------------------------------------------------------------------------

def crear_alerta(con, usuario: dict, nombre: str, fuentes=(), materias=(), consulta: str = "") -> int:
    maximo = usuario["limites"]["alertas"]
    n = con.execute("SELECT COUNT(*) n FROM alertas WHERE usuario_id = ?", (usuario["id"],)).fetchone()["n"]
    if n >= maximo:
        raise LimiteExcedido(f"El plan {usuario['plan']} permite {maximo} alertas")
    fuera = [f for f in fuentes if f not in FUENTES]
    if fuera:
        raise ValueError(f"Fuentes desconocidas: {fuera}")
    cur = con.execute(
        "INSERT INTO alertas (usuario_id, nombre, fuentes, materias, consulta, ultimo_envio) "
        "VALUES (?,?,?,?,?,?)",
        (usuario["id"], nombre, json.dumps(list(fuentes)), json.dumps(list(materias)), consulta, db.ahora()))
    con.commit()
    return cur.lastrowid


def boletin(con, usuario: dict, marcar_enviado: bool = True) -> list[dict]:
    """Documentos nuevos desde el último envío de cada alerta del usuario."""
    salida = []
    for a in con.execute("SELECT * FROM alertas WHERE usuario_id = ?", (usuario["id"],)).fetchall():
        docs = db.buscar(con, texto=a["consulta"], fuentes=json.loads(a["fuentes"]) or None,
                         materias=json.loads(a["materias"]), ingresado_despues=a["ultimo_envio"] or "",
                         limite=200)
        salida.append({"alerta": a["nombre"], "documentos": [recortar(d, usuario["plan"]) for d in docs]})
        if marcar_enviado:
            con.execute("UPDATE alertas SET ultimo_envio = ? WHERE id = ?", (db.ahora(), a["id"]))
    con.commit()
    return salida


def boletin_texto(entregas: list[dict]) -> str:
    """Cuerpo de correo en texto plano."""
    lineas = []
    for e in entregas:
        lineas.append(f"== {e['alerta']} ({len(e['documentos'])} nuevos) ==")
        for d in e["documentos"]:
            verif = "" if d["verificacion"] == "verificado_fuente_oficial" else " [sin verificar]"
            lineas.append(f"- {d['fuente'].upper()} {d['tipo']} {d['identificador']} "
                          f"({d['fecha'] or 's/f'}){verif}: {d['titulo']}")
            if d.get("resumen"):
                lineas.append(f"  Resumen (generado por IA, revisar): {d['resumen']}")
            if d["url"]:
                lineas.append(f"  Fuente oficial: {d['url']}")
        lineas.append("")
    return "\n".join(lineas).strip() or "Sin documentos nuevos."
