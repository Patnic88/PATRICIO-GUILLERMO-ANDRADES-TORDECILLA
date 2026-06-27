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

// Resumen diario por correo: dirección a la que enviar el digest (opcional).
// Déjalo vacío para no recibir resumen por correo.
var DIGEST_TO = "";

var MAX_DAYS = 14;
var MAX_THREADS = 80;

// ---------------------------------------------------------------------------
// Punto de entrada del Web App (consumido por estado-diario.html)
// ---------------------------------------------------------------------------

function doGet(e) {
  var dias = parseInt((e && e.parameter && e.parameter.dias) || "1", 10);
  if (isNaN(dias) || dias < 1) dias = 1;
  if (dias > MAX_DAYS) dias = MAX_DAYS;

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
    var asunto = "⚖️ Estado Diario (" + entries.length + " movimientos)";
    var cuerpo = entries.map(function (e) {
      return "• [" + e.tribunal + "] " + (e.rol || "(sin rol)") + " — "
        + e.tipoResolucion + "\n  " + e.caratulado + "\n  "
        + (e.resumen || "").slice(0, 200) + "\n";
    }).join("\n");
    GmailApp.sendEmail(DIGEST_TO, asunto, cuerpo);
  }

  return entries.length;
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
  // Formatos típicos: C-114-2026, RIT O-3-2026, Rol N° 1234-2025, etc.
  var m = text.match(
    /\b(?:rol|rit|ric|ingreso)\s*(?:n[°º]?)?\s*[:#]?\s*([A-Z]?-?\s*\d+\s*-\s*\d{4})/i
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
  if (/notific/i.test(text)) return "Notificación";
  if (/resoluc/i.test(text)) return "Resolución";
  return "Movimiento";
}
