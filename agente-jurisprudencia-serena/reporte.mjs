#!/usr/bin/env node
// Agente Jurisprudencia C.A. La Serena — ejecutor para Claude (rutina o skill).
//
// Lee en www.pjud.cl la lista "Noticias sobre fallos" de la jurisdicción
// C.A. de La Serena, se queda solo con las decisiones de la Corte de
// Apelaciones de La Serena y deja listo el reporte para crear carruseles de
// Instagram. Este programa no envía correos ni escribe el texto de los
// carruseles: eso lo hace Claude siguiendo SKILL.md.
//
// Uso:
//   node reporte.mjs [--salida <dir>] [--dias-anteriores 7]
//   node reporte.mjs --desde AAAA-MM-DD --hasta AAAA-MM-DD [--salida <dir>]
//   node reporte.mjs --entrada <carpeta> [--salida <dir>]  (modo carpeta: notas
//                                           guardadas desde el navegador, .html o .txt)
//   node reporte.mjs --por-leer <carpeta>  (modo navegador: qué notas de la lista
//                                           guardada hay que abrir)
//   node reporte.mjs --componer <dir>      (vuelve a armar el reporte con los
//                                           carruseles que Claude escribió)
//   node reporte.mjs --incorporar-sentencia <dir> --nota <número> --sentencia <archivo .txt|.pdf>
//                    [--fuente-rol <URL>]   (rol y fecha leídos en la sentencia, verificados
//                                            contra las citas de la nota)
//   node reporte.mjs --asignar-rol <dir> --nota <número> --rol <rol> --fuente-rol <fuente>
//                    [--fecha-sentencia AAAA-MM-DD]   (rol confirmado a mano)
// Opciones: --hoy AAAA-MM-DD, --max-notas 12, --pausa-seg 15, --base-url <url>
//
// pjud.cl protege el sitio: rechaza lecturas seguidas y puede pedir una
// verificación humana (CAPTCHA) a los navegadores automatizados. El agente se
// identifica, lee lo mínimo (la lista y las notas del período), espera entre
// una nota y otra y, ante un rechazo o una verificación, se detiene: lo que
// falta queda como "no leído", con su enlace. No resuelve ni evade la
// verificación; para esos casos está el modo carpeta (--entrada), con páginas
// que una persona abrió y guardó desde su navegador.
//
// Escribe en <dir>: reporte.html, reporte.md, resultado.json, datos.json,
// fichas/<fecha>_<id>.json y, por cada recomendado, carruseles/<fecha>_<id>/
// con ficha.json, brief.md y spec.base.json. Código de salida 0 = reporte o
// aviso listo; 1 = falla interna (JSON con accion "error").

import { writeFileSync, readFileSync, mkdirSync, existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import * as J from "./jurisprudencia.mjs";

const require = createRequire(import.meta.url);

function cargarPlaywright() {
  for (const ruta of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try { return require(ruta); } catch { /* siguiente */ }
  }
  throw new Error("No encontré Playwright (lo necesita el navegador que lee pjud.cl).");
}

// El navegador conserva su User-Agent real ("HeadlessChrome") y agrega el
// nombre del agente. No se disfraza de navegador de escritorio: si el sitio
// decide pedir verificación humana a los automatizados, el agente lo informa.
const IDENTIFICACION = "AgenteJurisprudenciaSerena/1.0 (reporte semanal personal)";

// ---------------------------------------------------------------------------
// Lectura del sitio (un solo navegador, sin reintentos ante un rechazo)
// ---------------------------------------------------------------------------

async function abrirSitio(baseUrl) {
  const { chromium } = cargarPlaywright();
  const navegador = await chromium.launch();
  const previo = await navegador.newPage();
  const ua = await previo.evaluate(() => navigator.userAgent);
  await previo.close();
  const contexto = await navegador.newContext({ userAgent: `${ua} ${IDENTIFICACION}` });
  const pagina = await contexto.newPage();
  return {
    async html(url) {
      const r = await pagina.goto(url, { timeout: 90000, waitUntil: "networkidle" });
      return { http: r ? r.status() : 0, html: await pagina.content() };
    },
    async lista() {
      return pagina.evaluate(async ({ ruta, jurisdiccion, tipo }) => {
        const fd = new FormData();
        fd.append("id_jurisdiction", jurisdiccion);
        fd.append("new_type_id", tipo);
        const r = await fetch(ruta, { method: "POST", body: fd, headers: { "X-Requested-With": "XMLHttpRequest" } });
        return { http: r.status, html: await r.text() };
      }, { ruta: baseUrl + J.CONFIG.rutaAjax, jurisdiccion: J.CONFIG.jurisdiccion, tipo: J.CONFIG.tipoNoticia });
    },
    cerrar: () => navegador.close()
  };
}

const esperar = (seg) => new Promise((r) => setTimeout(r, seg * 1000));

function datosVacios(hoy, periodo, modo) {
  return { accion: "reporte", hoy, periodo, fuente: { estado: "ok", modo, error: "", total: 0, enPeriodo: 0 },
    fallos: [], recomendados: [], noLeidas: [], descartadas: [], carruseles: {} };
}

/**
 * Común al sitio y a la carpeta: criba por título, lee cada nota con
 * `leerNota(item)` (→ HTML o null si no está), confirma que decidió la Corte
 * y arma la ficha. Ante un rechazo o una verificación humana se detiene.
 */
async function procesarNotas(datos, items, leerNota, { maxNotas = 12, pausaSeg = 0 } = {}) {
  const porLeer = [];
  for (const item of items) {
    const c = J.clasificarTitulo(item.titulo);
    if (c.tipo === "otro") datos.descartadas.push({ item, motivo: c.motivo });
    else porLeer.push(item);
  }
  let detenido = "";
  for (let i = 0; i < porLeer.length; i++) {
    const item = porLeer[i];
    if (detenido) { datos.noLeidas.push({ item, motivo: detenido }); continue; }
    if (i >= maxNotas) { datos.noLeidas.push({ item, motivo: `Tope de ${maxNotas} notas por ejecución` }); continue; }
    if (pausaSeg > 0) await esperar(pausaSeg);
    let r;
    try {
      r = await leerNota(item);
    } catch (err) {
      datos.noLeidas.push({ item, motivo: "pjud.cl no respondió: " + String(err.message).split("\n")[0] });
      continue;
    }
    if (r === null) { datos.noLeidas.push({ item, motivo: "La nota no está guardada en la carpeta" }); continue; }
    const noticia = r.nota || J.parsearNoticia(r.html);
    if (noticia.estado === "rechazada" || noticia.estado === "verificacion") {
      detenido = noticia.estado === "rechazada"
        ? "El sitio rechazó la lectura (protección anti-bots); el agente se detuvo para no insistir"
        : "pjud.cl pidió verificación humana (CAPTCHA); el agente no la resuelve ni la evade";
      datos.noLeidas.push({ item, motivo: detenido });
      continue;
    }
    if (noticia.estado !== "ok") {
      datos.noLeidas.push({ item, motivo: r.http >= 400 ? `Error HTTP ${r.http}` : "Formato de la nota no reconocido" });
      continue;
    }
    const conf = J.confirmarCorte(noticia);
    if (!conf.ok) { datos.descartadas.push({ item, motivo: conf.motivo }); continue; }
    datos.fallos.push(J.extraerFicha(item, noticia, conf));
  }
  datos.recomendados = J.elegirRecomendados(datos.fallos);
  return datos;
}

const enPeriodo = (items, periodo) => items
  .filter((it) => it.fechaNota >= periodo.desde && it.fechaNota <= periodo.hasta)
  .sort((a, b) => b.fechaNota.localeCompare(a.fechaNota) || Number(b.id) - Number(a.id));

/** Lee la lista y las notas del período en pjud.cl, y arma los datos del reporte. */
export async function buscar({ hoy, periodo, maxNotas = 12, pausaSeg = 15, baseUrl = J.CONFIG.baseUrl }) {
  const datos = datosVacios(hoy, periodo, "sitio");
  const aviso = (error) => Object.assign(datos, { accion: "aviso", fuente: { ...datos.fuente, estado: "error", error } });

  let sitio;
  try {
    sitio = await abrirSitio(baseUrl);
  } catch (err) {
    return aviso("No se pudo iniciar el navegador: " + err.message);
  }
  try {
    let portada;
    try {
      portada = await sitio.html(baseUrl + J.CONFIG.rutaLista);
    } catch (err) {
      return aviso("pjud.cl no respondió: " + String(err.message).split("\n")[0]);
    }
    if (J.esVerificacionHumana(portada.html)) return aviso(J.MENSAJE_VERIFICACION);
    if (J.esRechazo(portada.html)) return aviso("pjud.cl rechazó la lectura (protección anti-bots del sitio). Vuelve a intentarlo más tarde.");
    if (portada.http >= 400) return aviso(`pjud.cl respondió con error HTTP ${portada.http}.`);

    let resp;
    try {
      resp = await sitio.lista();
    } catch (err) {
      return aviso("No se pudo pedir la lista de fallos: " + String(err.message).split("\n")[0]);
    }
    const lista = J.parsearLista(resp.html);
    if (lista.estado === "verificacion") return aviso(J.MENSAJE_VERIFICACION);
    if (lista.estado === "rechazada") return aviso("pjud.cl rechazó la lectura de la lista (protección anti-bots del sitio).");
    if (resp.http >= 400) return aviso(`La lista de fallos respondió con error HTTP ${resp.http}.`);
    if (lista.estado !== "ok") return aviso("La lista de fallos llegó con un formato que el agente no reconoce (¿cambió el sitio?).");
    datos.fuente.total = lista.items.length;
    const items = enPeriodo(lista.items, periodo);
    datos.fuente.enPeriodo = items.length;
    return await procesarNotas(datos, items, (item) => sitio.html(`${baseUrl}${J.CONFIG.rutaLista}/${item.id}`), { maxNotas, pausaSeg });
  } finally {
    await sitio.cerrar();
  }
}

/**
 * Lee una carpeta con páginas de pjud.cl guardadas por una persona (Ctrl+S)
 * o por Claude desde la pestaña (modo navegador): .html con el código de la
 * página o .txt con su texto. Reconoce la lista y las notas; une la lista
 * leída como texto (sin enlaces) con sus notas por el título.
 */
function leerCarpeta(entrada) {
  if (!existsSync(entrada) || !statSync(entrada).isDirectory()) throw new Error("No existe la carpeta " + entrada);
  const notas = new Map();
  const lista = [];
  const ilegibles = [];
  const sentencias = [];
  for (const nombre of readdirSync(entrada).filter((n) => /\.(html?|txt|pdf)$/i.test(n)).sort()) {
    if (/\.pdf$/i.test(nombre)) {
      try {
        sentencias.push({ archivo: nombre, ...leerSentenciaArchivo(join(entrada, nombre)) });
      } catch (err) {
        ilegibles.push({ item: { id: null, url: "", titulo: nombre, fechaNota: "" }, motivo: err.message });
      }
      continue;
    }
    const contenido = readFileSync(join(entrada, nombre), "utf8");
    const texto = /\.txt$/i.test(nombre);
    const nota = texto ? { ...J.parsearNoticiaTexto(contenido), origen: "texto" } : J.parsearNoticia(contenido);
    if (nota.estado === "ok") {
      const id = J.idDesdeHtml(contenido, nombre);
      const fechaNota = J.fechaDesdeLiteral(nota.fechaTexto);
      const motivo = !id ? "No se encontró el número de la nota (falta la línea «URL: …» o el enlace)"
        : !fechaNota ? "No se reconoce la fecha de la nota" : "";
      if (motivo) ilegibles.push({ item: { id: null, url: "", titulo: nombre, fechaNota: "" }, motivo });
      else notas.set(id, { nota, fechaNota });
      continue;
    }
    const l = texto ? J.parsearListaTexto(contenido) : J.parsearLista(contenido);
    if (l.estado === "ok") { lista.push(...l.items); continue; }
    // Un texto largo con rol es una sentencia guardada desde el Portal Unificado o la OJV.
    if (texto && J.parsearSentencia(contenido).rol && contenido.length > 1500) {
      sentencias.push({ archivo: nombre, ...textoYFuente(contenido, nombre) });
      continue;
    }
    ilegibles.push({
      item: { id: null, url: "", titulo: nombre, fechaNota: "" },
      motivo: nota.estado === "verificacion" || l.estado === "verificacion"
        ? "La página guardada es la verificación humana del sitio, no la nota"
        : "No se reconoce como una página de pjud.cl"
    });
  }
  const porTitulo = new Map([...notas].map(([id, n]) => [J.normalizar(n.nota.titulo), id]));
  const urlDe = (id) => `${J.CONFIG.baseUrl}${J.CONFIG.rutaLista}/${id}`;
  const items = new Map();
  for (const it of lista) {
    const id = it.id || porTitulo.get(J.normalizar(it.titulo)) || null;
    const item = id ? { ...it, id, url: it.url || urlDe(id) } : it;
    items.set(id || "titulo:" + J.normalizar(it.titulo), item);
  }
  for (const [id, n] of notas) {
    if (!items.has(id)) items.set(id, { id, url: urlDe(id), titulo: n.nota.titulo, fechaNota: n.fechaNota });
  }
  return { notas, items: [...items.values()], ilegibles, sentencias };
}

/** Primera línea «URL: …» como fuente; si no la hay, el nombre del archivo. */
function textoYFuente(contenido, nombre) {
  const m = contenido.match(/^\s*(?:URL|Fuente)\s*:\s*(\S+)/i);
  return { texto: contenido, fuente: m ? m[1] : basename(nombre) };
}

/** Texto de una sentencia guardada como .txt o .pdf (con pdftotext). */
export function leerSentenciaArchivo(ruta) {
  if (!existsSync(ruta)) throw new Error("No existe " + ruta);
  if (extname(ruta).toLowerCase() === ".pdf") {
    let texto;
    try {
      texto = execFileSync("pdftotext", ["-enc", "UTF-8", "-layout", ruta, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      if (err.code === "ENOENT") throw new Error("Para leer PDF hace falta pdftotext (poppler-utils); guarda la sentencia como .txt");
      throw new Error("No se pudo leer el PDF " + basename(ruta) + ": " + String(err.stderr || err.message).trim().split("\n")[0]);
    }
    if (!texto.trim()) throw new Error("El PDF " + basename(ruta) + " no tiene texto (¿es una imagen escaneada?)");
    return { texto, fuente: basename(ruta) };
  }
  return textoYFuente(readFileSync(ruta, "utf8"), ruta);
}

/**
 * Incorpora las sentencias guardadas a las fichas que verifican. Deja en
 * datos.sentencias qué pasó con cada archivo.
 */
function incorporarSentenciasDeCarpeta(datos, sentencias) {
  datos.sentencias = [];
  for (const s of sentencias) {
    const candidatas = datos.fallos.map((f) => ({ f, v: J.verificarSentencia(f, s.texto) })).filter((x) => x.v.coincide);
    if (!candidatas.length) {
      const mejor = datos.fallos.map((f) => J.verificarSentencia(f, s.texto)).sort((a, b) => b.citasCoincidentes - a.citasCoincidentes)[0];
      datos.sentencias.push({ archivo: s.archivo, estado: "sin coincidencia", nota: null, rol: J.parsearSentencia(s.texto).rol,
        detalle: mejor ? mejor.motivos.join(" ") : "No hay fallos en el período." });
      continue;
    }
    if (candidatas.length > 1) {
      datos.sentencias.push({ archivo: s.archivo, estado: "ambigua", nota: null, rol: null,
        detalle: "Coincide con más de una nota: " + candidatas.map((c) => c.f.id).join(", ") + ". Incorpórala a mano con --incorporar-sentencia." });
      continue;
    }
    const { f } = candidatas[0];
    try {
      const g = J.incorporarSentencia(f, s.texto, { fuente: s.fuente });
      datos.fallos[datos.fallos.findIndex((x) => x.id === f.id)] = g;
      datos.sentencias.push({ archivo: s.archivo, estado: "incorporada", nota: f.id, rol: g.rol, fecha: g.fechaSentencia,
        detalle: g.rolVerificacion.avisos.join(" ") });
    } catch (err) {
      datos.sentencias.push({ archivo: s.archivo, estado: "conflicto", nota: f.id, rol: null, detalle: err.message });
    }
  }
}

function periodoDe(items, periodo, hoy) {
  if (periodo) return periodo;
  const fechas = items.map((it) => it.fechaNota).filter(Boolean).sort();
  return fechas.length ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : { desde: hoy, hasta: hoy };
}

/**
 * Modo carpeta: procesa lo guardado. Sin período, procesa todo lo que haya.
 * No usa la red.
 */
export async function desdeCarpeta({ entrada, hoy, periodo = null }) {
  const c = leerCarpeta(entrada);
  periodo = periodoDe(c.items, periodo, hoy);
  const items = enPeriodo(c.items, periodo);
  const datos = datosVacios(hoy, periodo, "carpeta");
  datos.fuente.total = c.items.length;
  datos.fuente.enPeriodo = items.length;
  datos.noLeidas.push(...c.ilegibles);
  await procesarNotas(datos, items, (item) => (c.notas.has(item.id) ? { nota: c.notas.get(item.id).nota } : null));
  incorporarSentenciasDeCarpeta(datos, c.sentencias);
  datos.recomendados = J.elegirRecomendados(datos.fallos);
  return datos;
}

/**
 * Modo navegador, antes de abrir las notas: con la lista guardada, dice qué
 * notas del período hay que abrir (las que pueden ser de la Corte) y cuáles
 * ya están en la carpeta. Las demás quedan descartadas por el título.
 */
export function porLeer({ entrada, hoy, periodo = null }) {
  const c = leerCarpeta(entrada);
  periodo = periodoDe(c.items, periodo, hoy);
  const res = { accion: "por-leer", periodo, abrir: [], guardadas: [], descartadas: [], ilegibles: c.ilegibles.map((x) => x.item.titulo) };
  for (const it of enPeriodo(c.items, periodo)) {
    const k = J.clasificarTitulo(it.titulo);
    const fila = { titulo: it.titulo, fechaNota: it.fechaNota, url: it.url || null };
    if (k.tipo === "otro") res.descartadas.push({ ...fila, motivo: k.motivo });
    else if (it.id && c.notas.has(it.id)) res.guardadas.push(fila);
    else res.abrir.push(fila);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------------

const json = (x) => JSON.stringify(x, null, 2) + "\n";

/**
 * Escribe fichas, carpetas de carrusel y el reporte. Devuelve el resumen.
 * En cada carpeta de carrusel refresca ficha.json y brief.md; spec.base.json
 * solo se crea si falta (spec.json y captions.md, que escribe Claude, no se tocan).
 */
export function guardar(salida, datos) {
  mkdirSync(join(salida, "fichas"), { recursive: true });
  for (const f of datos.fallos) writeFileSync(join(salida, "fichas", J.slugFicha(f) + ".json"), json(f));
  const carpetas = {};
  for (const id of datos.recomendados) {
    const f = datos.fallos.find((x) => x.id === id);
    const dir = join(salida, "carruseles", J.slugFicha(f));
    carpetas[id] = dir;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ficha.json"), json(f));
    writeFileSync(join(dir, "brief.md"), J.construirBrief(f));
    if (!existsSync(join(dir, "spec.base.json"))) writeFileSync(join(dir, "spec.base.json"), json(J.specBase(f)));
  }
  const rep = J.construirReporte(datos);
  const archivos = { html: join(salida, "reporte.html"), markdown: join(salida, "reporte.md") };
  writeFileSync(archivos.html, rep.html);
  writeFileSync(archivos.markdown, rep.md);
  writeFileSync(join(salida, "datos.json"), json(datos));
  const resumen = {
    accion: datos.accion,
    asunto: rep.asunto,
    para: J.CONFIG.para,
    cc: J.CONFIG.cc,
    periodo: datos.periodo,
    fuente: datos.fuente,
    fallos: datos.fallos.map((f) => ({ id: f.id, titulo: f.titulo, fechaNota: f.fechaNota, rol: f.rol, puntaje: f.puntaje })),
    sinRol: datos.fallos.filter((f) => !f.rol).map((f) => ({ id: f.id, titulo: f.titulo, sala: f.sala, frasesBusqueda: f.frasesBusqueda || [] })),
    sentencias: datos.sentencias || [],
    recomendados: datos.recomendados.map((id) => ({
      id,
      carpeta: carpetas[id],
      carrusel: datos.carruseles[id] ? { ok: datos.carruseles[id].validacion.ok, errores: datos.carruseles[id].validacion.errores } : null
    })),
    noLeidas: datos.noLeidas.length,
    descartadas: datos.descartadas.length,
    archivos
  };
  writeFileSync(join(salida, "resultado.json"), json(resumen));
  return resumen;
}

/** Valida los carruseles escritos por Claude y rehace el reporte con ellos. */
export function componer(salida) {
  const ruta = join(salida, "datos.json");
  if (!existsSync(ruta)) throw new Error("No existe " + ruta + ": primero ejecuta la búsqueda.");
  const datos = JSON.parse(readFileSync(ruta, "utf8"));
  datos.carruseles = {};
  for (const id of datos.recomendados) {
    const f = datos.fallos.find((x) => x.id === id);
    const dir = join(salida, "carruseles", J.slugFicha(f));
    const specRuta = join(dir, "spec.json");
    if (!existsSync(specRuta)) continue;
    const spec = JSON.parse(readFileSync(specRuta, "utf8"));
    const capRuta = join(dir, "captions.md");
    const captions = existsSync(capRuta) ? readFileSync(capRuta, "utf8") : null;
    datos.carruseles[id] = { spec, captions, validacion: J.validarCarrusel(spec, f, captions) };
  }
  return guardar(salida, datos);
}

/**
 * Registra el rol que la nota no traía (leído en la sentencia, en el Portal
 * Unificado o en la OJV), con su fuente. Actualiza la ficha, cambia el
 * [VERIFICAR: rol en la OJV] del carrusel por el rol y rehace el reporte.
 */
export function asignarRol(salida, { nota, rol, fuente, fechaSentencia = null }) {
  return actualizarRol(salida, nota, (f) => J.aplicarRol(f, { rol, fuente, fechaSentencia }));
}

/**
 * Incorpora el rol y la fecha desde el texto de la sentencia (.txt o .pdf),
 * solo si las citas de la nota aparecen en él y es de la Corte de La Serena.
 */
export function incorporarSentencia(salida, { nota, archivo, fuente = null }) {
  const s = leerSentenciaArchivo(archivo);
  return actualizarRol(salida, nota, (f) => J.incorporarSentencia(f, s.texto, { fuente: fuente || s.fuente }), basename(archivo));
}

function actualizarRol(salida, nota, cambiar, archivo = null) {
  const ruta = join(salida, "datos.json");
  if (!existsSync(ruta)) throw new Error("No existe " + ruta + ": primero ejecuta la búsqueda.");
  const datos = JSON.parse(readFileSync(ruta, "utf8"));
  const i = datos.fallos.findIndex((f) => f.id === String(nota));
  if (i < 0) throw new Error(`No hay un fallo con la nota ${nota} en ${salida}`);
  const f = cambiar(datos.fallos[i]);
  datos.fallos[i] = f;
  datos.recomendados = J.elegirRecomendados(datos.fallos);
  if (archivo && f.rolVerificacion) {
    datos.sentencias = (datos.sentencias || []).filter((x) => x.archivo !== archivo);
    datos.sentencias.push({ archivo, estado: "incorporada", nota: f.id, rol: f.rol, fecha: f.fechaSentencia, detalle: f.rolVerificacion.avisos.join(" ") });
  }
  const dir = join(salida, "carruseles", J.slugFicha(f));
  if (existsSync(dir)) {
    writeFileSync(join(dir, "ficha.json"), json(f));
    writeFileSync(join(dir, "brief.md"), J.construirBrief(f));
    for (const nombre of ["spec.base.json", "spec.json", "captions.md"]) {
      const r = join(dir, nombre);
      if (existsSync(r)) writeFileSync(r, readFileSync(r, "utf8").split("[VERIFICAR: rol en la OJV]").join(f.rol));
    }
  }
  writeFileSync(ruta, json(datos));
  return componer(salida);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function leerArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const clave = argv[i].replace(/^--/, "");
    const valor = argv[i + 1];
    if (!argv[i].startsWith("--") || valor === undefined) throw new Error("Argumento inválido: " + argv[i]);
    i++;
    if (clave === "salida") o.salida = resolve(valor);
    else if (clave === "componer") o.componer = resolve(valor);
    else if (clave === "entrada") o.entrada = resolve(valor);
    else if (clave === "por-leer") o.porLeer = resolve(valor);
    else if (clave === "asignar-rol") o.asignarRol = resolve(valor);
    else if (clave === "incorporar-sentencia") o.incorporar = resolve(valor);
    else if (clave === "sentencia") o.sentencia = resolve(valor);
    else if (clave === "nota") o.nota = valor;
    else if (clave === "rol") o.rol = valor;
    else if (clave === "fuente-rol") o.fuenteRol = valor;
    else if (clave === "fecha-sentencia") {
      if (!FECHA.test(valor)) throw new Error("--fecha-sentencia debe ser AAAA-MM-DD");
      o.fechaSentencia = valor;
    }
    else if (clave === "dias-anteriores") o.diasAnteriores = parseInt(valor, 10);
    else if (["desde", "hasta", "hoy"].includes(clave)) {
      if (!FECHA.test(valor)) throw new Error(`--${clave} debe ser AAAA-MM-DD`);
      o[clave] = valor;
    } else if (clave === "max-notas") o.maxNotas = parseInt(valor, 10);
    else if (clave === "pausa-seg") o.pausaSeg = parseFloat(valor);
    else if (clave === "base-url") o.baseUrl = valor.replace(/\/+$/, "");
    else throw new Error("Opción desconocida: --" + clave);
  }
  return o;
}

export async function main(argv) {
  const o = leerArgs(argv);
  if (o.componer) return componer(o.componer);
  if (o.incorporar) {
    if (!o.nota || !o.sentencia) throw new Error("Usa --incorporar-sentencia <salida> --nota <número> --sentencia <archivo .txt o .pdf> [--fuente-rol <URL>]");
    return incorporarSentencia(o.incorporar, { nota: o.nota, archivo: o.sentencia, fuente: o.fuenteRol || null });
  }
  if (o.asignarRol) {
    if (!o.nota || !o.rol) throw new Error("Usa --asignar-rol <salida> --nota <número> --rol <rol> --fuente-rol <fuente>");
    return asignarRol(o.asignarRol, { nota: o.nota, rol: o.rol, fuente: o.fuenteRol, fechaSentencia: o.fechaSentencia });
  }
  const hoy = o.hoy || J.hoyChile();
  let periodo = null;
  if (o.desde || o.hasta) {
    if (!o.desde || !o.hasta) throw new Error("Usa --desde y --hasta juntos");
    if (o.desde > o.hasta) throw new Error("--desde es posterior a --hasta");
    periodo = { desde: o.desde, hasta: o.hasta };
  } else if (o.diasAnteriores > 0 || !(o.entrada || o.porLeer)) {
    periodo = J.periodoAnterior(hoy, o.diasAnteriores > 0 ? o.diasAnteriores : 7);
  }
  if (o.porLeer) return porLeer({ entrada: o.porLeer, hoy, periodo });
  const salida = o.salida || mkdtempSync(join(tmpdir(), "jurisprudencia-serena-"));
  const datos = o.entrada
    ? await desdeCarpeta({ entrada: o.entrada, hoy, periodo })
    : await buscar({ hoy, periodo, maxNotas: o.maxNotas, pausaSeg: o.pausaSeg, baseUrl: o.baseUrl });
  return guardar(salida, datos);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(json(await main(process.argv.slice(2))).trim());
  } catch (err) {
    console.log(json({ accion: "error", error: String((err && err.message) || err) }).trim());
    process.exit(1);
  }
}
