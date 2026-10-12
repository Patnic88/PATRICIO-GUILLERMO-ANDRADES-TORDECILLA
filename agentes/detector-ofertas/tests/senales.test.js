// Pruebas del motor de reglas. Ejecutar: node tests/senales.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("../senales.js");

const ids = (r) => r.senales.map((s) => s.id);

// Aviso real de la captura (TikTok, octubre 2026): debe quedar en riesgo alto.
const aviso = fs.readFileSync(path.join(__dirname, "../ejemplos/aviso-tiktok-mercadolibre.txt"), "utf8");
const r = S.analizar(aviso);
assert.strictEqual(r.nivel, "alto");
assert.strictEqual(r.marca, "Mercado Libre");
for (const id of ["marcaEmpleo", "montoDiario", "tareaVaga", "pagoDiario", "urgencia"]) {
  assert.ok(ids(r).includes(id), `falta la señal ${id}`);
}
assert.ok(!ids(r).includes("pidePago"), "el aviso no pide dinero; no debe marcarse");
assert.ok(r.senales.every((s) => s.evidencia.length > 0), "cada señal lleva evidencia");

// Oferta formal (ficticia): sin señales, con señales a favor y riesgo bajo.
const formal = S.analizar("Se busca vendedor(a) para tienda de ropa en Illapel. Contrato indefinido, sueldo base $550.000 más comisiones. Requisitos: enseñanza media completa y 1 año de experiencia. Envía tu CV a postulaciones@tiendaejemplo.cl. Entrevista presencial.");
assert.strictEqual(formal.nivel, "bajo");
assert.deepStrictEqual(ids(formal), []);
assert.deepStrictEqual(formal.aFavor.map((s) => s.id), ["contrato", "procesoFormal"]);
assert.deepStrictEqual(formal.enlaces, [], "un correo no es un enlace");

// Una sola señal crítica basta para riesgo alto, aunque mencione contrato.
const deposito = S.analizar("Contrato indefinido. Para activar tu cuenta debes hacer un depósito de $20.000 que se devuelve con tu primer pago.");
assert.strictEqual(deposito.nivel, "alto");
assert.ok(ids(deposito).includes("pidePago"));

const claves = S.analizar("Para pagarte necesitamos tu clave bancaria y el código que te llegará por SMS.");
assert.strictEqual(claves.nivel, "alto");
assert.ok(ids(claves).includes("datosSensibles"));
// "palabras clave" no es pedir una clave
assert.ok(!ids(S.analizar("Buscamos redactor con manejo de palabras clave SEO para blog.")).includes("datosSensibles"));

// Enlaces: acortadores, dominios de riesgo y dominio que no es de la marca.
const enlaces = S.analizar("Trabaja con Mercado Libre desde tu casa. Postula aquí: https://mercado-libre-empleos.xyz/registro o en bit.ly/abc123");
assert.ok(ids(enlaces).includes("enlaceSospechoso"));
assert.ok(ids(enlaces).includes("dominioNoOficial"));
const oficial = S.analizar("Únete al equipo de Mercado Libre. Revisa las vacantes en https://www.mercadolibre.cl/empleos");
assert.ok(!ids(oficial).includes("dominioNoOficial"), "subdominio/dominio oficial no se marca");

// Mensajería y número chileno
assert.ok(ids(S.analizar("Gana dinero extra. Escríbenos al +56 9 1234 5678 para más info")).includes("mensajeria"));

// Montos: "60.000" no es un dominio
assert.deepStrictEqual(S.extraerEnlaces("Ingreso diario 60.000 – 80.000 CLP"), []);

// Texto vacío o muy corto
assert.strictEqual(S.analizar("").nivel, "sin_datos");
assert.strictEqual(S.analizar("hola").nivel, "sin_datos");

// Puntaje acotado a 0–100
const todo = S.analizar("Mercado Libre trabajo desde casa. Ingreso diario $90.000. Pago diario. Sin experiencia. Dar me gusta a productos. Escríbenos por WhatsApp. Últimos cupos. Depósito para activar tu cuenta. Envía foto de tu carnet. bit.ly/x");
assert.strictEqual(todo.puntaje, 100);

console.log("senales.test.js: OK");
