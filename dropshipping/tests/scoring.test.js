// Pruebas del motor de puntuación y generadores. Ejecutar: node tests/scoring.test.js
const assert = require("assert");
const S = require("../scoring.js");
const G = require("../generadores.js");

const hoy = new Date("2026-10-06T12:00:00");
const todos = Object.fromEntries(S.CRITERIOS.map((c) => [c.id, true]));

// Datos de prueba ficticios.
const fuerte = {
  producto: "Producto de prueba", vistas: 1000000, likes: 80000, comentarios: 4000, compartidos: 16000,
  comentariosCompra: 400, fechaPublicacion: "2026-09-26", diasActivo: 35,
  precioVenta: 20000, costoProducto: 5000, costoEnvio: 2000, criterios: todos,
};

// Métricas básicas
const m = S.metricas(fuerte, hoy);
assert.strictEqual(m.engagement, 0.1);
assert.strictEqual(m.dias, 10);
assert.strictEqual(m.vistasDia, 100000);
assert.strictEqual(m.margen, 0.65);

// Producto fuerte en todo -> 100 y "Ganador probable"
const p = S.puntuar(fuerte, hoy);
assert.strictEqual(p.total, 100);
assert.strictEqual(p.veredicto, "Ganador probable");

// Un criterio bloqueante sin marcar -> "No apto" aunque el puntaje sea alto
const conMarca = { ...fuerte, criterios: { ...todos, sinMarca: false } };
const pb = S.puntuar(conMarca, hoy);
assert.strictEqual(pb.veredicto, "No apto");
assert.strictEqual(pb.bloqueos.length, 1);

// Registro vacío -> 0 sin errores (sin divisiones por cero)
const vacio = S.puntuar({}, hoy);
assert.strictEqual(vacio.total, 0);
assert.strictEqual(vacio.veredicto, "No apto");

// Precio sugerido con redondeo psicológico
assert.strictEqual(S.precioSugerido(7000, 2.8, "CLP"), 19990);
assert.strictEqual(S.precioSugerido(8.5, 2.8, "USD"), 23.99);
assert.strictEqual(S.precioSugerido(0), 0);

// Frecuencias y mediana
const f = S.frecuencias([{ o: "A" }, { o: "B" }, { o: "A" }, { o: "" }], "o");
assert.deepStrictEqual(f[0], { valor: "A", n: 2, pct: 0.5 });
assert.strictEqual(S.mediana([3, 1, 2, 0]), 2);

// Ficha y CSV
const ficha = G.ficha({ ...fuerte, producto: "Corrector Ñandú, \"Pro\"", tipoGancho: "Pregunta" });
assert.strictEqual(ficha.handle, "corrector-nandu-pro");
assert.strictEqual(ficha.precio, 19990);
assert.ok(ficha.descripcionHtml.includes("&quot;Pro&quot;"), "el HTML debe ir escapado");

const csv = G.csvShopify([ficha]).split("\n");
assert.ok(csv[0].startsWith("Handle,Title,Body (HTML)"));
assert.ok(csv[1].includes('"Corrector Ñandú, ""Pro"""'), "comillas y comas escapadas en CSV");

const json = G.jsonShopify(ficha);
assert.strictEqual(json.producto.status, "DRAFT");

assert.ok(G.guion({ tipoGancho: "Pregunta", formato: "Unboxing" }).includes("0–3 s"));

console.log("✔ Todas las pruebas pasaron");
