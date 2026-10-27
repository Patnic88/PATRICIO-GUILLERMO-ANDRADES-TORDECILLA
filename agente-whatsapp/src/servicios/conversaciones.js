// Contactos, conversaciones y mensajes. Cada número de WhatsApp tiene una
// sola conversación; nada de lo que se consulta aquí cruza conversaciones.

import { ahora, transaccion } from "../db.js";
import { verificarClave } from "./seguridad.js";
import { normalizarRut } from "./rut.js";
import { auditar } from "./auditoria.js";
import { crearAlerta } from "./alertas.js";

export const normalizarTelefono = (t) => String(t || "").replace(/\D/g, "");

export function obtenerConversacion(db, telefono, { nombrePerfil = null, esPrueba = false } = {}) {
  const tel = normalizarTelefono(telefono);
  if (!tel) throw new Error("telefono_invalido");
  return transaccion(db, () => {
    let contacto = db.prepare("SELECT * FROM contactos WHERE telefono = ?").get(tel);
    if (!contacto) {
      const r = db.prepare("INSERT INTO contactos (telefono, nombre_perfil, creado) VALUES (?, ?, ?)").run(tel, nombrePerfil, ahora());
      contacto = db.prepare("SELECT * FROM contactos WHERE id = ?").get(r.lastInsertRowid);
    } else if (nombrePerfil && nombrePerfil !== contacto.nombre_perfil) {
      db.prepare("UPDATE contactos SET nombre_perfil = ? WHERE id = ?").run(nombrePerfil, contacto.id);
      contacto.nombre_perfil = nombrePerfil;
    }
    let conv = db.prepare("SELECT * FROM conversaciones WHERE contacto_id = ?").get(contacto.id);
    if (!conv) {
      const r = db.prepare("INSERT INTO conversaciones (contacto_id, es_prueba, creado, actualizado) VALUES (?, ?, ?, ?)").run(contacto.id, esPrueba ? 1 : 0, ahora(), ahora());
      conv = db.prepare("SELECT * FROM conversaciones WHERE id = ?").get(r.lastInsertRowid);
    }
    return { contacto, conversacion: conv };
  });
}

export const leerConversacion = (db, id) => db.prepare("SELECT * FROM conversaciones WHERE id = ?").get(id);
export const leerContacto = (db, id) => db.prepare("SELECT * FROM contactos WHERE id = ?").get(id);

// Registra un mensaje entrante. Si el identificador de WhatsApp ya existe
// (reintento del webhook), no se duplica.
export function registrarEntrante(db, { conversacionId, waId = null, tipo = "texto", texto = null, mediaId = null, documentoId = null }) {
  const r = db.prepare(
    `INSERT OR IGNORE INTO mensajes (conversacion_id, direccion, autor, wa_id, tipo, texto, media_id, documento_id, estado, creado, actualizado)
     VALUES (?, 'entrante', 'cliente', ?, ?, ?, ?, ?, 'pendiente', ?, ?)`
  ).run(conversacionId, waId, tipo, texto, mediaId, documentoId, ahora(), ahora());
  if (r.changes === 0) return { duplicado: true };
  db.prepare("UPDATE conversaciones SET ultimo_entrante = ?, actualizado = ? WHERE id = ?").run(ahora(), ahora(), conversacionId);
  return { duplicado: false, id: Number(r.lastInsertRowid) };
}

// Mensajes que forman parte de la conversación real: se excluyen los que
// aún se procesan y las respuestas que nunca llegaron al cliente.
const VISIBLES = "estado NOT IN ('pendiente','procesando') AND NOT (direccion = 'saliente' AND estado IN ('enviando','fallido'))";

// Sin identidad verificada (desde != null) se excluye además lo conversado
// mientras la identidad estuvo verificada (mensajes confidenciales).
export function historial(db, conversacionId, { limite = 30, desde = null } = {}) {
  const filas = desde
    ? db.prepare(`SELECT * FROM mensajes WHERE conversacion_id = ? AND creado >= ? AND confidencial = 0 AND ${VISIBLES} ORDER BY id DESC LIMIT ?`).all(conversacionId, desde, limite)
    : db.prepare(`SELECT * FROM mensajes WHERE conversacion_id = ? AND ${VISIBLES} ORDER BY id DESC LIMIT ?`).all(conversacionId, limite);
  return filas.reverse();
}

export function fijarModo(db, conversacionId, modo, motivo, actor) {
  db.prepare("UPDATE conversaciones SET modo = ?, motivo_modo = ?, actualizado = ? WHERE id = ?").run(modo, motivo || null, ahora(), conversacionId);
  auditar(db, { actor, accion: `conversacion.modo_${modo}`, conversacionId, detalle: { motivo } });
}

// ---------------------------------------------------------------------------
// Verificación de identidad
// ---------------------------------------------------------------------------

export function sesionVerificada(conv, referencia = new Date()) {
  return !!(conv.verificado_cliente_id && conv.verificado_hasta && new Date(conv.verificado_hasta) > referencia);
}

// Verifica RUT + código personal entregado por la oficina. El número de
// teléfono no participa: tenerlo no basta para acceder a información.
export function verificarIdentidad(db, cfgAgente, conversacionId, { rut, codigo }) {
  const conv = leerConversacion(db, conversacionId);
  const t = new Date();
  const codigoTxt = String(codigo || "").trim();
  // El código intentado (correcto o no) no queda guardado en texto plano.
  if (/^\d{4,8}$/.test(codigoTxt)) ocultarCodigo(db, conversacionId, codigoTxt);
  if (conv.bloqueado_hasta && new Date(conv.bloqueado_hasta) > t) {
    return { ok: false, motivo: "bloqueado_temporalmente", hasta: conv.bloqueado_hasta };
  }
  const rutN = normalizarRut(rut);
  const cliente = rutN ? db.prepare("SELECT * FROM clientes WHERE rut = ?").get(rutN) : null;
  // Bloqueo por cliente: impide adivinar el código desde muchos números.
  if (cliente?.bloqueado_hasta && new Date(cliente.bloqueado_hasta) > t) {
    auditar(db, { actor: "agente", accion: "identidad.verificar", conversacionId, resultado: "rechazado", detalle: { motivo: "cliente_bloqueado" } });
    return { ok: false, motivo: "bloqueado_temporalmente" };
  }
  const correcto = !!(cliente && cliente.pin_hash && /^\d{4,8}$/.test(codigoTxt) && verificarClave(codigoTxt, cliente.pin_hash));
  if (!correcto) {
    const intentos = conv.intentos_fallidos + 1;
    let bloqueo = null;
    if (intentos >= cfgAgente.intentosVerificacion) {
      bloqueo = new Date(t.getTime() + cfgAgente.bloqueoMinutos * 60_000).toISOString();
      crearAlerta(db, {
        tipo: "seguridad", prioridad: "alta", conversacionId,
        descripcion: `${intentos} intentos fallidos de verificación de identidad. Conversación bloqueada para verificación hasta ${bloqueo}.`,
        claveDedupe: `verif-bloqueo-${conversacionId}-${bloqueo.slice(0, 13)}`
      });
    }
    db.prepare("UPDATE conversaciones SET intentos_fallidos = ?, bloqueado_hasta = ?, actualizado = ? WHERE id = ?")
      .run(bloqueo ? 0 : intentos, bloqueo, ahora(), conversacionId);
    if (cliente) {
      const n = cliente.intentos_fallidos + 1;
      const hasta = n >= cfgAgente.intentosPorCliente ? new Date(t.getTime() + cfgAgente.bloqueoMinutos * 60_000).toISOString() : null;
      db.prepare("UPDATE clientes SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?").run(hasta ? 0 : n, hasta, cliente.id);
      if (hasta) crearAlerta(db, { tipo: "seguridad", prioridad: "alta", conversacionId, descripcion: `${n} intentos fallidos de verificación contra la ficha #${cliente.id}. Verificación de esa ficha bloqueada hasta ${hasta}. Si no fue el cliente, considere generar un código nuevo.`, claveDedupe: `verif-cliente-${cliente.id}-${hasta.slice(0, 13)}` });
    }
    auditar(db, { actor: "agente", accion: "identidad.verificar", conversacionId, resultado: "rechazado", detalle: { intentos } });
    return { ok: false, motivo: bloqueo ? "bloqueado_temporalmente" : "datos_no_coinciden", intentos_restantes: bloqueo ? 0 : cfgAgente.intentosVerificacion - intentos };
  }
  const hasta = new Date(t.getTime() + cfgAgente.verificacionHoras * 3600_000).toISOString();
  db.prepare(
    "UPDATE conversaciones SET verificado_cliente_id = ?, verificado_hasta = ?, verificado_por = 'rut_codigo', intentos_fallidos = 0, bloqueado_hasta = NULL, actualizado = ? WHERE id = ?"
  ).run(cliente.id, hasta, ahora(), conversacionId);
  db.prepare("UPDATE clientes SET intentos_fallidos = 0 WHERE id = ?").run(cliente.id);
  auditar(db, { actor: "agente", accion: "identidad.verificar", conversacionId, resultado: "ok", detalle: { cliente_id: cliente.id, hasta } });
  return { ok: true, cliente_id: cliente.id, nombre: cliente.nombre, valida_hasta: hasta };
}

export function ocultarCodigo(db, conversacionId, codigo) {
  if (!codigo) return;
  const filas = db.prepare("SELECT id, texto FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante' AND texto LIKE ?").all(conversacionId, `%${codigo}%`);
  const re = new RegExp(`(?<!\\d)${codigo}(?!\\d)`, "g");
  for (const f of filas) {
    db.prepare("UPDATE mensajes SET texto = ?, actualizado = ? WHERE id = ?").run(f.texto.replace(re, "[código de verificación omitido]"), ahora(), f.id);
  }
}

export function verificarManual(db, cfgAgente, conversacionId, clienteId, actor) {
  const hasta = new Date(Date.now() + cfgAgente.verificacionHoras * 3600_000).toISOString();
  db.prepare("UPDATE conversaciones SET verificado_cliente_id = ?, verificado_hasta = ?, verificado_por = ?, intentos_fallidos = 0, bloqueado_hasta = NULL, actualizado = ? WHERE id = ?")
    .run(clienteId, hasta, `manual:${actor}`, ahora(), conversacionId);
  auditar(db, { actor, accion: "identidad.verificar_manual", conversacionId, detalle: { cliente_id: clienteId, hasta } });
}

export function revocarVerificacion(db, conversacionId, actor) {
  db.prepare("UPDATE conversaciones SET verificado_cliente_id = NULL, verificado_hasta = NULL, verificado_por = NULL, actualizado = ? WHERE id = ?").run(ahora(), conversacionId);
  auditar(db, { actor, accion: "identidad.revocar", conversacionId });
}
