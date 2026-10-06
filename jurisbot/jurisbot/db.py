"""Almacenamiento en SQLite con búsqueda de texto completo (FTS5)."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from .modelo import Documento

ESQUEMA = """
CREATE TABLE IF NOT EXISTS documentos (
    clave          TEXT PRIMARY KEY,
    fuente         TEXT NOT NULL,
    tipo           TEXT NOT NULL,
    identificador  TEXT NOT NULL,
    fecha          TEXT,
    titulo         TEXT,
    url            TEXT,
    texto          TEXT,
    huella         TEXT,
    origen         TEXT,
    verificacion   TEXT NOT NULL DEFAULT 'sin_verificar',
    materias       TEXT NOT NULL DEFAULT '[]',
    normas_citadas TEXT NOT NULL DEFAULT '[]',
    resumen        TEXT,
    clasificado_por TEXT,
    ingresado      TEXT NOT NULL,
    actualizado    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_doc_fuente_fecha ON documentos(fuente, fecha);
CREATE INDEX IF NOT EXISTS ix_doc_ingresado ON documentos(ingresado);

CREATE VIRTUAL TABLE IF NOT EXISTS documentos_fts USING fts5(
    clave UNINDEXED, titulo, texto, resumen, materias,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS usuarios (
    id         INTEGER PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    plan       TEXT NOT NULL DEFAULT 'gratis',
    api_key    TEXT UNIQUE NOT NULL,
    vigente_hasta TEXT,
    creado     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alertas (
    id         INTEGER PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre     TEXT NOT NULL,
    fuentes    TEXT NOT NULL DEFAULT '[]',
    materias   TEXT NOT NULL DEFAULT '[]',
    consulta   TEXT NOT NULL DEFAULT '',
    ultimo_envio TEXT
);

CREATE TABLE IF NOT EXISTS uso (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    dia        TEXT NOT NULL,
    consultas  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (usuario_id, dia)
);
"""


def ahora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def conectar(ruta: str = "jurisbot.db") -> sqlite3.Connection:
    con = sqlite3.connect(ruta)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(ESQUEMA)
    return con


def guardar(con: sqlite3.Connection, doc: Documento) -> str:
    """Inserta o actualiza. Devuelve 'nuevo', 'actualizado' o 'sin_cambios'."""
    fila = con.execute(
        "SELECT huella, materias, verificacion FROM documentos WHERE clave = ?", (doc.clave,)
    ).fetchone()
    t = ahora()
    if fila and fila["huella"] == doc.huella and not doc.materias:
        return "sin_cambios"

    valores = dict(
        clave=doc.clave, fuente=doc.fuente, tipo=doc.tipo, identificador=doc.identificador,
        fecha=doc.fecha, titulo=doc.titulo, url=doc.url, texto=doc.texto, huella=doc.huella,
        origen=doc.origen, verificacion=doc.verificacion,
        materias=json.dumps(doc.materias, ensure_ascii=False),
        normas_citadas=json.dumps(doc.normas_citadas, ensure_ascii=False),
        resumen=doc.resumen, clasificado_por=doc.clasificado_por,
    )
    if fila:
        # Un texto nuevo invalida la verificación previa.
        if fila["huella"] != doc.huella and doc.verificacion == fila["verificacion"]:
            valores["verificacion"] = "sin_verificar"
        sets = ", ".join(f"{k} = :{k}" for k in valores if k != "clave")
        con.execute(f"UPDATE documentos SET {sets}, actualizado = :t WHERE clave = :clave",
                    {**valores, "t": t})
        estado = "actualizado"
    else:
        cols = ", ".join(valores)
        marcas = ", ".join(f":{k}" for k in valores)
        con.execute(
            f"INSERT INTO documentos ({cols}, ingresado, actualizado) VALUES ({marcas}, :t, :t)",
            {**valores, "t": t},
        )
        estado = "nuevo"
    con.execute("DELETE FROM documentos_fts WHERE clave = ?", (doc.clave,))
    con.execute(
        "INSERT INTO documentos_fts (clave, titulo, texto, resumen, materias) VALUES (?,?,?,?,?)",
        (doc.clave, doc.titulo, doc.texto, doc.resumen, " ".join(doc.materias)),
    )
    con.commit()
    return estado


def actualizar_clasificacion(con, clave: str, materias, normas, resumen: str, por: str):
    con.execute(
        "UPDATE documentos SET materias = ?, normas_citadas = ?, resumen = ?, "
        "clasificado_por = ?, actualizado = ? WHERE clave = ?",
        (json.dumps(materias, ensure_ascii=False), json.dumps(normas, ensure_ascii=False),
         resumen, por, ahora(), clave),
    )
    fila = con.execute("SELECT titulo, texto FROM documentos WHERE clave = ?", (clave,)).fetchone()
    con.execute("DELETE FROM documentos_fts WHERE clave = ?", (clave,))
    con.execute(
        "INSERT INTO documentos_fts (clave, titulo, texto, resumen, materias) VALUES (?,?,?,?,?)",
        (clave, fila["titulo"], fila["texto"], resumen, " ".join(materias)),
    )
    con.commit()


def marcar_verificacion(con, clave: str, estado: str):
    con.execute("UPDATE documentos SET verificacion = ?, actualizado = ? WHERE clave = ?",
                (estado, ahora(), clave))
    con.commit()


def _fila_a_dict(f: sqlite3.Row, con_texto: bool) -> dict:
    d = dict(f)
    d["materias"] = json.loads(d["materias"])
    d["normas_citadas"] = json.loads(d["normas_citadas"])
    if not con_texto:
        d.pop("texto", None)
    return d


def _consulta_fts(texto: str) -> str:
    """Convierte texto libre en una consulta FTS5 segura (cada palabra entre comillas)."""
    palabras = [p.replace('"', "") for p in texto.split() if p.strip('"')]
    return " ".join(f'"{p}"' for p in palabras)


def buscar(con, texto: str = "", fuentes=None, materias=None, desde: str = "",
           hasta: str = "", ingresado_despues: str = "", ingresado_hasta: str = "",
           limite: int = 50, con_texto: bool = False) -> list[dict]:
    where, params = [], []
    if texto.strip():
        where.append("d.clave IN (SELECT clave FROM documentos_fts WHERE documentos_fts MATCH ?)")
        params.append(_consulta_fts(texto))
    if fuentes:
        where.append(f"d.fuente IN ({','.join('?' * len(fuentes))})")
        params += list(fuentes)
    for m in materias or []:
        where.append("EXISTS (SELECT 1 FROM json_each(d.materias) WHERE value = ?)")
        params.append(m)
    if desde:
        where.append("d.fecha >= ?"); params.append(desde)
    if hasta:
        where.append("d.fecha <= ?"); params.append(hasta)
    if ingresado_despues:
        where.append("d.ingresado > ?"); params.append(ingresado_despues)
    if ingresado_hasta:
        where.append("d.ingresado <= ?"); params.append(ingresado_hasta)
    sql = "SELECT * FROM documentos d"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY d.fecha DESC, d.ingresado DESC LIMIT ?"
    params.append(int(limite))
    return [_fila_a_dict(f, con_texto) for f in con.execute(sql, params)]


def obtener(con, clave: str) -> dict | None:
    f = con.execute("SELECT * FROM documentos WHERE clave = ?", (clave,)).fetchone()
    return _fila_a_dict(f, True) if f else None


def estadisticas(con) -> dict:
    por_fuente = {r["fuente"]: r["n"] for r in con.execute(
        "SELECT fuente, COUNT(*) n FROM documentos GROUP BY fuente")}
    por_materia = {r["value"]: r["n"] for r in con.execute(
        "SELECT value, COUNT(*) n FROM documentos, json_each(documentos.materias) "
        "GROUP BY value ORDER BY n DESC")}
    verif = {r["verificacion"]: r["n"] for r in con.execute(
        "SELECT verificacion, COUNT(*) n FROM documentos GROUP BY verificacion")}
    return {"por_fuente": por_fuente, "por_materia": por_materia, "verificacion": verif}
