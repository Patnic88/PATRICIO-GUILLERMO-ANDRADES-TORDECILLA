// Persistencia en SQLite (módulo node:sqlite incluido en Node 22, sin
// dependencias externas). Un solo archivo de base de datos en DIR_DATOS.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ESQUEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  rut TEXT UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'persona' CHECK (tipo IN ('persona','empresa')),
  email TEXT,
  notas TEXT,
  pin_hash TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);

-- Un contacto es un número de WhatsApp. Puede estar asociado a un cliente,
-- pero esa asociación NO autoriza por sí sola a ver información confidencial.
CREATE TABLE IF NOT EXISTS contactos (
  id INTEGER PRIMARY KEY,
  telefono TEXT NOT NULL UNIQUE,
  nombre_perfil TEXT,
  cliente_id INTEGER REFERENCES clientes(id),
  creado TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversaciones (
  id INTEGER PRIMARY KEY,
  contacto_id INTEGER NOT NULL UNIQUE REFERENCES contactos(id),
  modo TEXT NOT NULL DEFAULT 'auto' CHECK (modo IN ('auto','humano')),
  motivo_modo TEXT,
  verificado_cliente_id INTEGER REFERENCES clientes(id),
  verificado_hasta TEXT,
  verificado_por TEXT,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TEXT,
  ultimo_entrante TEXT,
  ultimo_aviso_fallo TEXT,
  es_prueba INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id),
  direccion TEXT NOT NULL CHECK (direccion IN ('entrante','saliente')),
  autor TEXT NOT NULL CHECK (autor IN ('cliente','agente','patricio','sistema')),
  wa_id TEXT UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'texto',
  texto TEXT,
  media_id TEXT,
  documento_id INTEGER REFERENCES documentos(id),
  estado TEXT NOT NULL,
  en_respuesta_a INTEGER UNIQUE REFERENCES mensajes(id),
  error TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mensajes_conv ON mensajes(conversacion_id, id);
CREATE INDEX IF NOT EXISTS ix_mensajes_estado ON mensajes(estado);

-- Solicitudes: ingreso de una consulta o requerimiento. El agente las crea y
-- actualiza; aceptar un encargo (asunto) corresponde a Patricio.
CREATE TABLE IF NOT EXISTS solicitudes (
  id INTEGER PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id),
  contacto_id INTEGER NOT NULL REFERENCES contactos(id),
  cliente_id INTEGER REFERENCES clientes(id),
  asunto_id INTEGER REFERENCES asuntos(id),
  tipo_cliente TEXT CHECK (tipo_cliente IN ('nuevo','existente','trabajo_en_curso','no_determinado')),
  tipo TEXT NOT NULL DEFAULT 'consulta',
  materia TEXT,
  motivo TEXT,
  nombre_declarado TEXT,
  comuna TEXT,
  urgencia TEXT NOT NULL DEFAULT 'normal' CHECK (urgencia IN ('normal','prioritaria','urgente')),
  siguiente_accion TEXT,
  datos TEXT NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','derivada','cerrada')),
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asuntos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  titulo TEXT NOT NULL,
  materia TEXT,
  estado TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_evaluacion','en_curso','suspendido','cerrado')),
  tribunal TEXT,
  rol TEXT,
  siguiente_accion TEXT,
  resumen_cliente TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);

-- Gestiones efectuadas en un asunto (las registra Patricio).
CREATE TABLE IF NOT EXISTS gestiones (
  id INTEGER PRIMARY KEY,
  asunto_id INTEGER NOT NULL REFERENCES asuntos(id),
  fecha TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  visible_cliente INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL
);

-- Antecedentes con su procedencia: declarado por el cliente, obtenido de un
-- documento recibido, o verificado por la oficina.
CREATE TABLE IF NOT EXISTS antecedentes (
  id INTEGER PRIMARY KEY,
  contacto_id INTEGER REFERENCES contactos(id),
  cliente_id INTEGER REFERENCES clientes(id),
  asunto_id INTEGER REFERENCES asuntos(id),
  solicitud_id INTEGER REFERENCES solicitudes(id),
  campo TEXT NOT NULL,
  valor TEXT NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('declarado','documental','verificado')),
  documento_id INTEGER REFERENCES documentos(id),
  registrado_por TEXT NOT NULL,
  creado TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY,
  conversacion_id INTEGER REFERENCES conversaciones(id),
  contacto_id INTEGER REFERENCES contactos(id),
  cliente_id INTEGER REFERENCES clientes(id),
  asunto_id INTEGER REFERENCES asuntos(id),
  solicitud_id INTEGER REFERENCES solicitudes(id),
  clase TEXT NOT NULL DEFAULT 'documento' CHECK (clase IN ('documento','comprobante','imagen','audio','video','otro')),
  nombre TEXT,
  mime TEXT,
  bytes INTEGER,
  sha256 TEXT,
  ruta TEXT,
  media_id TEXT,
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'recibido' CHECK (estado IN ('recibido','asociado','error_descarga','rechazado')),
  error TEXT,
  creado TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS citas (
  id INTEGER PRIMARY KEY,
  contacto_id INTEGER NOT NULL REFERENCES contactos(id),
  conversacion_id INTEGER REFERENCES conversaciones(id),
  cliente_id INTEGER REFERENCES clientes(id),
  solicitud_id INTEGER REFERENCES solicitudes(id),
  inicio TEXT NOT NULL,
  fin TEXT NOT NULL,
  modalidad TEXT,
  motivo TEXT,
  nombre TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('confirmada','cancelada')),
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
-- Impide dos reservas confirmadas en el mismo bloque.
CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_bloque ON citas(inicio) WHERE estado = 'confirmada';

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY,
  contacto_id INTEGER NOT NULL REFERENCES contactos(id),
  conversacion_id INTEGER REFERENCES conversaciones(id),
  cliente_id INTEGER REFERENCES clientes(id),
  asunto_id INTEGER REFERENCES asuntos(id),
  documento_id INTEGER UNIQUE REFERENCES documentos(id),
  monto_declarado TEXT,
  fecha_declarada TEXT,
  concepto TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente_verificacion' CHECK (estado IN ('pendiente_verificacion','verificado','rechazado')),
  verificado_por TEXT,
  verificado_en TEXT,
  nota TEXT,
  creado TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  prioridad TEXT NOT NULL CHECK (prioridad IN ('alta','media','baja')),
  conversacion_id INTEGER REFERENCES conversaciones(id),
  solicitud_id INTEGER REFERENCES solicitudes(id),
  descripcion TEXT NOT NULL,
  fecha_informada TEXT,
  clave_dedupe TEXT UNIQUE,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','resuelta')),
  notificada TEXT,
  creado TEXT NOT NULL,
  resuelta_en TEXT
);

-- Base de conocimiento. El agente solo lee entradas en estado 'aprobado'.
CREATE TABLE IF NOT EXISTS conocimiento (
  id INTEGER PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('aprobado','pendiente','borrador')),
  nota_interna TEXT,
  actualizado TEXT NOT NULL,
  actualizado_por TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  accion TEXT NOT NULL,
  conversacion_id INTEGER,
  resultado TEXT,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS ix_auditoria_conv ON auditoria(conversacion_id, id);

CREATE TABLE IF NOT EXISTS sesiones_admin (
  token_hash TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expira TEXT NOT NULL
);
`;

export function abrirDb(ruta) {
  if (ruta !== ":memory:") mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  if (ruta !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(ESQUEMA);
  return db;
}

export const ahora = () => new Date().toISOString();

// Ejecuta fn dentro de una transacción. Si fn lanza, se revierte todo.
export function transaccion(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function leerAjuste(db, clave, def = null) {
  const fila = db.prepare("SELECT valor FROM ajustes WHERE clave = ?").get(clave);
  return fila ? JSON.parse(fila.valor) : def;
}

export function guardarAjuste(db, clave, valor) {
  db.prepare(
    `INSERT INTO ajustes (clave, valor, actualizado) VALUES (?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado`
  ).run(clave, JSON.stringify(valor), ahora());
}
