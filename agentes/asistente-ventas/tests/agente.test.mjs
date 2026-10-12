// Prueba del agente con el SDK real y un fetch falso que imita la API de
// Claude (sin gastar). Ejecutar: node tests/agente.test.mjs
import assert from "node:assert";
import Anthropic from "@anthropic-ai/sdk";
import { redactarBorrador, MODELO, resumirPublicacion } from "../agente.mjs";

const pedidos = [];
let guion = [];
const fetchFalso = async (url, init) => {
  pedidos.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
  return new Response(JSON.stringify(guion.shift()), { status: 200, headers: { "content-type": "application/json" } });
};
const cliente = new Anthropic({ apiKey: "prueba", fetch: fetchFalso, maxRetries: 0 });

const mensaje = (content, stop_reason) => ({
  id: "msg_" + pedidos.length, type: "message", role: "assistant", model: MODELO, content, stop_reason,
  stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 },
});
const BORRADOR = { respuesta: "¡Hola! Sí, tenemos 3 unidades disponibles y el envío es gratis. ¡Saludos!", confianza: "alta",
  requiere_revision: false, motivo_revision: "", datos_usados: ["stock: 3", "envío gratis"] };

const mlFalso = {
  publicacion: async (id) => ({ id, title: "Lámpara LED", price: 19990, currency_id: "CLP", available_quantity: 3,
    condition: "new", shipping: { free_shipping: true, local_pick_up: false, mode: "me2" }, warranty: "Garantía del vendedor: 6 meses",
    attributes: [{ id: "BRAND", name: "Marca", value_name: "Genérica" }, { id: "X", name: "Vacío", value_name: null }], seller_id: 77 }),
  descripcion: async () => ({ plain_text: "Lámpara de escritorio." }),
};

// 1) Flujo completo: Claude pide ver la publicación y luego entrega el borrador.
guion = [
  mensaje([{ type: "tool_use", id: "toolu_1", name: "ver_publicacion", input: { item_id: "MLC1" } }], "tool_use"),
  mensaje([{ type: "text", text: JSON.stringify(BORRADOR) }], "end_turn"),
];
const b = await redactarBorrador({ pregunta: { id: 5, item_id: "MLC1", text: "¿Tienes stock?" }, ml: mlFalso, politicas: "Despacho: lunes a viernes.", cliente });

assert.strictEqual(pedidos.length, 2);
const [p1, p2] = pedidos;
assert.ok(p1.url.endsWith("/v1/messages?beta=true"), p1.url);
assert.strictEqual(p1.body.model, MODELO);
assert.strictEqual(p1.body.fallbacks, "default");
assert.ok(p1.headers.get("anthropic-beta").includes("server-side-fallback-2026-07-01"));
assert.deepStrictEqual(p1.body.tools.map((t) => t.name), ["ver_publicacion", "ver_descripcion"]);
assert.strictEqual(p1.body.output_config.format.type, "json_schema");
assert.ok(p1.body.system[1].text.includes("Despacho: lunes a viernes."));
assert.ok(p1.body.messages[0].content.includes("<pregunta>\n¿Tienes stock?\n</pregunta>"));
const resultado = p2.body.messages.at(-1).content[0];
assert.strictEqual(resultado.type, "tool_result");
assert.ok(JSON.stringify(resultado.content).includes("disponibles"), "devolvió el resumen de la publicación");

assert.strictEqual(b.respuesta, BORRADOR.respuesta);
assert.deepStrictEqual(b.alertas, []);
assert.strictEqual(b.publicable_solo, true);

// 2) Un borrador con datos de contacto nunca es publicable solo.
pedidos.length = 0;
guion = [mensaje([{ type: "text", text: JSON.stringify({ ...BORRADOR, respuesta: "Escríbeme al WhatsApp +56 9 1234 5678" }) }], "end_turn")];
const conContacto = await redactarBorrador({ pregunta: { id: 6, item_id: "MLC1", text: "¿Me das tu número?" }, ml: mlFalso, cliente });
assert.strictEqual(conContacto.publicable_solo, false);
assert.ok(conContacto.alertas.some((a) => a.id === "contacto"));

// 3) Rechazo de la IA: error legible.
guion = [mensaje([], "refusal")];
await assert.rejects(redactarBorrador({ pregunta: { id: 7, item_id: "MLC1", text: "x" }, ml: mlFalso, cliente }), /a mano/);

// Resumen: descarta atributos vacíos
assert.deepStrictEqual(resumirPublicacion(await mlFalso.publicacion("MLC1")).atributos, ["Marca: Genérica"]);

console.log("agente.test.mjs: OK");
