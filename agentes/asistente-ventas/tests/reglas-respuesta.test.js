// Pruebas de la revisión automática de respuestas. Ejecutar: node tests/reglas-respuesta.test.js
const assert = require("assert");
const R = require("../reglas-respuesta.js");
const ids = (t) => R.revisar(t).alertas.map((a) => a.id);

// Respuesta normal: sin alertas
const ok = R.revisar("  Hola, sí tenemos 3 unidades disponibles y el envío es gratis. ¡Quedamos atentos!  ");
assert.deepStrictEqual(ok.alertas, []);
assert.strictEqual(ok.bloqueada, false);
assert.ok(!ok.texto.startsWith(" "), "recorta espacios");

// Contacto, enlaces y pagos por fuera bloquean
assert.deepStrictEqual(ids("Escríbeme al WhatsApp +56 9 1234 5678"), ["contacto"]);
assert.deepStrictEqual(ids("Mi correo es ventas@tienda.cl"), ["contacto", "enlace"]);
assert.deepStrictEqual(ids("Mira más modelos en www.mitienda.cl"), ["enlace"]);
assert.deepStrictEqual(ids("Si quieres te hago descuento por transferencia"), ["pagoExterno"]);
assert.ok(R.revisar("Te hago descuento por transferencia").bloqueada);

// Promesa absoluta: alerta que no bloquea
const promesa = R.revisar("Producto 100% original, garantizado.");
assert.deepStrictEqual(promesa.alertas.map((a) => a.id), ["promesa"]);
assert.strictEqual(promesa.bloqueada, false);

// Vacía y demasiado larga
assert.deepStrictEqual(ids("   "), ["vacia"]);
assert.deepStrictEqual(ids("a".repeat(2001)), ["larga"]);
assert.deepStrictEqual(ids("a".repeat(2000)), []);

console.log("reglas-respuesta.test.js: OK");
