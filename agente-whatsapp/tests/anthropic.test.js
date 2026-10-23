// Adaptador de Anthropic: forma de la solicitud enviada a la API, probada
// contra un servidor local (no llama a la API real).
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { crearProveedorAnthropic } from "../src/ia/anthropic.js";
import { crearAppPrueba, decir } from "./ayuda.js";

function servidorFalso(respuestas) {
  const recibidas = [];
  const srv = http.createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      recibidas.push({ ruta: req.url, cabeceras: req.headers, cuerpo: JSON.parse(cuerpo) });
      const r = respuestas.shift();
      res.writeHead(r.estado || 200, { "content-type": "application/json" });
      res.end(JSON.stringify(r.cuerpo));
    });
  }).listen(0);
  return { srv, recibidas, url: `http://127.0.0.1:${srv.address().port}` };
}

const mensaje = (content, stop_reason = "end_turn") => ({ cuerpo: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason, usage: { input_tokens: 10, output_tokens: 5 } } });

test("solicitud: caché en system, contexto como mensaje de sistema al final, esfuerzo y respaldo", async () => {
  const f = servidorFalso([
    mensaje([{ type: "tool_use", id: "toolu_1", name: "registrar_solicitud", input: { nombre_declarado: "Ana" } }], "tool_use"),
    mensaje([{ type: "text", text: "Gracias, Ana. ¿Me cuenta el motivo de su consulta?" }])
  ]);
  try {
    const cfgIa = { apiKey: "sk-prueba", baseUrl: f.url, modelo: "claude-opus-5-5", esfuerzo: "medium", fallbacks: true, timeoutMs: 5000 };
    const { app } = crearAppPrueba({ ia: crearProveedorAnthropic(cfgIa) });
    const { texto } = await decir(app, "56901010101", "Me llamo Ana");
    assert.equal(texto, "Gracias, Ana. ¿Me cuenta el motivo de su consulta?");
    const [primera, segunda] = f.recibidas;
    assert.equal(primera.ruta, "/v1/messages?beta=true");
    assert.match(primera.cabeceras["anthropic-beta"], /server-side-fallback-2026-07-01/);
    assert.equal(primera.cuerpo.fallbacks, "default");
    assert.equal(primera.cuerpo.model, "claude-opus-5-5");
    assert.deepEqual(primera.cuerpo.output_config, { effort: "medium" });
    assert.deepEqual(primera.cuerpo.thinking, { type: "adaptive" });
    assert.deepEqual(primera.cuerpo.system[0].cache_control, { type: "ephemeral" });
    assert.equal(primera.cuerpo.messages.at(-1).role, "system");
    assert.match(primera.cuerpo.messages.at(-1).content, /CONTEXTO INTERNO/);
    assert.ok(primera.cuerpo.tools.some((t) => t.name === "verificar_identidad"));
    // Segunda llamada: historial solo agregado al final (sin editar lo anterior).
    assert.deepEqual(segunda.cuerpo.messages.slice(0, primera.cuerpo.messages.length), primera.cuerpo.messages);
    assert.equal(segunda.cuerpo.messages.at(-1).content[0].type, "tool_result");
    assert.equal(primera.cabeceras["x-api-key"], "sk-prueba");
  } finally { f.srv.close(); }
});

test("error de la API: se informa sin exponer la clave", async () => {
  const f = servidorFalso([{ estado: 401, cuerpo: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }]);
  try {
    const ia = crearProveedorAnthropic({ apiKey: "sk-secreta", baseUrl: f.url, modelo: "claude-opus-5-5", esfuerzo: "medium", fallbacks: true, timeoutMs: 5000 });
    await assert.rejects(ia.generar({ system: "x", mensajes: [{ role: "user", content: "hola" }], herramientas: [] }), (e) => /anthropic 401/.test(e.message) && !e.message.includes("sk-secreta"));
  } finally { f.srv.close(); }
});
