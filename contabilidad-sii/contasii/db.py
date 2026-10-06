"""Esquema SQLite del libro contable.

Principios de integridad:
- Los asientos no se borran ni se editan: se anulan con un contra-asiento.
- Cada asiento lleva un hash encadenado al anterior (bitácora inmutable), de
  modo que cualquier alteración posterior de la base es detectable.
- Un período cerrado no admite nuevos asientos.
"""

import sqlite3

ESQUEMA = """
CREATE TABLE IF NOT EXISTS contribuyente (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    rut             TEXT NOT NULL,
    razon_social    TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('empresa', 'persona_natural')),
    regimen         TEXT NOT NULL,
    giro            TEXT,
    creado          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cuenta (
    codigo      TEXT PRIMARY KEY,
    nombre      TEXT NOT NULL,
    tipo        TEXT NOT NULL CHECK (tipo IN ('activo','pasivo','patrimonio','ingreso','gasto','orden')),
    imputable   INTEGER NOT NULL DEFAULT 1,
    activa      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS periodo (
    periodo     TEXT PRIMARY KEY,           -- 'AAAA-MM'
    cerrado     INTEGER NOT NULL DEFAULT 0,
    cerrado_en  TEXT
);

CREATE TABLE IF NOT EXISTS asiento (
    numero      INTEGER PRIMARY KEY,        -- correlativo, sin saltos
    fecha       TEXT NOT NULL,              -- 'AAAA-MM-DD'
    periodo     TEXT NOT NULL,
    glosa       TEXT NOT NULL,
    tipo        TEXT NOT NULL DEFAULT 'traspaso'
                CHECK (tipo IN ('apertura','ingreso','egreso','traspaso','ajuste','cierre','anulacion')),
    origen      TEXT,                       -- 'manual', 'rcv', 'honorarios', ...
    anula_a     INTEGER REFERENCES asiento(numero),
    hash        TEXT NOT NULL,
    hash_prev   TEXT NOT NULL,
    creado      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS linea (
    id          INTEGER PRIMARY KEY,
    asiento     INTEGER NOT NULL REFERENCES asiento(numero),
    cuenta      TEXT NOT NULL REFERENCES cuenta(codigo),
    debe        INTEGER NOT NULL DEFAULT 0 CHECK (debe >= 0),
    haber       INTEGER NOT NULL DEFAULT 0 CHECK (haber >= 0),
    detalle     TEXT,
    rut_aux     TEXT,                       -- RUT del auxiliar (cliente/proveedor)
    documento   INTEGER REFERENCES documento(id)
);

CREATE TABLE IF NOT EXISTS documento (
    id              INTEGER PRIMARY KEY,
    libro           TEXT NOT NULL CHECK (libro IN ('compra','venta','honorario_recibido','honorario_emitido')),
    tipo_dte        INTEGER,
    rut_contraparte TEXT NOT NULL,
    razon_social    TEXT,
    folio           TEXT NOT NULL,
    fecha           TEXT NOT NULL,
    periodo         TEXT NOT NULL,
    exento          INTEGER NOT NULL DEFAULT 0,
    neto            INTEGER NOT NULL DEFAULT 0,
    iva             INTEGER NOT NULL DEFAULT 0,
    iva_no_rec      INTEGER NOT NULL DEFAULT 0,
    iva_uso_comun   INTEGER NOT NULL DEFAULT 0,
    iva_retenido    INTEGER NOT NULL DEFAULT 0,
    otros_imp       INTEGER NOT NULL DEFAULT 0,
    bruto           INTEGER NOT NULL DEFAULT 0,  -- honorarios
    retencion       INTEGER NOT NULL DEFAULT 0,  -- honorarios
    total           INTEGER NOT NULL DEFAULT 0,
    estado          TEXT,
    fuente          TEXT,                    -- archivo de origen
    UNIQUE (libro, tipo_dte, rut_contraparte, folio)
);

CREATE TABLE IF NOT EXISTS remanente_iva (
    periodo     TEXT PRIMARY KEY,           -- remanente que queda al cierre de este período
    monto       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bitacora (
    id      INTEGER PRIMARY KEY,
    cuando  TEXT NOT NULL DEFAULT (datetime('now')),
    accion  TEXT NOT NULL,
    detalle TEXT
);
"""


def conectar(ruta: str) -> sqlite3.Connection:
    con = sqlite3.connect(ruta)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(ESQUEMA)
    return con


def registrar_bitacora(con, accion: str, detalle: str = "") -> None:
    con.execute("INSERT INTO bitacora (accion, detalle) VALUES (?, ?)", (accion, detalle))
