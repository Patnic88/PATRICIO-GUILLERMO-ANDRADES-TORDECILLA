// Pruebas de las funciones con IA. Ejecutar: node tests/ia.test.js
// No llaman a la API real: usan el SDK incluido con un fetch simulado que
// registra cada solicitud y entrega respuestas de prueba (inventadas).
const assert = require("assert");
require("../vendor/anthropic-sdk-0.127.0.js");
const IA = require("../ia.js");
const SDK = globalThis.AnthropicSDK;

// ---- Costos y presupuesto --------------------------------------------------
const usoBase = { input_tokens: 1000000, output_tokens: 100000 };
const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
cerca(IA.costoUSD({ model: "claude-opus-5-5", usage: usoBase }, "claude-opus-5-5"), 4 + 2);
cerca(IA.costoUSD({ model: "claude-haiku-5-5", usage: usoBase }, "claude-haiku-5-5"), 0.1 + 0.05);
// Respaldo a un modelo más caro: se cobra todo al más caro.
cerca(IA.costoUSD({ model: "claude-opus-4-8", usage: usoBase }, "claude-opus-5-5"), 5 + 2.5);
// Modelo desconocido: precio más alto conocido (conservador).
cerca(IA.costoUSD({ model: "otro", usage: usoBase }, "otro"), 10 + 5);

let reg = IA.sumarGasto(null, 30);
reg = IA.sumarGasto(reg, 55);
let est = IA.estadoPresupuesto(reg, 100);
assert.strictEqual(est.gastado, 85);
assert.strictEqual(est.llamadas, 2);
assert.ok(est.aviso && !est.bloqueado);
est = IA.estadoPresupuesto(IA.sumarGasto(reg, 15), 100);
assert.ok(est.bloqueado);
assert.strictEqual(est.restante, 0);

const tipico = IA.costoTipico("claude-opus-5-5");
cerca(tipico.extraer, (3000 * 4 + 2500 * 20) / 1e6);
assert.ok(IA.costoTipico("claude-haiku-5-5").verificar < tipico.verificar);

// ---- Citas -------------------------------------------------------------------
const noticia = "El jueves 25 de marzo de 2015 un «aluvión» afectó a Chañaral y Diego de Almagro.";
assert.ok(IA.citaEnTexto("un aluvión afectó a  CHANARAL", noticia));
assert.ok(!IA.citaEnTexto("un aluvión afectó a Copiapó", noticia));
assert.ok(!IA.citaEnTexto("un", noticia), "una cita demasiado corta no cuenta");

// ---- Esquemas: todo objeto cerrado y con todos sus campos requeridos ---------
function revisarEsquema(s, ruta = "raíz") {
  if (s.type === "object") {
    assert.strictEqual(s.additionalProperties, false, `${ruta}: falta additionalProperties false`);
    assert.deepStrictEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${ruta}: required incompleto`);
    for (const [k, v] of Object.entries(s.properties)) revisarEsquema(v, `${ruta}.${k}`);
  }
  if (s.type === "array") revisarEsquema(s.items, `${ruta}[]`);
}
revisarEsquema(IA.ESQUEMA_EXTRACCION);
revisarEsquema(IA.HERRAMIENTA_VEREDICTO.input_schema);
assert.strictEqual(IA.HERRAMIENTA_VEREDICTO.strict, true);

// ---- Parámetros por modelo ---------------------------------------------------
const pOpus = IA.peticionBase("claude-opus-5-5", 100, "low");
assert.deepStrictEqual(pOpus.betas, ["server-side-fallback-2026-07-01"]);
assert.strictEqual(pOpus.fallbacks, "default");
const pHaiku = IA.peticionBase("claude-haiku-5-5", 100, "low");
assert.strictEqual(pHaiku.fallbacks, undefined, "Haiku 5.5 no lleva respaldo");
assert.strictEqual(pHaiku.betas, undefined);
assert.throws(() => IA.peticionExtraccion({ texto: "x".repeat(IA.MAX_CARACTERES_TEXTO + 1) }), /máximo/);
assert.throws(() => IA.peticionExtraccion({ texto: "   " }), /Pega el texto/);
assert.throws(() => IA.peticionVerificacion({ evento: { fuente_url: "" } }), /enlace/);
// La lectura web con filtrado dinámico es solo para Opus y Sonnet; Haiku usa la básica.
const evPrueba = { fecha: "2015-03-25", localidad: "X", fuente_url: "https://ejemplo.cl" };
assert.strictEqual(IA.peticionVerificacion({ evento: evPrueba, modelo: "claude-haiku-5-5" }).tools[0].type, "web_fetch_20250910");
assert.strictEqual(IA.peticionVerificacion({ evento: evPrueba, modelo: "claude-sonnet-5-5" }).tools[0].type, "web_fetch_20260209");

// ---- Validación de la extracción --------------------------------------------
const val = IA.validarExtraccion({
  es_aluvion_en_chile: true,
  eventos: [
    { fecha: "2015-03-25", localidad: "Chañaral", cita_textual: "un aluvión afectó a Chañaral" },
    { fecha: "25/03/2015", localidad: "Copiapó", cita_textual: "texto que no está" },
  ],
}, noticia);
assert.strictEqual(val.eventos[0].citaOk, true);
assert.strictEqual(val.eventos[0].alertas.length, 0);
assert.strictEqual(val.eventos[1].fecha, null, "fecha mal formada se descarta");
assert.strictEqual(val.eventos[1].citaOk, false);
assert.strictEqual(val.eventos[1].alertas.length, 3);

// ---- Llamadas con fetch simulado --------------------------------------------
function fetchSimulado(respuestas) {
  const solicitudes = [];
  const fn = async (url, init) => {
    const headers = new Headers(init.headers);
    solicitudes.push({ url: String(url), headers, body: JSON.parse(init.body) });
    const r = respuestas.shift();
    return new Response(JSON.stringify(r.cuerpo), { status: r.status || 200, headers: { "content-type": "application/json", "request-id": "req_prueba" } });
  };
  return { fn, solicitudes };
}
const mensaje = (content, extra = {}) => ({
  id: "msg_prueba", type: "message", role: "assistant", model: "claude-opus-5-5",
  content, stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 2000, output_tokens: 500 }, ...extra,
});

function cuentaPrueba(presupuesto = 100) {
  let registro = null;
  return {
    puedeGastar: () => !IA.estadoPresupuesto(registro, presupuesto).bloqueado,
    gastar: (c) => { registro = IA.sumarGasto(registro, c); },
    total: () => (registro ? registro.gastado : 0),
  };
}

(async () => {
  // 1. Extracción: forma de la solicitud y lectura de la respuesta.
  {
    const salida = { es_aluvion_en_chile: true, eventos: [{ fecha: "2015-03-25", localidad: "Chañaral", comuna: null, region: "Atacama", fallecidos: null, fallecidos_texto: null, desencadenante: null, descripcion: "Prueba", cita_textual: "un aluvión afectó a Chañaral", observaciones: null }] };
    const f = fetchSimulado([{ cuerpo: mensaje([{ type: "text", text: JSON.stringify(salida) }]) }]);
    const cliente = IA.crearCliente("sk-prueba", { SDK, fetch: f.fn });
    const cuenta = cuentaPrueba();
    const res = await IA.extraerAluviones(cliente, { texto: noticia, url: "https://ejemplo.cl/nota" }, cuenta);
    assert.strictEqual(res.eventos.length, 1);
    assert.strictEqual(res.eventos[0].citaOk, true);
    const s = f.solicitudes[0];
    assert.match(s.url, /\/v1\/messages(\?beta=true)?$/);
    assert.strictEqual(s.headers.get("x-api-key"), "sk-prueba");
    assert.strictEqual(s.headers.get("anthropic-dangerous-direct-browser-access"), "true");
    assert.match(s.headers.get("anthropic-beta") || "", /server-side-fallback-2026-07-01/);
    assert.strictEqual(s.body.model, "claude-opus-5-5");
    assert.strictEqual(s.body.fallbacks, "default");
    assert.strictEqual(s.body.betas, undefined, "betas va como encabezado, no en el cuerpo");
    assert.strictEqual(s.body.output_config.format.type, "json_schema");
    assert.strictEqual(s.body.output_config.effort, "medium");
    assert.ok(!("thinking" in s.body), "en Opus 5.5 no se envía thinking");
    assert.ok(Math.abs(res.costo - (2000 * 4 + 500 * 20) / 1e6) < 1e-12);
    assert.ok(Math.abs(cuenta.total() - res.costo) < 1e-12);
  }

  // 2. Verificación: pausa del servidor, luego veredicto por herramienta.
  {
    const veredicto = { pagina_leida: true, confirma_fecha: "si", fecha_en_fuente: "25 de marzo de 2015", confirma_lugar: "si", lugar_en_fuente: "Chañaral", fallecidos_en_fuente: null, cita_textual: "…", observaciones: "Coincide." };
    const f = fetchSimulado([
      { cuerpo: mensaje([{ type: "server_tool_use", id: "srvtoolu_1", name: "web_fetch", input: { url: "https://ejemplo.cl/nota" } }], { stop_reason: "pause_turn" }) },
      { cuerpo: mensaje([
        { type: "web_fetch_tool_result", tool_use_id: "srvtoolu_1", content: { error_code: "url_not_accessible" } },
        { type: "tool_use", id: "toolu_1", name: "registrar_verificacion", input: veredicto },
      ], { stop_reason: "tool_use" }) },
    ]);
    const cliente = IA.crearCliente("sk-prueba", { SDK, fetch: f.fn });
    const res = await IA.verificarFuente(cliente, { evento: { fecha: "2015-03-25", localidad: "Chañaral", fuente_url: "https://ejemplo.cl/nota" } }, cuentaPrueba());
    assert.deepStrictEqual(res.resultado, veredicto);
    assert.deepStrictEqual(res.errores, ["url_not_accessible"]);
    assert.strictEqual(f.solicitudes.length, 2);
    const segunda = f.solicitudes[1].body;
    assert.strictEqual(segunda.messages.length, 2, "se reenvía el turno pausado");
    assert.strictEqual(segunda.messages[1].role, "assistant");
    const herramientas = f.solicitudes[0].body.tools;
    assert.strictEqual(herramientas[0].type, "web_fetch_20260209");
    assert.strictEqual(herramientas[1].strict, true);
    assert.ok(!("tool_choice" in f.solicitudes[0].body), "Opus 5.5 no acepta tool_choice forzado");
  }

  // 3. Informe: agrega la frase de cierre si falta; rechazo; presupuesto agotado.
  {
    const f = fetchSimulado([
      { cuerpo: mensaje([{ type: "text", text: "Párrafo de prueba." }], { model: "claude-haiku-5-5" }) },
      { cuerpo: mensaje([], { stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } }) },
    ]);
    const cliente = IA.crearCliente("sk-prueba", { SDK, fetch: f.fn });
    const res = await IA.redactarInforme(cliente, { datos: { indice: 10 }, modelo: "claude-haiku-5-5" }, cuentaPrueba());
    assert.ok(res.texto.endsWith(IA.CIERRE_INFORME));
    assert.strictEqual(f.solicitudes[0].body.output_config.effort, "low");
    assert.strictEqual(f.solicitudes[0].body.fallbacks, undefined);
    await assert.rejects(IA.redactarInforme(cliente, { datos: {} }, cuentaPrueba()), /reglas de seguridad/);
    const agotada = cuentaPrueba(0);
    await assert.rejects(IA.redactarInforme(cliente, { datos: {} }, agotada), /presupuesto/);
  }

  // 4. Errores tipados del SDK → mensajes en español.
  {
    const f = fetchSimulado([{ status: 401, cuerpo: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }]);
    const cliente = IA.crearCliente("sk-mala", { SDK, fetch: f.fn });
    try {
      await IA.redactarInforme(cliente, { datos: {} }, cuentaPrueba());
      assert.fail("debió fallar");
    } catch (e) {
      assert.match(IA.mensajeError(e, SDK), /clave de la API no es válida/);
    }
  }
  assert.throws(() => IA.crearCliente("", { SDK }), /Falta la clave/);

  console.log("OK: pruebas de IA pasaron");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
