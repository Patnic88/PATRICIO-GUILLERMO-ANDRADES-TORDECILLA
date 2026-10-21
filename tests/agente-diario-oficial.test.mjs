// Tests del ejecutor de Claude para el Diario Oficial
// (agente-diario-oficial/reporte.mjs) y del paquete descargable.
//
// Levanta un servidor HTTP local que sirve los fixtures SINTÉTICOS de
// tests/fixtures/diario-oficial/ como si fueran las páginas del sitio, y
// corre el CLI real (curl incluido) contra él.
//
// Uso: node tests/agente-diario-oficial.test.mjs   (o desde tests/run.sh)

import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";

const run = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "agente-diario-oficial", "reporte.mjs");
const fixture = (name) => readFileSync(join(__dirname, "fixtures", "diario-oficial", name), "utf8");

// Páginas que sirve el servidor; cada test las ajusta.
let paginas = {};
function paginasOk() {
  return {
    "index.php": { html: fixture("normas-generales.sintetico.html") },
    "avisos_destacados.php": { html: fixture("avisos-destacados.sintetico.html") },
    "normas_particulares.php": { html: fixture("normas-particulares.sintetico.html") },
    "publicaciones_judiciales.php": { html: fixture("sin-publicaciones.sintetico.html") }
  };
}

const server = createServer((req, res) => {
  const pagina = req.url.split("?")[0].split("/").pop();
  const p = paginas[pagina];
  if (!p) { res.writeHead(404); res.end("no existe"); return; }
  res.writeHead(p.code || 200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(p.html);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/edicionelectronica/`;

const tmp = mkdtempSync(join(tmpdir(), "agente-do-test-"));
let n = 0;

async function cli(args, script = CLI) {
  const salida = join(tmp, "salida-" + n++);
  try {
    const { stdout } = await run("node", [script, "--salida", salida, "--base-url", BASE, ...args]);
    return { code: 0, json: JSON.parse(stdout), salida };
  } catch (err) {
    return { code: err.code, json: JSON.parse(err.stdout || "{}"), salida };
  }
}

let pass = 0, fail = 0;
async function test(name, fn) {
  paginas = paginasOk();
  try { await fn(); pass++; console.log("PASS:", name); }
  catch (e) { fail++; console.error("FAIL:", name, "\n  ", e.message); }
}

// ---------------------------------------------------------------------------

await test("CLI: edición de hoy → reporte listo para enviar", async () => {
  const { code, json, salida } = await cli(["--fecha", "20-10-2026"]);
  assert.equal(code, 0);
  assert.equal(json.accion, "reporte");
  assert.equal(json.asunto, "📰 Diario Oficial 20-10-2026 · Ed. N° 99.999 — 6 destacadas · 4 normas generales");
  assert.deepEqual(json.para, ["pandrades23@gmail.com"]);
  assert.deepEqual(json.cc, ["andradestordecilla.abogado@gmail.com"]);
  assert.equal(json.fechaEdicion, "20-10-2026");
  assert.equal(json.secciones.length, 4);
  assert.deepEqual(json.secciones.map((s) => s.estado), ["ok", "ok", "ok", "sin_publicaciones"]);
  const html = readFileSync(json.archivos.html, "utf8");
  const texto = readFileSync(json.archivos.texto, "utf8");
  assert.match(html, /⭐ Destacadas por tema/);
  assert.match(html, /rutina diaria de Claude/, "firma del ejecutor de Claude");
  assert.doesNotMatch(html, /tu cuenta de Google/);
  assert.match(texto, /=== NORMAS GENERALES \(4\) ===/);
  assert.deepEqual(JSON.parse(readFileSync(join(salida, "resultado.json"), "utf8")), json);
});

await test("CLI: sección secundaria caída no impide el reporte", async () => {
  paginas["normas_particulares.php"] = { code: 503, html: "caído" };
  const { json } = await cli(["--fecha", "20-10-2026"]);
  assert.equal(json.accion, "reporte");
  assert.equal(json.secciones[2].estado, "error");
  assert.equal(json.secciones[2].http, 503);
  assert.match(readFileSync(json.archivos.texto, "utf8"), /No se pudo leer esta sección: HTTP 503/);
});

await test("CLI: sitio que responde 403 → aviso 'no se pudo leer el sitio'", async () => {
  paginas["index.php"] = { code: 403, html: "Forbidden" };
  const { code, json } = await cli(["--fecha", "20-10-2026", "--reintentos", "0"]);
  assert.equal(code, 0);
  assert.equal(json.accion, "aviso");
  assert.equal(json.asunto, "📰 Diario Oficial 20-10-2026 — no se pudo leer el sitio");
  const texto = readFileSync(json.archivos.texto, "utf8");
  assert.match(texto, /HTTP 403/);
  assert.match(texto, /Network access → Allowed domains/, "ayuda pensada para Claude, no Apps Script");
  assert.doesNotMatch(texto, /editor de Apps Script/);
});

await test("CLI: edición de otro día → aviso 'sin edición de hoy'", async () => {
  const { json } = await cli(["--fecha", "21-10-2026", "--reintentos", "0"]);
  assert.equal(json.accion, "aviso");
  assert.equal(json.asunto, "📰 Diario Oficial 21-10-2026 — sin edición de hoy detectada");
  assert.match(readFileSync(json.archivos.texto, "utf8"), /la última edición disponible es del 20-10-2026/);
});

await test("CLI: reintenta y envía cuando la edición de hoy aparece", async () => {
  // La edición de "hoy" (21-10) recién aparece en el segundo intento.
  const hoy = fixture("normas-generales.sintetico.html").replace(/2026\/10\/20/g, "2026/10/21");
  paginas["index.php"] = { html: fixture("normas-generales.sintetico.html") };
  setTimeout(() => { paginas["index.php"] = { html: hoy }; }, 500);
  const { json } = await cli(["--fecha", "21-10-2026", "--reintentos", "2", "--espera-seg", "1"]);
  assert.equal(json.accion, "reporte");
  assert.equal(json.fechaEdicion, "21-10-2026");
});

await test("CLI: opción desconocida → JSON de error y código 1", async () => {
  const { code, json } = await cli(["--opcion-rara", "x"]);
  assert.equal(code, 1);
  assert.equal(json.accion, "error");
  assert.match(json.error, /Opción desconocida/);
});

await test("Paquete: el .zip trae SKILL.md, reporte.mjs y diario-oficial.gs, y funciona", async () => {
  const dist = join(tmp, "dist");
  await run("bash", [join(ROOT, "scripts", "empaquetar-agente-diario-oficial.sh"), dist]);
  const zip = join(dist, "agente-diario-oficial.zip");
  assert.ok(existsSync(zip));
  const { stdout } = await run("unzip", ["-Z1", zip]);
  assert.deepEqual(stdout.trim().split("\n").sort(), [
    "diario-oficial/",
    "diario-oficial/SKILL.md",
    "diario-oficial/diario-oficial.gs",
    "diario-oficial/reporte.mjs"
  ]);
  const extraido = join(tmp, "extraido");
  await run("unzip", ["-q", zip, "-d", extraido]);
  const skill = readFileSync(join(extraido, "diario-oficial", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: diario-oficial\n/);
  // El reporte.mjs empaquetado usa su propia copia de diario-oficial.gs.
  const { json } = await cli(["--fecha", "20-10-2026"], join(extraido, "diario-oficial", "reporte.mjs"));
  assert.equal(json.accion, "reporte");
});

server.close();
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
