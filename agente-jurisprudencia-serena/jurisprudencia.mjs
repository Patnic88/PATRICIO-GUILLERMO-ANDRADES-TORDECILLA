// Agente Jurisprudencia C.A. La Serena — lógica pura (sin red ni archivos).
//
// Fuente única: las notas "Noticias sobre fallos" del Poder Judicial
// (www.pjud.cl, jurisdicción C.A. de La Serena). De esa lista el agente se
// queda SOLO con las decisiones de la Corte de Apelaciones de La Serena
// (descarta juzgados, TOP, ministros en visita y noticias institucionales,
// y dice por qué). De cada nota arma una ficha con datos copiados
// literalmente, mide su interés para un carrusel de Choapa Justa y prepara
// el reporte. También valida que un carrusel escrito por Claude no agregue
// nada que no esté en la ficha.
//
// Lo usan reporte.mjs (CLI), validar-carrusel.mjs y los tests.

export const CONFIG = {
  para: ["pandrades23@gmail.com"],
  cc: ["andradestordecilla.abogado@gmail.com"],
  baseUrl: "https://www.pjud.cl",
  rutaLista: "/prensa-y-comunicaciones/noticias-del-poder-judicial",
  rutaAjax: "/ajax/news/getNewsForFilters",
  // Valores del formulario de filtros de pjud.cl (verificados el 25-10-2026).
  jurisdiccion: "7", // "C.A de La Serena"
  tipoNoticia: "48", // "Noticias sobre fallos"
  maxRecomendados: 3,
  puntajeMinimo: 4,
  zona: "America/Santiago"
};

export const TRIBUNAL = "Corte de Apelaciones de La Serena";

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", ndash: "–", mdash: "—", hellip: "…",
  deg: "°", ordm: "º", ordf: "ª", aacute: "á", eacute: "é", iacute: "í", oacute: "ó",
  uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", iexcl: "¡", iquest: "¿"
};

/** HTML → texto en una línea, con entidades decodificadas. */
export function textoPlano(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    // Las etiquetas de formato (negrita, cursiva, enlaces) no separan palabras:
    // "“<strong>SE CONFIRMA</strong>" se lee "“SE CONFIRMA", como en el navegador.
    .replace(/<\/?(?:strong|b|em|i|u|span|a|sup|sub|small|font)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] !== "#") return ENTIDADES[e] ?? m;
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    })
    .replace(/[\s ]+/g, " ")
    .trim();
}

/** Forma comparable: sin tildes, comillas y guiones unificados, minúsculas. */
export function normalizar(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[“”«»„"]/g, '"').replace(/[‘’`´']/g, "'")
    .replace(/[–—‑−]/g, "-").replace(/…/g, "...")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

export const escaparHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const escaparRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------------------
// Fechas (hora de Chile)
// ---------------------------------------------------------------------------

/** Fecha de hoy en Chile, AAAA-MM-DD. */
export function hoyChile(ahora = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: CONFIG.zona, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(ahora).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function sumarDias(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Los `n` días completos anteriores a `hoy` (no incluye hoy). */
export function periodoAnterior(hoy, n) {
  return { desde: sumarDias(hoy, -n), hasta: sumarDias(hoy, -1) };
}

export const isoATexto = (iso) => iso ? iso.split("-").reverse().join("-") : "";

// ---------------------------------------------------------------------------
// Lectura de páginas de pjud.cl
// ---------------------------------------------------------------------------

/** Página de rechazo del cortafuegos del sitio ("La URL solicitada ha sido rechazada"). */
export const esRechazo = (html) => /La URL solicitada ha sido rechazada/i.test(String(html || ""));

/**
 * Verificación humana (CAPTCHA) que el sitio muestra a navegadores
 * automatizados. El agente no la resuelve ni la evade: la informa.
 */
export const esVerificacionHumana = (html) =>
  /testing whether you are a human visitor|What code is in the image\?/i.test(String(html || ""));

export const MENSAJE_VERIFICACION = "pjud.cl pidió una verificación humana (CAPTCHA) al navegador automatizado. "
  + "El agente no la resuelve ni la evade. Para este período, abre las notas en tu navegador, guárdalas "
  + "(Ctrl+S) en una carpeta y pide a Claude que las procese con el modo carpeta (--entrada).";

const MESES = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07",
  agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };

/** "22-octubre-2026" (fecha de la página de la nota) → "2026-10-22". */
export function fechaDesdeLiteral(texto) {
  const m = normalizar(texto).match(/(\d{1,2})[-\s]+(?:de\s+)?([a-z]+)[-\s]+(?:de\s+)?(\d{4})/);
  if (!m || !MESES[m[2]]) return null;
  return `${m[3]}-${MESES[m[2]]}-${m[1].padStart(2, "0")}`;
}

/** Número de la nota en una página guardada desde el navegador (enlaces de compartir, "saved from url"). */
export function idDesdeHtml(html, nombreArchivo = "") {
  const m = String(html || "").match(/noticias-del-poder-judicial(?:\/|%2F)(\d{4,})/i)
    || String(nombreArchivo).match(/(\d{5,})/);
  return m ? m[1] : null;
}

/**
 * Lista de notas que devuelve POST /ajax/news/getNewsForFilters.
 * La fecha del listado viene como "22-10-2026 03:10": solo se usa el día
 * (la parte de la hora del sitio no es confiable).
 */
export function parsearLista(html) {
  const s = String(html || "");
  if (esRechazo(s)) return { estado: "rechazada", items: [] };
  if (esVerificacionHumana(s)) return { estado: "verificacion", items: [] };
  const items = [];
  const re = /<a\b[^>]*href="([^"]*noticias-del-poder-judicial\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(s))) {
    const titulo = textoPlano((m[3].match(/<h5[^>]*>([\s\S]*?)<\/h5>/i) || [])[1] || "");
    const f = m[3].match(/(\d{2})-(\d{2})-(\d{4})/);
    if (!titulo || !f) continue;
    items.push({
      id: m[2],
      url: `${CONFIG.baseUrl}${CONFIG.rutaLista}/${m[2]}`,
      titulo,
      fechaNota: `${f[3]}-${f[2]}-${f[1]}`
    });
  }
  if (!items.length && !/jt-result-item|jtpaginators/.test(s) && s.trim()) {
    return { estado: "desconocida", items: [] };
  }
  return { estado: "ok", items };
}

/** Página de una nota: título, fecha literal, bajada y párrafos. */
export function parsearNoticia(html) {
  const s = String(html || "");
  if (esRechazo(s)) return { estado: "rechazada" };
  if (esVerificacionHumana(s)) return { estado: "verificacion" };
  const titulo = textoPlano((s.match(/<h3 class="blog-title">([\s\S]*?)<\/h3>/i) || [])[1] || "");
  const cuerpo = (s.match(/<div class="col-12 blog-content[^"]*">([\s\S]*?)(?:<\/medium>|<\/div>)/i) || [])[1];
  if (!titulo || cuerpo === undefined) return { estado: "desconocida" };
  const tras = s.slice(s.indexOf("blog-title"));
  const fechaTexto = textoPlano((tras.match(/<span class="text-muted">([\s\S]*?)<\/span>/i) || [])[1] || "");
  const bajada = textoPlano((s.match(/<blockquote class="wp-block-quote">([\s\S]*?)<\/blockquote>/i) || [])[1] || "");
  let parrafos = [...cuerpo.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((x) => textoPlano(x[1]));
  if (!parrafos.length) parrafos = cuerpo.split(/<br\s*\/?>\s*<br\s*\/?>/i).map(textoPlano);
  parrafos = parrafos.filter(Boolean);
  if (!parrafos.length) return { estado: "desconocida" };
  const doc = s.match(/href="((?:https?:\/\/www\.pjud\.cl)?\/prensa-y-comunicaciones\/docs\/download\/\d+)"/i);
  const documento = doc ? (doc[1].startsWith("http") ? doc[1] : CONFIG.baseUrl + doc[1]) : null;
  return { estado: "ok", titulo, fechaTexto, bajada, parrafos, ...(documento ? { documento } : {}) };
}

// ---------------------------------------------------------------------------
// Texto de la página (modo navegador: lo que Claude lee en la pestaña)
// ---------------------------------------------------------------------------

const lineasDe = (texto) => String(texto || "").split(/\r?\n/)
  .map((l) => l.replace(/[\s\u00a0]+/g, " ").trim()).filter(Boolean);

/**
 * Lista leída como texto: cada nota es una línea de título seguida de su
 * fecha ("22-10-2026 03:10"). El texto no trae enlaces, así que id y url
 * quedan vacíos hasta que se lea la nota.
 */
export function parsearListaTexto(texto) {
  if (esVerificacionHumana(texto)) return { estado: "verificacion", items: [] };
  if (esRechazo(texto)) return { estado: "rechazada", items: [] };
  const lineas = lineasDe(texto);
  const items = [];
  for (let i = 1; i < lineas.length; i++) {
    const f = lineas[i].match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+\d{1,2}:\d{2})?$/);
    if (f && !/^\d{2}-\d{2}-\d{4}/.test(lineas[i - 1])) {
      items.push({ id: null, url: "", titulo: lineas[i - 1], fechaNota: `${f[3]}-${f[2]}-${f[1]}` });
    }
  }
  return items.length ? { estado: "ok", items } : { estado: "desconocida", items: [] };
}

/**
 * Nota leída como texto: el título es la línea anterior a la fecha
 * ("22-octubre-2026"), la bajada la línea siguiente y luego los párrafos,
 * hasta "Volver" o el pie del sitio.
 */
export function parsearNoticiaTexto(texto) {
  if (esVerificacionHumana(texto)) return { estado: "verificacion" };
  if (esRechazo(texto)) return { estado: "rechazada" };
  const lineas = lineasDe(texto).filter((l) => !/^(URL|Fuente)\s*:/i.test(l));
  const iFecha = lineas.findIndex((l) => /^\d{1,2}-[a-záéíóú]+-\d{4}$/i.test(l));
  if (iFecha < 1) return { estado: "desconocida" };
  let fin = lineas.findIndex((l, i) => i > iFecha && /^(Volver|ACERCA DEL PODER JUDICIAL)$/i.test(l));
  if (fin < 0) fin = lineas.length;
  const cuerpo = lineas.slice(iFecha + 1, fin).filter((l) => !/^(Video|Compartir|Imagen)$/i.test(l));
  if (cuerpo.length < 2) return { estado: "desconocida" };
  return { estado: "ok", titulo: lineas[iFecha - 1], fechaTexto: lineas[iFecha], bajada: cuerpo[0], parrafos: cuerpo.slice(1) };
}

// ---------------------------------------------------------------------------
// ¿Es una decisión de la Corte de Apelaciones de La Serena?
// ---------------------------------------------------------------------------

const CORTE_SRC = "Corte\\s+(?:de\\s+Apelaciones\\s+)?(?:de\\s+)?La\\s+Serena\\b";
const CORTE_RE = new RegExp("\\b" + CORTE_SRC, "i");
const CORTE_INICIO_RE = new RegExp("^(?:La\\s+)?" + CORTE_SRC, "i");

const VERBOS = "acogi[oó]|rechaz[oó]|confirm[oó]|revoc[oó]|orden[oó]|conden[oó]|anul[oó]|declar[oó]|"
  + "absolvi[oó]|dej[oó]|mantuvo|aument[oó]|rebaj[oó]|prohibi[oó]|dispuso|ratific[oó]|desestim[oó]|"
  + "sobresey[oó]|concedi[oó]|neg[oó]|resolvi[oó]|accedi[oó]|elev[oó]|fij[oó]|acredit[oó]|descart[oó]|"
  + "sancion[oó]|otorg[oó]|invalid[oó]|decret[oó]|suspendi[oó]|desech[oó]|admiti[oó]|reconoci[oó]|ampar[oó]";
// \b de JavaScript no reconoce letras con tilde: el final del verbo se marca con (?!\p{L}).
const DECISION_RE = new RegExp("\\b(" + CORTE_SRC + ")(?:\\s*,[^,]{1,80},)?\\s+(" + VERBOS + ")(?![\\p{L}])", "iu");
const SALA_RE = /\b(Primera|Segunda|Tercera|Cuarta)\s+Sala\b/i;

const OTROS_TRIBUNALES = [
  [/^(?:\d+\s*°?\s*)?Juzgados?\b/i, "Juzgado de primera instancia, no la Corte"],
  [/^(?:\d+\s*°?\s*)?(?:TOP|Tribunal(?:es)?\s+(?:de\s+)?(?:Juicio\s+)?Oral)\b/i, "Tribunal de Juicio Oral en lo Penal, no la Corte"],
  [/^Ministr[oa]s?\b/i, "Ministro en visita o de fuero (resolución de primera instancia), no una sala de la Corte"],
  [/^(?:La\s+)?Corte\s+Suprema\b/i, "Fallo de la Corte Suprema, no de la Corte de La Serena"],
  [/^(?:Presidente|Presidenta|Fiscal[ií]a|Fiscal|Comit[eé]|Tablas?|Apertura|Concurso)\b/i, "Noticia institucional, no un fallo"]
];

/**
 * Primera criba, solo con el título del listado:
 * "corte" (la Corte decide), "revisar" (la menciona; hay que leer la nota)
 * u "otro" (otro tribunal o noticia institucional, con su motivo).
 */
export function clasificarTitulo(titulo) {
  const base = String(titulo || "").trim();
  const conPrefijo = base.match(/^([^:]{1,60}):\s+(.+)$/); // "Tren de Aragua: Corte de La Serena…"
  const variantes = conPrefijo ? [base, conPrefijo[2]] : [base];
  if (variantes.some((v) => CORTE_INICIO_RE.test(v))) return { tipo: "corte" };
  for (const v of variantes) {
    for (const [re, motivo] of OTROS_TRIBUNALES) if (re.test(v)) return { tipo: "otro", motivo };
  }
  if (CORTE_RE.test(base)) return { tipo: "revisar" };
  return { tipo: "otro", motivo: "Otro tribunal de la jurisdicción: el título no atribuye la decisión a la Corte" };
}

/** Confirma, con el texto de la nota, que decidió la Corte de La Serena. */
export function confirmarCorte(noticia) {
  const p0 = noticia.parrafos[0] || "";
  if (/^\s*(?:La\s+)?(?:Excelentísima\s+)?Corte\s+Suprema\b/i.test(p0)) {
    return { ok: false, motivo: "La nota informa un fallo de la Corte Suprema" };
  }
  if (/^\s*(?:El|La)\s+ministr[oa]\s+(?:en\s+visita|de\s+fuero)/i.test(p0)) {
    return { ok: false, motivo: "Ministro en visita o de fuero (resolución de primera instancia), no una sala de la Corte" };
  }
  const texto = [noticia.bajada, ...noticia.parrafos.slice(0, 3)].join(" ");
  const m = texto.match(DECISION_RE);
  if (m) return { ok: true, verbo: m[2] };
  if (CORTE_RE.test(texto) && /\bSala\s+del\s+tribunal\s+de\s+alzada\b/i.test(texto)) return { ok: true, verbo: null };
  return { ok: false, motivo: "La nota no atribuye la decisión a la Corte de Apelaciones de La Serena" };
}

// ---------------------------------------------------------------------------
// Ficha (todo literal, copiado de la nota)
// ---------------------------------------------------------------------------

const ACCIONES = [
  "recurso de protección", "acción de protección", "recurso de amparo económico", "recurso de amparo",
  "acción de amparo", "recurso de nulidad", "recurso de apelación", "recurso de queja",
  "recurso de reclamación", "reclamo de ilegalidad", "recurso de casación", "recurso de hecho",
  "acción constitucional", "solicitud de extradición", "desafuero", "apelación"
];

// Número de rol: con punto de miles ("1.069-2025") o sin él ("1234-2026").
const NUM_ROL = "(?:\\d{1,3}(?:\\.\\d{3})+|\\d{1,6})-\\d{4}";
const ROL_RE = new RegExp("\\b(?:causa\\s+)?rol(?:\\s+de\\s+ingreso)?(?:\\s+(?:N\\s*[°º.]|n[uú]m(?:ero|\\.)|Corte))?\\s*[:°º]?\\s*"
  + "((?:[A-Za-zÁÉÍÓÚáéíóúñ]+-)?" + NUM_ROL + ")\\b", "gi");

function buscarRoles(parrafos) {
  const roles = [];
  parrafos.forEach((p) => {
    for (const m of p.matchAll(ROL_RE)) {
      const antes = p.slice(Math.max(0, m.index - 80), m.index);
      const cerca = p.slice(Math.max(0, m.index - 120), m.index + m[0].length + 120);
      const deInferior = /\b(autos|dictad[ao]\s+por|juzgado|tribunal\s+oral|TOP)\b[^.]*$/i.test(antes);
      roles.push({
        rol: m[1],
        texto: m[0],
        deLaCorte: !deInferior && /\b(Sala|fallo|Corte|tribunal de alzada)\b/i.test(cerca)
      });
    }
  });
  return roles;
}

function buscarIntegracion(texto) {
  const m = texto.match(/integrad[ao]s?\s+por\s+((?:[^–—\-()]|\([a-z]{1,3}\))+?)\s*(?:[–—]|-(?=\s*[a-záéíóú])|\)(?!\w)|,\s+(?:acogi|rechaz|confirm|revoc|orden|descart))/i);
  return m ? m[1].trim() : null;
}

/** Texto entre comillas (admite comillas anidadas: “… “oportuna” …”). */
function buscarCitas(parrafos) {
  const citas = [];
  const agregar = (texto, parrafo) => {
    const t = texto.trim();
    if (t.length >= 25 && !citas.some((c) => c.texto.includes(t))) citas.push({ texto: t, parrafo });
  };
  parrafos.forEach((p, i) => {
    let prof = 0, inicio = -1;
    for (let k = 0; k < p.length; k++) {
      if (p[k] === "“") { if (prof === 0) inicio = k + 1; prof++; }
      else if (p[k] === "”" && prof > 0 && --prof === 0) agregar(p.slice(inicio, k), i + 1);
    }
    for (const m of p.matchAll(/"([^"]{25,})"/g)) agregar(m[1], i + 1);
  });
  return citas;
}

function buscarNormas(texto) {
  const res = [
    /\bart[íi]culos?\s+\d+\s*[°º]?(?:\s*(?:,\s*)?(?:N\s*[°º]\s*\d+|numerales?\s+[\d\sy,]+|incisos?\s+\w+|letras?\s+[a-z]\)?))*(?:\s+(?:del|de\s+la)\s+(?:Código(?:\s+(?:de|del|en\s+lo)?\s*[A-ZÁÉÍÓÚ][a-záéíóú]+)+|Constitución\s+Política(?:\s+de\s+la\s+República)?|[Ll]ey\s+(?:N\s*[°º]\s*)?\d{1,2}(?:\.\d{3})+))?/g,
    /\b[Ll]ey\s+(?:N\s*[°º]\.?\s*)?\d{1,2}\.\d{3}\b/g,
    /\bCódigo\s+(?:Procesal\s+)?(?:Penal|Civil|del\s+Trabajo|Tributario|Sanitario|de\s+Aguas)\b/g,
    /\bConstitución\s+Política(?:\s+de\s+la\s+República)?\b/g
  ];
  const vistas = new Map();
  for (const re of res) {
    for (const m of texto.matchAll(re)) {
      const t = m[0].trim().replace(/[\s,]+$/, "");
      const k = normalizar(t);
      if (![...vistas.keys()].some((x) => x.includes(k))) vistas.set(k, t);
    }
  }
  return [...vistas.values()];
}

function buscarLiteral(textos, frases) {
  for (const t of textos) {
    for (const f of frases) {
      const m = String(t || "").match(new RegExp("\\b" + escaparRe(f) + "\\b", "i"));
      if (m) return m[0];
    }
  }
  return null;
}

/** Ficha verificable de una nota ya confirmada como decisión de la Corte. */
export function extraerFicha(item, noticia, confirmacion = confirmarCorte(noticia)) {
  const { bajada, parrafos } = noticia;
  const todo = [bajada, ...parrafos].join(" ");
  const roles = buscarRoles(parrafos);
  const rolCorte = roles.find((r) => r.deLaCorte) || null;
  const salaM = todo.match(SALA_RE);
  const votoM = todo.match(/\bfallo\s+(?:unánime|dividido|de\s+mayoría)\b|\bvoto\s+(?:dividido|de\s+minoría|en\s+contra|disidente)\b/i);

  const ficha = {
    id: item.id,
    url: item.url,
    fuente: "Nota de prensa del Poder Judicial (pjud.cl), sección Noticias sobre fallos",
    tribunal: TRIBUNAL,
    titulo: noticia.titulo || item.titulo,
    fechaNota: item.fechaNota,
    fechaNotaTexto: isoATexto(item.fechaNota),
    fechaNotaLiteral: noticia.fechaTexto || "",
    sala: salaM ? `${salaM[1][0].toUpperCase()}${salaM[1].slice(1).toLowerCase()} Sala` : null,
    integracion: buscarIntegracion(todo),
    rol: rolCorte ? rolCorte.rol : null,
    rolTexto: rolCorte ? rolCorte.texto : null,
    otrosRoles: roles.filter((r) => r !== rolCorte).map((r) => r.texto),
    accion: buscarLiteral([noticia.titulo, bajada, parrafos[0]], ACCIONES),
    resultado: confirmacion.verbo || null,
    votacion: votoM ? votoM[0] : null,
    bajada,
    parrafos,
    citas: buscarCitas(parrafos),
    normas: buscarNormas(todo),
    // "html": página guardada tal cual; "texto": texto que Claude copió desde la pestaña.
    lectura: noticia.origen === "texto" ? "texto" : "html"
  };
  ficha.rolFuente = rolCorte ? "Nota de prensa del Poder Judicial" : null;
  ficha.fechaSentencia = null;
  ficha.documento = noticia.documento || null;
  ficha.frasesBusqueda = frasesBusqueda(ficha);
  ficha.fraseBusqueda = ficha.frasesBusqueda[0] || null;
  ficha.rolVerificacion = null;
  Object.assign(ficha, puntuar(ficha));
  ficha.pendientes = pendientes(ficha);
  return ficha;
}

// Palabras que no sirven para empezar ni terminar una frase de búsqueda.
const VACIAS = new Set(("a al ante bajo con contra de del desde en entre hacia hasta la las lo los el un una unos unas y e o u "
  + "que se su sus por para sin sobre tras es son fue era ha han ya no ni le les me mi este esta esto ese esa eso aquel "
  + "aquella aquello como cuando donde pues si asi tal cual cuya cuyo cuyas cuyos mas tambien tanto toda todo todos todas "
  + "dicha dicho dichos dichas misma mismo mismas mismos cada otra otro otras otros ello ella ellos ellas aquello").split(" "));
// Vocabulario forense presente en casi cualquier sentencia: no distingue un fallo de otro.
const FORENSE = new Set(("recurso recursos recurrente recurrentes recurrido recurridos recurrida recurridas sentencia resolucion "
  + "tribunal corte sala articulo articulos considerando considerandos antecedentes autos fojas resuelve resuelto estima "
  + "estimar corresponde procede procedente improcedente improcedencia acoge rechaza confirma revoca declara dispone "
  + "efecto consecuencia conforme referido referida referidos referidas senalado senalada anterior anteriores presente "
  + "respecto accion acciones constitucional garantia garantias derecho derechos ilegal arbitrario arbitraria legal "
  + "actuar hechos acreditado acreditada vulneracion vulnerado").split(" "));
const FORMULAS = /^(?:que asi las cosas|que respecto|por estas consideraciones|por tanto|en consecuencia|en efecto|por otra parte|sin embargo|ahora bien|asimismo|ademas|se acoge|se rechaza|se confirma|se revoca|de todo lo dicho|teniendo en cuenta|atendido|visto)\b/;

const pesoPalabra = (w) => {
  const n = normalizar(w).replace(/[^\p{L}\d]/gu, "");
  if (!n || VACIAS.has(n)) return 0;
  if (FORENSE.has(n)) return -1;
  if (/\d/.test(n)) return 1;
  return n.length >= 8 ? 2 : n.length >= 5 ? 1 : 0;
};

/**
 * Frases literales y distintivas del fallo (6 a 10 palabras) para encontrarlo
 * en el Portal Unificado de Sentencias: la sentencia las contiene tal cual.
 * Devuelve hasta `max`, de citas distintas, ordenadas de más a menos
 * distintiva. Empiezan y terminan en palabra con contenido; excluyen los
 * incisos de la prensa ("–añade–") y las fórmulas forenses.
 */
export function frasesBusqueda(f, max = 3) {
  const original = [f.bajada, ...f.parrafos].join(" ");
  const candidatas = [];
  f.citas.forEach((c, k) => {
    const tramos = c.texto.split(/\s*(?:\(…\)|\(\.\.\.\)|[.;:“”"‘’–—()]|\s-|-\s)\s*/)
      .map((t) => t.replace(/^[,\s–—-]+|[,\s–—-]+$/g, "").trim()).filter(Boolean);
    for (const t of tramos) {
      const palabras = t.split(/\s+/);
      if (palabras.length < 6) continue;
      const largo = Math.min(10, palabras.length);
      for (let i = 0; i + largo <= palabras.length; i++) {
        const fin = i + largo;
        // Las frases que empiezan y terminan en un límite de cláusula se leen
        // (y se buscan) mejor que las que cortan una expresión por la mitad.
        const limites = (i === 0 || /,$/.test(palabras[i - 1]) ? 1 : 0) + (fin === palabras.length || /,$/.test(palabras[fin - 1]) ? 1 : 0);
        let v = palabras.slice(i, fin);
        while (v.length && pesoPalabra(v[0]) <= 0) v.shift();
        while (v.length && (pesoPalabra(v[v.length - 1]) <= 0 || /,$/.test(v[v.length - 1]))) v.pop();
        if (v.length < 6) continue;
        const frase = v.join(" ");
        if (FORMULAS.test(normalizar(frase)) || !original.includes(frase)) continue;
        candidatas.push({ frase, cita: k, valor: v.reduce((a, w) => a + pesoPalabra(w), 0) + limites });
      }
    }
  });
  candidatas.sort((a, b) => b.valor - a.valor || a.frase.length - b.frase.length);
  const elegidas = [];
  const citasUsadas = new Set();
  for (const c of candidatas) {
    if (citasUsadas.has(c.cita)) continue;
    if (elegidas.some((e) => normalizar(e).includes(normalizar(c.frase)) || normalizar(c.frase).includes(normalizar(e)))) continue;
    elegidas.push(c.frase);
    citasUsadas.add(c.cita);
    if (elegidas.length >= max) break;
  }
  return elegidas;
}

/** Compatibilidad: la mejor frase de búsqueda, o null. */
export const fraseBusqueda = (f) => frasesBusqueda(f, 1)[0] || null;

// ---------------------------------------------------------------------------
// Sentencia (texto del Portal Unificado, de la OJV o de un PDF)
// ---------------------------------------------------------------------------

const UNIDADES = { cero: 0, uno: 1, un: 1, una: 1, primero: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90 };
const NUMERAL = "(?:\\d{1,2}|(?:treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)(?:\\s+y\\s+(?:uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?|"
  + Object.keys(UNIDADES).join("|") + ")";

/** "treinta y uno" → 31; "dieciséis" → 16; "7" → 7. Sobre texto normalizado. */
function numeroDesdeLetras(t) {
  const n = normalizar(t).trim();
  if (/^\d+$/.test(n)) return parseInt(n, 10);
  const m = n.match(/^(\w+)(?:\s+y\s+(\w+))?$/);
  if (!m || !(m[1] in UNIDADES)) return null;
  return UNIDADES[m[1]] + (m[2] ? UNIDADES[m[2]] || 0 : 0);
}

/**
 * Fecha escrita con números o con letras, como la encabezan las sentencias
 * chilenas ("La Serena, dieciséis de octubre de dos mil veintiséis";
 * "a veintiún días del mes de marzo del año dos mil veinticinco"; "16-10-2026").
 * Devuelve AAAA-MM-DD o null. Con `cerca`, prefiere la fecha que sigue a ese texto.
 */
export function fechaDesdeLetras(texto, cerca = null) {
  const n = normalizar(texto);
  const meses = Object.keys(MESES).join("|");
  const letras = new RegExp("(" + NUMERAL + ")\\s+(?:dias?\\s+)?(?:de\\s+|del\\s+mes\\s+de\\s+)?(" + meses + ")\\s+(?:de\\s+|del\\s+ano\\s+|del\\s+)?(\\d{4}|dos\\s+mil(?:\\s+" + NUMERAL + ")?)", "g");
  const numerica = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g;
  const encontradas = [];
  for (const m of n.matchAll(letras)) {
    const dia = numeroDesdeLetras(m[1]);
    const mes = MESES[m[2]];
    const anio = /^\d{4}$/.test(m[3]) ? parseInt(m[3], 10) : 2000 + (numeroDesdeLetras(m[3].replace(/^dos\s+mil\s*/, "")) || 0);
    if (dia >= 1 && dia <= 31 && mes && anio >= 1990 && anio <= 2100) encontradas.push({ pos: m.index, iso: `${anio}-${mes}-${String(dia).padStart(2, "0")}` });
  }
  for (const m of n.matchAll(numerica)) {
    const [dia, mes, anio] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && anio >= 1990 && anio <= 2100) encontradas.push({ pos: m.index, iso: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` });
  }
  if (!encontradas.length) return null;
  encontradas.sort((a, b) => a.pos - b.pos);
  if (cerca) {
    const pc = n.indexOf(normalizar(cerca));
    if (pc >= 0) {
      const despues = encontradas.find((x) => x.pos >= pc && x.pos - pc < 80);
      if (despues) return despues.iso;
    }
  }
  return encontradas[0].iso;
}

const ROL_SENTENCIA_RE = new RegExp("\\b(?:rol|ingreso|causa)(?:\\s+(?:de\\s+)?(?:ingreso|corte|n[uú]mero|unico))?\\s*(?:n\\s*[°º.]?|nº|no\\.?|num\\.?)?\\s*[:.]?\\s*"
  + "((?:[A-Za-zÁÉÍÓÚáéíóúñ]+(?:\\s[A-Za-zÁÉÍÓÚáéíóúñ]+)?-)?" + NUM_ROL + ")", "gi");
const ROL_PREFIJADO_RE = new RegExp("\\b((?:Protecci[oó]n|Amparo|Penal|Civil|Laboral|Familia|Cobranza|Contencioso(?:\\s+Administrativo)?|Reforma\\s+Laboral|Criminal)-" + NUM_ROL + ")\\b", "gi");

/**
 * Datos de una sentencia a partir de su texto: rol (el del encabezado si lo
 * hay), fecha, si es de la Corte de Apelaciones de La Serena, sala y si el
 * encabezado es de la Corte Suprema (otra causa, otro rol).
 */
export function parsearSentencia(texto) {
  const t = String(texto || "").replace(/[\s ]+/g, " ").trim();
  const roles = [];
  for (const re of [ROL_PREFIJADO_RE, ROL_SENTENCIA_RE]) {
    for (const m of t.matchAll(re)) roles.push({ rol: m[1].replace(/\s+/g, " "), pos: m.index, prefijado: /-\d/.test(m[1]) && /^[A-Za-z]/.test(m[1]) });
  }
  const vistos = new Map();
  for (const r of roles) if (!vistos.has(r.rol)) vistos.set(r.rol, r);
  const lista = [...vistos.values()].sort((a, b) => (b.prefijado - a.prefijado) || a.pos - b.pos);
  const cabecera = t.slice(0, 1500);
  const posSuprema = t.search(/Corte\s+Suprema/i);
  const posSerena = t.search(/Corte\s+de\s+Apelaciones\s+de\s+La\s+Serena/i);
  // En las sentencias chilenas la sala suele ir al final ("Pronunciada por la
  // Primera Sala…"), así que se busca en todo el texto.
  const salaM = t.match(/\b(Primera|Segunda|Tercera|Cuarta)\s+Sala\b/i);
  return {
    rol: lista.length ? lista[0].rol : null,
    roles: lista.map((r) => r.rol),
    fecha: fechaDesdeLetras(t, "La Serena,") || fechaDesdeLetras(cabecera),
    tribunalLaSerena: posSerena >= 0 || /\bI(?:ltma|lustr[íi]sima)?\.?\s+Corte\b[\s\S]{0,40}La\s+Serena/i.test(t),
    // Encabezado de la Corte Suprema: aparece en los primeros 600 caracteres y
    // antes que la Corte de La Serena (que allí solo se cita como tribunal recurrido).
    esSuprema: posSuprema >= 0 && posSuprema < 600 && (posSerena < 0 || posSuprema < posSerena),
    sala: salaM ? salaM[1][0].toUpperCase() + salaM[1].slice(1).toLowerCase() + " Sala" : null,
    largo: t.length
  };
}

/** Ventanas de `n` palabras de un texto, para comparar citas con incisos de la prensa. */
function ventanas(texto, n) {
  const partes = texto.split(/\s*(?:\(…\)|\(\.\.\.\)|[–—]|\s-\s)\s*/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of partes) {
    const w = p.split(/\s+/);
    if (w.length <= n) { if (w.length >= 6) out.push(p); continue; }
    for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(" "));
  }
  return out;
}

/**
 * ¿Este texto es la sentencia de la ficha? Exige que al menos una cita
 * textual de la nota aparezca en el texto (ventanas de 10 palabras, sin
 * incisos) y que el texto sea de la Corte de Apelaciones de La Serena.
 */
export function verificarSentencia(ficha, texto) {
  const p = parsearSentencia(texto);
  const n = normalizar(String(texto || ""));
  const citasCoincidentes = ficha.citas.filter((c) => ventanas(c.texto, 10).some((v) => n.includes(normalizar(v)))).length;
  const frases = frasesBusqueda(ficha, 3);
  const frasesCoincidentes = frases.filter((f) => n.includes(normalizar(f))).length;
  const motivos = [];
  if (!ficha.citas.length) motivos.push("La nota no trae citas textuales: no se puede comprobar automáticamente que esta sea la sentencia. Confírmalo a mano y usa --asignar-rol.");
  else if (!citasCoincidentes) motivos.push(`Ninguna de las ${ficha.citas.length} citas textuales de la nota aparece en el texto.`);
  if (!p.tribunalLaSerena) motivos.push("El texto no menciona a la Corte de Apelaciones de La Serena.");
  if (p.esSuprema) motivos.push("El encabezado es de la Corte Suprema: es otra causa, con otro rol.");
  if (p.sala && ficha.sala && p.sala !== ficha.sala) motivos.push(`La sala del texto (${p.sala}) no coincide con la de la nota (${ficha.sala}).`);
  if (!p.rol) motivos.push("No encontré un rol en el texto.");
  const avisos = [];
  if (p.rol) {
    const anio = parseInt(p.rol.slice(-4), 10);
    const anioNota = parseInt(ficha.fechaNota.slice(0, 4), 10);
    if (anio > anioNota || anio < anioNota - 3) avisos.push(`El año del rol (${anio}) queda lejos del de la nota (${anioNota}): revísalo.`);
  }
  if (!p.fecha) avisos.push("No encontré la fecha de la sentencia en el texto.");
  return { coincide: motivos.length === 0, rol: p.rol, roles: p.roles, fecha: p.fecha, sala: p.sala, tribunalLaSerena: p.tribunalLaSerena,
    citasCoincidentes, totalCitas: ficha.citas.length, frasesCoincidentes, totalFrases: frases.length, motivos, avisos };
}

/**
 * Incorpora a la ficha el rol (y la fecha) leídos en el texto de su
 * sentencia, solo si la verificación pasa. `fuente` es de dónde salió el
 * texto (URL del Portal Unificado, OJV, nombre del archivo).
 */
export function incorporarSentencia(ficha, texto, { fuente }) {
  const v = verificarSentencia(ficha, texto);
  if (!v.coincide) {
    const e = new Error("La sentencia no se incorporó: " + v.motivos.join(" "));
    e.verificacion = v;
    throw e;
  }
  if (ficha.rol && ficha.rol !== v.rol && !v.roles.includes(ficha.rol)) {
    const e = new Error(`El rol del texto (${v.rol}) no coincide con el que informa la nota (${ficha.rol}).`);
    e.verificacion = v;
    throw e;
  }
  const g = aplicarRol(ficha, { rol: ficha.rol || v.rol, fuente, fechaSentencia: v.fecha });
  g.rolVerificacion = { fuente: String(fuente).trim(), citasCoincidentes: v.citasCoincidentes, totalCitas: v.totalCitas,
    frasesCoincidentes: v.frasesCoincidentes, totalFrases: v.totalFrases, sala: v.sala, avisos: v.avisos };
  g.pendientes = pendientes(g);
  return g;
}

const ROL_VALIDO = new RegExp("^(?:[A-Za-zÁÉÍÓÚáéíóúñ]+-)?" + NUM_ROL + "$");

/**
 * Registra el rol de un fallo cuya nota no lo traía. Exige la fuente (dónde
 * se leyó: URL de la sentencia, OJV…). Devuelve la ficha actualizada.
 */
export function aplicarRol(f, { rol, fuente, fechaSentencia = null }) {
  const r = String(rol || "").trim().replace(/^rol\s*(?:N\s*[°º.]\s*)?/i, "");
  if (!ROL_VALIDO.test(r)) throw new Error(`Rol con formato no reconocido: «${rol}» (ejemplos: 1234-2026, Protección-1234-2026, 1.069-2025)`);
  if (!String(fuente || "").trim()) throw new Error("Falta la fuente del rol (por ejemplo, la URL de la sentencia en el Portal Unificado o «OJV»)");
  if (fechaSentencia && !/^\d{4}-\d{2}-\d{2}$/.test(fechaSentencia)) throw new Error("La fecha de la sentencia debe ser AAAA-MM-DD");
  const g = { ...f, rol: r, rolTexto: `${r} (según ${String(fuente).trim()})`, rolFuente: String(fuente).trim(),
    fechaSentencia: fechaSentencia || f.fechaSentencia || null, rolVerificacion: null };
  Object.assign(g, puntuar(g));
  g.pendientes = pendientes(g);
  return g;
}

/** Lo que la nota NO permite afirmar: se verifica antes de publicar. */
function pendientes(f) {
  const p = [];
  if (!f.rol) {
    const frases = (f.frasesBusqueda || []).map((x) => `«${x}»`).join(" o ");
    p.push("Rol: la nota no lo informa y es obligatorio para publicar. Búscalo en el Portal Unificado de Sentencias"
      + (frases ? ` con la frase ${frases}` : "")
      + ", guarda el texto de la sentencia e incorpóralo con --incorporar-sentencia (o regístralo con --asignar-rol)."
      + " Mientras tanto el carrusel lleva [VERIFICAR: rol en la OJV] y sale con banda BORRADOR.");
  }
  if (!f.fechaSentencia) {
    p.push(`Fecha de la sentencia: la nota no la informa. La fecha disponible (${f.fechaNotaTexto}) es la de publicación de la nota; no presentarla como fecha del fallo.`);
  }
  p.push("Estado del fallo: la nota no dice si está firme. Puede ser revisado por la Corte Suprema; revisar en la Oficina Judicial Virtual con el rol.");
  p.push("Texto íntegro: el agente leyó la nota de prensa, no la sentencia. Todo lo que no esté en la nota no se afirma.");
  if (f.lectura === "texto") p.push("La nota se guardó como texto copiado por Claude desde la pestaña: contrasta las citas del carrusel con la página antes de publicar.");
  if (f.normas.length) p.push("Normas mencionadas en la nota (" + f.normas.join("; ") + "): confirmar el texto vigente en LeyChile antes de citarlas como ley.");
  return p;
}

// ---------------------------------------------------------------------------
// Interés para un carrusel de Choapa Justa (puntaje transparente)
// ---------------------------------------------------------------------------

export const TEMAS = [
  { id: "territorio", nombre: "Provincia de Choapa", peso: 5,
    palabras: ["los vilos", "illapel", "salamanca", "canela", "choapa", "pichidangui", "caimanes", "tilama", "mincha", "huentelauquen"] },
  { id: "municipal", nombre: "Municipal", peso: 4,
    palabras: ["municipalidad*", "municipio*", "municipal*", "alcald*", "concejo municipal", "concejal*", "patente*", "direccion de obras", "18.695"] },
  { id: "salud", nombre: "Salud", peso: 3,
    palabras: ["isapre*", "fonasa", "hospital*", "farmaco*", "medicamento*", "tratamiento*", "terapia*", "licencia* medica*", "paciente*", "cesfam", "prestacion* de salud"] },
  { id: "educacion", nombre: "Educación", peso: 3,
    palabras: ["colegio*", "liceo*", "escuela*", "estudiante*", "alumno*", "matricula*", "superintendencia de educacion", "universidad*", "sostenedor*", "establecimiento educacional"] },
  { id: "laboral", nombre: "Laboral y funcionarios", peso: 3,
    palabras: ["trabajador*", "despido*", "acoso laboral", "ley karin", "21.643", "funcionari* municipal*", "funcionari* public*",
      "sumario administrativo", "estatuto administrativo", "remuneracion*", "codigo del trabajo", "empleador*"] },
  { id: "servicios", nombre: "Agua, luz y servicios básicos", peso: 3,
    palabras: ["agua potable", "suministro de agua", "suministro electrico", "corte de suministro", "electricidad", "energia electrica", "sanitaria*", "campamento*"] },
  { id: "digital", nombre: "Honra y redes sociales", peso: 3,
    palabras: ["redes sociales", "whatsapp", "facebook", "instagram", "tiktok", "honra", "datos personales", "funa*"] },
  { id: "consumidor", nombre: "Consumidor y empresas", peso: 2,
    palabras: ["consumidor*", "sernac", "banco*", "aseguradora*", "proveedor*", "cobro* indebido*"] },
  { id: "vivienda", nombre: "Vivienda, propiedad y medio ambiente", peso: 2,
    palabras: ["vivienda*", "arriendo*", "arrendatari*", "servidumbre*", "usurpacion*", "medio ambiente", "ambiental*", "permiso de edificacion"] },
  { id: "inclusion", nombre: "Inclusión y no discriminación", peso: 2,
    palabras: ["discapacidad*", "espectro autista", "tea", "discrimina*", "ajustes razonables", "inclusion"] },
  { id: "estado", nombre: "Responsabilidad del Estado", peso: 2,
    palabras: ["falta de servicio", "indemniza*", "fisco", "consejo de defensa del estado"] }
];

// "cuidado": no identificar a nadie. "delicado": evaluar si conviene publicar.
const CUIDADO = ["menor de edad", "menores de edad", "nino*", "nina*", "adolescente*", "salud mental", "discapacidad*"];
const DELICADO = ["abuso sexual", "violacion", "femicidio", "homicidio*", "tortura*", "secuestro*", "imagenes intimas", "violencia intrafamiliar", "suicidio*"];

// Cada letra admite su variante con tilde, para buscar en el texto original
// y mostrar la palabra tal como aparece en la nota ("fármaco", no "farmaco").
const VARIANTES = { a: "[aáàâä]", e: "[eéèêë]", i: "[iíìîï]", o: "[oóòôö]", u: "[uúùûü]", n: "[nñ]" };

function reDePalabra(p) {
  const n = normalizar(p);
  const abierta = n.endsWith("*");
  const cuerpo = (abierta ? n.slice(0, -1) : n).split("").map((c) =>
    c === "*" ? "\\p{L}*" : c === " " ? "\\s+" : VARIANTES[c] || escaparRe(c)).join("");
  return new RegExp("(?<![\\p{L}\\d])" + cuerpo + (abierta ? "\\p{L}*" : "(?![\\p{L}\\d])"), "iu");
}

function coincidencias(texto, palabras) {
  const out = [];
  for (const p of palabras) {
    const m = texto.match(reDePalabra(p));
    if (m && !out.some((x) => normalizar(x) === normalizar(m[0]))) out.push(m[0]);
  }
  return out;
}

/** Puntaje para elegir qué fallo convertir en carrusel, con sus motivos. */
export function puntuar(f) {
  const texto = [f.titulo, f.bajada, ...f.parrafos].join(" ").replace(/\s+/g, " ");
  const motivos = [];
  const temas = [];
  let puntaje = 0;
  for (const t of TEMAS) {
    const pal = coincidencias(texto, t.palabras);
    if (pal.length) {
      temas.push({ id: t.id, nombre: t.nombre, palabras: pal });
      puntaje += t.peso;
      motivos.push({ puntos: t.peso, texto: `${t.nombre} (${pal.join(", ")})` });
    }
  }
  const accion = normalizar(f.accion);
  if (/proteccion|accion constitucional/.test(accion)) {
    puntaje += 2;
    motivos.push({ puntos: 2, texto: "Recurso de protección: una herramienta que cualquier persona puede usar" });
  }
  if (/^(acogi|orden|prohibi|concedi|ampar)/.test(normalizar(f.resultado))) {
    puntaje += 1;
    motivos.push({ puntos: 1, texto: `Resultado con mensaje práctico (${f.resultado})` });
  }
  if (f.rol) { puntaje += 1; motivos.push({ puntos: 1, texto: "Rol disponible (se puede citar)" }); }
  if (f.citas.length >= 2) { puntaje += 1; motivos.push({ puntos: 1, texto: `${f.citas.length} citas textuales del fallo` }); }
  const cuidado = coincidencias(texto, CUIDADO);
  const delicado = coincidencias(texto, DELICADO);
  if (delicado.length) {
    puntaje -= 3;
    motivos.push({ puntos: -3, texto: `Tema delicado (${delicado.join(", ")}): evaluar si conviene publicarlo` });
  }
  return { puntaje, motivos, temas, cuidado, delicado };
}

/** Recomendados para carrusel: los de mayor puntaje sobre el mínimo. */
export function elegirRecomendados(fichas, max = CONFIG.maxRecomendados, minimo = CONFIG.puntajeMinimo) {
  return [...fichas]
    .filter((f) => f.puntaje >= minimo)
    .sort((a, b) => b.puntaje - a.puntaje || b.fechaNota.localeCompare(a.fechaNota))
    .slice(0, max)
    .map((f) => f.id);
}

// ---------------------------------------------------------------------------
// Base del carrusel (para el skill carrusel-juridico-choapajusta)
// ---------------------------------------------------------------------------

export const slugFicha = (f) => `${f.fechaNota}_${f.id}`;

export function fuenteCita(f) {
  return [
    "C. A. de La Serena",
    f.sala,
    f.rol ? `Rol ${f.rol}` : "Rol [VERIFICAR: rol en la OJV]"
  ].filter(Boolean).join(" · ");
}

/** Cita sugerida: literal, de hasta 220 caracteres, preferentemente la que decide. */
export function citaSugerida(f) {
  const decide = /arbitrari|ilegal|se acoge|se rechaza|se confirma|se revoca|ordena|derecho|no equivale|no puede/i;
  const cortas = f.citas.filter((c) => c.texto.length <= 220);
  const elegida = cortas.find((c) => decide.test(c.texto))
    || [...cortas].sort((a, b) => a.texto.length - b.texto.length)[0];
  if (elegida) return elegida.texto;
  if (!f.citas.length) return null;
  const t = f.citas[0].texto;
  const corte = t.lastIndexOf(" ", 200);
  return t.slice(0, corte > 80 ? corte : 200).replace(/[,;:]$/, "") + " (…)";
}

/** spec.json inicial: Claude reemplaza cada [REDACTAR…] usando solo la ficha. */
export function specBase(f) {
  const cita = citaSugerida(f);
  return {
    tema: slugFicha(f),
    categoria: "JURISPRUDENCIA · C. A. LA SERENA",
    paleta: "claro",
    slides: [
      { tipo: "portada",
        titulo: `[REDACTAR: pregunta o gancho de hasta 60 caracteres, a partir de «${f.titulo}»]`,
        gancho: "[REDACTAR: hasta 80 caracteres, la consecuencia práctica]",
        swipe: "Desliza para entender el fallo" },
      { tipo: "contenido", paso: 1, encabezado: "Los hechos",
        titulo: "[REDACTAR: hasta 55 caracteres]",
        texto: "[REDACTAR: qué pasó, en simple, con lo que dice la nota (párrafo 1)]" },
      { tipo: "contenido", paso: 2, encabezado: "Qué se discutía",
        titulo: "[REDACTAR: hasta 55 caracteres]",
        texto: "[REDACTAR: qué pidió quien recurrió y qué respondió la otra parte, según la nota]" },
      { tipo: "cita", encabezado: "Qué dijo la Corte",
        texto: cita || "[REDACTAR: copia literal de una cita de la ficha]",
        fuente: fuenteCita(f) },
      { tipo: "contenido", paso: 3, encabezado: "Por qué importa",
        titulo: "[REDACTAR: hasta 55 caracteres]",
        texto: "[REDACTAR: el criterio de la Corte, explicado para una persona común]" },
      { tipo: "contenido", paso: 4, encabezado: "Qué puedes hacer",
        titulo: "[REDACTAR: hasta 55 caracteres]",
        texto: "[REDACTAR: orientación general, sin prometer resultados ni dar consejo para un caso]" },
      { tipo: "cierre",
        titulo: "¿Te pasó algo parecido?",
        cta: "Cada caso es distinto: consulta el tuyo.",
        fuentes: [
          ["Corte de Apelaciones de La Serena", f.sala, f.rol ? `rol ${f.rol}` : "rol [VERIFICAR: rol en la OJV]"].filter(Boolean).join(", "),
          `Nota del Poder Judicial, ${f.fechaNotaTexto} (pjud.cl)`
        ],
        recordatorio: "Un fallo es criterio de la Corte, no una ley" }
    ]
  };
}

/** Guía de redacción del carrusel para Claude (brief.md). */
export function construirBrief(f) {
  const l = [];
  l.push(`# Carrusel: ${f.titulo}`, "");
  l.push("Fuente única: `ficha.json` (nota de prensa del Poder Judicial). No agregues hechos, normas, cifras, roles ni nombres que no estén ahí.", "");
  l.push("## Ficha", "");
  l.push(`- Tribunal: ${f.tribunal}${f.sala ? " — " + f.sala : ""}`);
  if (f.integracion) l.push(`- Integración: ${f.integracion}`);
  l.push(`- Rol: ${f.rol ? f.rol + " (según la nota: «" + f.rolTexto + "»)" : "no informado en la nota → [VERIFICAR: rol en la OJV]"}`);
  if (f.accion) l.push(`- Acción o recurso: ${f.accion}`);
  if (f.resultado) l.push(`- Resultado: ${f.resultado}`);
  if (f.votacion) l.push(`- Votación: ${f.votacion}`);
  l.push(`- Nota publicada: ${f.fechaNotaTexto} — ${f.url}`, "");
  l.push("## Bajada (literal)", "", `> ${f.bajada}`, "");
  l.push("## Citas textuales del fallo disponibles", "");
  if (f.citas.length) f.citas.forEach((c, i) => l.push(`${i + 1}. (párrafo ${c.parrafo}) “${c.texto}”`));
  else l.push("La nota no trae citas textuales: la slide `cita` debe usar una frase literal de la bajada o de un párrafo, o quedar fuera.");
  l.push("");
  l.push("## Guion sugerido (arco «Sentencia o causa»)", "");
  l.push("1. **Portada**: el conflicto como pregunta cotidiana. No repitas el título de la nota.");
  l.push("2. **Los hechos** (paso 1): qué pasó, en simple.");
  l.push("3. **Qué se discutía** (paso 2).");
  l.push("4. **Qué dijo la Corte** (`cita`): texto LITERAL de la ficha (puedes acortar con «(…)»); la fuente ya viene puesta.");
  l.push("5. **Por qué importa** (paso 3): el criterio, como criterio de la Corte («La Corte consideró que…»), no como ley.");
  l.push("6. **Qué puedes hacer** (paso 4): orientación general; nada de plazos o requisitos que no estén en la ficha.");
  l.push("7. **Cierre**: CTA y fuentes (ya vienen puestas).", "");
  l.push("## Antes de publicar", "");
  f.pendientes.forEach((p) => l.push(`- ${p}`));
  if (f.cuidado.length) l.push(`- Cuidado (${f.cuidado.join(", ")}): no identifiques a ninguna persona.`);
  if (f.delicado.length) l.push(`- Tema delicado (${f.delicado.join(", ")}): evalúa si conviene publicarlo.`);
  l.push("", "## Validación", "", "```bash", "node agente-jurisprudencia-serena/validar-carrusel.mjs spec.json ficha.json captions.md", "```", "");
  return l.join("\n");
}

// ---------------------------------------------------------------------------
// Validación de un carrusel contra su ficha (que no agregue nada)
// ---------------------------------------------------------------------------

const INSTITUCIONES = [
  "Corte Suprema", "Tribunal Constitucional", "Contraloría", "Dirección del Trabajo", "Inspección del Trabajo",
  "SERNAC", "Superintendencia", "Fiscalía", "Ministerio Público", "Defensoría", "Consejo de Defensa del Estado",
  "Isapre", "Fonasa", "Carabineros", "PDI", "Gendarmería", "Tesorería", "SII", "Registro Civil"
];

/** Grupos de dígitos (sin separador de miles), para comparar cifras. */
function numeros(texto) {
  return (String(texto || "").replace(/(\d)\.(?=\d{3}\b)/g, "$1").match(/\d+/g) || []);
}

function textosDelSpec(spec) {
  const out = [];
  (spec.slides || []).forEach((s, i) => {
    for (const [k, v] of Object.entries(s)) {
      if (k === "tipo" || k === "paso") continue;
      (Array.isArray(v) ? v : [v]).forEach((x) => { if (typeof x === "string") out.push({ donde: `slide ${i + 1} (${s.tipo}).${k}`, texto: x }); });
    }
  });
  // "tema" es solo el nombre de la carpeta; no aparece en las láminas.
  if (typeof spec.categoria === "string") out.push({ donde: "categoria", texto: spec.categoria });
  return out;
}

const sinVerificar = (t) => String(t).replace(/\[VERIFICAR[^\]]*\]/g, " ");

/**
 * Revisa que el carrusel (spec y captions) se apoye solo en la ficha.
 * Devuelve { ok, errores, avisos }.
 */
export function validarCarrusel(spec, ficha, captions = null) {
  const errores = [];
  const avisos = [];
  const fuenteTexto = [ficha.titulo, ficha.bajada, ...ficha.parrafos, ficha.fechaNotaTexto, ficha.sala, ficha.rol,
    ficha.fechaSentencia ? isoATexto(ficha.fechaSentencia) : ""].filter(Boolean).join(" \n ");
  const fuenteNorm = normalizar(fuenteTexto);
  const permitidos = new Set(numeros(fuenteTexto));

  const slides = Array.isArray(spec && spec.slides) ? spec.slides : [];
  if (slides.length < 3 || slides.length > 12) errores.push(`El carrusel debe tener entre 3 y 12 slides (tiene ${slides.length}).`);
  if (!slides.length || slides[0].tipo !== "portada" || !slides[0].titulo) errores.push("La primera slide debe ser una portada con título.");

  const piezas = textosDelSpec(spec || {});
  if (captions !== null) piezas.push({ donde: "captions", texto: String(captions) });

  for (const { donde, texto } of piezas) {
    if (/\[REDACTAR/i.test(texto)) errores.push(`${donde}: quedó un [REDACTAR] sin completar.`);
    const limpio = sinVerificar(texto).replace(/#\S+/g, " ").replace(/https?:\/\/\S+/g, " ");
    for (const n of numeros(limpio)) {
      if (!permitidos.has(n)) errores.push(`${donde}: la cifra «${n}» no aparece en la ficha. Usa la expresión de la nota o márcala [VERIFICAR: …].`);
    }
    const norm = normalizar(limpio);
    for (const inst of INSTITUCIONES) {
      const k = normalizar(inst);
      if (new RegExp("\\b" + escaparRe(k) + "\\b").test(norm) && !new RegExp("\\b" + escaparRe(k) + "\\b").test(fuenteNorm)) {
        errores.push(`${donde}: nombra «${inst}», que no aparece en la ficha.`);
      }
    }
  }

  const citas = slides.filter((s) => s.tipo === "cita");
  if (!citas.length) avisos.push("No hay slide de cita: el carrusel no muestra lo que dijo la Corte con sus palabras.");
  citas.forEach((s) => {
    const fragmentos = String(s.texto || "")
      .replace(/^["“«\s]+|["”»\s]+$/g, "")
      .split(/\s*(?:\(…\)|\(\.\.\.\)|\[…\]|\[\.\.\.\]|…)\s*/)
      .map((x) => x.replace(/^["“«\s]+|["”»\s]+$/g, "").trim())
      .filter(Boolean);
    const largo = fragmentos.join("").length;
    if (largo < 30) errores.push("La slide de cita debe copiar al menos 30 caracteres literales de la ficha.");
    fragmentos.forEach((fr) => {
      if (!fuenteNorm.includes(normalizar(fr))) errores.push(`La cita no es literal: «${fr.slice(0, 80)}${fr.length > 80 ? "…" : ""}» no está en la nota.`);
    });
    const fuente = String(s.fuente || "");
    if (!/La\s+Serena/i.test(fuente)) errores.push("La fuente de la cita debe decir «C. A. de La Serena».");
    if (ficha.rol ? !fuente.includes(ficha.rol) : !/\[VERIFICAR/.test(fuente)) {
      errores.push(ficha.rol ? `La fuente de la cita debe incluir el rol ${ficha.rol}.` : "La fuente de la cita debe llevar [VERIFICAR: rol en la OJV] (la nota no informa el rol).");
    }
  });

  if (captions !== null) {
    if (!/fuente\s*:[^\n]*La\s+Serena/i.test(String(captions))) errores.push("Los captions deben tener una línea «Fuente: … Corte de Apelaciones de La Serena …».");
    if (!/#choapajusta\b/i.test(String(captions))) avisos.push("Los captions no incluyen #choapajusta.");
  }
  if (!ficha.rol) avisos.push("Sin rol en la nota: el carrusel saldrá con banda BORRADOR hasta verificarlo en la OJV.");
  if (ficha.cuidado && ficha.cuidado.length) avisos.push(`Cuidado (${ficha.cuidado.join(", ")}): revisa que no se pueda identificar a nadie.`);
  if (ficha.delicado && ficha.delicado.length) avisos.push(`Tema delicado (${ficha.delicado.join(", ")}): evalúa si conviene publicarlo.`);

  return { ok: errores.length === 0, errores: [...new Set(errores)], avisos };
}

// ---------------------------------------------------------------------------
// Reporte (correo HTML + Markdown)
// ---------------------------------------------------------------------------

const ADVERTENCIAS = [
  "Fuente: notas de prensa del Poder Judicial sobre fallos de la Corte de Apelaciones de La Serena. Es una selección que hace el propio Poder Judicial, no el total de los fallos de la Corte.",
  "El agente no leyó las sentencias íntegras: el Portal Unificado de Sentencias (juris.pjud.cl) no es accesible desde el entorno de Claude. Todo lo que no está en la nota se marca como pendiente.",
  "La fecha que se muestra es la de publicación de la nota, no la de la sentencia.",
  "Un fallo es el criterio de la Corte en ese caso, no una regla general, y puede no estar firme."
];

function periodoTexto(p) {
  return p.desde === p.hasta ? isoATexto(p.desde) : `${isoATexto(p.desde)} al ${isoATexto(p.hasta)}`;
}

export function asuntoReporte(d) {
  const base = `⚖️ Fallos C.A. La Serena · ${periodoTexto(d.periodo)}`;
  if (d.accion === "aviso") return `${base} — no se pudo leer pjud.cl`;
  if (!d.fallos.length) return `${base} — sin fallos nuevos de la Corte`;
  const n = d.fallos.length;
  const r = d.recomendados.length;
  return `${base} — ${n} ${n === 1 ? "fallo" : "fallos"} · ${r} para carrusel`;
}

const E = escaparHtml;
const estilo = {
  cuerpo: "font-family:Arial,Helvetica,sans-serif;color:#17171a;max-width:760px;margin:0 auto;line-height:1.45",
  h1: "font-size:20px;margin:0 0 4px",
  h2: "font-size:17px;margin:28px 0 8px;border-bottom:2px solid #17171a;padding-bottom:4px",
  h3: "font-size:15px;margin:18px 0 6px",
  tarjeta: "border:1px solid #d4d4d9;border-radius:6px;padding:12px 14px;margin:10px 0",
  dato: "color:#55555c;font-size:13px",
  cita: "border-left:3px solid #85858c;margin:6px 0;padding:2px 10px;color:#33333a;font-style:italic",
  aviso: "background:#fff4e5;border:1px solid #f0c27a;border-radius:6px;padding:8px 12px;margin:10px 0;font-size:13px",
  ok: "color:#1a7f37;font-weight:bold",
  mal: "color:#b42318;font-weight:bold"
};

function datosFichaHtml(f) {
  const filas = [
    ["Tribunal", E(`${f.tribunal}${f.sala ? " — " + f.sala : ""}`)],
    ["Rol", f.rol
      ? `${E(f.rol)} <span style="${estilo.dato}">${f.rolFuente && f.rolFuente !== "Nota de prensa del Poder Judicial"
        ? `(fuente: ${E(f.rolFuente)}${f.rolVerificacion ? ` · <span style="${estilo.ok}">verificado</span>: ${f.rolVerificacion.citasCoincidentes} de ${f.rolVerificacion.totalCitas} citas de la nota aparecen en la sentencia` : " · sin verificación automática"})`
        : `(según la nota: «${E(f.rolTexto)}»)`}</span>`
      : `<span style="${estilo.mal}">PENDIENTE — obligatorio para publicar</span> · la nota no lo informa`],
    ...(f.fechaSentencia ? [["Fecha de la sentencia", isoATexto(f.fechaSentencia)]] : []),
    ["Acción o recurso", E(f.accion || "—")],
    ["Resultado", E(f.resultado || "—")],
    ["Votación", E(f.votacion || "—")],
    ["Integración", E(f.integracion || "—")],
    ["Nota publicada", `${f.fechaNotaTexto} · <a href="${E(f.url)}">${E(f.url)}</a>`],
    ...(f.documento ? [["Documento adjunto", `<a href="${E(f.documento)}">${E(f.documento)}</a> (puede traer el rol)`]] : [])
  ];
  return `<table style="border-collapse:collapse;font-size:13px">${filas.map(([k, v]) =>
    `<tr><td style="padding:2px 10px 2px 0;color:#55555c;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:2px 0">${v}</td></tr>`).join("")}</table>`;
}

function guionHtml(spec) {
  return `<ol style="font-size:13px;padding-left:20px">${(spec.slides || []).map((s) => {
    const partes = [s.encabezado, s.titulo, s.gancho, s.texto, s.dato, s.cta, s.recordatorio]
      .filter(Boolean).map((x) => E(String(x).replace(/\*\*/g, "")));
    const fuente = s.fuente ? `<br><span style="${estilo.dato}">Fuente: ${E(s.fuente)}</span>` : "";
    const fuentes = Array.isArray(s.fuentes) && s.fuentes.length ? `<br><span style="${estilo.dato}">Fuentes: ${E(s.fuentes.join(" · "))}</span>` : "";
    return `<li><b>${E(s.tipo)}</b>: ${partes.join(" — ")}${fuente}${fuentes}</li>`;
  }).join("")}</ol>`;
}

function recomendadoHtml(f, i, carrusel) {
  const h = [];
  h.push(`<div style="${estilo.tarjeta}">`);
  h.push(`<h3 style="${estilo.h3}">${i + 1}. ${E(f.titulo)}</h3>`);
  h.push(datosFichaHtml(f));
  if (!f.rol) h.push(cajaRol(f));
  h.push(`<p style="font-size:13px;margin:8px 0 2px"><b>Por qué sirve para un carrusel</b> (puntaje ${f.puntaje}):</p><ul style="font-size:13px;margin:2px 0">${f.motivos.map((m) => `<li>${m.puntos > 0 ? "+" : ""}${m.puntos} · ${E(m.texto)}</li>`).join("")}</ul>`);
  h.push(`<p style="font-size:13px;margin:8px 0 2px"><b>Bajada de la nota</b> (literal):</p><div style="${estilo.cita}">${E(f.bajada)}</div>`);
  if (f.citas.length) {
    h.push(`<p style="font-size:13px;margin:8px 0 2px"><b>Citas textuales del fallo</b> (para la slide de cita):</p>`);
    f.citas.slice(0, 4).forEach((c) => h.push(`<div style="${estilo.cita}">“${E(c.texto)}”</div>`));
    if (f.citas.length > 4) h.push(`<p style="${estilo.dato}">… y ${f.citas.length - 4} más en la ficha.</p>`);
  }
  if (carrusel && carrusel.spec) {
    const v = carrusel.validacion;
    h.push(`<p style="font-size:13px;margin:10px 0 2px"><b>Guion del carrusel</b> — ${v.ok ? `<span style="${estilo.ok}">✅ validado contra la ficha</span>` : `<span style="${estilo.mal}">❌ no pasó la validación: no usar</span>`}</p>`);
    if (!v.ok) h.push(`<ul style="font-size:13px;color:#b42318">${v.errores.map((e) => `<li>${E(e)}</li>`).join("")}</ul>`);
    h.push(guionHtml(carrusel.spec));
    if (carrusel.captions) h.push(`<p style="font-size:13px;margin:8px 0 2px"><b>Caption de Instagram y Facebook</b>:</p><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:#f4f4f5;padding:8px 10px;border-radius:6px">${E(carrusel.captions)}</pre>`);
    if (v.avisos.length) h.push(`<div style="${estilo.aviso}">${v.avisos.map(E).join("<br>")}</div>`);
  }
  h.push(`<p style="font-size:13px;margin:8px 0 2px"><b>Antes de publicar</b>:</p><ul style="font-size:13px;margin:2px 0">${f.pendientes.map((p) => `<li>${E(p)}</li>`).join("")}${f.cuidado.length ? `<li>Cuidado (${E(f.cuidado.join(", "))}): no identificar a ninguna persona.</li>` : ""}${f.delicado.length ? `<li>Tema delicado (${E(f.delicado.join(", "))}): evaluar si conviene publicarlo.</li>` : ""}</ul>`);
  h.push("</div>");
  return h.join("\n");
}

/** Instrucciones para obtener el rol que la nota no trae. */
function cajaRol(f) {
  const frases = (f.frasesBusqueda || []).map((x) => `<li><b>«${E(x)}»</b></li>`).join("");
  return `<div style="${estilo.aviso}"><b>Cómo obtener el rol:</b> en el Portal Unificado de Sentencias
(<a href="https://juris.pjud.cl/busqueda?Corte_Suprema">juris.pjud.cl</a>, pestaña «Corte de Apelaciones») busca
${frases ? `una de estas frases textuales del fallo:<ul style="margin:4px 0">${frases}</ul>` : "las palabras del título. "}
Abre la sentencia de la Corte de Apelaciones de La Serena${f.sala ? ", " + E(f.sala) : ""}, y guarda su texto
(o su PDF) en la carpeta de entrada con el nombre <code>sentencia-${E(f.id)}.txt</code>. El agente comprueba que las
citas de la nota están en ese texto, toma el rol y la fecha de la sentencia y quita el BORRADOR del carrusel.
${f.documento ? `También revisa el documento adjunto a la nota. ` : ""}Si prefieres, pide a Claude: «el rol del fallo ${E(f.id)} es …», con la URL de la sentencia.</div>`;
}

function fichaCortaHtml(f) {
  return `<div style="${estilo.tarjeta}"><b>${E(f.titulo)}</b><br><span style="${estilo.dato}">${f.fechaNotaTexto} · ${E(f.sala || "Sala no informada")} · ${f.rol ? "Rol " + E(f.rol) : "rol PENDIENTE"} · ${E(f.accion || "acción no informada")} · puntaje ${f.puntaje}${f.temas.length ? " · " + E(f.temas.map((t) => t.nombre).join(", ")) : ""}</span><br><a href="${E(f.url)}">${E(f.url)}</a></div>`;
}

/**
 * Arma el correo. `d` = { accion, hoy, periodo, fuente:{estado,error,total},
 * fallos, recomendados, noLeidas, descartadas, carruseles }.
 */
export function construirReporte(d) {
  const asunto = asuntoReporte(d);
  const porId = new Map(d.fallos.map((f) => [f.id, f]));
  const recomendados = d.recomendados.map((id) => porId.get(id)).filter(Boolean);
  const otros = d.fallos.filter((f) => !d.recomendados.includes(f.id))
    .sort((a, b) => b.puntaje - a.puntaje || b.fechaNota.localeCompare(a.fechaNota));
  const carruseles = d.carruseles || {};

  const h = [];
  h.push(`<div style="${estilo.cuerpo}">`);
  h.push(`<h1 style="${estilo.h1}">⚖️ Fallos de la Corte de Apelaciones de La Serena</h1>`);
  h.push(`<p style="${estilo.dato}">Período: ${periodoTexto(d.periodo)} (fecha de publicación de la nota) · Generado el ${isoATexto(d.hoy)}</p>`);

  if (d.accion === "aviso") {
    h.push(`<div style="${estilo.aviso}"><b>No se pudo leer la lista de fallos de pjud.cl.</b><br>${E(d.fuente.error || "")}<br>Revisión manual: <a href="${CONFIG.baseUrl}${CONFIG.rutaLista}">${CONFIG.baseUrl}${CONFIG.rutaLista}</a> (filtro Jurisdicción: C.A de La Serena; Tipo noticia: Noticias sobre fallos).</div>`);
  } else {
    h.push(`<p style="font-size:14px">${d.fuente.modo === "carpeta" ? "Notas guardadas a mano (modo carpeta)" : "Notas sobre fallos de la jurisdicción en el período"}: <b>${d.fuente.enPeriodo}</b>. De la Corte de Apelaciones de La Serena: <b>${d.fallos.length}</b>. Descartadas por ser de otro tribunal o no ser un fallo: <b>${d.descartadas.length}</b>.${d.noLeidas.length ? ` No leídas: <b>${d.noLeidas.length}</b>.` : ""}</p>`);
    if (!d.fallos.length && !d.noLeidas.length) {
      h.push(`<p>No hubo notas sobre fallos de la Corte de Apelaciones de La Serena en el período. No hay material nuevo para carruseles.</p>`);
    }
    if (recomendados.length) {
      h.push(`<h2 style="${estilo.h2}">⭐ Recomendados para carrusel</h2>`);
      recomendados.forEach((f, i) => h.push(recomendadoHtml(f, i, carruseles[f.id])));
    } else if (d.fallos.length) {
      h.push(`<p>Ningún fallo del período alcanzó el puntaje mínimo (${CONFIG.puntajeMinimo}) para recomendarlo como carrusel.</p>`);
    }
    if (otros.length) {
      h.push(`<h2 style="${estilo.h2}">Otros fallos de la Corte en el período</h2>`);
      otros.forEach((f) => h.push(fichaCortaHtml(f)));
    }
    if (d.noLeidas.length) {
      h.push(`<h2 style="${estilo.h2}">No leídas (revisar a mano)</h2><ul style="font-size:13px">${d.noLeidas.map((x) =>
        `<li>${x.item.fechaNota ? isoATexto(x.item.fechaNota) + " · " : ""}${E(x.item.titulo)} — <i>${E(x.motivo)}</i>${x.item.url ? `<br><a href="${E(x.item.url)}">${E(x.item.url)}</a>` : ""}</li>`).join("")}</ul>`);
    }
    if (d.descartadas.length) {
      h.push(`<h2 style="${estilo.h2}">Descartadas (no son fallos de la Corte)</h2><ul style="font-size:12px;color:#55555c">${d.descartadas.map((x) =>
        `<li>${isoATexto(x.item.fechaNota)} · ${E(x.item.titulo)} — ${E(x.motivo)}${x.item.url ? ` · <a href="${E(x.item.url)}">ver</a>` : ""}</li>`).join("")}</ul>`);
    }
  }
  if (d.sentencias && d.sentencias.length) {
    h.push(`<h2 style="${estilo.h2}">Sentencias en la carpeta</h2><ul style="font-size:13px">${d.sentencias.map((x) =>
      `<li><b>${E(x.archivo)}</b> — ${x.estado === "incorporada" ? `<span style="${estilo.ok}">incorporada</span> a la nota ${E(x.nota)}: rol ${E(x.rol)}${x.fecha ? ", sentencia del " + isoATexto(x.fecha) : ""}` : `<span style="${estilo.mal}">${E(x.estado)}</span>`}${x.detalle ? ` · ${E(x.detalle)}` : ""}</li>`).join("")}</ul>`);
  }
  h.push(`<h2 style="${estilo.h2}">Advertencias</h2><ul style="font-size:12px;color:#55555c">${ADVERTENCIAS.map((a) => `<li>${E(a)}</li>`).join("")}</ul>`);
  h.push(`<p style="font-size:12px;color:#85858c">Generado por el agente Jurisprudencia C.A. La Serena (Claude). Para convertir un recomendado en láminas, pide a Claude: «renderiza el carrusel del fallo &lt;número de nota&gt;».</p>`);
  h.push("</div>");

  return { asunto, html: h.join("\n"), md: construirMarkdown(d, asunto, recomendados, otros, carruseles) };
}

function construirMarkdown(d, asunto, recomendados, otros, carruseles) {
  const l = [`# ${asunto}`, "", `Período: ${periodoTexto(d.periodo)} (fecha de publicación de la nota). Generado el ${isoATexto(d.hoy)}.`, ""];
  if (d.accion === "aviso") {
    l.push(`**No se pudo leer la lista de fallos de pjud.cl.** ${d.fuente.error || ""}`, "");
  } else {
    l.push(`Notas sobre fallos en el período: ${d.fuente.enPeriodo}. De la Corte: ${d.fallos.length}. Descartadas: ${d.descartadas.length}. No leídas: ${d.noLeidas.length}.`, "");
    if (recomendados.length) {
      l.push("## ⭐ Recomendados para carrusel", "");
      recomendados.forEach((f, i) => {
        l.push(`### ${i + 1}. ${f.titulo}`, "");
        l.push(`- ${f.tribunal}${f.sala ? " — " + f.sala : ""} · ${f.rol ? "Rol " + f.rol + (f.rolFuente ? ` (${f.rolFuente})` : "") : "**Rol PENDIENTE** (obligatorio para publicar)"} · ${f.accion || "acción no informada"} · ${f.resultado || ""}`);
        if (!f.rol && f.frasesBusqueda && f.frasesBusqueda.length) l.push(`- Buscar el rol en juris.pjud.cl (Corte de Apelaciones) con: ${f.frasesBusqueda.map((x) => `«${x}»`).join(" · ")}`);
        l.push(`- Nota del ${f.fechaNotaTexto}: ${f.url}`);
        l.push(`- Puntaje ${f.puntaje}: ${f.motivos.map((m) => `${m.puntos > 0 ? "+" : ""}${m.puntos} ${m.texto}`).join("; ")}`, "");
        l.push(`> ${f.bajada}`, "");
        const c = carruseles[f.id];
        if (c && c.spec) {
          l.push(`**Guion** — ${c.validacion.ok ? "✅ validado contra la ficha" : "❌ no pasó la validación: " + c.validacion.errores.join(" | ")}`, "");
          c.spec.slides.forEach((s, j) => l.push(`${j + 1}. **${s.tipo}**: ${[s.encabezado, s.titulo, s.gancho, s.texto, s.dato, s.cta].filter(Boolean).join(" — ")}${s.fuente ? ` _(Fuente: ${s.fuente})_` : ""}`));
          l.push("");
        }
      });
    }
    if (otros.length) {
      l.push("## Otros fallos de la Corte", "");
      otros.forEach((f) => l.push(`- ${f.fechaNotaTexto} · ${f.titulo} · ${f.rol ? "Rol " + f.rol : "rol PENDIENTE"} · puntaje ${f.puntaje} · ${f.url}`));
      l.push("");
    }
    if (d.noLeidas.length) {
      l.push("## No leídas", "");
      d.noLeidas.forEach((x) => l.push(`- ${x.item.titulo} — ${x.motivo} · ${x.item.url}`));
      l.push("");
    }
    if (d.descartadas.length) {
      l.push("## Descartadas (no son fallos de la Corte)", "");
      d.descartadas.forEach((x) => l.push(`- ${isoATexto(x.item.fechaNota)} · ${x.item.titulo} — ${x.motivo}`));
      l.push("");
    }
  }
  if (d.sentencias && d.sentencias.length) {
    l.push("## Sentencias en la carpeta", "");
    d.sentencias.forEach((x) => l.push(`- ${x.archivo} — ${x.estado}${x.nota ? ` (nota ${x.nota}, rol ${x.rol})` : ""}${x.detalle ? ` · ${x.detalle}` : ""}`));
    l.push("");
  }
  l.push("## Advertencias", "", ...ADVERTENCIAS.map((a) => `- ${a}`), "");
  return l.join("\n");
}
