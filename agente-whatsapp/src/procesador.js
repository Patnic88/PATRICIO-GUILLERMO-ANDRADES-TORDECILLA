// Cola persistente de mensajes. Flujo:
//   webhook → mensaje 'pendiente' (deduplicado por id de WhatsApp)
//   → espera breve (DEBOUNCE_MS) para agrupar mensajes seguidos
//   → 'procesando' → turno del agente → respuesta 'enviando' → 'enviado'.
// Una respuesta por grupo de mensajes (índice único en en_respuesta_a), de
// modo que un reinicio o un reintento no duplica respuestas.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ahora, transaccion, leerAjuste } from "./db.js";
import { leerConversacion, leerContacto, obtenerConversacion, registrarEntrante, fijarModo, normalizarTelefono, sesionVerificada } from "./servicios/conversaciones.js";
import { crearAlerta } from "./servicios/alertas.js";
import { auditar, log } from "./servicios/auditoria.js";
import { tokenAleatorio } from "./servicios/seguridad.js";
import { extraerEventos } from "./whatsapp/webhook.js";
import { procesarTurno } from "./agente/turno.js";

const MIME_PERMITIDOS = /^(image\/(jpeg|png|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel|text\/plain|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp))(;.*)?$/i;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "text/plain": "txt", "audio/ogg": "ogg", "audio/mpeg": "mp3", "video/mp4": "mp4" };
const CLASE = { image: "imagen", document: "documento", audio: "audio", video: "video", sticker: "otro" };

export function crearProcesador(app) {
  const { db, cfg } = app;
  const enCurso = new Set();
  let temporizador = null;

  // ---- Documentos ---------------------------------------------------------

  function crearDocumento({ conversacionId, contactoId, tipo, nombre, mime, mediaId }) {
    const r = db.prepare(
      `INSERT INTO documentos (conversacion_id, contacto_id, clase, nombre, mime, media_id, estado, creado) VALUES (?, ?, ?, ?, ?, ?, 'recibido', ?)`
    ).run(conversacionId, contactoId, CLASE[tipo] || "documento", nombre || null, mime || null, mediaId || null, ahora());
    return Number(r.lastInsertRowid);
  }

  function guardarArchivo(documentoId, bytes, mime, sha256) {
    if (!MIME_PERMITIDOS.test(mime || "")) {
      db.prepare("UPDATE documentos SET estado = 'rechazado', error = ?, mime = ? WHERE id = ?").run("tipo_de_archivo_no_permitido", mime, documentoId);
      return false;
    }
    const mes = ahora().slice(0, 7);
    const dir = join(cfg.dirDatos, "documentos", mes);
    mkdirSync(dir, { recursive: true });
    // El nombre en disco no usa el nombre enviado por el cliente.
    const ruta = join(dir, `${documentoId}-${sha256.slice(0, 12)}.${EXT[mime.split(";")[0]] || "bin"}`);
    writeFileSync(ruta, bytes, { mode: 0o600 });
    db.prepare("UPDATE documentos SET ruta = ?, bytes = ?, sha256 = ?, mime = ? WHERE id = ?").run(ruta, bytes.length, sha256, mime, documentoId);
    return true;
  }

  async function descargarPendientes(mensajes) {
    for (const m of mensajes) {
      if (!m.documento_id) continue;
      const d = db.prepare("SELECT * FROM documentos WHERE id = ?").get(m.documento_id);
      if (!d || d.ruta || !d.media_id || d.estado !== "recibido") continue;
      try {
        const { bytes, mime, sha256 } = await app.whatsapp.descargarMedia(d.media_id);
        guardarArchivo(d.id, bytes, mime, sha256);
      } catch (e) {
        db.prepare("UPDATE documentos SET estado = 'error_descarga', error = ? WHERE id = ?").run(String(e.message).slice(0, 300), d.id);
        auditar(db, { actor: "sistema", accion: "documento.descargar", conversacionId: m.conversacion_id, resultado: "error", detalle: { documento_id: d.id, error: String(e.message).slice(0, 200) } });
      }
    }
  }

  // ---- Envío --------------------------------------------------------------

  async function enviar(conversacionId, texto, { enRespuestaA = null, autor = "agente", confidencial = false } = {}) {
    const conv = leerConversacion(db, conversacionId);
    const contacto = leerContacto(db, conv.contacto_id);
    let id;
    try {
      id = Number(db.prepare(
        `INSERT INTO mensajes (conversacion_id, direccion, autor, tipo, texto, estado, en_respuesta_a, confidencial, creado, actualizado) VALUES (?, 'saliente', ?, 'texto', ?, 'enviando', ?, ?, ?, ?)`
      ).run(conversacionId, autor, texto, enRespuestaA, confidencial ? 1 : 0, ahora(), ahora()).lastInsertRowid);
    } catch (e) {
      if (/UNIQUE/i.test(String(e.message))) return { duplicado: true };
      throw e;
    }
    // Las conversaciones del simulador nunca salen por WhatsApp, ni siquiera en producción.
    let r;
    try {
      r = conv.es_prueba ? { simulado: true, id: null } : await app.whatsapp.enviarTexto(contacto.telefono, texto, { manual: autor === "patricio" });
    } catch (e) {
      db.prepare("UPDATE mensajes SET estado = 'fallido', error = ?, actualizado = ? WHERE id = ?").run(String(e.message).slice(0, 300), ahora(), id);
      crearAlerta(db, { tipo: "envio_fallido", prioridad: "alta", conversacionId, descripcion: `No se pudo enviar un mensaje por WhatsApp: ${String(e.message).slice(0, 200)}. El cliente NO recibió la respuesta.` });
      auditar(db, { actor: autor, accion: "mensaje.enviar", conversacionId, resultado: "error", detalle: { mensaje_id: id, error: String(e.message).slice(0, 200) } });
      return { id, error: String(e.message) };
    }
    // El envío ya ocurrió: un error al registrarlo no debe presentarse como falla de envío.
    try {
      db.prepare("UPDATE mensajes SET estado = ?, wa_id = ?, actualizado = ? WHERE id = ?").run(r.simulado ? "simulado" : "enviado", r.id, ahora(), id);
      auditar(db, { actor: autor, accion: "mensaje.enviar", conversacionId, resultado: r.simulado ? "simulado" : "ok", detalle: { mensaje_id: id } });
    } catch (e) {
      log("error", "mensaje enviado pero no registrado", { conversacionId, mensaje_id: id, error: String(e.message) });
    }
    return { id, simulado: r.simulado };
  }

  // Mensaje manual de Patricio desde el panel: solo dentro de las 24 horas
  // siguientes al último mensaje del cliente (ventana de atención de WhatsApp).
  async function enviarManual(conversacionId, texto, actor) {
    const conv = leerConversacion(db, conversacionId);
    if (!conv.ultimo_entrante || Date.now() - Date.parse(conv.ultimo_entrante) > 24 * 3600_000) {
      return { error: "fuera_de_ventana", detalle: "Han pasado más de 24 horas desde el último mensaje del cliente. WhatsApp exige una plantilla aprobada para escribirle." };
    }
    fijarModo(db, conversacionId, "humano", "Patricio respondió desde el panel", actor);
    return enviar(conversacionId, texto, { autor: "patricio", confidencial: sesionVerificada(conv) });
  }

  // ---- Procesamiento ------------------------------------------------------

  async function procesarConversacion(conversacionId) {
    if (enCurso.has(conversacionId)) return { ocupado: true };
    enCurso.add(conversacionId);
    let ids = [];
    try {
      const nuevos = transaccion(db, () => {
        const filas = db.prepare("SELECT * FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante' AND estado = 'pendiente' ORDER BY id").all(conversacionId);
        for (const f of filas) db.prepare("UPDATE mensajes SET estado = 'procesando', actualizado = ? WHERE id = ?").run(ahora(), f.id);
        return filas;
      });
      if (!nuevos.length) return { vacio: true };
      ids = nuevos.map((m) => m.id);
      await descargarPendientes(nuevos);
      const conv = leerConversacion(db, conversacionId);
      const marcar = (estado, error = null) => {
        for (const id of ids) db.prepare("UPDATE mensajes SET estado = ?, error = ?, actualizado = ? WHERE id = ?").run(estado, error, ahora(), id);
      };
      if (leerAjuste(db, "agente_pausado", false) || conv.modo === "humano") {
        marcar("recibido_humano");
        crearAlerta(db, { tipo: "mensaje_en_espera", prioridad: "media", conversacionId, descripcion: "Mensaje nuevo en una conversación con respuestas automáticas pausadas.", claveDedupe: `espera-${conversacionId}-${ahora().slice(0, 13)}` });
        return { sinRespuesta: true };
      }
      const recientes = db.prepare("SELECT COUNT(*) n FROM mensajes WHERE conversacion_id = ? AND direccion = 'saliente' AND autor = 'agente' AND creado >= ?")
        .get(conversacionId, new Date(Date.now() - 3600_000).toISOString()).n;
      if (recientes >= cfg.agente.maxTurnosHora) {
        marcar("limitado");
        crearAlerta(db, { tipo: "limite_mensajes", prioridad: "alta", conversacionId, descripcion: `La conversación superó ${cfg.agente.maxTurnosHora} respuestas automáticas en una hora. El agente dejó de responder en ella hasta la próxima hora; revise si es abuso o una consulta que requiere atención directa.`, claveDedupe: `limite-${conversacionId}-${ahora().slice(0, 13)}` });
        return { sinRespuesta: true, limitado: true };
      }
      const turno = await procesarTurno(app, conversacionId, nuevos.map((m) => db.prepare("SELECT * FROM mensajes WHERE id = ?").get(m.id)));
      marcar(turno.error ? "error" : "procesado", turno.error);
      // Lo conversado con identidad verificada no vuelve a mostrarse al
      // agente si después la verificación vence o se revoca.
      const confidencial = !!turno.estado?.verificado || sesionVerificada(leerConversacion(db, conversacionId));
      if (confidencial) for (const id of ids) db.prepare("UPDATE mensajes SET confidencial = 1 WHERE id = ?").run(id);
      const envio = turno.texto ? await enviar(conversacionId, turno.texto, { enRespuestaA: ids[ids.length - 1], confidencial }) : null;
      return { turno, envio };
    } catch (e) {
      log("error", "fallo procesando conversación", { conversacionId, error: String(e.stack || e) });
      for (const id of ids) db.prepare("UPDATE mensajes SET estado = 'error', error = ?, actualizado = ? WHERE id = ?").run(String(e.message).slice(0, 300), ahora(), id);
      crearAlerta(db, { tipo: "fallo_sistema", prioridad: "alta", conversacionId, descripcion: `Error interno procesando mensajes: ${String(e.message).slice(0, 200)}`, claveDedupe: `fallo-sis-${conversacionId}-${ahora().slice(0, 13)}` });
      return { error: String(e.message) };
    } finally {
      enCurso.delete(conversacionId);
    }
  }

  async function revisarCola() {
    const filas = db.prepare("SELECT conversacion_id, MAX(creado) AS ultimo FROM mensajes WHERE estado = 'pendiente' AND direccion = 'entrante' GROUP BY conversacion_id").all();
    const listas = filas.filter((f) => !enCurso.has(f.conversacion_id) && Date.now() - Date.parse(f.ultimo) >= cfg.agente.debounceMs);
    await Promise.all(listas.map((f) => procesarConversacion(f.conversacion_id)));
  }

  // ---- Entrada desde el webhook -------------------------------------------

  function ingresarWebhook(payload) {
    const ev = extraerEventos(payload, cfg.whatsapp.phoneNumberId);
    let nuevos = 0, duplicados = 0;
    for (const m of ev.mensajes) {
      const { contacto, conversacion } = obtenerConversacion(db, m.de, { nombrePerfil: m.nombrePerfil });
      if (db.prepare("SELECT 1 FROM mensajes WHERE wa_id = ?").get(m.waId)) { duplicados++; continue; }
      // Un mensaje real convierte en real una conversación creada en el simulador.
      if (conversacion.es_prueba) db.prepare("UPDATE conversaciones SET es_prueba = 0 WHERE id = ?").run(conversacion.id);
      const documentoId = m.media ? crearDocumento({ conversacionId: conversacion.id, contactoId: contacto.id, tipo: m.tipo, nombre: m.media.nombre, mime: m.media.mime, mediaId: m.media.id }) : null;
      const r = registrarEntrante(db, { conversacionId: conversacion.id, waId: m.waId, tipo: m.media ? m.tipo : "texto", texto: m.texto, mediaId: m.media?.id ?? null, documentoId });
      if (r.duplicado) { duplicados++; if (documentoId) db.prepare("DELETE FROM documentos WHERE id = ?").run(documentoId); } else nuevos++;
    }
    const mapa = { sent: "enviado", delivered: "entregado", read: "leido", failed: "fallido" };
    const orden = { enviando: 0, incierto: 0, simulado: 0, enviado: 1, entregado: 2, leido: 3 };
    for (const s of ev.estados) {
      const fila = db.prepare("SELECT id, conversacion_id, estado FROM mensajes WHERE wa_id = ? AND direccion = 'saliente'").get(s.waId);
      if (!fila || !mapa[s.estado]) continue;
      // Los estados llegan desordenados: nunca retroceder (leído → entregado).
      if (s.estado !== "failed" && (orden[mapa[s.estado]] ?? 0) <= (orden[fila.estado] ?? 0)) continue;
      db.prepare("UPDATE mensajes SET estado = ?, error = ?, actualizado = ? WHERE id = ?").run(mapa[s.estado], s.errores ? JSON.stringify(s.errores).slice(0, 300) : null, ahora(), fila.id);
      if (s.estado === "failed") crearAlerta(db, { tipo: "envio_fallido", prioridad: "alta", conversacionId: fila.conversacion_id, descripcion: `WhatsApp informó que un mensaje no fue entregado: ${JSON.stringify(s.errores || []).slice(0, 200)}`, claveDedupe: `entrega-${s.waId}` });
    }
    for (const e of ev.ecos) {
      const tel = normalizarTelefono(e.para);
      const c = db.prepare("SELECT conversaciones.id FROM conversaciones JOIN contactos ON contactos.id = conversaciones.contacto_id WHERE contactos.telefono = ?").get(tel);
      if (!c) continue;
      db.prepare(`INSERT OR IGNORE INTO mensajes (conversacion_id, direccion, autor, wa_id, tipo, texto, estado, creado, actualizado) VALUES (?, 'saliente', 'patricio', ?, 'texto', ?, 'enviado', ?, ?)`).run(c.id, e.waId, e.texto, ahora(), ahora());
      fijarModo(db, c.id, "humano", "Patricio respondió desde la app de WhatsApp Business", "webhook");
    }
    auditar(db, { actor: "webhook", accion: "webhook.recibir", detalle: { nuevos, duplicados, estados: ev.estados.length, ecos: ev.ecos.length, descartados: ev.descartados } });
    if (nuevos) despertar();
    return { nuevos, duplicados };
  }

  // ---- Simulador (panel) --------------------------------------------------

  async function simularEntrante({ telefono, texto, archivo = null }) {
    const { contacto, conversacion } = obtenerConversacion(db, telefono, { nombrePerfil: "Simulador", esPrueba: true });
    let documentoId = null;
    if (archivo) {
      const bytes = Buffer.from(archivo.base64, "base64");
      if (bytes.length > cfg.whatsapp.maxBytesMedia) return { error: "archivo_demasiado_grande" };
      const tipo = /^image\//.test(archivo.mime) ? "image" : /^audio\//.test(archivo.mime) ? "audio" : "document";
      documentoId = crearDocumento({ conversacionId: conversacion.id, contactoId: contacto.id, tipo, nombre: archivo.nombre, mime: archivo.mime });
      const { createHash } = await import("node:crypto");
      guardarArchivo(documentoId, bytes, archivo.mime, createHash("sha256").update(bytes).digest("hex"));
    }
    registrarEntrante(db, { conversacionId: conversacion.id, waId: `sim-${tokenAleatorio(9)}`, tipo: archivo ? "documento" : "texto", texto: texto || null, documentoId });
    const r = await procesarConversacion(conversacion.id);
    return { conversacionId: conversacion.id, ...r };
  }

  // ---- Ciclo de vida ------------------------------------------------------

  function recuperar() {
    const n = db.prepare("UPDATE mensajes SET estado = 'pendiente', actualizado = ? WHERE estado = 'procesando'").run(ahora()).changes;
    for (const m of db.prepare("SELECT id, conversacion_id FROM mensajes WHERE estado = 'enviando'").all()) {
      db.prepare("UPDATE mensajes SET estado = 'incierto', actualizado = ? WHERE id = ?").run(ahora(), m.id);
      crearAlerta(db, { tipo: "envio_incierto", prioridad: "alta", conversacionId: m.conversacion_id, descripcion: `El servicio se reinició durante el envío del mensaje #${m.id}. No se reenvía para evitar duplicados; verifique si el cliente lo recibió.`, claveDedupe: `incierto-${m.id}` });
    }
    if (n) log("info", "mensajes recuperados tras reinicio", { n });
  }

  function despertar() {
    setTimeout(() => revisarCola().catch((e) => log("error", "cola", { error: String(e) })), cfg.agente.debounceMs + 50);
  }

  return {
    iniciar() {
      recuperar();
      temporizador = setInterval(() => revisarCola().catch((e) => log("error", "cola", { error: String(e) })), 1000);
      temporizador.unref?.();
    },
    detener() { if (temporizador) clearInterval(temporizador); },
    ingresarWebhook, procesarConversacion, revisarCola, simularEntrante, enviarManual, enviar, recuperar
  };
}
