// Tests unitarios del agente del Diario Oficial (diario-oficial.gs).
//
// Igual que tests/extract.test.mjs: el .gs se evalúa en un sandbox de Node
// con mocks mínimos de Apps Script (UrlFetchApp, MailApp, ScriptApp,
// PropertiesService...). Los HTML de tests/fixtures/diario-oficial/ son
// SINTÉTICOS: imitan la estructura documentada del sitio con datos ficticios.
//
// Uso: node tests/diario-oficial.test.mjs   (o desde tests/run.sh)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { strict as assert } from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gsCode = readFileSync(join(__dirname, "..", "diario-oficial.gs"), "utf8");
const fixture = (name) =>
  readFileSync(join(__dirname, "fixtures", "diario-oficial", name), "utf8");

const HTML = {
  generales: fixture("normas-generales.sintetico.html"),
  avisos: fixture("avisos-destacados.sintetico.html"),
  particulares: fixture("normas-particulares.sintetico.html"),
  vacio: fixture("sin-publicaciones.sintetico.html")
};

// ---------------------------------------------------------------------------
// Mocks de las globales de Apps Script
// ---------------------------------------------------------------------------

const Utilities = {
  // Formatea en la zona horaria pedida (como Apps Script), vía Intl.
  formatDate(date, tz, fmt) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(date).map((x) => [x.type, x.value])
    );
    if (fmt === "H") return String(parseInt(p.hour, 10));
    return fmt.replace("yyyy", p.year).replace("MM", p.month).replace("dd", p.day)
      .replace("HH", p.hour).replace("mm", p.minute);
  },
  sleep: () => {}
};

// Respuestas de red simuladas: página → { code, html } o una función que lanza.
let paginas = {};
let fetchLog = [];
const UrlFetchApp = {
  fetch(url) {
    fetchLog.push(url);
    const pagina = url.split("?")[0].split("/").pop();
    const r = paginas[pagina];
    if (typeof r === "function") return r();
    const { code = 200, html = "" } = r || { code: 404, html: "Not found" };
    return { getResponseCode: () => code, getContentText: () => html };
  }
};

let enviados = [];
const MailApp = { sendEmail: (opts) => { enviados.push(opts); } };

let store = {};
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = v; }
  })
};

let triggers = [];
let creados = 0;
const ScriptApp = {
  getProjectTriggers: () => triggers,
  newTrigger: (fn) => ({
    timeBased: () => ({
      everyHours: (n) => ({
        create: () => {
          creados++;
          triggers.push({ getHandlerFunction: () => fn, horas: n });
        }
      })
    })
  }),
  deleteTrigger: (t) => { triggers = triggers.filter((x) => x !== t); }
};

const Logger = { log: () => {} };

const sandbox = new Function(
  "Utilities", "UrlFetchApp", "MailApp", "PropertiesService", "ScriptApp", "Logger",
  gsCode +
  "\nreturn { parseSeccion, coincidencias, normalizar, decodeEntities, limpiarTexto," +
  " extraerEnlace, absolutizar, extraerFechaTexto, formatoEdicion, escapeHtml," +
  " construirReporte, construirAviso, opcionesCorreo, revisarDiarioOficial," +
  " enviarReporteAhora, instalarAgente, desinstalarAgente, leerSeccion, fetchSeccion," +
  " leerEdicion, seccionServida," +
  " DO_SECCIONES, DO_PROP_ULTIMO_ENVIO, DIGEST_TO, DIGEST_CC };"
);
const fns = sandbox(Utilities, UrlFetchApp, MailApp, PropertiesService, ScriptApp, Logger);

function reset() {
  paginas = {
    "index.php": { html: HTML.generales },
    "avisos_destacados.php": { html: HTML.avisos },
    "normas_particulares.php": { html: HTML.particulares },
    "publicaciones_judiciales.php": { html: HTML.vacio }
  };
  fetchLog = [];
  enviados = [];
  store = {};
  triggers = [];
  creados = 0;
}

// Horas de prueba (UTC). En Chile son 05/06h, 08/09h y 14/15h según horario
// de verano: los tests sólo dependen de que queden antes/dentro/después.
const HOY = "20-10-2026";
const TEMPRANO = new Date("2026-10-20T09:00:00Z");
const MANANA = new Date("2026-10-20T12:30:00Z");
const TARDE = new Date("2026-10-20T18:30:00Z");

// ---------------------------------------------------------------------------
// Helpers de prueba
// ---------------------------------------------------------------------------

let pass = 0, fail = 0;
function test(name, fn) {
  reset();
  try { fn(); pass++; console.log("PASS:", name); }
  catch (e) { fail++; console.error("FAIL:", name, "\n  ", e.message); }
}

const sec = (id) => fns.DO_SECCIONES.find((s) => s.id === id);
const resultado = (id, html) => {
  const p = fns.parseSeccion(html);
  return { seccion: sec(id), http: 200, error: "", ...p };
};
const temasDe = (item) => fns.coincidencias(item).map((t) => t.tema);

// ---------------------------------------------------------------------------
// parseSeccion
// ---------------------------------------------------------------------------

test("parseSeccion: lee publicaciones, jerarquía y CVE", () => {
  const r = fns.parseSeccion(HTML.generales);
  assert.equal(r.estado, "ok");
  assert.equal(r.items.length, 4, "la fila con título vacío y el <script> no cuentan");
  assert.equal(r.encabezados, 6);
  const [a, b, c, d] = r.items;
  assert.equal(a.rama, "PODER EJECUTIVO");
  assert.equal(a.ministerio, "MINISTERIO DE PRUEBA DEL INTERIOR");
  assert.equal(a.organismo, "Subsecretaría de Prueba Regional");
  assert.equal(a.cve, "9000001");
  assert.equal(a.titulo, "NORMA DE PRUEBA 1: Modifica la Ley N° 18.695, para la I. Municipalidad de Los Vilos");
  assert.equal(b.organismo, "Servicio de Impuestos Internos");
  assert.equal(c.organismo, "Servicio de Impuestos Internos", "el organismo se hereda");
  assert.equal(c.titulo, "NORMA DE PRUEBA 3: Texto sin palabras clave & con <símbolos>");
  assert.equal(d.rama, "OTRAS ENTIDADES");
  assert.equal(d.ministerio, "", "title3 reinicia ministerio");
  assert.equal(d.organismo, "", "title3 reinicia organismo");
});

test("parseSeccion: URLs absolutas (relativa, absoluta y ../)", () => {
  const r = fns.parseSeccion(HTML.generales);
  const base = "https://www.diariooficial.interior.gob.cl/publicaciones/2026/10/20/99999/01/";
  assert.equal(r.items[0].pdfUrl, base + "9000001.pdf");
  assert.equal(r.items[1].pdfUrl, base + "9000002.pdf");
  assert.equal(r.items[2].pdfUrl, base + "9000003.pdf");
});

test("parseSeccion: fecha y edición desde la ruta del PDF", () => {
  const r = fns.parseSeccion(HTML.generales);
  assert.equal(r.fecha, HOY);
  assert.equal(r.edicion, "99999");
});

test("parseSeccion: 'nofound' → sin_publicaciones, fecha desde el texto", () => {
  const r = fns.parseSeccion(HTML.vacio);
  assert.equal(r.estado, "sin_publicaciones");
  assert.equal(r.items.length, 0);
  assert.equal(r.fecha, HOY);
  assert.equal(r.edicion, "99999");
});

test("parseSeccion: página de verificación anti-bots → estructura_desconocida", () => {
  const r = fns.parseSeccion("<html><body><h1>Verificando que eres humano…</h1></body></html>");
  assert.equal(r.estado, "estructura_desconocida");
  assert.equal(r.items.length, 0);
});

test("parseSeccion: vacío o null → estructura_desconocida", () => {
  assert.equal(fns.parseSeccion("").estado, "estructura_desconocida");
  assert.equal(fns.parseSeccion(null).estado, "estructura_desconocida");
});

test("parseSeccion: respaldo con filas sin clase 'content'", () => {
  const html = '<table><tr><td class="title4">MINISTERIO X</td></tr>'
    + '<tr><td>Publicación de prueba</td><td><a href="/publicaciones/2026/10/20/99999/04/9000301.pdf">PDF</a></td></tr></table>';
  const r = fns.parseSeccion(html);
  assert.equal(r.estado, "ok");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].titulo, "Publicación de prueba");
  assert.equal(r.items[0].ministerio, "MINISTERIO X");
  assert.equal(r.items[0].cve, "9000301", "CVE desde la ruta si el texto no lo trae");
});

test("parseSeccion: respaldo sin tabla (sólo enlaces a PDF)", () => {
  const html = '<p><a href="/publicaciones/2026/10/20/99999/05/9000401.pdf">Extracto de prueba CVE-9000401</a></p>'
    + '<p><a href="/otra/cosa.pdf">No es del diario</a></p>';
  const r = fns.parseSeccion(html);
  assert.equal(r.estado, "ok");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].cve, "9000401");
  assert.equal(r.fecha, HOY);
});

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

test("decodeEntities: nombradas, numéricas y desconocidas", () => {
  assert.equal(fns.decodeEntities("Subsecretar&iacute;a &amp; N&deg; &#241; &#xF1;"), "Subsecretaría & N° ñ ñ");
  assert.equal(fns.decodeEntities("&noexiste;"), "&noexiste;");
});

test("normalizar: tildes, mayúsculas y puntos de miles", () => {
  assert.equal(fns.normalizar("  Contraloría  GENERAL "), "contraloria general");
  assert.equal(fns.normalizar("Ley N° 18.695 y 1.234.567"), "ley n° 18695 y 1234567");
  assert.equal(fns.normalizar("Artículo 3.5"), "articulo 3.5", "decimales no se tocan");
});

test("extraerFechaTexto: fecha larga en español", () => {
  assert.equal(fns.extraerFechaTexto("Martes 20 de Octubre de 2026"), "20-10-2026");
  assert.equal(fns.extraerFechaTexto("1 de septiembre del 2026"), "01-09-2026");
  assert.equal(fns.extraerFechaTexto("sin fecha"), "");
});

test("formatoEdicion: separador de miles", () => {
  assert.equal(fns.formatoEdicion("44569"), "44.569");
  assert.equal(fns.formatoEdicion(""), "");
});

// ---------------------------------------------------------------------------
// coincidencias
// ---------------------------------------------------------------------------

const item = (titulo, organismo = "", ministerio = "") => ({ titulo, organismo, ministerio });

test("coincidencias: territorio y municipal, sin importar tildes", () => {
  const t = temasDe(item("Decreto de la I. MUNICIPALIDAD DE LOS VILOS"));
  assert.deepEqual(t, ["Los Vilos / Choapa / Coquimbo", "Municipal"]);
});

test("coincidencias: número de ley con puntos", () => {
  assert.deepEqual(temasDe(item("Modifica la Ley N° 18.834")), ["Laboral / funcionarios"]);
  assert.deepEqual(temasDe(item("Modifica la Ley N° 21.643")), ["Laboral / funcionarios"]);
});

test("coincidencias: prefijo con '*' (tributari*, remuneracion*)", () => {
  assert.deepEqual(temasDe(item("Normas tributarias de prueba")), ["Tributario"]);
  assert.deepEqual(temasDe(item("Fija remuneraciones")), ["Laboral / funcionarios"]);
});

test("coincidencias: 'SII' como palabra completa, no dentro de otra", () => {
  assert.deepEqual(temasDe(item("Resolución del SII")), ["Tributario"]);
  assert.deepEqual(temasDe(item("Consiidera texto")), []);
});

test("coincidencias: busca también en el organismo", () => {
  assert.deepEqual(temasDe(item("Resolución exenta", "Contraloría General de la República")), ["Contraloría / probidad"]);
});

test("coincidencias: 'vilos' sin 'los' no basta; palabra parcial tampoco", () => {
  assert.deepEqual(temasDe(item("Villa Vilos")), []);
  assert.deepEqual(temasDe(item("Coquimbano")), [], "coquimbo no es prefijo (sin '*')");
});

test("coincidencias: sin temas → []", () => {
  assert.deepEqual(temasDe(item("Aviso de prueba sin temas")), []);
});

// ---------------------------------------------------------------------------
// construirReporte / construirAviso
// ---------------------------------------------------------------------------

const resultadosOk = () => [
  resultado("normas_generales", HTML.generales),
  resultado("avisos_destacados", HTML.avisos),
  resultado("normas_particulares", HTML.particulares),
  resultado("publicaciones_judiciales", HTML.vacio)
];

test("construirReporte: asunto con fecha, edición y conteos", () => {
  const r = fns.construirReporte(resultadosOk(), HOY);
  assert.equal(r.subject, "📰 Diario Oficial 20-10-2026 · Ed. N° 99.999 — 6 destacadas · 4 normas generales");
});

test("construirReporte: secciones completas y filtradas", () => {
  const r = fns.construirReporte(resultadosOk(), HOY);
  // Normas Generales y Avisos: completas.
  assert.match(r.plain, /=== NORMAS GENERALES \(4\) ===/);
  assert.match(r.plain, /=== AVISOS DESTACADOS \(2\) ===/);
  assert.match(r.plain, /AVISO DE PRUEBA A/, "los avisos se listan aunque no coincidan");
  // Particulares: sólo coincidencias.
  assert.match(r.plain, /=== NORMAS PARTICULARES \(1 de 3\) ===/);
  assert.match(r.plain, /PARTICULAR DE PRUEBA 2/);
  assert.doesNotMatch(r.plain, /PARTICULAR DE PRUEBA 1/);
  // Judiciales: sin publicaciones.
  assert.match(r.plain, /=== PUBLICACIONES JUDICIALES \(0\) ===\nSin publicaciones en esta sección\./);
});

test("construirReporte: destacadas agrupadas por tema con motivo y PDF", () => {
  const r = fns.construirReporte(resultadosOk(), HOY);
  assert.match(r.plain, /=== DESTACADAS POR TEMA \(6\) ===/);
  assert.match(r.plain, /-- Los Vilos \/ Choapa \/ Coquimbo \(2\)/);
  assert.match(r.plain, /Coincide con Los Vilos \/ Choapa \/ Coquimbo: "los vilos"; Municipal: "municipal"/);
  assert.match(r.plain, /CVE-9000001 https:\/\/www\.diariooficial\.interior\.gob\.cl\/publicaciones\/2026\/10\/20\/99999\/01\/9000001\.pdf/);
  assert.match(r.html, /⭐ Destacadas por tema/);
});

test("construirReporte: escapa HTML de los títulos", () => {
  const r = fns.construirReporte(resultadosOk(), HOY);
  assert.match(r.html, /con &lt;símbolos&gt;/);
  assert.doesNotMatch(r.html, /<símbolos>/);
});

test("construirReporte: sección que no se pudo leer aparece con su motivo", () => {
  const res = resultadosOk();
  res[2] = { seccion: sec("normas_particulares"), http: 503, error: "HTTP 503", estado: "error", fecha: "", edicion: "", items: [] };
  const r = fns.construirReporte(res, HOY);
  assert.match(r.plain, /⚠️ No se pudo leer esta sección: HTTP 503\. Revísala en https:\/\/www\.diariooficial\.interior\.gob\.cl\/edicionelectronica\/normas_particulares\.php/);
  assert.match(r.html, /No se pudo leer esta sección: HTTP 503/);
  assert.match(r.plain, /=== NORMAS PARTICULARES \(—\) ===/);
});

test("construirReporte: sin jerarquía no muestra encabezado de organismo", () => {
  const r = fns.construirReporte(resultadosOk(), HOY);
  assert.match(r.plain, /=== AVISOS DESTACADOS \(2\) ===\n• AVISO DE PRUEBA A/);
});

test("construirReporte: Normas Generales caídas → asunto lo indica", () => {
  const res = resultadosOk();
  res[0] = { seccion: sec("normas_generales"), http: 0, error: "timeout", estado: "error", fecha: "", edicion: "", items: [] };
  const r = fns.construirReporte(res, HOY);
  assert.match(r.subject, /Normas Generales no disponibles$/);
});

test("construirReporte: edición que no es de hoy queda advertida", () => {
  const r = fns.construirReporte(resultadosOk(), "21-10-2026");
  assert.match(r.subject, /^📰 Diario Oficial 20-10-2026/, "el asunto usa la fecha de la edición leída");
  assert.match(r.plain, /la edición leída es del 20-10-2026, no de hoy \(21-10-2026\)/);
});

test("construirReporte: sin destacadas → lo dice explícitamente", () => {
  const res = [resultado("normas_generales", HTML.vacio)];
  const r = fns.construirReporte(res, HOY);
  assert.match(r.subject, /— 0 destacadas · 0 normas generales$/);
  assert.match(r.plain, /Sin publicaciones que mencionen tus temas/);
});

test("construirReporte: tope de publicaciones por sección", () => {
  let filas = "";
  for (let i = 0; i < 160; i++) {
    filas += `<tr class="content"><td>Item de prueba ${i}</td><td><a href="/publicaciones/2026/10/20/99999/01/${8000000 + i}.pdf">CVE-${8000000 + i}</a></td></tr>`;
  }
  const r = fns.construirReporte([resultado("normas_generales", `<table>${filas}</table>`)], HOY);
  assert.match(r.plain, /Item de prueba 149\n/);
  assert.doesNotMatch(r.plain, /Item de prueba 150\n/);
  assert.match(r.plain, /… y 10 más en https:\/\/www\.diariooficial\.interior\.gob\.cl\/edicionelectronica\/index\.php/);
});

test("construirReporte: pie con fuente y aviso de verificación", () => {
  const r = fns.construirReporte(resultadosOk(), HOY);
  assert.match(r.plain, /Fuente primaria: Diario Oficial de la República de Chile/);
  assert.match(r.plain, /verifica el texto íntegro en el PDF \(CVE\)/);
});

test("construirAviso: sitio leído pero sin edición de hoy", () => {
  const principal = resultado("normas_generales", HTML.generales);
  const a = fns.construirAviso(principal, "21-10-2026");
  assert.equal(a.subject, "📰 Diario Oficial 21-10-2026 — sin edición de hoy detectada");
  assert.match(a.plain, /la última edición disponible es del 20-10-2026/);
});

test("construirAviso: sitio no leído", () => {
  const principal = { seccion: sec("normas_generales"), http: 403, error: "HTTP 403", estado: "error", fecha: "", items: [] };
  const a = fns.construirAviso(principal, HOY);
  assert.equal(a.subject, "📰 Diario Oficial 20-10-2026 — no se pudo leer el sitio");
  assert.match(a.plain, /^No se pudo leer la edición electrónica: HTTP 403\./);
  const b = fns.construirAviso({ ...principal, error: "estructura no reconocida", http: 200 }, HOY);
  assert.match(b.plain, /estructura no reconocida \(HTTP 200\)\./);
});

test("opcionesCorreo: destinatario, CC y remitente", () => {
  const o = fns.opcionesCorreo({ subject: "s", plain: "p", html: "<p>h</p>" });
  assert.equal(o.to, "pandrades23@gmail.com");
  assert.equal(o.cc, "andradestordecilla.abogado@gmail.com");
  assert.equal(o.subject, "s");
  assert.equal(o.body, "p");
  assert.equal(o.htmlBody, "<p>h</p>");
  assert.equal(o.name, "Agente Diario Oficial");
});

// ---------------------------------------------------------------------------
// Lectura del sitio
// ---------------------------------------------------------------------------

test("fetchSeccion: reintenta y devuelve el último error", () => {
  paginas["index.php"] = { code: 503, html: "caído" };
  const r = fns.fetchSeccion("https://www.diariooficial.interior.gob.cl/edicionelectronica/index.php");
  assert.equal(fetchLog.length, 3);
  assert.equal(r.http, 503);
  assert.equal(r.error, "HTTP 503");
});

test("fetchSeccion: excepción de red se captura", () => {
  paginas["index.php"] = () => { throw new Error("DNS error"); };
  const r = fns.fetchSeccion("https://www.diariooficial.interior.gob.cl/edicionelectronica/index.php");
  assert.equal(r.http, 0);
  assert.equal(r.error, "DNS error");
});

test("leerSeccion: estructura desconocida se informa como error legible", () => {
  paginas["index.php"] = { html: "<html><body>Verificación</body></html>" };
  const r = fns.leerSeccion(sec("normas_generales"));
  assert.equal(r.estado, "estructura_desconocida");
  assert.match(r.error, /estructura no reconocida/);
  assert.equal(r.url, "https://www.diariooficial.interior.gob.cl/edicionelectronica/index.php");
});

// ---------------------------------------------------------------------------
// revisarDiarioOficial (flujo del activador)
// ---------------------------------------------------------------------------

test("revisar: antes de las 08:00 no hace nada", () => {
  assert.equal(fns.revisarDiarioOficial(TEMPRANO), "temprano");
  assert.equal(fetchLog.length, 0);
  assert.equal(enviados.length, 0);
});

test("revisar: envía una vez y no repite el mismo día", () => {
  assert.equal(fns.revisarDiarioOficial(MANANA), "enviado");
  assert.equal(enviados.length, 1);
  assert.equal(fetchLog.length, 4, "lee las 4 secciones");
  assert.match(fetchLog[0], /\/edicionelectronica\/index\.php$/, "la principal va sin parámetros");
  fetchLog.slice(1).forEach((u) => {
    assert.match(u, /\.php\?date=20-10-2026&edition=99999$/, "las demás piden la misma edición: " + u);
  });
  assert.equal(store[fns.DO_PROP_ULTIMO_ENVIO], HOY);
  assert.match(enviados[0].subject, /^📰 Diario Oficial 20-10-2026/);
  assert.equal(enviados[0].cc, "andradestordecilla.abogado@gmail.com");

  assert.equal(fns.revisarDiarioOficial(TARDE), "ya_enviado");
  assert.equal(enviados.length, 1);
});

test("revisar: el objeto de evento del activador se trata como 'ahora'", () => {
  const r = fns.revisarDiarioOficial({ triggerUid: "123" });
  assert.ok(["temprano", "enviado", "esperando", "aviso"].includes(r));
});

test("revisar: edición de otro día antes del límite → espera", () => {
  const ayer = HTML.generales.replace(/2026\/10\/20/g, "2026/10/19");
  paginas["index.php"] = { html: ayer };
  assert.equal(fns.revisarDiarioOficial(MANANA), "esperando");
  assert.equal(enviados.length, 0);
  assert.equal(fetchLog.length, 1, "no lee las demás secciones");
  assert.equal(store[fns.DO_PROP_ULTIMO_ENVIO], undefined);
});

test("revisar: sitio caído después del límite → un aviso, una sola vez", () => {
  paginas["index.php"] = { code: 403, html: "Forbidden" };
  assert.equal(fns.revisarDiarioOficial(TARDE), "aviso");
  assert.equal(enviados.length, 1);
  assert.match(enviados[0].subject, /no se pudo leer el sitio/);
  assert.equal(fns.revisarDiarioOficial(TARDE), "ya_enviado");
  assert.equal(enviados.length, 1);
});

test("revisar: sección secundaria caída no impide el envío", () => {
  paginas["normas_particulares.php"] = { code: 500, html: "" };
  assert.equal(fns.revisarDiarioOficial(MANANA), "enviado");
  assert.match(enviados[0].body, /No se pudo leer esta sección: HTTP 500/);
});

test("enviarReporteAhora: envía y marca el día si la edición es de hoy", () => {
  // Fija la fecha de los PDFs a "hoy" real para que coincida con new Date().
  const hoyReal = Utilities.formatDate(new Date(), "America/Santiago", "dd-MM-yyyy");
  const [d, m, y] = hoyReal.split("-");
  paginas["index.php"] = { html: HTML.generales.replace(/2026\/10\/20/g, `${y}/${m}/${d}`) };
  const r = fns.enviarReporteAhora();
  assert.equal(enviados.length, 1);
  assert.equal(r[0], "normas_generales: ok");
  assert.equal(store[fns.DO_PROP_ULTIMO_ENVIO], hoyReal);
});

// ---------------------------------------------------------------------------
// Activador
// ---------------------------------------------------------------------------

test("instalarAgente: crea el activador horario una sola vez", () => {
  assert.equal(fns.instalarAgente(), true);
  assert.equal(fns.instalarAgente(), false);
  assert.equal(creados, 1);
  assert.equal(triggers[0].getHandlerFunction(), "revisarDiarioOficial");
  assert.equal(triggers[0].horas, 1);
});

test("desinstalarAgente: borra los activadores", () => {
  fns.instalarAgente();
  fns.desinstalarAgente();
  assert.equal(triggers.length, 0);
});

// ---------------------------------------------------------------------------
// Estructura real del sitio (copia del 23-10-2026, edición 44.581)
// ---------------------------------------------------------------------------

const REAL = fixture("normas-generales.real-2026-10-23.html");

test("real: lee las 12 Normas Generales de la edición 44.581", () => {
  const r = fns.parseSeccion(REAL);
  assert.equal(r.estado, "ok");
  assert.equal(r.fecha, "23-10-2026");
  assert.equal(r.edicion, "44581");
  assert.equal(r.items.length, 12);
  const primera = r.items[0];
  assert.equal(primera.rama, "PODER EJECUTIVO");
  assert.equal(primera.ministerio, "MINISTERIO DE DEFENSA NACIONAL");
  assert.equal(primera.cve, "2886293");
  assert.equal(primera.pdfUrl, "https://www.diariooficial.interior.gob.cl/publicaciones/2026/10/23/44581/01/2886293.pdf");
  assert.match(primera.titulo, /^Resolución exenta número 4\/3\/0132\/2264, de 2026\.- Aprueba la Sexta edición/);
  const ultima = r.items[11];
  assert.equal(ultima.rama, "OTRAS ENTIDADES");
  assert.equal(ultima.ministerio, "MUNICIPALIDAD DE CAUQUENES");
  assert.equal(ultima.cve, "2888714");
});

test("real: el menú marca index.php como sección activa", () => {
  assert.equal(fns.seccionServida(REAL), "index.php");
});

test("seccionServida: sin enlace activo → ''", () => {
  assert.equal(fns.seccionServida(HTML.generales), "");
  assert.equal(fns.seccionServida('<a class="active" href="javascript:void(0)">x</a>'), "");
});

test("leerSeccion: si el sitio entrega otra sección, no se usa y se informa", () => {
  // Pedir Avisos y recibir la página de Normas Generales (lo que hace el
  // sitio cuando faltan fecha y edición).
  paginas["avisos_destacados.php"] = { html: REAL };
  const r = fns.leerSeccion(sec("avisos_destacados"), "?date=23-10-2026&edition=44581");
  assert.equal(r.estado, "error");
  assert.equal(r.items.length, 0);
  assert.match(r.error, /entregó otra sección \(index\.php\) en vez de avisos_destacados\.php/);
  assert.match(r.url, /avisos_destacados\.php\?date=23-10-2026&edition=44581$/);
});

test("leerEdicion: sin fecha/edición en la principal, pide las demás sin parámetros", () => {
  const principal = { seccion: sec("normas_generales"), fecha: "", edicion: "", estado: "error", items: [] };
  const res = fns.leerEdicion(principal);
  assert.equal(res.length, 4);
  assert.equal(res[0], principal);
  fetchLog.forEach((u) => assert.doesNotMatch(u, /\?/));
});

test("parseSeccion: letras sueltas (índice alfabético) no son organismo", () => {
  const html = '<table><tr><td class="title4">PODER JUDICIAL</td></tr><tr><td class="title5">O</td></tr>'
    + '<tr class="content"><td>Publicación de prueba</td><td><a href="/publicaciones/2026/10/20/99999/07/9000501.pdf">CVE-9000501</a></td></tr></table>';
  const r = fns.parseSeccion(html);
  assert.equal(r.items[0].ministerio, "PODER JUDICIAL");
  assert.equal(r.items[0].organismo, "");
});

test("absolutizar: http:// del Diario Oficial pasa a https://; otros sitios no se tocan", () => {
  assert.equal(fns.absolutizar("http://www.diariooficial.interior.gob.cl/publicaciones/2026/10/23/44581/04/2888074.pdf"),
    "https://www.diariooficial.interior.gob.cl/publicaciones/2026/10/23/44581/04/2888074.pdf");
  assert.equal(fns.absolutizar("http://ejemplo.cl/a.pdf"), "http://ejemplo.cl/a.pdf");
});

console.log(`\n${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
