// Prueba E2E del sitio: navega con Chromium contra un servidor local y
// valida tanto el agente de Estado Diario como la coexistencia con la
// funcionalidad de WhatsApp que ya estaba en `main`.

import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.E2E_OUT_DIR || join(__dirname, "..", ".test-output");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.E2E_BASE || "http://127.0.0.1:8765";
const HEAD = !!process.env.E2E_HEADED;

const results = [];
const assert = (cond, msg) => {
  results.push({ ok: !!cond, msg });
  console[cond ? "log" : "error"](cond ? "PASS:" : "FAIL:", msg);
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  headless: !HEAD
});
const ctx = await browser.newContext({ viewport: { width: 1200, height: 950 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push("console.error: " + m.text());
});
page.on("requestfailed", (req) => {
  // Ignoramos pings al servicio del PJUD (lo simularíamos en otra capa)
  consoleErrors.push("requestfailed: " + req.url() + " - " + req.failure()?.errorText);
});

// ---------------------------------------------------------------------------
// A — index.html: WhatsApp + nav-link al Estado Diario coexisten
// ---------------------------------------------------------------------------
await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
await page.waitForSelector("#lista li");

assert(await page.$('.nav-link[href="estado-diario.html"]'), "A1. nav-link a Estado Diario visible");
assert(await page.$("#btnWhatsApp"), "A2. Botón WhatsApp 'Enviar pendientes' presente");
assert(await page.$("#btnWhatsNum"), "A3. Botón 'Número de WhatsApp' en footer");

const tareas = await page.$$("#lista li");
assert(tareas.length === 10, `A4. Página de tareas carga 10 (vi ${tareas.length})`);

const waLinks = await page.$$("#lista li .wa-link");
assert(waLinks.length === 10, `A5. Cada tarea muestra su botón WhatsApp (vi ${waLinks.length})`);

const numero = await page.evaluate(() => window.WHATSAPP_NUMERO);
assert(numero === "56942208035", `A6. WHATSAPP_NUMERO en config = "${numero}"`);

const courtUrl = await page.evaluate(() => window.COURT_SYNC_URL);
assert(courtUrl === "", "A7. COURT_SYNC_URL vacía (modo datos de muestra)");

await page.screenshot({ path: join(OUT, "01-index.png"), fullPage: true });

// ---------------------------------------------------------------------------
// B — estado-diario.html: filtros, persistencia, badge "Hoy"
// ---------------------------------------------------------------------------
await page.click('.nav-link[href="estado-diario.html"]');
await page.waitForSelector("#listaED li");

const initial = await page.$$("#listaED li");
assert(initial.length === 3, `B1. Estado Diario carga 3 de muestra (vi ${initial.length})`);

assert(
  /datos de muestra/i.test((await page.textContent("#agentNote")) || ""),
  "B2. Aviso 'datos de muestra' visible (sin URL del agente)"
);

await page.click('button.chip[data-filter="los-vilos"]');
await page.waitForTimeout(120);
assert((await page.$$("#listaED li")).length === 2, "B3. Filtro 'Los Vilos' → 2 movimientos");

await page.click('button.chip[data-filter="corte-la-serena"]');
await page.waitForTimeout(120);
assert((await page.$$("#listaED li")).length === 1, "B4. Filtro 'Corte La Serena' → 1 movimiento");
assert(/Pérez/.test((await page.textContent("#listaED li .titulo")) || ""), "B5. Carátula correcta en Corte");

// Marcado como revisado y persistencia
await page.click('button.chip[data-filter="todos"]');
await page.waitForTimeout(120);
await page.click("#listaED li:first-child .check");
await page.waitForTimeout(100);
assert(
  /hecha/.test((await page.getAttribute("#listaED li:first-child", "class")) || ""),
  "B6. Marcar como revisado aplica clase 'hecha'"
);

await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#listaED li");
assert(
  /hecha/.test((await page.getAttribute("#listaED li:first-child", "class")) || ""),
  "B7. Persistencia tras recargar"
);

// Filtro "Sin revisar"
await page.click('button.chip[data-filter="no-revisadas"]');
await page.waitForTimeout(120);
assert((await page.$$("#listaED li")).length === 2, "B8. Filtro 'Sin revisar' deja 2");

// ---------------------------------------------------------------------------
// C — Badge "Hoy" (counter-hoy) aparece cuando hay movimientos del día
// ---------------------------------------------------------------------------
const hoyIso = new Date().toISOString();
const hoyFecha = hoyIso.slice(0, 10);
await page.evaluate(({ hoyIso, hoyFecha }) => {
  const lista = JSON.parse(localStorage.getItem("estado_diario_v1") || "[]");
  lista.unshift({
    id: "ed-hoy-test",
    rol: "C-999-2026",
    caratulado: "TEST con I. Municipalidad de Los Vilos",
    tribunal: "Juzgado de Letras y Garantía de Los Vilos",
    tipoTribunal: "los-vilos",
    fecha: hoyFecha,
    fechaIso: hoyIso,
    tipoResolucion: "Provee escrito",
    resumen: "Movimiento sintético inyectado por el test E2E.",
    remitente: "notifica_jl_losvilos@pjud.cl",
    threadId: "",
    revisada: false
  });
  localStorage.setItem("estado_diario_v1", JSON.stringify(lista));
}, { hoyIso, hoyFecha });

await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#listaED li");
await page.click('button.chip[data-filter="todos"]');
await page.waitForTimeout(120);

const counterHoyVisible = await page.evaluate(() =>
  !document.getElementById("counterHoy").classList.contains("oculto")
);
assert(counterHoyVisible, "C1. Badge 'Hoy' visible cuando hay movimientos del día");

const counterHoyTxt = await page.textContent("#counterHoy");
assert(/\b1 hoy\b/i.test(counterHoyTxt || ""), `C2. Badge 'Hoy' dice "1 hoy" (vi "${counterHoyTxt}")`);

await page.click('button.chip[data-filter="hoy"]');
await page.waitForTimeout(120);
assert((await page.$$("#listaED li")).length === 1, "C3. Filtro 'Hoy' deja exactamente 1 movimiento");

await page.screenshot({ path: join(OUT, "02-estado-diario-hoy.png"), fullPage: true });

// ---------------------------------------------------------------------------
// D — WhatsApp: el click abre wa.me con el número configurado
// ---------------------------------------------------------------------------
await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
await page.waitForSelector("#btnWhatsApp");

const urlOpen = await page.evaluate(() => new Promise((resolve) => {
  const orig = window.open;
  window.open = (url) => { resolve(url); window.open = orig; return null; };
  document.getElementById("btnWhatsApp").click();
}));
assert(/^https:\/\/wa\.me\/56942208035\?text=/.test(urlOpen), `D1. WhatsApp abre wa.me/56942208035`);
assert(decodeURIComponent(urlOpen).includes("tareas pendientes"), "D2. Mensaje contiene 'tareas pendientes'");

// ---------------------------------------------------------------------------
// E — Sin errores de consola/red (favicon ahora existe, no debe 404)
// ---------------------------------------------------------------------------
assert(consoleErrors.length === 0, `E1. Cero errores en consola/red (vi ${consoleErrors.length})`);
if (consoleErrors.length) console.error("   errores:", consoleErrors);

// ---------------------------------------------------------------------------
// REPORTE
// ---------------------------------------------------------------------------
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
writeFileSync(join(OUT, "e2e-result.json"), JSON.stringify({
  total: results.length, pass, fail,
  errores_consola: consoleErrors,
  detalle: results
}, null, 2));

console.log(`\n=== E2E: ${pass}/${results.length} OK, ${fail} fallos ===`);
await browser.close();
process.exit(fail === 0 && consoleErrors.length === 0 ? 0 : 1);
