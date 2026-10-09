// Pruebas de la conexión con Claude contra un servidor local que imita la API
// (no gasta saldo). Ejecutar: node tests/claude.test.js
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const vm = require("vm");

// localStorage mínimo para Node.
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "../vendor/anthropic-sdk.js"), "utf8"));
const SDK = globalThis.AnthropicSDK.default;
const C = require("../claude.js");
const MD = require("../markdown.js");

const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

// ---- Costos (precios oficiales consultados el 9-oct-2026) ---------------------
let c = C.costo({ input_tokens: 10000, cache_creation_input_tokens: 5000, cache_read_input_tokens: 20000, output_tokens: 2000, server_tool_use: { web_search_requests: 2 } }, "claude-haiku-5-5");
cerca(c.detalle.entrada, 0.001, "haiku entrada");
cerca(c.detalle.escritura, 0.000625, "haiku escritura");
cerca(c.detalle.lectura, 0.0002, "haiku lectura");
cerca(c.detalle.salida, 0.001, "haiku salida");
cerca(c.detalle.busquedas, 0.02, "búsquedas");
cerca(c.total, 0.022825, "haiku total");
c = C.costo({ input_tokens: 150000, output_tokens: 1000 }, "claude-haiku-5-5");
cerca(c.total, 0.075 + 0.0025, "haiku sobre 100K usa la tarifa larga");
c = C.costo({ input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 10000 }, "claude-sonnet-5-5");
cerca(c.total, 0.002 + 0.01 + 0.001, "sonnet");
assert.strictEqual(C.costo({}, "modelo-x").conocido, false);
assert.strictEqual(C.usd(0), "USD 0");
assert.strictEqual(C.usd(0.0012), "USD 0,0012");
assert.strictEqual(C.usd(1.5), "USD 1,50");

// ---- Solicitud ------------------------------------------------------------------------
const base = { modelo: "claude-haiku-5-5", esfuerzo: "low", busqueda: false, sistema: "S", mensajes: [{ role: "user", content: "hola" }] };
let s = C.armarSolicitud(base);
assert.strictEqual(s.model, "claude-haiku-5-5");
assert.deepStrictEqual(s.cache_control, { type: "ephemeral" });
assert.deepStrictEqual(s.thinking, { type: "adaptive", display: "summarized" });
assert.deepStrictEqual(s.output_config, { effort: "low" });
assert.ok(!s.tools && !s.betas && !s.fallbacks, "Haiku sin herramientas ni respaldo");
s = C.armarSolicitud({ ...base, modelo: "claude-sonnet-5-5", busqueda: true });
assert.deepStrictEqual(s.betas, ["server-side-fallback-2026-07-01"]);
assert.strictEqual(s.fallbacks, "default");
assert.deepStrictEqual(s.tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]);
assert.ok(C.sistemaBase({ fecha: "9 de octubre de 2026", pais: "Chile", busqueda: true }).includes("(Chile)"));
assert.ok(C.sistemaBase({ fecha: "x", busqueda: false }).includes("no tienes acceso a internet"));

// Tras un respaldo a mitad de respuesta se omiten razonamientos y llamadas sin resultado.
const conRespaldo = [
  { type: "thinking", thinking: "a", signature: "s" },
  { type: "text", text: "parcial" },
  { type: "server_tool_use", id: "t1", name: "web_search", input: {} },
  { type: "server_tool_use", id: "t2", name: "web_search", input: {} },
  { type: "web_search_tool_result", tool_use_id: "t2", content: [] },
  { type: "fallback", from: { model: "claude-sonnet-5-5" }, to: { model: "claude-sonnet-5" } },
  { type: "thinking", thinking: "b", signature: "s2" },
  { type: "text", text: "final" },
];
assert.deepStrictEqual(C.contenidoParaHistorial(conRespaldo).map((b) => b.type + (b.id || "")),
  ["text", "server_tool_uset2", "web_search_tool_result", "fallback", "thinking", "text"]);
const sinRespaldo = [{ type: "thinking", thinking: "a" }, { type: "text", text: "x" }];
assert.strictEqual(C.contenidoParaHistorial(sinRespaldo), sinRespaldo);

const r = C.resumirBloques([
  { type: "thinking", thinking: "pensé" },
  { type: "server_tool_use", name: "web_search", input: { query: "precio especiero Chile" } },
  { type: "text", text: "Hola", citations: [{ url: "https://a.cl", title: "A" }, { url: "https://a.cl", title: "A" }] },
]);
assert.strictEqual(r.texto, "Hola");
assert.strictEqual(r.razonamiento, "pensé");
assert.deepStrictEqual(r.busquedas, ["precio especiero Chile"]);
assert.strictEqual(r.fuentes.length, 1, "fuentes sin duplicados");

// ---- Ajustes, clave y presupuesto ---------------------------------------------------------
assert.strictEqual(C.ajustes().presupuesto, 100);
assert.strictEqual(C.ajustes().modelo, "claude-haiku-5-5");
C.guardarAjustes({ presupuesto: 10 });
C.sumarGasto(7.9);
assert.strictEqual(C.estadoPresupuesto(), "ok");
C.sumarGasto(0.2);
assert.strictEqual(C.estadoPresupuesto(), "aviso");
C.sumarGasto(2);
assert.strictEqual(C.estadoPresupuesto(), "agotado");
C.guardarAjustes({ gastado: 0, presupuesto: 100 });
const claveFalsa = "sk-ant-api03-" + "x".repeat(30);
assert.ok(C.formatoClaveValido(claveFalsa));
assert.ok(!C.formatoClaveValido("hola"));
C.guardarClave(claveFalsa, false);
assert.strictEqual(C.clave(), claveFalsa);
assert.strictEqual(localStorage.getItem("asistente_ia_claude_clave_v1"), null, "sin «recordar» no se guarda");
C.guardarClave(claveFalsa, true);
assert.ok(localStorage.getItem("asistente_ia_claude_clave_v1"));
C.olvidarClave();
assert.strictEqual(C.clave(), "");

// ---- Markdown seguro -------------------------------------------------------------------------
const html = MD.aHtml("# Título\n**negrita** y `<b>`\n\n<script>alert(1)</script>\n\n[malo](javascript:alert(1)) [bueno](https://ok.cl)\n\n| A | B |\n|---|---|\n| 1 | <img src=x onerror=alert(1)> |\n\n- uno\n- dos\n\n1. a\n2. b");
assert.ok(!/<script|<img|onerror=alert\(1\)>|href="javascript/i.test(html), "no deja pasar HTML ni javascript:");
assert.ok(html.includes("&lt;script&gt;"));
assert.ok(html.includes("<strong>negrita</strong>"));
assert.ok(html.includes("<code>&lt;b&gt;</code>"));
assert.ok(html.includes('<a href="https://ok.cl" target="_blank" rel="noopener noreferrer">bueno</a>'));
assert.ok(html.includes("<table>") && html.includes("<th>A</th>") && html.includes("<td>1</td>"));
assert.ok(html.includes("<ul><li>uno</li><li>dos</li></ul>") && html.includes("<ol><li>a</li><li>b</li></ol>"));
assert.ok(html.includes("<h3>Título</h3>"));
assert.strictEqual(MD.aHtml("| solo | una línea |"), "<p>| solo | una línea |</p>", "tabla sin separador no se cuelga");

// ---- SDK real contra una API simulada ----------------------------------------------------------
function sse(eventos) {
  return eventos.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

function mensajeSSE({ modelo = "claude-haiku-5-5", bloques, stop = "end_turn", usage = {} }) {
  const ev = [{ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", content: [], model: modelo, stop_reason: null, stop_sequence: null,
    usage: { input_tokens: usage.input || 1000, output_tokens: 1, cache_creation_input_tokens: usage.escritura || 0, cache_read_input_tokens: usage.lectura || 0 } } }];
  bloques.forEach((b, i) => {
    if (b.type === "text") {
      ev.push({ type: "content_block_start", index: i, content_block: { type: "text", text: "" } });
      for (const trozo of b.trozos) ev.push({ type: "content_block_delta", index: i, delta: { type: "text_delta", text: trozo } });
    } else if (b.type === "thinking") {
      ev.push({ type: "content_block_start", index: i, content_block: { type: "thinking", thinking: "", signature: "" } });
      ev.push({ type: "content_block_delta", index: i, delta: { type: "thinking_delta", thinking: b.texto } });
      ev.push({ type: "content_block_delta", index: i, delta: { type: "signature_delta", signature: "firma" } });
    } else if (b.type === "server_tool_use") {
      ev.push({ type: "content_block_start", index: i, content_block: { type: "server_tool_use", id: b.id, name: "web_search", input: {} } });
      ev.push({ type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query: b.query }) } });
    }
    ev.push({ type: "content_block_stop", index: i });
  });
  ev.push({ type: "message_delta", delta: { stop_reason: stop, stop_sequence: null, ...(stop === "refusal" ? { stop_details: { type: "refusal", category: "general_harms" } } : {}) },
    usage: { output_tokens: usage.salida || 500, ...(usage.busquedas ? { server_tool_use: { web_search_requests: usage.busquedas } } : {}) } });
  ev.push({ type: "message_stop" });
  return sse(ev);
}

const recibidas = [];
let guion = [];
const servidor = http.createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (d) => (cuerpo += d));
  req.on("end", () => {
    recibidas.push({ url: req.url, headers: req.headers, body: cuerpo ? JSON.parse(cuerpo) : null });
    const paso = guion.shift();
    if (!paso) { res.writeHead(500); res.end("{}"); return; }
    if (paso.error) { res.writeHead(paso.status, { "content-type": "application/json" }); res.end(JSON.stringify(paso.error)); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(paso.sse);
  });
});

(async () => {
  await new Promise((ok) => servidor.listen(0, ok));
  const cliente = new SDK({ apiKey: claveFalsa, baseURL: `http://127.0.0.1:${servidor.address().port}`, maxRetries: 0 });
  const conv = { modelo: "claude-haiku-5-5", esfuerzo: "medium", busqueda: false, sistema: "S", mensajes: [{ role: "user", content: "Hola" }] };

  // 1) Respuesta normal con razonamiento y texto en trozos.
  guion = [{ sse: mensajeSSE({ bloques: [{ type: "thinking", texto: "pienso" }, { type: "text", trozos: ["Hola ", "Patricio"] }], usage: { input: 2000, salida: 1000 } }) }];
  const vistos = { texto: "", raz: "", bloques: [] };
  let res = await C.ejecutarTurno(cliente, conv, {
    texto: (t) => (vistos.texto += t), razonamiento: (t) => (vistos.raz += t), inicioBloque: (b) => vistos.bloques.push(b.type),
  });
  assert.strictEqual(vistos.texto, "Hola Patricio");
  assert.strictEqual(vistos.raz, "pienso");
  assert.deepStrictEqual(vistos.bloques, ["thinking", "text"]);
  assert.strictEqual(res.respuestas.length, 1);
  assert.strictEqual(res.stop_reason, "end_turn");
  cerca(res.costo, 2000 * 0.10 / 1e6 + 1000 * 0.50 / 1e6, "costo del turno");
  assert.strictEqual(res.respuestas[0].content[0].signature, "firma", "el razonamiento conserva su firma para el historial");
  let enviada = recibidas.at(-1);
  assert.strictEqual(enviada.url, "/v1/messages");
  assert.strictEqual(enviada.body.stream, true);
  assert.deepStrictEqual(enviada.body.cache_control, { type: "ephemeral" });
  assert.strictEqual(enviada.headers["x-api-key"], claveFalsa);

  // 2) Pausa (pause_turn) con búsqueda: se reanuda sin agregar mensajes del usuario.
  guion = [
    { sse: mensajeSSE({ bloques: [{ type: "server_tool_use", id: "srv1", query: "precio" }], stop: "pause_turn", usage: { busquedas: 1 } }) },
    { sse: mensajeSSE({ bloques: [{ type: "text", trozos: ["Listo"] }] }) },
  ];
  res = await C.ejecutarTurno(cliente, { ...conv, busqueda: true }, {});
  assert.strictEqual(res.respuestas.length, 2);
  assert.strictEqual(res.costos.length, 2);
  enviada = recibidas.at(-1);
  assert.strictEqual(enviada.body.messages.length, 2, "reanuda con usuario + respuesta pausada");
  assert.strictEqual(enviada.body.messages[1].role, "assistant");
  assert.strictEqual(enviada.body.messages[1].content[0].type, "server_tool_use");
  assert.ok(Array.isArray(enviada.body.tools));

  // 3) Rechazo.
  guion = [{ sse: mensajeSSE({ bloques: [], stop: "refusal" }) }];
  res = await C.ejecutarTurno(cliente, conv, {});
  assert.strictEqual(res.stop_reason, "refusal");
  assert.ok(res.refusal);

  // 4) Sonnet: cabecera del respaldo y parámetro fallbacks.
  guion = [{ sse: mensajeSSE({ modelo: "claude-sonnet-5-5", bloques: [{ type: "text", trozos: ["ok"] }] }) }];
  await C.ejecutarTurno(cliente, { ...conv, modelo: "claude-sonnet-5-5" }, {});
  enviada = recibidas.at(-1);
  assert.ok(String(enviada.headers["anthropic-beta"]).includes("server-side-fallback-2026-07-01"));
  assert.strictEqual(enviada.body.fallbacks, "default");
  assert.ok(!("betas" in enviada.body), "betas va en la cabecera, no en el cuerpo");

  // 5) Errores traducidos.
  const errores = [
    [401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "clave"],
    [400, { type: "error", error: { type: "invalid_request_error", message: "You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC." } }, "tope"],
    [429, { type: "error", error: { type: "rate_limit_error", message: "limit", details: { error_code: "enforced_spend_limit_reached" } } }, "tope"],
    [429, { type: "error", error: { type: "rate_limit_error", message: "Number of requests has exceeded your per-minute rate limit" } }, "limite"],
    [400, { type: "error", error: { type: "invalid_request_error", message: "Web search is not enabled for your organization" } }, "busqueda"],
  ];
  for (const [status, cuerpo, tipo] of errores) {
    guion = [{ status, error: cuerpo }];
    let atrapado = null;
    try { await C.ejecutarTurno(cliente, conv, {}); } catch (e) { atrapado = e; }
    assert.ok(atrapado, `debió fallar con ${status}`);
    assert.strictEqual(C.explicarError(atrapado).tipo, tipo, `${status} → ${tipo}: ${atrapado.message}`);
  }

  // 6) Detener a mitad de la respuesta.
  guion = [{ sse: mensajeSSE({ bloques: [{ type: "text", trozos: ["a", "b", "c"] }] }) }];
  const senal = {};
  let detenido = null;
  try {
    await C.ejecutarTurno(cliente, conv, { inicioBloque: () => senal.abortar() }, senal);
  } catch (e) { detenido = e; }
  assert.ok(detenido);
  assert.strictEqual(C.explicarError(detenido).tipo, "detenido");

  servidor.close();
  console.log("✔ Todas las pruebas de la conexión con Claude pasaron");
})().catch((e) => { servidor.close(); console.error(e); process.exit(1); });
