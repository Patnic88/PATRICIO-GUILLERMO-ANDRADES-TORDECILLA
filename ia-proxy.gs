/**
 * Proxy de IA para "Predicción de Juicios" (Claude API)
 * -----------------------------------------------------
 * Este Google Apps Script recibe, por POST, el caso descrito y los fallos más
 * relevantes que el módulo de predicción ya seleccionó, y los reenvía a la
 * API de Claude (Anthropic). Devuelve un análisis jurídico razonado en
 * lenguaje natural, con citas a los fallos.
 *
 * ¿Por qué un proxy y no llamar a la API directo desde el navegador?
 *   Para NO exponer tu clave de API en el navegador (cualquiera que abra la
 *   página podría verla). El Apps Script guarda la clave de forma privada en
 *   las "Propiedades del script" y solo entrega el texto del análisis.
 *
 * CÓMO INSTALARLO (una sola vez, ~5 minutos):
 *   1. Consigue una clave de API de Anthropic en https://console.anthropic.com
 *      (Settings → API Keys). Empieza con "sk-ant-...".
 *   2. Entra a https://script.google.com y crea un "Nuevo proyecto".
 *   3. Borra el contenido de ejemplo y pega TODO este archivo.
 *   4. Guarda la clave en las propiedades del script (NO la escribas en el
 *      código): menú "Configuración del proyecto" (engranaje) → sección
 *      "Propiedades del script" → "Agregar propiedad":
 *        - Propiedad: ANTHROPIC_API_KEY
 *        - Valor:     sk-ant-...   (tu clave)
 *      (Opcional) puedes agregar otra propiedad MODEL para cambiar el modelo;
 *      por defecto usa "claude-opus-4-8".
 *   5. Menú "Implementar" → "Nueva implementación" → tipo "Aplicación web".
 *        - Ejecutar como: Yo (tu cuenta)
 *        - Quién tiene acceso: Cualquiera
 *   6. Copia la URL de la aplicación web (termina en /exec).
 *   7. Pégala en config.js -> window.IA_URL = "...".
 *
 * Privacidad: el caso que escribas se envía a la API de Anthropic para
 * generar el análisis. No pegues datos sensibles que no quieras procesar ahí.
 */

// Modelo por defecto (puedes sobrescribirlo con la propiedad de script MODEL).
var DEFAULT_MODEL = "claude-opus-4-8";
var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var ANTHROPIC_VERSION = "2023-06-01";
var MAX_TOKENS = 1500;

/**
 * Punto de entrada del Web App (POST desde prediccion.js).
 */
function doPost(e) {
  try {
    var datos = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var analisis = analizarConClaude(datos);
    return json({ analisis: analisis });
  } catch (err) {
    return json({ error: String(err) });
  }
}

/**
 * Permite probar el despliegue abriendo la URL en el navegador.
 */
function doGet() {
  return json({ ok: true, mensaje: "Proxy de IA activo. Use POST con el caso." });
}

/**
 * Construye el prompt y llama a la API de Claude.
 */
function analizarConClaude(datos) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return "Falta configurar ANTHROPIC_API_KEY en las propiedades del script.";
  }
  var model = PropertiesService.getScriptProperties().getProperty("MODEL") || DEFAULT_MODEL;

  var caso = datos.caso || {};
  var fallos = datos.fallos || [];
  var prob = typeof datos.probabilidad === "number"
    ? Math.round(datos.probabilidad * 100) + "%"
    : "n/d";

  var listaFallos = fallos.map(function (f, i) {
    return (i + 1) + ". Rol " + f.rol + " (" + (f.anio || "s/f") + ", " + f.sala +
      "ª Sala, " + f.recurso + ") — RESULTADO: " + f.resultado +
      ". Criterio: " + (f.resumen || "");
  }).join("\n");

  var system =
    "Eres un abogado chileno experto en jurisprudencia de la Corte Suprema. " +
    "Analizas un caso comparándolo SOLO con los fallos que se te entregan. " +
    "Eres riguroso y prudente: dejas claro el nivel de incertidumbre y NUNCA " +
    "garantizas el resultado del juicio. Citas los fallos por su Rol. " +
    "Responde solo con el análisis final, en español, sin preámbulos.";

  var prompt =
    "CASO A EVALUAR\n" +
    "- Recurso/acción: " + (caso.recurso || "n/d") + "\n" +
    "- Sala: " + (caso.sala || "n/d") + "\n" +
    "- Tema: " + (caso.tema || "n/d") + "\n" +
    "- Hechos y argumentos:\n" + (caso.hechos || "(no indicados)") + "\n\n" +
    "FALLOS RELEVANTES DE LA CORTE SUPREMA (de la base del usuario):\n" +
    (listaFallos || "(ninguno)") + "\n\n" +
    "Estimación estadística previa de que se ACOJA: " + prob + "\n\n" +
    "Entrega un análisis breve (máx. ~350 palabras) con esta estructura:\n" +
    "1) Criterio dominante de la Corte en estos fallos.\n" +
    "2) Cómo se aplica al caso (factores a favor y en contra).\n" +
    "3) Pronóstico prudente con nivel de confianza y principales riesgos.\n" +
    "4) Recomendaciones para fortalecer la posición.";

  var payload = {
    model: model,
    max_tokens: MAX_TOKENS,
    system: system,
    messages: [{ role: "user", content: prompt }]
  };

  var resp = UrlFetchApp.fetch(ANTHROPIC_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var body = JSON.parse(resp.getContentText() || "{}");
  if (code !== 200) {
    return "Error de la API (" + code + "): " +
      ((body.error && body.error.message) || resp.getContentText());
  }

  // La respuesta trae content[] con bloques; tomamos el texto.
  var texto = (body.content || [])
    .filter(function (b) { return b.type === "text"; })
    .map(function (b) { return b.text; })
    .join("\n")
    .trim();

  return texto || "La API no devolvió texto de análisis.";
}

/**
 * Devuelve JSON. Apps Script sirve la respuesta con CORS permisivo en la URL
 * final de googleusercontent, por lo que el fetch del navegador puede leerla
 * cuando la petición es "simple" (Content-Type text/plain).
 */
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
