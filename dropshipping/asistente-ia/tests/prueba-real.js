// Prueba REAL contra la API de Anthropic. GASTA SALDO (≈ USD 0,002 con Haiku 5.5).
// No forma parte de las pruebas automáticas. Requiere la variable ANTHROPIC_API_KEY.
// Ejecutar: node tests/prueba-real.js
//
// 1) Consulta la ficha de Haiku 5.5 (sin costo): ¿admite búsqueda web?
// 2) Ejecuta el prompt «Encontrar mi nicho» con el perfil de ejemplo usando el
//    mismo código de la app (claude.js) e imprime respuesta, uso y costo estimado.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const clave = process.env.ANTHROPIC_API_KEY;
if (!clave) {
  console.log("Falta la variable ANTHROPIC_API_KEY: no se hizo ninguna llamada.");
  process.exit(2);
}

vm.runInThisContext(fs.readFileSync(path.join(__dirname, "../vendor/anthropic-sdk.js"), "utf8"));
const C = require("../claude.js");
const P = require("../plantillas.js");

// baseURL explícita: así la clave solo va a la API pública de Anthropic aunque
// el entorno defina ANTHROPIC_BASE_URL para otro uso.
const cliente = new globalThis.AnthropicSDK.default({ apiKey: clave, baseURL: "https://api.anthropic.com", maxRetries: 1 });
const MODELO = "claude-haiku-5-5";

const perfil = {
  tienda: "Casa Zen", nicho: "orden para cocinas pequeñas", producto: "especiero giratorio",
  publico: "personas de 25 a 45 años que viven en departamento", pais: "Chile", moneda: "CLP",
  ia: "Claude", plataforma: "Shopify", proveedor: "AliExpress", tono: "Cercano", experiencia: "Principiante",
  canales: ["TikTok", "Instagram"], precioVenta: 14990, costoProducto: 4200, costoEnvio: 2500, presupuesto: 150000,
};

(async () => {
  const info = await cliente.models.retrieve(MODELO);
  const ws = info && info.capabilities && info.capabilities.server_tools && info.capabilities.server_tools.web_search;
  console.log(`Modelo: ${info.display_name || info.id}`);
  console.log(`Búsqueda web según la API: ${ws ? JSON.stringify(ws) : "el campo no viene en la respuesta"}`);

  const prompt = P.generar(P.buscar("nicho"), perfil).variantes[0].texto;
  const conv = {
    modelo: MODELO, esfuerzo: "low", busqueda: false,
    sistema: C.sistemaBase({ fecha: new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }), pais: "Chile", busqueda: false }),
    mensajes: [{ role: "user", content: prompt }],
  };
  const inicio = Date.now();
  const r = await C.ejecutarTurno(cliente, conv, {});
  const final = r.respuestas[r.respuestas.length - 1];
  const texto = C.resumirBloques(final.content).texto;
  console.log(`\nstop_reason: ${r.stop_reason} · modelo que respondió: ${final.model} · ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  console.log("usage:", JSON.stringify(final.usage));
  console.log(`Costo estimado por la app: ${C.usd(r.costo)}`);
  console.log("\nPrimeros 800 caracteres de la respuesta:\n" + texto.slice(0, 800));
})().catch((e) => {
  console.error("Falló:", C.explicarError(e).texto);
  process.exit(1);
});
