// Pruebas del motor de predicción (engine.js). Ejecuta:  node test/engine.test.js
"use strict";
const assert = require("assert");
const path = require("path");
const E = require(path.join(__dirname, "..", "engine.js"));

let pasadas = 0;
function test(nombre, fn) {
  try {
    fn();
    pasadas++;
    console.log("  ✓ " + nombre);
  } catch (err) {
    console.error("  ✗ " + nombre + "\n    " + err.message);
    process.exitCode = 1;
  }
}

// --- Utilidades de texto ---------------------------------------------------

test("normalizar quita tildes, mayúsculas y puntuación", () => {
  assert.strictEqual(E.normalizar("Confianza LEGÍTIMA, sí."), "confianza legitima  si ");
});

test("tokens descarta palabras cortas y stopwords", () => {
  const t = E.tokens("el recurso de protección fue acogido");
  assert.deepStrictEqual(t, ["recurso", "proteccion", "acogido"]);
});

test("jaccard mide el solape de conjuntos", () => {
  assert.strictEqual(E.jaccard(E.setDe("contrata municipal"), E.setDe("contrata funcionario")), 1 / 3);
  assert.strictEqual(E.jaccard(new Set(), new Set(["x"])), 0);
});

// --- TF-IDF y coseno -------------------------------------------------------

test("coseno es 1 para vectores idénticos y 0 para disjuntos", () => {
  const a = new Map([["contrata", 2], ["confianza", 1]]);
  const b = new Map([["contrata", 2], ["confianza", 1]]);
  assert.ok(Math.abs(E.coseno(a, b) - 1) < 1e-9);
  assert.strictEqual(E.coseno(a, new Map([["otro", 3]])), 0);
});

test("IDF baja el peso de términos frecuentes en el corpus", () => {
  const docs = [E.frecuencias("contrata comun"), E.frecuencias("contrata rara"), E.frecuencias("contrata otra")];
  const idf = E.calcularIDF(docs);
  // 'contrata' está en los 3 documentos; 'rara' solo en 1 => rara pesa más.
  assert.ok(idf.get("rara") > idf.get("contrata"));
});

test("terminosComunes prioriza los términos más distintivos (mayor IDF)", () => {
  const idf = new Map([["contrata", 0.3], ["confianza", 1.2]]);
  const comunes = E.terminosComunes(
    new Map([["contrata", 1], ["confianza", 1]]),
    new Map([["contrata", 1], ["confianza", 1]]),
    idf, 1
  );
  assert.deepStrictEqual(comunes, ["confianza"]);
});

// --- Ponderación y etiquetas ----------------------------------------------

test("pesoAnio decae con la antigüedad y tiene piso 0.5", () => {
  assert.strictEqual(E.pesoAnio(2026, 2026), 1);
  assert.strictEqual(E.pesoAnio(2016, 2026), 0.5);   // 10 años -> piso
  assert.strictEqual(E.pesoAnio(1990, 2026), 0.5);   // no baja del piso
  assert.strictEqual(E.pesoAnio(null, 2026), 0.7);   // sin año
});

test("valorResultado y etiquetaResultado mapean los tres estados", () => {
  assert.strictEqual(E.valorResultado("acoge"), 1);
  assert.strictEqual(E.valorResultado("acoge_parcial"), 0.5);
  assert.strictEqual(E.valorResultado("rechaza"), 0);
  assert.strictEqual(E.etiquetaResultado("acoge_parcial"), "Acoge parcial");
});

// --- predecirCore (integración) -------------------------------------------

const BASE = [
  { id: "a", anio: 2025, sala: "Tercera", recurso: "Protección", tema: "Funcionarios municipales",
    resultado: "acoge", resumen: "confianza legitima renovaciones sucesivas larga duracion motivacion", palabras: [] },
  { id: "b", anio: 2025, sala: "Tercera", recurso: "Protección", tema: "Funcionarios municipales",
    resultado: "rechaza", resumen: "contrata sin cinco años confianza legitima cargo de confianza", palabras: [] },
  { id: "c", anio: 2024, sala: "Primera", recurso: "Casación en el fondo", tema: "Responsabilidad municipal",
    resultado: "acoge", resumen: "falta de servicio via publica nexo causal indemnizacion", palabras: [] }
];

test("predecirCore devuelve ok:false sin coincidencias", () => {
  const r = E.predecirCore(BASE, { recurso: "", sala: "", tema: "", hechos: "materia totalmente ajena xyzzy" }, 2026);
  assert.strictEqual(r.ok, false);
});

test("predecirCore prioriza el fallo temáticamente más cercano", () => {
  const caso = { recurso: "Protección", sala: "Tercera", tema: "Funcionarios municipales",
    hechos: "no renovacion de contrata con renovaciones sucesivas de larga duracion, confianza legitima y falta de motivacion" };
  const r = E.predecirCore(BASE, caso, 2026);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.top[0].fallo.id, "a");                 // el de larga duración
  assert.ok(r.top[0].comunes.length > 0);                     // muestra términos comunes
  assert.ok(r.probabilidad >= 0 && r.probabilidad <= 1);      // probabilidad válida
});

test("predecirCore: probabilidad 1 si el único match es 'acoge'", () => {
  const soloAcoge = [BASE[2]];
  const r = E.predecirCore(soloAcoge, { recurso: "Casación en el fondo", sala: "Primera",
    tema: "Responsabilidad municipal", hechos: "falta de servicio en via publica con nexo causal" }, 2026);
  assert.strictEqual(r.ok, true);
  assert.ok(Math.abs(r.probabilidad - 1) < 1e-9);
});

console.log(`\n${pasadas} pruebas OK`);
