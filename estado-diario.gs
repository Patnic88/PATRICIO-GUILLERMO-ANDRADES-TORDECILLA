/**
 * Agente: Estado Diario del Tribunal
 * ----------------------------------
 * Revisa el correo de Gmail y reúne las notificaciones del Poder Judicial
 * (pjud.cl) que provienen de:
 *
 *   • Juzgado de Letras y Garantía de Los Vilos
 *   • Corte de Apelaciones de La Serena
 *
 * y que están vinculadas a Patricio Andrades y/o a la I. Municipalidad de
 * Los Vilos. Devuelve los movimientos del día en JSON para que la página
 * `estado-diario.html` los muestre automáticamente.
 *
 * Corre dentro de tu propia cuenta de Google: sin servidores, sin
 * contraseñas, sin credenciales extra.
 *
 * INSTALACIÓN (una sola vez, ~5 minutos):
 *   1. Entra a https://script.google.com y crea un "Nuevo proyecto".
 *   2. Borra el contenido de ejemplo y pega TODO este archivo.
 *   3. Menú "Implementar" → "Nueva implementación" → tipo "Aplicación web".
 *        - Ejecutar como: Yo (tu cuenta)
 *        - Quién tiene acceso: Cualquiera
 *   4. Autoriza los permisos de Gmail cuando lo pida.
 *   5. Copia la URL de la aplicación web (termina en /exec).
 *   6. Pégala en `config.js` -> window.COURT_SYNC_URL = "...".
 *
 * REVISIÓN AUTOMÁTICA DIARIA (opcional pero recomendado):
 *   En el editor de Apps Script:
 *     · Activadores (icono de reloj) → "Añadir activador"
 *     · Función a ejecutar:   reviseEstadoDiario
 *     · Tipo de evento:       Basado en tiempo → Día → 08:00
 *   El agente etiquetará los hilos nuevos con "⚖️ Estado Diario" y
 *   enviará un resumen al propio buzón con los movimientos del día.
 */

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

var COURT_SOURCES = [
  {
    id: "los-vilos",
    nombre: "Juzgado de Letras y Garantía de Los Vilos",
    // Remitentes oficiales del Poder Judicial para este tribunal.
    senders: [
      "notifica_jl_losvilos@pjud.cl",
      "notifica_jlg_losvilos@pjud.cl",
      "jl_losvilos@pjud.cl"
    ],
    // Pista textual para reconocerlo cuando llega por un alias distinto.
    domainHint: "los vilos"
  },
  {
    id: "corte-la-serena",
    nombre: "Corte de Apelaciones de La Serena",
    senders: [
      "notifica_corte_laserena@pjud.cl",
      "notifica_ica_laserena@pjud.cl",
      "ica_laserena@pjud.cl"
    ],
    domainHint: "la serena"
  }
];

// Términos que vinculan la causa a Patricio o al municipio.
var KEYWORDS = [
  "municipalidad de los vilos",
  "i. municipalidad de los vilos",
  "muni los vilos",
  "patricio andrades",
  "andrades tordecilla",
  "patricio guillermo andrades"
];

// Etiqueta que se aplica a los hilos detectados (se crea si no existe).
var STATE_LABEL = "⚖️ Estado Diario";

// Resumen diario por correo: dirección a la que enviar el digest.
// Déjalo vacío para no recibir resumen por correo.
var DIGEST_TO = "pandrades23@gmail.com";

// URL pública de la página `estado-diario.html` (si la publicas, p. ej. en
// GitHub Pages). El digest incluye un enlace "Ver tablero" cuando está
// configurada. Déjala vacía si abres la página sólo localmente.
var DIGEST_DASHBOARD_URL = "";

var MAX_DAYS = 14;
var MAX_THREADS = 80;

// ---------------------------------------------------------------------------
// Punto de entrada del Web App (consumido por estado-diario.html)
// ---------------------------------------------------------------------------

function doGet(e) {
  var dias = parseInt((e && e.parameter && e.parameter.dias) || "1", 10);
  if (isNaN(dias) || dias < 1) dias = 1;
  if (dias > MAX_DAYS) dias = MAX_DAYS;

  // Auto-instalación del trigger diario en la primera invocación del Web App.
  try { ensureDailyTrigger(); } catch (err) { /* no bloquear la respuesta */ }

  var entries = buildEntries(dias);
  var payload = JSON.stringify({
    updated: new Date().toISOString(),
    dias: dias,
    entries: entries
  });

  // JSONP para que funcione abriendo la página como archivo local (file://).
  var callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + payload + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Job programable: revisa, etiqueta y opcionalmente envía resumen al buzón.
// ---------------------------------------------------------------------------

function reviseEstadoDiario() {
  var entries = buildEntries(1);
  if (!entries.length) return 0;

  var label = GmailApp.getUserLabelByName(STATE_LABEL)
    || GmailApp.createLabel(STATE_LABEL);

  entries.forEach(function (entry) {
    if (!entry.threadId) return;
    try { GmailApp.getThreadById(entry.threadId).addLabel(label); }
    catch (err) { /* el hilo puede haber sido archivado */ }
  });

  if (DIGEST_TO) {
    var digest = buildDigest(entries);
    GmailApp.sendEmail(DIGEST_TO, digest.subject, digest.plain, { htmlBody: digest.html });
  }

  return entries.length;
}

/**
 * Helper para mandar el resumen del día AHORA mismo (sin esperar al
 * trigger de las 08:00). Útil para validar que el correo llega bien.
 * Córrelo desde el editor de Apps Script: "Ejecutar → sendDigestNow".
 */
function sendDigestNow() {
  if (!DIGEST_TO) throw new Error("DIGEST_TO está vacío; edita estado-diario.gs");
  var entries = buildEntries(1);
  var digest = buildDigest(entries);
  GmailApp.sendEmail(DIGEST_TO, digest.subject, digest.plain, { htmlBody: digest.html });
  return entries.length;
}

/**
 * Arma el resumen para el correo a partir de una lista de entradas.
 * Pura: no toca Gmail ni el reloj — facilita probarla en isolation.
 * Devuelve { subject, plain, html }.
 */
function buildDigest(entries) {
  var fechaHoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy");
  var total = entries.length;

  if (!total) {
    return {
      subject: "⚖️ Estado Diario " + fechaHoy + " — sin movimientos",
      plain: "Sin movimientos hoy en el Juzgado de Los Vilos ni en la Corte de La Serena vinculados a la Municipalidad.",
      html: "<p>Sin movimientos hoy en el Juzgado de Los Vilos ni en la Corte de La Serena vinculados a la Municipalidad.</p>"
    };
  }

  var subject = "⚖️ Estado Diario " + fechaHoy + " — "
    + total + (total === 1 ? " movimiento" : " movimientos");

  // Agrupar por tribunal para que el correo sea legible.
  var grupos = {};
  entries.forEach(function (e) {
    var k = e.tribunal || "Otro";
    (grupos[k] = grupos[k] || []).push(e);
  });

  // Texto plano (fallback para clientes sin HTML)
  var plainLines = ["Estado Diario del " + fechaHoy, ""];
  Object.keys(grupos).forEach(function (trib) {
    plainLines.push("=== " + trib + " (" + grupos[trib].length + ") ===");
    grupos[trib].forEach(function (e) {
      plainLines.push("• " + (e.rol || "(sin rol)") + " — " + e.tipoResolucion);
      plainLines.push("  " + (e.caratulado || ""));
      if (e.resumen) plainLines.push("  " + e.resumen.slice(0, 220));
      if (e.threadId) plainLines.push("  https://mail.google.com/mail/u/0/#all/" + e.threadId);
      plainLines.push("");
    });
  });

  // HTML formateado
  var htmlParts = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1f2933;max-width:640px;">',
    '<h2 style="margin:0 0 12px;color:#1b5e9b;">⚖️ Estado Diario · ' + escapeHtml(fechaHoy) + '</h2>',
    '<p style="color:#69707d;margin:0 0 18px;">' + total
      + (total === 1 ? ' movimiento detectado' : ' movimientos detectados')
      + ' en tu Gmail vinculados a la I. Municipalidad de Los Vilos / Patricio Andrades.</p>'
  ];
  Object.keys(grupos).forEach(function (trib) {
    htmlParts.push('<h3 style="margin:18px 0 8px;color:#14497a;border-bottom:1px solid #e3e8ef;padding-bottom:4px;">'
      + escapeHtml(trib) + ' <span style="color:#69707d;font-weight:400;">(' + grupos[trib].length + ')</span></h3>');
    grupos[trib].forEach(function (e) {
      htmlParts.push('<div style="margin:0 0 14px;padding:10px 12px;background:#f4f6f9;border-left:3px solid #7b5bbf;border-radius:6px;">');
      htmlParts.push('<div style="font-weight:600;">' + escapeHtml(e.caratulado || "(sin carátula)") + '</div>');
      htmlParts.push('<div style="font-size:13px;color:#69707d;margin:4px 0;">'
        + '<span style="font-family:ui-monospace,monospace;background:#f3f1ea;color:#6d5a1f;padding:1px 8px;border-radius:999px;">'
        + escapeHtml(e.rol || "sin rol") + '</span> '
        + '<span style="background:#e9f5ee;color:#4a9d6a;padding:1px 8px;border-radius:999px;margin-left:4px;">'
        + escapeHtml(e.tipoResolucion || "Movimiento") + '</span></div>');
      if (e.resumen) {
        htmlParts.push('<div style="font-size:13px;color:#1f2933;margin-top:6px;">'
          + escapeHtml(e.resumen.slice(0, 280)) + '</div>');
      }
      if (e.threadId) {
        htmlParts.push('<div style="margin-top:6px;"><a href="https://mail.google.com/mail/u/0/#all/'
          + encodeURIComponent(e.threadId)
          + '" style="font-size:12px;color:#1b5e9b;text-decoration:none;">🔗 Ver correo original</a></div>');
      }
      htmlParts.push('</div>');
    });
  });
  if (DIGEST_DASHBOARD_URL) {
    htmlParts.push('<p style="margin:20px 0 0;"><a href="' + escapeHtml(DIGEST_DASHBOARD_URL)
      + '" style="background:#1b5e9b;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Ver tablero completo</a></p>');
  }
  htmlParts.push('<p style="margin:24px 0 0;font-size:11px;color:#a0a8b3;">Generado por estado-diario.gs ejecutándose en tu cuenta de Google.</p>');
  htmlParts.push('</div>');

  return {
    subject: subject,
    plain: plainLines.join("\n"),
    html: htmlParts.join("")
  };
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Crea (si no existe) un trigger basado en tiempo que ejecuta
 * `reviseEstadoDiario` cada día a las 08:00 hora local del script.
 * Idempotente: no duplica triggers.
 */
function ensureDailyTrigger() {
  var existing = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "reviseEstadoDiario";
  });
  if (existing) return false;
  ScriptApp.newTrigger("reviseEstadoDiario")
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();
  return true;
}

/**
 * Helper manual para borrar todos los triggers asociados a este script.
 */
function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
}

// ---------------------------------------------------------------------------
// Núcleo: búsqueda y filtrado de notificaciones
// ---------------------------------------------------------------------------

function buildEntries(dias) {
  var afterDate = new Date();
  afterDate.setHours(0, 0, 0, 0);
  afterDate.setDate(afterDate.getDate() - dias + 1);
  var afterStr = Utilities.formatDate(
    afterDate, Session.getScriptTimeZone(), "yyyy/MM/dd"
  );

  // Construye la búsqueda de Gmail: cualquier remitente conocido + dominio
  // genérico pjud.cl como red de seguridad.
  var senderClauses = [];
  COURT_SOURCES.forEach(function (src) {
    src.senders.forEach(function (s) { senderClauses.push("from:" + s); });
  });
  senderClauses.push("from:@pjud.cl");

  var query = "(" + senderClauses.join(" OR ") + ") after:" + afterStr;
  var threads = GmailApp.search(query, 0, MAX_THREADS);

  var entries = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      if (msg.getDate() < afterDate) return;
      var entry = analyzeMessage(thread, msg);
      if (entry) entries.push(entry);
    });
  });

  // Deduplica por id (mismo mensaje no repetido) y ordena de más reciente a más antiguo.
  var seen = {};
  entries = entries.filter(function (e) {
    if (seen[e.id]) return false;
    seen[e.id] = true;
    return true;
  });
  entries.sort(function (a, b) { return b.fechaIso.localeCompare(a.fechaIso); });
  return entries;
}

function analyzeMessage(thread, msg) {
  var from = (msg.getFrom() || "").toLowerCase();
  var subject = msg.getSubject() || "";
  var body = msg.getPlainBody() || "";
  var hay = (subject + " " + body).toLowerCase();

  // ¿Proviene de uno de los tribunales que nos interesan?
  var source = null;
  for (var i = 0; i < COURT_SOURCES.length; i++) {
    var src = COURT_SOURCES[i];
    var matchSender = src.senders.some(function (s) {
      return from.indexOf(s.toLowerCase()) !== -1;
    });
    var matchHint = hay.indexOf(src.domainHint) !== -1
      && from.indexOf("@pjud.cl") !== -1;
    if (matchSender || matchHint) { source = src; break; }
  }
  if (!source) return null;

  // ¿Está vinculada a Patricio o a la Municipalidad de Los Vilos?
  var vinculado = KEYWORDS.some(function (k) { return hay.indexOf(k) !== -1; });
  if (!vinculado) return null;

  return {
    id: "ed-" + msg.getId(),
    rol: extractRol(subject + " " + body),
    caratulado: extractCaratulado(subject, body),
    tribunal: source.nombre,
    tipoTribunal: source.id,
    fecha: Utilities.formatDate(
      msg.getDate(), Session.getScriptTimeZone(), "yyyy-MM-dd"
    ),
    fechaIso: msg.getDate().toISOString(),
    tipoResolucion: extractTipo(subject + " " + body),
    resumen: body.replace(/\s+/g, " ").trim().slice(0, 280),
    remitente: (msg.getFrom() || "").replace(/.*<(.+)>.*/, "$1"),
    threadId: thread.getId(),
    revisada: false
  };
}

// ---------------------------------------------------------------------------
// Extractores ligeros — funcionan sobre el cuerpo del correo del PJUD.
// ---------------------------------------------------------------------------

function extractRol(text) {
  // Formatos típicos del PJUD: C-114-2026, RIT O-3-2026, Rol N° 1234-2025,
  // Ingreso Corte 12345-2026, Ingreso Causa 999-2025. Permitimos una
  // palabra intermedia frecuente ("Corte" / "ICA" / "Causa") entre la
  // keyword y el rol propiamente tal.
  var m = text.match(
    /\b(?:rol|rit|ric|ingreso)\b(?:\s+(?:corte|ica|causa))?\s*(?:n[°º]?)?\s*[:#]?\s*([A-Z]?-?\s*\d+\s*-\s*\d{4})/i
  );
  if (m) return m[1].replace(/\s+/g, "");
  m = text.match(/\b([A-Z])-(\d{1,6})-(\d{4})\b/);
  return m ? (m[1] + "-" + m[2] + "-" + m[3]) : "";
}

function extractCaratulado(subject, body) {
  var combo = subject + " " + body;
  var m = combo.match(/caratulad[oa][:\s]+([^.\n\r]{5,100})/i);
  if (m) return m[1].trim();
  m = combo.match(/\b([^.\n\r]{3,80}?\s+(?:con|c\/|contra)\s+[^.\n\r]{3,80})/i);
  if (m) return m[1].trim();
  return subject.slice(0, 100);
}

function extractTipo(text) {
  if (/sentenc/i.test(text)) return "Sentencia";
  if (/provee/i.test(text)) return "Provee escrito";
  if (/decret/i.test(text)) return "Decreto";
  if (/audienc/i.test(text)) return "Citación a audiencia";
  if (/recurso\s+de\s+(protecci|apelaci|nulidad|queja)/i.test(text)) return "Recurso";
  // "notif..." cubre "notificación", "notifíquese", "notifico", etc.
  // (la versión anterior, /notific/, fallaba con "Notifíquese" por el acento).
  if (/notif/i.test(text)) return "Notificación";
  if (/resoluc/i.test(text)) return "Resolución";
  return "Movimiento";
}
