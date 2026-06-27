/**
 * Sincronización automática: Gmail → Lista de Tareas
 * ---------------------------------------------------
 * Este Google Apps Script lee los correos etiquetados con "📋 Tarea" en TU
 * cuenta de Gmail y los expone como JSON para que la lista de tareas
 * (index.html) los muestre automáticamente, sin que tengas que pedirlo.
 *
 * Corre dentro de tu propia cuenta de Google: no requiere servidores,
 * contraseñas ni credenciales adicionales.
 *
 * CÓMO INSTALARLO (una sola vez, ~5 minutos):
 *   1. Entra a https://script.google.com y crea un "Nuevo proyecto".
 *   2. Borra el contenido de ejemplo y pega TODO este archivo.
 *   3. Menú "Implementar" → "Nueva implementación" → tipo "Aplicación web".
 *        - Ejecutar como: Yo (tu cuenta)
 *        - Quién tiene acceso: Cualquiera  (devuelve solo el asunto/remitente
 *          de los correos etiquetados; no expone el cuerpo).
 *   4. Autoriza los permisos de Gmail cuando lo pida.
 *   5. Copia la URL de la aplicación web (termina en /exec).
 *   6. Pégala en config.js -> window.SYNC_URL = "...".
 *
 * La lista se actualizará sola cada vez que abras la página. Cada vez que
 * etiquetes (o desetiquetes) un correo con "📋 Tarea" en Gmail, aparecerá
 * (o desaparecerá) en tu lista.
 */

// Nombre exacto de la etiqueta en Gmail.
var LABEL_NAME = "📋 Tarea";

// Máximo de hilos a leer.
var MAX_THREADS = 100;

/**
 * Punto de entrada del Web App. Devuelve las tareas en JSON.
 */
function doGet(e) {
  var tasks = buildTasks();
  var payload = JSON.stringify({ updated: new Date().toISOString(), tasks: tasks });

  // El callback permite cargarlo como JSONP y evitar problemas de CORS
  // cuando abres index.html como archivo local (file://).
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

/**
 * Lee los hilos etiquetados y los transforma en objetos de tarea.
 */
function buildTasks() {
  var label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) return [];

  var threads = label.getThreads(0, MAX_THREADS);
  return threads.map(function (thread) {
    var messages = thread.getMessages();
    var first = messages[0];
    var last = messages[messages.length - 1];
    return {
      id: "g-" + thread.getId(),
      titulo: thread.getFirstMessageSubject() || "(sin asunto)",
      detalle: last.getPlainBody().slice(0, 240).replace(/\s+/g, " ").trim(),
      categoria: guessCategory(thread),
      prioridad: thread.isImportant() ? "alta" : "media",
      vence: "",
      de: first.getFrom().replace(/.*<(.+)>.*/, "$1"),
      threadId: thread.getId(),
      hecha: false
    };
  });
}

/**
 * Heurística simple para clasificar la tarea según otras etiquetas/contenido.
 */
function guessCategory(thread) {
  var labels = thread.getLabels().map(function (l) { return l.getName(); }).join(" ");
  var subject = (thread.getFirstMessageSubject() || "").toLowerCase();
  if (/judicial|sentencia|causa|demanda|recurso|poder judicial/i.test(labels + " " + subject)) return "Judicial";
  if (/convenio/i.test(subject)) return "Convenios";
  if (/transparencia/i.test(labels + " " + subject)) return "Transparencia";
  if (/concejo|incidentes|sesión/i.test(labels + " " + subject)) return "Concejo";
  return "Administrativo";
}
