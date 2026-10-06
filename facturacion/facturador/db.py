"""Base de datos SQLite: esquema, configuración y acceso a datos."""

import datetime as dt
import os
import sqlite3
from pathlib import Path

from . import rut as rut_mod
from .calculos import TIPOS_DOCUMENTO, ESTADOS, totalizar

ESQUEMA = """
CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL UNIQUE,
    razon_social TEXT NOT NULL,
    giro TEXT NOT NULL DEFAULT '',
    direccion TEXT NOT NULL DEFAULT '',
    comuna TEXT NOT NULL DEFAULT '',
    ciudad TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT '',
    contacto TEXT NOT NULL DEFAULT '',
    notas TEXT NOT NULL DEFAULT '',
    activo INTEGER NOT NULL DEFAULT 1,
    creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS servicios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descripcion TEXT NOT NULL,
    precio_unitario INTEGER NOT NULL DEFAULT 0,
    exento INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS planes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    descripcion TEXT NOT NULL,
    monto INTEGER NOT NULL DEFAULT 0,
    tipo_documento TEXT NOT NULL DEFAULT 'FACTURA',
    periodicidad TEXT NOT NULL DEFAULT 'MENSUAL',
    dia_emision INTEGER NOT NULL DEFAULT 1,
    mes_inicio TEXT NOT NULL,
    mes_fin TEXT,
    notas TEXT NOT NULL DEFAULT '',
    activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    folio INTEGER,
    folio_sii TEXT NOT NULL DEFAULT '',
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    fecha_emision TEXT NOT NULL,
    fecha_vencimiento TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'BORRADOR',
    neto INTEGER NOT NULL DEFAULT 0,
    exento INTEGER NOT NULL DEFAULT 0,
    iva INTEGER NOT NULL DEFAULT 0,
    retencion INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    observaciones TEXT NOT NULL DEFAULT '',
    plan_id INTEGER REFERENCES planes(id),
    periodo TEXT NOT NULL DEFAULT '',
    creado TEXT NOT NULL,
    emitido_en TEXT,
    anulado_en TEXT,
    motivo_anulacion TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_folio ON documentos(tipo, folio);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_plan_periodo ON documentos(plan_id, periodo)
    WHERE plan_id IS NOT NULL AND estado <> 'ANULADA';
CREATE TABLE IF NOT EXISTS lineas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    orden INTEGER NOT NULL DEFAULT 0,
    descripcion TEXT NOT NULL,
    cantidad REAL NOT NULL DEFAULT 1,
    precio_unitario INTEGER NOT NULL DEFAULT 0,
    exento INTEGER NOT NULL DEFAULT 0,
    subtotal INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    monto INTEGER NOT NULL,
    medio TEXT NOT NULL DEFAULT 'TRANSFERENCIA',
    referencia TEXT NOT NULL DEFAULT ''
);
"""

CONFIG_POR_DEFECTO = {
    "emisor_razon_social": "",
    "emisor_rut": "",
    "emisor_giro": "",
    "emisor_direccion": "",
    "emisor_comuna": "",
    "emisor_ciudad": "",
    "emisor_email": "",
    "emisor_telefono": "",
    "tasa_iva": "19",
    "tasa_retencion": "15.25",
    "dias_plazo_pago": "30",
    "tipo_documento_defecto": "FACTURA",
    "pie_documento": "Documento de control interno. El documento tributario "
                     "oficial se emite en sii.cl.",
    "datos_transferencia": "",
    "folio_siguiente_FACTURA": "1",
    "folio_siguiente_FACTURA_EXENTA": "1",
    "folio_siguiente_BOLETA_HONORARIOS": "1",
    "folio_siguiente_NOTA_COBRO": "1",
}

PERIODICIDADES = {
    "MENSUAL": 1,
    "BIMESTRAL": 2,
    "TRIMESTRAL": 3,
    "SEMESTRAL": 6,
    "ANUAL": 12,
}


class ErrorValidacion(ValueError):
    """Error de datos ingresados por el usuario (se muestra tal cual)."""


def ahora():
    return dt.datetime.now().replace(microsecond=0).isoformat(sep=" ")


def hoy():
    return dt.date.today().isoformat()


def ruta_datos_por_defecto():
    """Carpeta de datos: $FACTURADOR_DATOS o ~/FacturadorAA."""
    base = os.environ.get("FACTURADOR_DATOS")
    if base:
        return Path(base)
    return Path.home() / "FacturadorAA"


def conectar(ruta=None):
    """Abre (y crea si no existe) la base de datos. Devuelve la conexión."""
    if ruta is None:
        carpeta = ruta_datos_por_defecto()
        carpeta.mkdir(parents=True, exist_ok=True)
        ruta = carpeta / "facturador.db"
    elif ruta != ":memory:":
        Path(ruta).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(ruta), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(ESQUEMA)
    for clave, valor in CONFIG_POR_DEFECTO.items():
        conn.execute(
            "INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)",
            (clave, valor),
        )
    conn.commit()
    return conn


def filas(cursor):
    return [dict(f) for f in cursor.fetchall()]


def fila(cursor):
    f = cursor.fetchone()
    return dict(f) if f else None


# ---------------------------------------------------------------- configuración

def obtener_config(conn):
    return {f["clave"]: f["valor"] for f in conn.execute("SELECT * FROM configuracion")}


def guardar_config(conn, datos):
    permitidas = set(CONFIG_POR_DEFECTO)
    for clave, valor in datos.items():
        if clave not in permitidas:
            continue
        if clave == "emisor_rut" and valor and not rut_mod.es_valido(valor):
            raise ErrorValidacion(f"RUT del emisor inválido: {valor}")
        if clave == "emisor_rut" and valor:
            valor = rut_mod.normalizar(valor)
        if clave in ("tasa_iva", "tasa_retencion", "dias_plazo_pago") or clave.startswith("folio_siguiente_"):
            try:
                numero = float(str(valor).replace(",", "."))
            except ValueError:
                raise ErrorValidacion(f"Valor numérico inválido en {clave}: {valor}")
            if numero < 0:
                raise ErrorValidacion(f"{clave} no puede ser negativo")
            if clave.startswith("folio_siguiente_") or clave == "dias_plazo_pago":
                valor = str(int(numero))
            else:
                valor = str(numero).rstrip("0").rstrip(".") if "." in str(numero) else str(numero)
        conn.execute(
            "INSERT INTO configuracion (clave, valor) VALUES (?, ?) "
            "ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
            (clave, str(valor)),
        )
    conn.commit()
    return obtener_config(conn)


def tasa(conn, clave):
    return float(obtener_config(conn).get(clave, "0").replace(",", "."))


# --------------------------------------------------------------------- clientes

CAMPOS_CLIENTE = ("rut", "razon_social", "giro", "direccion", "comuna", "ciudad",
                  "email", "telefono", "contacto", "notas", "activo")


def _validar_cliente(datos):
    rut = datos.get("rut", "")
    if not rut_mod.es_valido(rut):
        raise ErrorValidacion(f"RUT inválido: {rut}")
    if not (datos.get("razon_social") or "").strip():
        raise ErrorValidacion("La razón social es obligatoria")
    limpio = {c: datos.get(c, "") for c in CAMPOS_CLIENTE}
    limpio["rut"] = rut_mod.normalizar(rut)
    limpio["razon_social"] = limpio["razon_social"].strip()
    limpio["activo"] = 1 if str(limpio.get("activo", 1)) not in ("0", "False", "false") else 0
    for c in CAMPOS_CLIENTE:
        if c != "activo" and limpio[c] is None:
            limpio[c] = ""
    return limpio


def listar_clientes(conn, solo_activos=False, buscar=""):
    sql = "SELECT * FROM clientes WHERE 1=1"
    params = []
    if solo_activos:
        sql += " AND activo = 1"
    if buscar:
        sql += " AND (razon_social LIKE ? OR rut LIKE ? OR contacto LIKE ?)"
        patron = f"%{buscar}%"
        params += [patron, patron, patron]
    sql += " ORDER BY razon_social COLLATE NOCASE"
    return filas(conn.execute(sql, params))


def obtener_cliente(conn, cliente_id):
    return fila(conn.execute("SELECT * FROM clientes WHERE id = ?", (cliente_id,)))


def crear_cliente(conn, datos):
    limpio = _validar_cliente(datos)
    if fila(conn.execute("SELECT id FROM clientes WHERE rut = ?", (limpio["rut"],))):
        raise ErrorValidacion(f"Ya existe un cliente con RUT {limpio['rut']}")
    columnas = ", ".join(CAMPOS_CLIENTE) + ", creado"
    marcas = ", ".join("?" for _ in CAMPOS_CLIENTE) + ", ?"
    cur = conn.execute(
        f"INSERT INTO clientes ({columnas}) VALUES ({marcas})",
        [limpio[c] for c in CAMPOS_CLIENTE] + [ahora()],
    )
    conn.commit()
    return obtener_cliente(conn, cur.lastrowid)


def actualizar_cliente(conn, cliente_id, datos):
    actual = obtener_cliente(conn, cliente_id)
    if not actual:
        raise ErrorValidacion("Cliente no encontrado")
    combinado = dict(actual)
    combinado.update({k: v for k, v in datos.items() if k in CAMPOS_CLIENTE})
    limpio = _validar_cliente(combinado)
    otro = fila(conn.execute("SELECT id FROM clientes WHERE rut = ? AND id <> ?",
                             (limpio["rut"], cliente_id)))
    if otro:
        raise ErrorValidacion(f"Otro cliente ya tiene el RUT {limpio['rut']}")
    asignaciones = ", ".join(f"{c} = ?" for c in CAMPOS_CLIENTE)
    conn.execute(f"UPDATE clientes SET {asignaciones} WHERE id = ?",
                 [limpio[c] for c in CAMPOS_CLIENTE] + [cliente_id])
    conn.commit()
    return obtener_cliente(conn, cliente_id)


def eliminar_cliente(conn, cliente_id):
    usados = fila(conn.execute(
        "SELECT COUNT(*) AS n FROM documentos WHERE cliente_id = ?", (cliente_id,)))
    if usados and usados["n"]:
        raise ErrorValidacion(
            "El cliente tiene documentos asociados; desactívalo en lugar de eliminarlo")
    conn.execute("DELETE FROM planes WHERE cliente_id = ?", (cliente_id,))
    conn.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))
    conn.commit()


# -------------------------------------------------------------------- servicios

def listar_servicios(conn, solo_activos=False):
    sql = "SELECT * FROM servicios"
    if solo_activos:
        sql += " WHERE activo = 1"
    return filas(conn.execute(sql + " ORDER BY descripcion COLLATE NOCASE"))


def _validar_servicio(datos):
    descripcion = (datos.get("descripcion") or "").strip()
    if not descripcion:
        raise ErrorValidacion("La descripción del servicio es obligatoria")
    try:
        precio = int(round(float(str(datos.get("precio_unitario", 0) or 0))))
    except ValueError:
        raise ErrorValidacion("Precio inválido")
    if precio < 0:
        raise ErrorValidacion("El precio no puede ser negativo")
    return {
        "descripcion": descripcion,
        "precio_unitario": precio,
        "exento": 1 if datos.get("exento") in (1, "1", True, "true") else 0,
        "activo": 0 if str(datos.get("activo", 1)) in ("0", "false", "False") else 1,
    }


def crear_servicio(conn, datos):
    s = _validar_servicio(datos)
    cur = conn.execute(
        "INSERT INTO servicios (descripcion, precio_unitario, exento, activo) VALUES (?,?,?,?)",
        (s["descripcion"], s["precio_unitario"], s["exento"], s["activo"]))
    conn.commit()
    return fila(conn.execute("SELECT * FROM servicios WHERE id = ?", (cur.lastrowid,)))


def actualizar_servicio(conn, servicio_id, datos):
    actual = fila(conn.execute("SELECT * FROM servicios WHERE id = ?", (servicio_id,)))
    if not actual:
        raise ErrorValidacion("Servicio no encontrado")
    actual.update(datos)
    s = _validar_servicio(actual)
    conn.execute(
        "UPDATE servicios SET descripcion=?, precio_unitario=?, exento=?, activo=? WHERE id=?",
        (s["descripcion"], s["precio_unitario"], s["exento"], s["activo"], servicio_id))
    conn.commit()
    return fila(conn.execute("SELECT * FROM servicios WHERE id = ?", (servicio_id,)))


def eliminar_servicio(conn, servicio_id):
    conn.execute("DELETE FROM servicios WHERE id = ?", (servicio_id,))
    conn.commit()


# ----------------------------------------------------------------------- planes

CAMPOS_PLAN = ("cliente_id", "descripcion", "monto", "tipo_documento", "periodicidad",
               "dia_emision", "mes_inicio", "mes_fin", "notas", "activo")


def _validar_periodo(valor, nombre):
    valor = (valor or "").strip()
    if not valor:
        return ""
    try:
        dt.datetime.strptime(valor, "%Y-%m")
    except ValueError:
        raise ErrorValidacion(f"{nombre} debe tener formato AAAA-MM (ej. 2026-03)")
    return valor


def _validar_plan(conn, datos):
    try:
        cliente_id = int(datos.get("cliente_id") or 0)
    except (TypeError, ValueError):
        raise ErrorValidacion("Cliente inválido")
    if not obtener_cliente(conn, cliente_id):
        raise ErrorValidacion("Cliente no encontrado")
    descripcion = (datos.get("descripcion") or "").strip()
    if not descripcion:
        raise ErrorValidacion("La descripción del plan es obligatoria")
    try:
        monto = int(round(float(str(datos.get("monto", 0) or 0))))
    except ValueError:
        raise ErrorValidacion("Monto inválido")
    if monto <= 0:
        raise ErrorValidacion("El monto debe ser mayor que cero")
    tipo = datos.get("tipo_documento") or "FACTURA"
    if tipo not in TIPOS_DOCUMENTO:
        raise ErrorValidacion(f"Tipo de documento inválido: {tipo}")
    periodicidad = datos.get("periodicidad") or "MENSUAL"
    if periodicidad not in PERIODICIDADES:
        raise ErrorValidacion(f"Periodicidad inválida: {periodicidad}")
    try:
        dia = int(datos.get("dia_emision") or 1)
    except (TypeError, ValueError):
        raise ErrorValidacion("Día de emisión inválido")
    if not 1 <= dia <= 31:
        raise ErrorValidacion("El día de emisión debe estar entre 1 y 31")
    mes_inicio = _validar_periodo(datos.get("mes_inicio"), "Mes de inicio")
    if not mes_inicio:
        mes_inicio = hoy()[:7]
    mes_fin = _validar_periodo(datos.get("mes_fin"), "Mes de término") or None
    if mes_fin and mes_fin < mes_inicio:
        raise ErrorValidacion("El mes de término no puede ser anterior al de inicio")
    return {
        "cliente_id": cliente_id,
        "descripcion": descripcion,
        "monto": monto,
        "tipo_documento": tipo,
        "periodicidad": periodicidad,
        "dia_emision": dia,
        "mes_inicio": mes_inicio,
        "mes_fin": mes_fin,
        "notas": datos.get("notas") or "",
        "activo": 0 if str(datos.get("activo", 1)) in ("0", "false", "False") else 1,
    }


def listar_planes(conn, solo_activos=False):
    sql = ("SELECT p.*, c.razon_social AS cliente, c.rut AS cliente_rut "
           "FROM planes p JOIN clientes c ON c.id = p.cliente_id")
    if solo_activos:
        sql += " WHERE p.activo = 1"
    return filas(conn.execute(sql + " ORDER BY c.razon_social COLLATE NOCASE, p.id"))


def obtener_plan(conn, plan_id):
    return fila(conn.execute(
        "SELECT p.*, c.razon_social AS cliente, c.rut AS cliente_rut "
        "FROM planes p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?", (plan_id,)))


def crear_plan(conn, datos):
    p = _validar_plan(conn, datos)
    columnas = ", ".join(CAMPOS_PLAN)
    marcas = ", ".join("?" for _ in CAMPOS_PLAN)
    cur = conn.execute(f"INSERT INTO planes ({columnas}) VALUES ({marcas})",
                       [p[c] for c in CAMPOS_PLAN])
    conn.commit()
    return obtener_plan(conn, cur.lastrowid)


def actualizar_plan(conn, plan_id, datos):
    actual = fila(conn.execute("SELECT * FROM planes WHERE id = ?", (plan_id,)))
    if not actual:
        raise ErrorValidacion("Plan no encontrado")
    actual.update({k: v for k, v in datos.items() if k in CAMPOS_PLAN})
    p = _validar_plan(conn, actual)
    asignaciones = ", ".join(f"{c} = ?" for c in CAMPOS_PLAN)
    conn.execute(f"UPDATE planes SET {asignaciones} WHERE id = ?",
                 [p[c] for c in CAMPOS_PLAN] + [plan_id])
    conn.commit()
    return obtener_plan(conn, plan_id)


def eliminar_plan(conn, plan_id):
    conn.execute("UPDATE documentos SET plan_id = NULL WHERE plan_id = ?", (plan_id,))
    conn.execute("DELETE FROM planes WHERE id = ?", (plan_id,))
    conn.commit()


# ------------------------------------------------------------------- documentos

def _validar_fecha(valor, nombre):
    try:
        return dt.date.fromisoformat(str(valor)[:10]).isoformat()
    except ValueError:
        raise ErrorValidacion(f"{nombre} inválida: {valor}")


def _validar_lineas(lineas):
    if not lineas:
        raise ErrorValidacion("El documento debe tener al menos una línea")
    limpias = []
    for i, linea in enumerate(lineas, start=1):
        descripcion = (linea.get("descripcion") or "").strip()
        if not descripcion:
            raise ErrorValidacion(f"La línea {i} no tiene descripción")
        try:
            cantidad = float(str(linea.get("cantidad", 1) or 0).replace(",", "."))
            precio = int(round(float(str(linea.get("precio_unitario", 0) or 0))))
        except ValueError:
            raise ErrorValidacion(f"Cantidad o precio inválido en la línea {i}")
        if cantidad <= 0:
            raise ErrorValidacion(f"La cantidad de la línea {i} debe ser mayor que cero")
        if precio < 0:
            raise ErrorValidacion(f"El precio de la línea {i} no puede ser negativo")
        limpias.append({
            "descripcion": descripcion,
            "cantidad": cantidad,
            "precio_unitario": precio,
            "exento": 1 if linea.get("exento") in (1, "1", True, "true") else 0,
        })
    return limpias


def _preparar_documento(conn, datos):
    tipo = datos.get("tipo") or obtener_config(conn)["tipo_documento_defecto"]
    if tipo not in TIPOS_DOCUMENTO:
        raise ErrorValidacion(f"Tipo de documento inválido: {tipo}")
    try:
        cliente_id = int(datos.get("cliente_id") or 0)
    except (TypeError, ValueError):
        raise ErrorValidacion("Cliente inválido")
    if not obtener_cliente(conn, cliente_id):
        raise ErrorValidacion("Cliente no encontrado")
    config = obtener_config(conn)
    fecha_emision = _validar_fecha(datos.get("fecha_emision") or hoy(), "Fecha de emisión")
    if datos.get("fecha_vencimiento"):
        fecha_vencimiento = _validar_fecha(datos["fecha_vencimiento"], "Fecha de vencimiento")
    else:
        plazo = int(float(config.get("dias_plazo_pago", "30")))
        fecha_vencimiento = (dt.date.fromisoformat(fecha_emision)
                             + dt.timedelta(days=plazo)).isoformat()
    if fecha_vencimiento < fecha_emision:
        raise ErrorValidacion("La fecha de vencimiento no puede ser anterior a la emisión")
    lineas = _validar_lineas(datos.get("lineas") or [])
    totales = totalizar(lineas, tipo,
                        tasa_iva=tasa(conn, "tasa_iva"),
                        tasa_retencion=tasa(conn, "tasa_retencion"))
    return {
        "tipo": tipo,
        "cliente_id": cliente_id,
        "fecha_emision": fecha_emision,
        "fecha_vencimiento": fecha_vencimiento,
        "observaciones": datos.get("observaciones") or "",
        "plan_id": datos.get("plan_id") or None,
        "periodo": datos.get("periodo") or "",
        "folio_sii": (datos.get("folio_sii") or "").strip(),
        "totales": totales,
    }


def _guardar_lineas(conn, documento_id, lineas):
    conn.execute("DELETE FROM lineas WHERE documento_id = ?", (documento_id,))
    for orden, l in enumerate(lineas, start=1):
        conn.execute(
            "INSERT INTO lineas (documento_id, orden, descripcion, cantidad, precio_unitario, "
            "exento, subtotal) VALUES (?,?,?,?,?,?,?)",
            (documento_id, orden, l["descripcion"], l["cantidad"], l["precio_unitario"],
             l["exento"], l["subtotal"]))


def crear_documento(conn, datos, emitir=False):
    d = _preparar_documento(conn, datos)
    t = d["totales"]
    cur = conn.execute(
        "INSERT INTO documentos (tipo, cliente_id, fecha_emision, fecha_vencimiento, estado, "
        "neto, exento, iva, retencion, total, observaciones, plan_id, periodo, folio_sii, creado) "
        "VALUES (?,?,?,?,'BORRADOR',?,?,?,?,?,?,?,?,?,?)",
        (d["tipo"], d["cliente_id"], d["fecha_emision"], d["fecha_vencimiento"],
         t["neto"], t["exento"], t["iva"], t["retencion"], t["total"],
         d["observaciones"], d["plan_id"], d["periodo"], d["folio_sii"], ahora()))
    documento_id = cur.lastrowid
    _guardar_lineas(conn, documento_id, t["lineas"])
    conn.commit()
    if emitir:
        return emitir_documento(conn, documento_id)
    return obtener_documento(conn, documento_id)


def actualizar_documento(conn, documento_id, datos):
    actual = fila(conn.execute("SELECT * FROM documentos WHERE id = ?", (documento_id,)))
    if not actual:
        raise ErrorValidacion("Documento no encontrado")
    if actual["estado"] != "BORRADOR":
        # Solo campos administrativos pueden cambiar en un documento emitido.
        cambios = {}
        if "folio_sii" in datos:
            cambios["folio_sii"] = (datos["folio_sii"] or "").strip()
        if "observaciones" in datos:
            cambios["observaciones"] = datos["observaciones"] or ""
        if "fecha_vencimiento" in datos and datos["fecha_vencimiento"]:
            cambios["fecha_vencimiento"] = _validar_fecha(datos["fecha_vencimiento"],
                                                          "Fecha de vencimiento")
        if cambios:
            asignaciones = ", ".join(f"{k} = ?" for k in cambios)
            conn.execute(f"UPDATE documentos SET {asignaciones} WHERE id = ?",
                         list(cambios.values()) + [documento_id])
            conn.commit()
        return obtener_documento(conn, documento_id)
    combinado = dict(actual)
    combinado["lineas"] = datos.get("lineas") or [
        dict(l) for l in conn.execute(
            "SELECT * FROM lineas WHERE documento_id = ? ORDER BY orden", (documento_id,))]
    combinado.update({k: v for k, v in datos.items() if k != "lineas"})
    d = _preparar_documento(conn, combinado)
    t = d["totales"]
    conn.execute(
        "UPDATE documentos SET tipo=?, cliente_id=?, fecha_emision=?, fecha_vencimiento=?, "
        "neto=?, exento=?, iva=?, retencion=?, total=?, observaciones=?, folio_sii=? WHERE id=?",
        (d["tipo"], d["cliente_id"], d["fecha_emision"], d["fecha_vencimiento"],
         t["neto"], t["exento"], t["iva"], t["retencion"], t["total"],
         d["observaciones"], d["folio_sii"], documento_id))
    _guardar_lineas(conn, documento_id, t["lineas"])
    conn.commit()
    return obtener_documento(conn, documento_id)


def emitir_documento(conn, documento_id):
    """Pasa de BORRADOR a EMITIDA asignando el folio interno siguiente."""
    doc = fila(conn.execute("SELECT * FROM documentos WHERE id = ?", (documento_id,)))
    if not doc:
        raise ErrorValidacion("Documento no encontrado")
    if doc["estado"] != "BORRADOR":
        raise ErrorValidacion("Solo se pueden emitir documentos en borrador")
    clave = f"folio_siguiente_{doc['tipo']}"
    with conn:
        siguiente = int(float(obtener_config(conn).get(clave, "1")))
        usado = fila(conn.execute(
            "SELECT MAX(folio) AS m FROM documentos WHERE tipo = ?", (doc["tipo"],)))
        if usado and usado["m"] is not None and usado["m"] >= siguiente:
            siguiente = usado["m"] + 1
        conn.execute(
            "UPDATE documentos SET estado='EMITIDA', folio=?, emitido_en=? WHERE id=?",
            (siguiente, ahora(), documento_id))
        conn.execute("UPDATE configuracion SET valor=? WHERE clave=?",
                     (str(siguiente + 1), clave))
    return obtener_documento(conn, documento_id)


def anular_documento(conn, documento_id, motivo=""):
    doc = fila(conn.execute("SELECT * FROM documentos WHERE id = ?", (documento_id,)))
    if not doc:
        raise ErrorValidacion("Documento no encontrado")
    if doc["estado"] == "ANULADA":
        raise ErrorValidacion("El documento ya está anulado")
    conn.execute(
        "UPDATE documentos SET estado='ANULADA', anulado_en=?, motivo_anulacion=? WHERE id=?",
        (ahora(), motivo or "", documento_id))
    conn.commit()
    return obtener_documento(conn, documento_id)


def eliminar_documento(conn, documento_id):
    doc = fila(conn.execute("SELECT * FROM documentos WHERE id = ?", (documento_id,)))
    if not doc:
        raise ErrorValidacion("Documento no encontrado")
    if doc["estado"] != "BORRADOR":
        raise ErrorValidacion("Solo se pueden eliminar borradores; los demás se anulan")
    conn.execute("DELETE FROM documentos WHERE id = ?", (documento_id,))
    conn.commit()


def _actualizar_estado_pago(conn, documento_id):
    doc = fila(conn.execute("SELECT * FROM documentos WHERE id = ?", (documento_id,)))
    if not doc or doc["estado"] in ("BORRADOR", "ANULADA"):
        return
    pagado = fila(conn.execute(
        "SELECT COALESCE(SUM(monto), 0) AS s FROM pagos WHERE documento_id = ?",
        (documento_id,)))["s"]
    nuevo = "PAGADA" if pagado >= doc["total"] and doc["total"] > 0 else "EMITIDA"
    conn.execute("UPDATE documentos SET estado = ? WHERE id = ?", (nuevo, documento_id))


def registrar_pago(conn, documento_id, datos):
    doc = fila(conn.execute("SELECT * FROM documentos WHERE id = ?", (documento_id,)))
    if not doc:
        raise ErrorValidacion("Documento no encontrado")
    if doc["estado"] not in ("EMITIDA", "PAGADA"):
        raise ErrorValidacion("Solo se registran pagos sobre documentos emitidos")
    try:
        monto = int(round(float(str(datos.get("monto", 0) or 0))))
    except ValueError:
        raise ErrorValidacion("Monto de pago inválido")
    if monto <= 0:
        raise ErrorValidacion("El monto del pago debe ser mayor que cero")
    fecha = _validar_fecha(datos.get("fecha") or hoy(), "Fecha de pago")
    conn.execute(
        "INSERT INTO pagos (documento_id, fecha, monto, medio, referencia) VALUES (?,?,?,?,?)",
        (documento_id, fecha, monto, datos.get("medio") or "TRANSFERENCIA",
         datos.get("referencia") or ""))
    _actualizar_estado_pago(conn, documento_id)
    conn.commit()
    return obtener_documento(conn, documento_id)


def eliminar_pago(conn, pago_id):
    pago = fila(conn.execute("SELECT * FROM pagos WHERE id = ?", (pago_id,)))
    if not pago:
        raise ErrorValidacion("Pago no encontrado")
    conn.execute("DELETE FROM pagos WHERE id = ?", (pago_id,))
    _actualizar_estado_pago(conn, pago["documento_id"])
    conn.commit()
    return obtener_documento(conn, pago["documento_id"])


def obtener_documento(conn, documento_id):
    doc = fila(conn.execute(
        "SELECT d.*, c.razon_social AS cliente, c.rut AS cliente_rut, c.email AS cliente_email, "
        "c.giro AS cliente_giro, c.direccion AS cliente_direccion, c.comuna AS cliente_comuna "
        "FROM documentos d JOIN clientes c ON c.id = d.cliente_id WHERE d.id = ?",
        (documento_id,)))
    if not doc:
        return None
    doc["lineas"] = filas(conn.execute(
        "SELECT * FROM lineas WHERE documento_id = ? ORDER BY orden", (documento_id,)))
    doc["pagos"] = filas(conn.execute(
        "SELECT * FROM pagos WHERE documento_id = ? ORDER BY fecha, id", (documento_id,)))
    doc["pagado"] = sum(p["monto"] for p in doc["pagos"])
    doc["saldo"] = doc["total"] - doc["pagado"] if doc["estado"] != "ANULADA" else 0
    doc["tipo_nombre"] = TIPOS_DOCUMENTO.get(doc["tipo"], doc["tipo"])
    return doc


def listar_documentos(conn, estado=None, tipo=None, cliente_id=None, desde=None,
                      hasta=None, buscar=""):
    sql = ("SELECT d.*, c.razon_social AS cliente, c.rut AS cliente_rut, "
           "COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.documento_id = d.id), 0) AS pagado "
           "FROM documentos d JOIN clientes c ON c.id = d.cliente_id WHERE 1=1")
    params = []
    if estado:
        if estado == "VENCIDA":
            sql += " AND d.estado = 'EMITIDA' AND d.fecha_vencimiento < ?"
            params.append(hoy())
        elif estado in ESTADOS:
            sql += " AND d.estado = ?"
            params.append(estado)
    if tipo:
        sql += " AND d.tipo = ?"
        params.append(tipo)
    if cliente_id:
        sql += " AND d.cliente_id = ?"
        params.append(int(cliente_id))
    if desde:
        sql += " AND d.fecha_emision >= ?"
        params.append(str(desde))
    if hasta:
        sql += " AND d.fecha_emision <= ?"
        params.append(str(hasta))
    if buscar:
        sql += " AND (c.razon_social LIKE ? OR c.rut LIKE ? OR CAST(d.folio AS TEXT) = ?)"
        params += [f"%{buscar}%", f"%{buscar}%", buscar]
    sql += " ORDER BY d.fecha_emision DESC, d.id DESC"
    docs = filas(conn.execute(sql, params))
    for d in docs:
        d["saldo"] = d["total"] - d["pagado"] if d["estado"] != "ANULADA" else 0
        d["tipo_nombre"] = TIPOS_DOCUMENTO.get(d["tipo"], d["tipo"])
        d["vencida"] = d["estado"] == "EMITIDA" and d["fecha_vencimiento"] < hoy()
    return docs
