/**
 * Agente: Diario Oficial
 * ----------------------
 * Revisa cada mañana la edición electrónica del Diario Oficial de la
 * República de Chile (diariooficial.interior.gob.cl) y envía un reporte por
 * correo con:
 *
 *   • Destacadas: las publicaciones que mencionan tus temas (Los Vilos,
 *     municipal, laboral, Contraloría, tributario), al inicio del correo.
 *   • Normas Generales del día, agrupadas por ministerio y organismo.
 *   • Avisos destacados.
 *   • Normas Particulares y Publicaciones Judiciales: sólo las que
 *     coinciden con tus temas.
 *
 * Los títulos se copian literalmente desde la edición electrónica: el agente
 * no resume ni interpreta. Si no logra leer el sitio, lo dice en el correo
 * en vez de rellenar.
 *
 * Corre dentro de tu propia cuenta de Google: sin servidores, sin
 * contraseñas, sin credenciales extra. Es un proyecto de Apps Script
 * distinto al del Estado Diario.
 *
 * INSTALACIÓN (una sola vez, ~5 minutos):
 *   1. Entra a https://script.google.com y crea un "Nuevo proyecto".
 *   2. Borra el contenido de ejemplo y pega TODO este archivo.
 *   3. Elige la función `diagnosticarDiarioOficial` y pulsa "Ejecutar".
 *      Autoriza los permisos cuando lo pida. En el "Registro de ejecución"
 *      cada sección debería decir "estado: ok" (o "sin_publicaciones").
 *   4. Elige `instalarAgente` y pulsa "Ejecutar". Queda programada la
 *      revisión automática.
 *   5. (Opcional) Ejecuta `enviarReporteAhora` para recibir el reporte de
 *      hoy al instante.
 *
 * PROGRAMACIÓN:
 *   El activador corre cada hora. Desde las 08:00 (hora de Chile) intenta
 *   leer la edición del día y, apenas la encuentra, envía el reporte una
 *   sola vez. Si a las 14:00 no hay edición con fecha de hoy, o el sitio no
 *   respondió, envía un aviso breve para revisar a mano.
 */

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

// Edición electrónica. Según el repositorio público
// stefanoseggio/diario-oficial-cl-monitor (fuente secundaria), desde
// septiembre de 2026 estas páginas muestran la edición del día sin
// parámetros. Confírmalo con `diagnosticarDiarioOficial`.
var DO_ORIGEN = "https://www.diariooficial.interior.gob.cl";
var DO_BASE_URL = DO_ORIGEN + "/edicionelectronica/";
var DO_TZ = "America/Santiago";

// Secciones que se revisan. La primera define la fecha de la edición.
//   modo "completa": se listan todas sus publicaciones.
//   modo "filtrada": sólo las que coinciden con DO_TEMAS.
var DO_SECCIONES = [
  { id: "normas_generales", nombre: "Normas Generales", pagina: "index.php", modo: "completa" },
  { id: "avisos_destacados", nombre: "Avisos destacados", pagina: "avisos_destacados.php", modo: "completa" },
  { id: "normas_particulares", nombre: "Normas Particulares", pagina: "normas_particulares.php", modo: "filtrada" },
  { id: "publicaciones_judiciales", nombre: "Publicaciones Judiciales", pagina: "publicaciones_judiciales.php", modo: "filtrada" }
];

// Temas que se destacan al inicio del reporte. Se busca en el título, el
// ministerio y el organismo, sin distinguir mayúsculas ni tildes, como
// palabra completa. Un "*" final acepta cualquier terminación
// ("municipal*" → municipal, municipalidad, municipales). Los números de
// ley van sin puntos ("18695" coincide con "Ley N° 18.695").
//   18.695 LOC de Municipalidades · 18.834 Estatuto Administrativo ·
//   18.883 Estatuto Adm. de Funcionarios Municipales · 21.643 Ley Karin ·
//   20.285 Acceso a la Información Pública (verificadas en LeyChile/BCN).
var DO_TEMAS = {
  "Los Vilos / Choapa / Coquimbo": ["los vilos", "choapa", "coquimbo"],
  "Municipal": ["municipal*", "18695", "gobierno* regional*"],
  "Laboral / funcionarios": [
    "codigo del trabajo", "estatuto* administrativo*", "18834", "18883",
    "remuneracion*", "ley karin", "21643"
  ],
  "Contraloría / probidad": ["contraloria", "transparencia", "20285", "probidad", "compras publicas"],
  "Tributario": [
    "servicio de impuestos internos", "sii", "tributari*", "impuesto*", "tesoreria general"
  ]
};

// Destinatario del reporte y copia (CC). CC vacío = sin copia.
var DIGEST_TO = "pandrades23@gmail.com";
var DIGEST_CC = "andradestordecilla.abogado@gmail.com";
var DO_REMITENTE = "Agente Diario Oficial";

// Ventana horaria (hora de Chile) en la que el activador intenta enviar.
var DO_HORA_INICIO = 8;
var DO_HORA_LIMITE = 14;

// Si a DO_HORA_LIMITE no hay edición de hoy, ¿enviar un aviso breve?
var DO_AVISAR_SIN_EDICION = true;

// Topes para que Gmail no recorte el correo por tamaño.
var DO_MAX_ITEMS_SECCION = 150;
var DO_MAX_DESTACADAS_TEMA = 40;

var DO_REINTENTOS = 3;
var DO_PROP_ULTIMO_ENVIO = "diarioOficial.ultimoEnvio";

// Textos que dependen de dónde corre el agente. El ejecutor de Claude
// (agente-diario-oficial/reporte.mjs) los reemplaza por los suyos.
var DO_FIRMA = "Generado por diario-oficial.gs ejecutándose en tu cuenta de Google.";
var DO_AYUDA_FALLA = "Si se repite, ejecuta diagnosticarDiarioOficial en el editor de Apps Script.";

// ---------------------------------------------------------------------------
// Job programado: el activador lo ejecuta cada hora.
// ---------------------------------------------------------------------------

/**
 * Revisa el Diario Oficial y envía el reporte del día una sola vez.
 * El activador le pasa un objeto de evento; los tests le pasan una fecha.
 * Devuelve qué hizo: "temprano" | "ya_enviado" | "esperando" | "aviso" | "enviado".
 */
function revisarDiarioOficial(ahora) {
  if (!(ahora instanceof Date)) ahora = new Date();
  var hoy = fechaChile(ahora);
  var hora = parseInt(Utilities.formatDate(ahora, DO_TZ, "H"), 10);
  var props = PropertiesService.getScriptProperties();

  if (hora < DO_HORA_INICIO) return "temprano";
  if (props.getProperty(DO_PROP_ULTIMO_ENVIO) === hoy) return "ya_enviado";

  var principal = leerSeccion(DO_SECCIONES[0]);
  if (!edicionEsDeHoy(principal, hoy)) {
    if (hora < DO_HORA_LIMITE) return "esperando";
    if (DO_AVISAR_SIN_EDICION) enviarCorreo(construirAviso(principal, hoy));
    props.setProperty(DO_PROP_ULTIMO_ENVIO, hoy);
    return "aviso";
  }

  var resultados = [principal].concat(DO_SECCIONES.slice(1).map(function (sec) {
    return leerSeccion(sec);
  }));
  enviarCorreo(construirReporte(resultados, hoy));
  props.setProperty(DO_PROP_ULTIMO_ENVIO, hoy);
  return "enviado";
}

/**
 * Envía el reporte AHORA, sin esperar al activador ni mirar si ya se envió.
 * Útil para validar que el correo llega bien. Córrelo desde el editor:
 * "Ejecutar → enviarReporteAhora".
 */
function enviarReporteAhora() {
  if (!DIGEST_TO) throw new Error("DIGEST_TO está vacío; edita diario-oficial.gs");
  var hoy = fechaChile(new Date());
  var resultados = DO_SECCIONES.map(function (sec) { return leerSeccion(sec); });
  enviarCorreo(construirReporte(resultados, hoy));
  // Si ya es la edición de hoy, el activador no la vuelve a enviar.
  if (edicionEsDeHoy(resultados[0], hoy)) {
    PropertiesService.getScriptProperties().setProperty(DO_PROP_ULTIMO_ENVIO, hoy);
  }
  return resultados.map(function (r) { return r.seccion.id + ": " + r.estado; });
}

/**
 * Registra, sección por sección, qué devuelve el sitio y qué entiende el
 * parser. Sirve para confirmar la estructura real del Diario Oficial desde
 * tu cuenta de Google (no envía correos).
 */
function diagnosticarDiarioOficial() {
  return DO_SECCIONES.map(function (sec) {
    var r = leerSeccion(sec);
    var lineas = [
      "== " + sec.nombre + " (" + r.url + ")",
      "HTTP " + r.http + " · " + r.largo + " caracteres · estado: " + r.estado
        + (r.error ? " (" + r.error + ")" : ""),
      "fecha: " + (r.fecha || "?") + " · edición: " + (r.edicion || "?")
        + " · encabezados: " + r.encabezados + " · publicaciones: " + r.items.length
    ];
    r.items.slice(0, 3).forEach(function (it) {
      lineas.push("  • " + it.titulo.slice(0, 120) + " [" + (it.cve ? "CVE-" + it.cve : "sin CVE") + "]");
    });
    if (r.estado !== "ok") lineas.push("Inicio del HTML recibido:\n" + r.muestra);
    Logger.log(lineas.join("\n"));
    return { id: sec.id, http: r.http, estado: r.estado, fecha: r.fecha, publicaciones: r.items.length };
  });
}

/**
 * Crea (si no existe) el activador que ejecuta `revisarDiarioOficial` cada
 * hora. Idempotente: no duplica activadores.
 */
function instalarAgente() {
  var existe = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "revisarDiarioOficial";
  });
  if (!existe) {
    ScriptApp.newTrigger("revisarDiarioOficial")
      .timeBased()
      .everyHours(1)
      .create();
  }
  Logger.log(existe
    ? "El activador ya existía; no se creó otro."
    : "Activador creado: revisarDiarioOficial cada hora (envía entre las "
      + DO_HORA_INICIO + ":00 y las " + DO_HORA_LIMITE + ":00, hora de Chile).");
  return !existe;
}

/** Borra todos los activadores de este proyecto. */
function desinstalarAgente() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
}

// ---------------------------------------------------------------------------
// Lectura del sitio
// ---------------------------------------------------------------------------

function leerSeccion(sec) {
  var url = DO_BASE_URL + sec.pagina;
  var resp = fetchSeccion(url);
  var r = {
    seccion: sec, url: url, http: resp.http, error: resp.error,
    estado: "error", fecha: "", edicion: "", items: [], encabezados: 0,
    largo: resp.html.length, muestra: resp.html.slice(0, 1500)
  };
  if (resp.error) return r;

  var p = parseSeccion(resp.html);
  r.estado = p.estado;
  r.fecha = p.fecha;
  r.edicion = p.edicion;
  r.items = p.items;
  r.encabezados = p.encabezados;
  if (p.estado === "estructura_desconocida") {
    r.error = "estructura no reconocida (posible cambio del sitio o página de verificación)";
  }
  return r;
}

/**
 * Descarga una página con reintentos ante fallas de red o HTTP no exitoso.
 * No intenta saltarse controles anti-bots: si el sitio los muestra, el
 * parser lo reporta como "estructura_desconocida".
 */
function fetchSeccion(url) {
  var ultimo = { http: 0, html: "", error: "" };
  for (var intento = 0; intento < DO_REINTENTOS; intento++) {
    try {
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      var code = resp.getResponseCode();
      ultimo = { http: code, html: leerTexto(resp), error: "" };
      if (code >= 200 && code < 300) return ultimo;
      ultimo.error = "HTTP " + code;
    } catch (err) {
      ultimo = { http: 0, html: "", error: String((err && err.message) || err) };
    }
    if (intento < DO_REINTENTOS - 1) Utilities.sleep(1000 * Math.pow(2, intento));
  }
  return ultimo;
}

/** Decodifica la respuesta respetando el charset declarado (UTF-8 o Latin-1). */
function leerTexto(resp) {
  if (!resp.getBlob) return resp.getContentText();
  var blob = resp.getBlob();
  var texto = blob.getDataAsString("UTF-8");
  var headers = resp.getHeaders ? resp.getHeaders() : {};
  var tipo = headers["Content-Type"] || headers["content-type"] || "";
  if (/charset\s*=\s*["']?\s*(iso-8859-1|latin-?1|windows-1252)/i.test(tipo + " " + texto.slice(0, 4000))) {
    texto = blob.getDataAsString("ISO-8859-1");
  }
  return texto;
}

// ---------------------------------------------------------------------------
// Parser (puro: recibe HTML, devuelve datos)
// ---------------------------------------------------------------------------

// Rutas de los PDF: /publicaciones/AAAA/MM/DD/EDICION/SECCION/CVE.pdf
var DO_RE_PDF = /\/publicaciones\/(\d{4})\/(\d{2})\/(\d{2})\/(\d+)\/\d+\/(\d+)\.pdf/i;

/**
 * Lee la tabla de una sección de la edición electrónica.
 * Estructura esperada (fuente secundaria, ver encabezado):
 *   <td class="title3"> rama · <td class="title4"> ministerio ·
 *   <td class="title5"> organismo · <tr class="content"> publicación, cuya
 *   1ª celda es el título y la 2ª el enlace al PDF ("CVE-1234567").
 *   Un elemento con clase "nofound" indica que no hubo publicaciones.
 * Devuelve { estado, fecha, edicion, encabezados, items }.
 */
function parseSeccion(html) {
  html = String(html == null ? "" : html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  var res = { estado: "estructura_desconocida", fecha: "", edicion: "", encabezados: 0, items: [] };
  var rama = "", ministerio = "", organismo = "";
  var sueltos = [];

  html.split(/<tr\b/i).slice(1).forEach(function (chunk) {
    var fila = chunk.split(/<\/tr\s*>/i)[0];
    var apertura = fila.slice(0, fila.indexOf(">") + 1);
    var cuerpo = fila.slice(apertura.length);

    var titulo = fila.match(/<td\b[^>]*class\s*=\s*["'][^"']*\btitle([345])\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
    if (titulo) {
      var texto = limpiarTexto(titulo[2]);
      res.encabezados++;
      if (titulo[1] === "3") { rama = texto; ministerio = ""; organismo = ""; }
      else if (titulo[1] === "4") { ministerio = texto; organismo = ""; }
      else { organismo = texto; }
      return;
    }

    var celdas = [];
    var re = /<td\b[^>]*>([\s\S]*?)<\/td>/gi, m;
    while ((m = re.exec(fila))) celdas.push(m[1]);

    if (/class\s*=\s*["'][^"']*\bcontent\b/i.test(apertura)) {
      var desc = celdas.length ? limpiarTexto(celdas[0]) : "";
      if (!desc) return;
      var enlace = extraerEnlace(celdas.slice(1).join(" ") || cuerpo);
      res.items.push(nuevaPublicacion(desc, rama, ministerio, organismo, enlace));
      return;
    }

    // Respaldo: fila sin la clase esperada pero con enlace a un PDF del diario.
    var enlaceSuelto = extraerEnlace(cuerpo);
    if (DO_RE_PDF.test(enlaceSuelto.url)) {
      var sinEnlace = limpiarTexto(cuerpo.replace(/<a\b[\s\S]*?<\/a>/gi, " "));
      sueltos.push(nuevaPublicacion(sinEnlace || enlaceSuelto.texto || "(sin título)",
        rama, ministerio, organismo, enlaceSuelto));
    }
  });

  if (!res.items.length && sueltos.length) res.items = sueltos;

  // Sin tabla: último respaldo, cualquier enlace a un PDF del diario.
  if (!res.items.length) {
    var reA = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, a;
    while ((a = reA.exec(html))) {
      if (!DO_RE_PDF.test(a[1])) continue;
      var enl = extraerEnlace(a[0]);
      res.items.push(nuevaPublicacion(enl.texto || "(sin título)", "", "", "", enl));
    }
  }

  for (var i = 0; i < res.items.length; i++) {
    var ruta = res.items[i].pdfUrl.match(DO_RE_PDF);
    if (ruta) {
      res.fecha = ruta[3] + "-" + ruta[2] + "-" + ruta[1];
      res.edicion = ruta[4];
      break;
    }
  }

  if (res.items.length) {
    res.estado = "ok";
  } else if (/class\s*=\s*["'][^"']*\bnofound\b/i.test(html)) {
    res.estado = "sin_publicaciones";
  }

  // Sin PDFs de donde sacar la fecha: se intenta con el texto de la página.
  if (!res.fecha && res.estado === "sin_publicaciones") {
    var pagina = limpiarTexto(html);
    res.fecha = extraerFechaTexto(pagina);
    var ed = normalizar(pagina).match(/edicion\s+(?:num(?:ero)?\.?|n\s*[°º.]?)\s*(\d+)/);
    if (ed) res.edicion = ed[1];
  }
  return res;
}

function nuevaPublicacion(titulo, rama, ministerio, organismo, enlace) {
  return {
    titulo: titulo, rama: rama, ministerio: ministerio, organismo: organismo,
    cve: enlace.cve, pdfUrl: enlace.url
  };
}

/** Primer enlace del fragmento: { url absoluta, texto, cve }. */
function extraerEnlace(fragmento) {
  var m = String(fragmento).match(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!m) return { url: "", texto: "", cve: "" };
  var url = absolutizar(decodeEntities(m[1].trim()));
  var texto = limpiarTexto(m[2]);
  var cve = texto.match(/CVE[-\s]*(\d+)/i) || url.match(DO_RE_PDF);
  return { url: url, texto: texto, cve: cve ? cve[cve.length - 1] : "" };
}

function absolutizar(href) {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  if (/^\/\//.test(href)) return "https:" + href;
  if (href.charAt(0) === "/") return DO_ORIGEN + href;
  var limpio = href.replace(/^(\.\.?\/)+/, "");
  if (/^publicaciones\//i.test(limpio)) return DO_ORIGEN + "/" + limpio;
  return DO_BASE_URL + limpio;
}

var DO_MESES = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07",
  agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12"
};

/** "Martes 20 de Octubre de 2026" → "20-10-2026" ("" si no encuentra). */
function extraerFechaTexto(texto) {
  var m = normalizar(texto).match(
    /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+|del\s+)?(\d{4})/
  );
  if (!m) return "";
  return (m[1].length === 1 ? "0" + m[1] : m[1]) + "-" + DO_MESES[m[2]] + "-" + m[3];
}

// ---------------------------------------------------------------------------
// Texto y coincidencias
// ---------------------------------------------------------------------------

var DO_ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", ordm: "º", ordf: "ª", deg: "°",
  laquo: "«", raquo: "»", ndash: "–", mdash: "—", iexcl: "¡", iquest: "¿",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…", middot: "·"
};

function decodeEntities(s) {
  return String(s == null ? "" : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
    if (e.charAt(0) === "#") {
      var code = e.charAt(1).toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isNaN(code) ? m : String.fromCodePoint(code);
    }
    return Object.prototype.hasOwnProperty.call(DO_ENTIDADES, e) ? DO_ENTIDADES[e] : m;
  });
}

function limpiarTexto(html) {
  return decodeEntities(String(html == null ? "" : html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Minúsculas, sin tildes, sin puntos de miles en números, espacios simples. */
function normalizar(s) {
  return String(s == null ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d)\.(?=\d{3}(?!\d))/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

var DO_PATRONES = {};

function patronPalabra(palabra) {
  if (DO_PATRONES[palabra]) return DO_PATRONES[palabra];
  var partes = normalizar(palabra).split(" ").map(function (t) {
    var prefijo = /\*$/.test(t);
    var base = t.replace(/\*$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return base + (prefijo ? "[a-z0-9]*" : "");
  });
  DO_PATRONES[palabra] = new RegExp("(?:^|[^a-z0-9])" + partes.join("\\s+") + "(?![a-z0-9])");
  return DO_PATRONES[palabra];
}

/** Temas de DO_TEMAS que menciona la publicación: [{ tema, palabra }]. */
function coincidencias(item) {
  var texto = normalizar([item.titulo, item.ministerio, item.organismo].join(" "));
  var out = [];
  Object.keys(DO_TEMAS).forEach(function (tema) {
    var palabras = DO_TEMAS[tema];
    for (var i = 0; i < palabras.length; i++) {
      if (patronPalabra(palabras[i]).test(texto)) {
        out.push({ tema: tema, palabra: palabras[i].replace(/\*/g, "") });
        return;
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Correo (puro: arma asunto, texto plano y HTML)
// ---------------------------------------------------------------------------

function fechaChile(fecha) {
  return Utilities.formatDate(fecha, DO_TZ, "dd-MM-yyyy");
}

function edicionEsDeHoy(r, hoy) {
  return !!r && (r.estado === "ok" || r.estado === "sin_publicaciones") && r.fecha === hoy;
}

/** "44569" → "44.569" */
function formatoEdicion(n) {
  return String(n || "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function agruparPorOrganismo(items) {
  var grupos = [], idx = {};
  items.forEach(function (it) {
    var clave = [it.ministerio, it.organismo].filter(Boolean).join(" · ") || it.rama || "";
    if (!(clave in idx)) { idx[clave] = grupos.length; grupos.push({ nombre: clave, items: [] }); }
    grupos[idx[clave]].items.push(it);
  });
  return grupos;
}

var DO_ESTILO_CHIP = "background:#fdf3d8;color:#7a5b00;padding:1px 8px;border-radius:999px;margin-right:4px;font-size:11px;";

function chipsHtml(it) {
  return (it.temas || []).map(function (t) {
    return '<span style="' + DO_ESTILO_CHIP + '">' + escapeHtml(t.tema) + '</span>';
  }).join("");
}

function enlacePdfHtml(it) {
  if (!it.pdfUrl) return '<span style="font-size:12px;color:#a0a8b3;">(sin enlace al PDF)</span>';
  return '<a href="' + escapeHtml(it.pdfUrl) + '" style="font-size:12px;color:#1b5e9b;text-decoration:none;">📄 '
    + escapeHtml(it.cve ? "CVE-" + it.cve : "PDF") + '</a>';
}

function enlacePdfPlano(it) {
  return it.pdfUrl ? (it.cve ? "CVE-" + it.cve + " " : "") + it.pdfUrl : "(sin enlace al PDF)";
}

/**
 * Arma el reporte a partir de los resultados de leerSeccion.
 * Pura: no toca la red, el correo ni el reloj. Devuelve { subject, plain, html }.
 */
function construirReporte(resultados, hoy) {
  var principal = resultados[0] || { estado: "error", items: [] };
  var fechaEd = principal.fecha || hoy;
  var edicion = "";
  resultados.forEach(function (r) { if (!edicion && r.edicion) edicion = r.edicion; });

  // Coincidencias por publicación y agrupación de destacadas por tema.
  var porTema = {}, nDestacadas = 0;
  Object.keys(DO_TEMAS).forEach(function (t) { porTema[t] = []; });
  resultados.forEach(function (r) {
    r.items.forEach(function (it) {
      it.temas = coincidencias(it);
      if (!it.temas.length) return;
      nDestacadas++;
      porTema[it.temas[0].tema].push({ item: it, seccion: r.seccion.nombre });
    });
  });

  var nGenerales = principal.estado === "ok" ? principal.items.length : 0;
  var subject = "📰 Diario Oficial " + fechaEd
    + (edicion ? " · Ed. N° " + formatoEdicion(edicion) : "")
    + " — " + nDestacadas + (nDestacadas === 1 ? " destacada" : " destacadas")
    + (principal.estado === "ok" || principal.estado === "sin_publicaciones"
      ? " · " + nGenerales + (nGenerales === 1 ? " norma general" : " normas generales")
      : " · Normas Generales no disponibles");

  var P = []; // texto plano
  var H = []; // HTML
  P.push("Diario Oficial — edición del " + fechaEd + (edicion ? " (N° " + formatoEdicion(edicion) + ")" : ""));
  P.push("Edición electrónica: " + DO_BASE_URL, "");
  H.push('<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1f2933;max-width:680px;">');
  H.push('<h2 style="margin:0 0 6px;color:#1b5e9b;">📰 Diario Oficial · ' + escapeHtml(fechaEd) + '</h2>');
  H.push('<p style="color:#69707d;margin:0 0 16px;">'
    + (edicion ? 'Edición N° ' + escapeHtml(formatoEdicion(edicion)) + ' · ' : '')
    + '<a href="' + escapeHtml(DO_BASE_URL) + '" style="color:#1b5e9b;">Ver edición electrónica</a></p>');

  if (principal.fecha && principal.fecha !== hoy) {
    var avisoFecha = "Atención: la edición leída es del " + principal.fecha + ", no de hoy (" + hoy + ").";
    P.push("⚠️ " + avisoFecha, "");
    H.push('<p style="background:#fdecea;color:#8a1c12;padding:8px 12px;border-radius:6px;">⚠️ ' + escapeHtml(avisoFecha) + '</p>');
  }

  // --- Destacadas por tema -------------------------------------------------
  P.push("=== DESTACADAS POR TEMA (" + nDestacadas + ") ===");
  H.push('<h3 style="margin:18px 0 8px;color:#14497a;border-bottom:1px solid #e3e8ef;padding-bottom:4px;">⭐ Destacadas por tema <span style="color:#69707d;font-weight:400;">(' + nDestacadas + ')</span></h3>');
  if (!nDestacadas) {
    P.push("Sin publicaciones que mencionen tus temas en las secciones revisadas.", "");
    H.push('<p style="color:#69707d;">Sin publicaciones que mencionen tus temas en las secciones revisadas.</p>');
  }
  Object.keys(DO_TEMAS).forEach(function (tema) {
    var lista = porTema[tema];
    if (!lista.length) return;
    P.push("-- " + tema + " (" + lista.length + ")");
    H.push('<h4 style="margin:14px 0 6px;color:#1f2933;">' + escapeHtml(tema) + ' <span style="color:#69707d;font-weight:400;">(' + lista.length + ')</span></h4>');
    lista.slice(0, DO_MAX_DESTACADAS_TEMA).forEach(function (d) {
      var it = d.item;
      var meta = [d.seccion, it.ministerio, it.organismo].filter(Boolean).join(" · ");
      var porque = it.temas.map(function (t) { return t.tema + ": \"" + t.palabra + "\""; }).join("; ");
      P.push("• " + it.titulo, "  " + meta, "  Coincide con " + porque, "  " + enlacePdfPlano(it), "");
      H.push('<div style="margin:0 0 10px;padding:8px 12px;background:#f4f6f9;border-left:3px solid #7b5bbf;border-radius:6px;">'
        + '<div style="font-size:11px;color:#69707d;">' + escapeHtml(meta) + '</div>'
        + '<div style="font-size:14px;margin:2px 0 4px;">' + escapeHtml(it.titulo) + '</div>'
        + '<div>' + chipsHtml(it) + ' <span style="font-size:11px;color:#69707d;">“'
        + escapeHtml(it.temas.map(function (t) { return t.palabra; }).join("”, “")) + '”</span> · ' + enlacePdfHtml(it) + '</div>'
        + '</div>');
    });
    if (lista.length > DO_MAX_DESTACADAS_TEMA) {
      var masD = "… y " + (lista.length - DO_MAX_DESTACADAS_TEMA) + " más en la edición electrónica.";
      P.push(masD, "");
      H.push('<p style="font-size:12px;color:#69707d;">' + escapeHtml(masD) + '</p>');
    }
  });

  // --- Secciones -----------------------------------------------------------
  resultados.forEach(function (r) {
    var sec = r.seccion;
    var linkSec = DO_BASE_URL + sec.pagina;
    var mostrar = sec.modo === "filtrada"
      ? r.items.filter(function (it) { return it.temas.length; })
      : r.items;
    var fallida = r.estado === "error" || r.estado === "estructura_desconocida";
    var cuenta = fallida ? "—"
      : sec.modo === "filtrada" && r.estado === "ok" ? mostrar.length + " de " + r.items.length
      : String(r.items.length);

    P.push("=== " + sec.nombre.toUpperCase() + " (" + cuenta + ") ===");
    H.push('<h3 style="margin:22px 0 8px;color:#14497a;border-bottom:1px solid #e3e8ef;padding-bottom:4px;">'
      + escapeHtml(sec.nombre) + ' <span style="color:#69707d;font-weight:400;">(' + escapeHtml(cuenta) + ')</span></h3>');

    if (fallida) {
      var fallo = "No se pudo leer esta sección: " + (r.error || r.estado) + ". Revísala en " + linkSec;
      P.push("⚠️ " + fallo, "");
      H.push('<p style="background:#fdecea;color:#8a1c12;padding:8px 12px;border-radius:6px;">⚠️ No se pudo leer esta sección: '
        + escapeHtml(r.error || r.estado) + '. <a href="' + escapeHtml(linkSec) + '" style="color:#8a1c12;">Revisar en el sitio</a></p>');
      return;
    }
    if (r !== principal && r.fecha && r.fecha !== fechaEd) {
      var otra = "Esta sección muestra publicaciones del " + r.fecha + ".";
      P.push("⚠️ " + otra);
      H.push('<p style="font-size:12px;color:#8a1c12;">⚠️ ' + escapeHtml(otra) + '</p>');
    }
    if (r.estado === "sin_publicaciones" || !r.items.length) {
      P.push("Sin publicaciones en esta sección.", "");
      H.push('<p style="color:#69707d;">Sin publicaciones en esta sección.</p>');
      return;
    }
    if (!mostrar.length) {
      var nada = "Sin coincidencias con tus temas (" + r.items.length + " publicaciones revisadas).";
      P.push(nada, "");
      H.push('<p style="color:#69707d;">' + escapeHtml(nada) + '</p>');
      return;
    }

    agruparPorOrganismo(mostrar.slice(0, DO_MAX_ITEMS_SECCION)).forEach(function (g) {
      if (g.nombre) {
        P.push("-- " + g.nombre);
        H.push('<div style="margin:12px 0 4px;font-size:12px;font-weight:600;color:#14497a;text-transform:uppercase;">' + escapeHtml(g.nombre) + '</div>');
      }
      H.push('<ul style="margin:0 0 8px;padding-left:18px;">');
      g.items.forEach(function (it) {
        P.push("• " + it.titulo, "  " + enlacePdfPlano(it));
        H.push('<li style="margin:0 0 6px;font-size:13px;">' + escapeHtml(it.titulo) + ' ' + chipsHtml(it) + ' ' + enlacePdfHtml(it) + '</li>');
      });
      H.push('</ul>');
    });
    if (mostrar.length > DO_MAX_ITEMS_SECCION) {
      var mas = "… y " + (mostrar.length - DO_MAX_ITEMS_SECCION) + " más en " + linkSec;
      P.push(mas);
      H.push('<p style="font-size:12px;color:#69707d;">… y ' + (mostrar.length - DO_MAX_ITEMS_SECCION)
        + ' más en <a href="' + escapeHtml(linkSec) + '" style="color:#1b5e9b;">la edición electrónica</a>.</p>');
    }
    P.push("");
  });

  var pie = "Fuente primaria: Diario Oficial de la República de Chile, edición electrónica. "
    + "Los títulos se transcriben literalmente; las destacadas se detectan por palabra clave de forma "
    + "automática y no constituyen análisis jurídico. Antes de citar, verifica el texto íntegro en el PDF (CVE).";
  P.push("—", pie);
  H.push('<p style="margin:24px 0 0;font-size:11px;color:#a0a8b3;">' + escapeHtml(pie)
    + '<br>' + escapeHtml(DO_FIRMA) + '</p>');
  H.push('</div>');

  return { subject: subject, plain: P.join("\n"), html: H.join("") };
}

/**
 * Aviso breve cuando a la hora límite no hay edición de hoy o el sitio no
 * respondió. Pura. Devuelve { subject, plain, html }.
 */
function construirAviso(principal, hoy) {
  var leyo = principal && (principal.estado === "ok" || principal.estado === "sin_publicaciones");
  var subject, detalle;
  if (leyo) {
    subject = "📰 Diario Oficial " + hoy + " — sin edición de hoy detectada";
    detalle = "El sitio respondió, pero la última edición disponible es "
      + (principal.fecha ? "del " + principal.fecha : "de fecha no identificable")
      + ". No se detectó una edición con fecha " + hoy + ".";
  } else {
    subject = "📰 Diario Oficial " + hoy + " — no se pudo leer el sitio";
    detalle = "No se pudo leer la edición electrónica: "
      + ((principal && principal.error) || "sin respuesta")
      + (principal && principal.http && !/^HTTP /.test(principal.error || "")
        ? " (HTTP " + principal.http + ")" : "") + ".";
  }
  var cierre = "Revisa manualmente: " + DO_BASE_URL + " — " + DO_AYUDA_FALLA;
  return {
    subject: subject,
    plain: detalle + "\n\n" + cierre,
    html: '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1f2933;max-width:640px;">'
      + '<h2 style="margin:0 0 12px;color:#1b5e9b;">📰 Diario Oficial · ' + escapeHtml(hoy) + '</h2>'
      + '<p>' + escapeHtml(detalle) + '</p>'
      + '<p><a href="' + escapeHtml(DO_BASE_URL) + '" style="color:#1b5e9b;">Revisar la edición electrónica</a>. '
      + escapeHtml(DO_AYUDA_FALLA) + '</p></div>'
  };
}

/** Opciones para MailApp.sendEmail. Pura: facilita testearla. */
function opcionesCorreo(msg) {
  var opts = {
    to: DIGEST_TO, subject: msg.subject, body: msg.plain, htmlBody: msg.html, name: DO_REMITENTE
  };
  if (DIGEST_CC) opts.cc = DIGEST_CC;
  return opts;
}

function enviarCorreo(msg) {
  MailApp.sendEmail(opcionesCorreo(msg));
}
