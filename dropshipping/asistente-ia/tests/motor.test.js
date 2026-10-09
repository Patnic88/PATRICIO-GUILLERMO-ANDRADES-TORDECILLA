// Pruebas del motor y del catálogo. Ejecutar: node tests/motor.test.js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const M = require("../motor.js");
const P = require("../plantillas.js");

// Perfil ficticio de prueba.
const completo = {
  tienda: "Casa Zen", nicho: "orden para cocinas pequeñas", producto: "especiero giratorio",
  publico: "personas de 25 a 45 años", pais: "Chile", moneda: "CLP", ia: "Claude", plataforma: "Shopify",
  proveedor: "AliExpress", tono: "Cercano", experiencia: "Principiante", canales: ["TikTok", "Instagram"],
  precioVenta: 14990, costoProducto: 4200, costoEnvio: 2500, presupuesto: 150000,
};
const perfiles = { completo, vacio: {}, chatgpt: { ...completo, ia: "ChatGPT", tienda: "" } };

// ---- Catálogo -------------------------------------------------------------------
const cuenta = P.PLANTILLAS.reduce((a, t) => ((a[t.tipo] = (a[t.tipo] || 0) + 1), a), {});
assert.deepStrictEqual(cuenta, { prompt: 16, loop: 4, skill: 6 });
assert.strictEqual(new Set(P.PLANTILLAS.map((t) => t.id)).size, P.PLANTILLAS.length, "ids repetidos");
for (const t of P.PLANTILLAS) {
  assert.ok(P.ETAPAS.some((e) => e.n === t.etapa), `${t.id}: etapa inválida`);
  if (t.tipo === "skill") assert.ok(t.ejemplo, `${t.id}: falta ejemplo`);
}

// ---- Todas las plantillas se generan sin restos de variables -----------------------
for (const [nombre, perfil] of Object.entries(perfiles)) {
  for (const t of P.PLANTILLAS) {
    const g = P.generar(t, perfil);
    assert.ok(g.variantes.length >= 1);
    for (const v of g.variantes) {
      assert.ok(v.texto.length > 200, `${t.id}/${v.id} (${nombre}): texto muy corto`);
      assert.ok(!/undefined|\[object Object\]|NaN/.test(v.texto), `${t.id}/${v.id} (${nombre}): contiene restos`);
      assert.ok(v.pasos.length >= 2, `${t.id}/${v.id}: faltan pasos de uso`);
      assert.ok(v.archivo, `${t.id}/${v.id}: falta nombre de archivo`);
    }
  }
}

// ---- Formato según la IA -------------------------------------------------------------
const pClaude = P.generar(P.buscar("ficha"), completo).variantes[0].texto;
assert.ok(pClaude.includes("<rol>") && pClaude.includes("</reglas>"), "Claude debe usar etiquetas XML");
const pGPT = P.generar(P.buscar("ficha"), perfiles.chatgpt).variantes[0].texto;
assert.ok(pGPT.includes("## Rol") && !pGPT.includes("<rol>"), "ChatGPT debe usar Markdown");
assert.ok(pGPT.includes("[COMPLETAR: nombre de la tienda]"), "dato faltante debe quedar marcado");
assert.ok(pClaude.includes("14.990 CLP"), "precio formateado con moneda");

// Reglas de veracidad presentes en todo prompt y loop.
for (const t of P.PLANTILLAS.filter((x) => x.tipo !== "skill")) {
  assert.ok(P.generar(t, completo).variantes[0].texto.includes("No inventes cifras"), `${t.id}: faltan reglas de veracidad`);
}

// Pistas legales: Chile con [VERIFICAR]; otro país sin normas chilenas.
const polCL = P.generar(P.buscar("politicas"), completo).variantes[0].texto;
assert.ok(polCL.includes("Ley 19.496") && polCL.includes("VERIFICAR"));
const polMX = P.generar(P.buscar("politicas"), { ...completo, pais: "México" }).variantes[0].texto;
assert.ok(!polMX.includes("Ley 19.496") && polMX.includes("México"));

// ---- Skills ------------------------------------------------------------------------------
for (const [nombre, perfil] of Object.entries(perfiles)) {
  for (const t of P.PLANTILLAS.filter((x) => x.tipo === "skill")) {
    const { skill } = P.generar(t, perfil);
    assert.ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill.nombre), `${skill.nombre}: nombre inválido`);
    assert.ok(skill.nombre.length <= M.MAX_NOMBRE);
    assert.ok(!/anthropic|claude/.test(skill.nombre));
    assert.ok(skill.descripcion.length <= M.MAX_DESCRIPCION, `${skill.nombre}: descripción de ${skill.descripcion.length} caracteres`);
    assert.ok(!/\[COMPLETAR/.test(skill.descripcion), `${skill.nombre} (${nombre}): marcador en la descripción`);
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(skill.skillMd);
    assert.ok(fm, "falta frontmatter");
    const claves = fm[1].split("\n").map((l) => l.split(":")[0]);
    assert.deepStrictEqual(claves, ["name", "description"]);
    assert.ok(!skill.otrasIA.startsWith("---"), "la versión para otras IA no lleva frontmatter");
  }
}
assert.strictEqual(M.nombreSkill("validador-productos", "Claude Store Ñandú"), "validador-productos-store-nandu");
assert.ok(M.nombreSkill("redactor-marca", "x".repeat(100)).length <= 64);
assert.strictEqual(M.nombreSkill("", ""), "skill-dropshipping");
// La primera variante sigue la IA elegida.
assert.strictEqual(P.generar(P.buscar("skill-soporte"), completo).variantes[0].id, "claude");
assert.strictEqual(P.generar(P.buscar("skill-soporte"), perfiles.chatgpt).variantes[0].id, "otras");

// ---- Loops ----------------------------------------------------------------------------------
const loop = P.generar(P.buscar("loop-productos"), completo, { maxCiclos: 3 });
assert.ok(loop.variantes[0].texto.includes("máximo 3 ciclos"));
assert.ok(loop.variantes[0].texto.includes("CONTINUAR"));
assert.strictEqual(loop.variantes.length, 1, "loop sin versión Claude Code");
const diario = P.generar(P.buscar("loop-diario"), completo, { intervalo: "12h" });
const code = diario.variantes.find((v) => v.id === "code");
assert.ok(code.texto.startsWith("/loop 12h "), code.texto.slice(0, 20));
assert.strictEqual(code.texto.trim().split("\n").length, 1, "el comando debe ir en una línea");
assert.ok(/No envíes mensajes/.test(code.texto));
assert.ok(P.generar(P.buscar("loop-diario"), completo, { intervalo: "99x" }).variantes[1].texto.startsWith("/loop 1d "), "intervalo inválido usa el de la plantilla");

// ---- Números y CRC ------------------------------------------------------------------------------
assert.strictEqual(M.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
assert.strictEqual(M.monedaDe("México"), "MXN");
assert.strictEqual(M.monedaDe("Marte"), "");
assert.strictEqual(M.dinero({ precioVenta: 14990, moneda: "CLP" }, "precioVenta"), "14.990 CLP");
assert.strictEqual(M.dinero({ precioVenta: "" }, "precioVenta"), "[COMPLETAR: precio de venta]");

// ---- ZIP: válido para unzip y Python ------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asistente-ia-"));
function hay(cmd) { try { execFileSync("which", [cmd], { stdio: "ignore" }); return true; } catch (e) { return false; } }

const kit = P.armarKit(completo);
const zipKit = M.crearZip(kit.archivos, new Date("2026-10-08T12:00:00"));
const rutaKit = path.join(tmp, kit.nombre);
fs.writeFileSync(rutaKit, zipKit);
const rutas = kit.archivos.map((a) => a.ruta);
assert.ok(rutas.includes("kit-ia-casa-zen/LEEME.md"));
assert.strictEqual(rutas.filter((r) => r.includes("/1-prompts/")).length, 16);
assert.strictEqual(rutas.filter((r) => /\/2-skills\/[^/]+\.zip$/.test(r)).length, 6);
assert.strictEqual(rutas.filter((r) => r.includes("/3-loops/")).length, 4);
const leeme = kit.archivos[0].contenido;
for (const t of P.PLANTILLAS) assert.ok(leeme.includes(t.titulo), `LEEME sin ${t.titulo}`);

if (hay("unzip")) {
  const salida = execFileSync("unzip", ["-t", rutaKit]).toString();
  assert.ok(/No errors detected/.test(salida), salida);
  execFileSync("unzip", ["-q", rutaKit, "-d", tmp]);
  const skillZip = rutas.find((r) => /\/2-skills\/validador[^/]*\.zip$/.test(r));
  const interno = path.join(tmp, skillZip);
  assert.ok(/No errors detected/.test(execFileSync("unzip", ["-t", interno]).toString()));
  const listado = execFileSync("unzip", ["-Z1", interno]).toString().trim().split("\n");
  assert.deepStrictEqual(listado, ["validador-productos-casa-zen/", "validador-productos-casa-zen/SKILL.md"]);
  const extraido = fs.readFileSync(path.join(tmp, "kit-ia-casa-zen", "1-prompts", "01-encontrar-mi-nicho.md"), "utf8");
  assert.ok(extraido.includes("cocinas pequeñas") && extraido.includes("Ayúdame"), "UTF-8 intacto");
} else {
  console.log("(unzip no disponible: se omite la verificación externa del ZIP)");
}
if (hay("python3")) {
  const py = "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(len(z.namelist()))";
  assert.ok(Number(execFileSync("python3", ["-I", "-c", py, rutaKit]).toString()) > rutas.length);
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log("✔ Todas las pruebas del Asistente IA pasaron");
