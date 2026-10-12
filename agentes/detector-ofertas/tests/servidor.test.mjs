// Pruebas del servidor y del cliente de IA con dobles (sin llamar a la API).
// Ejecutar: node tests/servidor.test.mjs
import assert from "node:assert";
import { crearServidor } from "../servidor.mjs";
import { analizarConIA, ESQUEMA, MODELO } from "../analizar-ia.mjs";

const RESULTADO = {
  es_oferta_laboral: true, nivel_riesgo: "alto", resumen: "Reúne señales típicas.", texto_detectado: "",
  marca_mencionada: "Mercado Libre", senales: [{ senal: "Pago diario", evidencia: "Pago diario", por_que_importa: "Anzuelo." }],
  senales_a_favor: [], que_hacer: ["Verifica en el sitio oficial."], que_no_hacer: ["No deposites."],
};

// 1) analizarConIA arma bien la solicitud y lee el JSON de salida.
let pedido;
const clienteFalso = { beta: { messages: { create: async (p) => {
  pedido = p;
  return { stop_reason: "end_turn", model: p.model, usage: { input_tokens: 10, output_tokens: 5 },
    content: [{ type: "text", text: JSON.stringify(RESULTADO) }] };
} } } };
const img = { media_type: "image/jpeg", data: "QUJD" };
const salida = await analizarConIA({ texto: "Ingreso diario", imagen: img, senalesLocales: [{ titulo: "Pago diario", evidencia: "x" }] }, clienteFalso);
assert.deepStrictEqual(salida.resultado, RESULTADO);
assert.strictEqual(pedido.model, MODELO);
assert.strictEqual(pedido.fallbacks, "default");
assert.deepStrictEqual(pedido.betas, ["server-side-fallback-2026-07-01"]);
assert.deepStrictEqual(pedido.output_config.format, { type: "json_schema", schema: ESQUEMA });
assert.strictEqual(pedido.messages[0].content[0].type, "image");
assert.ok(pedido.messages[0].content[1].text.includes("<aviso>\nIngreso diario\n</aviso>"));
assert.ok(!("thinking" in pedido), "en este modelo el pensamiento se controla con effort");

// 2) Rechazo y respuesta cortada se convierten en errores legibles.
for (const stop of ["refusal", "max_tokens"]) {
  const c = { beta: { messages: { create: async () => ({ stop_reason: stop, content: [] }) } } };
  await assert.rejects(analizarConIA({ texto: "x" }, c), /IA/);
}

// 3) Servidor: estáticos permitidos, archivos internos bloqueados, clave y límite.
const registros = [];
const servidor = crearServidor({
  analizarConIA: async () => ({ resultado: RESULTADO, modelo: "m", uso: { input_tokens: 1, output_tokens: 1 } }),
  claves: ["cliente-123"], limitePorHora: 1, iaDisponible: true, registrar: (l) => registros.push(l),
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const post = (cuerpo, clave) => fetch(base + "/api/analizar", {
  method: "POST", headers: { "content-type": "application/json", "x-clave-cliente": clave || "" }, body: JSON.stringify(cuerpo),
});

try {
  assert.strictEqual((await fetch(base + "/")).status, 200);
  assert.strictEqual((await fetch(base + "/senales.js")).status, 200);
  assert.strictEqual((await fetch(base + "/servidor.mjs")).status, 404, "no expone código del servidor");
  assert.strictEqual((await fetch(base + "/package.json")).status, 404);
  assert.deepStrictEqual(await (await fetch(base + "/api/estado")).json(), { ia: true, requiereClave: true });

  assert.strictEqual((await post({ texto: "Ingreso diario" })).status, 401, "sin clave");
  assert.strictEqual((await post({}, "cliente-123")).status, 400, "sin texto ni imagen");
  assert.strictEqual((await post({ imagen: { media_type: "text/html", data: "x" } }, "cliente-123")).status, 400);

  const ok = await post({ texto: "Mercado Libre. Ingreso diario: 60.000 CLP. Pago diario." }, "cliente-123");
  const datos = await ok.json();
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(datos.ia.nivel_riesgo, "alto");
  assert.ok(datos.reglas.senales.length > 0);
  assert.strictEqual(registros.length, 1);
  assert.ok(!JSON.stringify(registros[0]).includes("Ingreso"), "el registro no guarda el aviso");

  const limitado = await post({ texto: "Ingreso diario: 60.000 CLP" }, "cliente-123");
  assert.strictEqual(limitado.status, 429);
  assert.ok((await limitado.json()).reglas, "aun al límite devuelve el resultado de reglas");
} finally {
  servidor.close();
}

console.log("servidor.test.mjs: OK");
