// Consultas nuevas: presentación, recepción gradual, clasificación y base de conocimiento.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAppPrueba, decir } from "./ayuda.js";

test("primer contacto: se presenta como asistente virtual y no como Patricio", async () => {
  const { app } = crearAppPrueba();
  const { texto } = await decir(app, "56930000001", "Hola");
  assert.match(texto, /asistente virtual de A & A jurídico y contable/);
  assert.doesNotMatch(texto, /soy patricio/i);
  assert.equal((texto.match(/\?/g) || []).length, 1, "una pregunta a la vez");
});

test("recepción gradual: registra datos, clasifica materia y no repite preguntas", async () => {
  const { app, db } = crearAppPrueba();
  const tel = "56930000002";
  await decir(app, tel, "Hola");
  const r1 = await decir(app, tel, "Me llamo Ana Pérez");
  assert.doesNotMatch(r1.texto, /nombre/i, "no vuelve a pedir el nombre");
  await decir(app, tel, "Quiero constituir una sociedad para un emprendimiento de turismo con mi hermano");
  const r3 = await decir(app, tel, "Vivo en Los Vilos");
  assert.match(r3.texto, /documentos/i);
  const s = db.prepare("SELECT * FROM solicitudes").get();
  assert.equal(s.nombre_declarado, "Ana Pérez");
  assert.equal(s.materia, "constitucion_empresa");
  assert.equal(s.comuna, "Los Vilos");
  assert.equal(s.tipo_cliente, "nuevo");
  const ant = db.prepare("SELECT campo, origen FROM antecedentes").all();
  assert.ok(ant.length >= 3 && ant.every((a) => a.origen === "declarado"), "todo lo dicho por el cliente queda como 'declarado'");
});

test("causa judicial: pide tribunal, rol/RIT, resolución y fecha de notificación", async () => {
  const { app, db } = crearAppPrueba();
  const tel = "56930000003";
  await decir(app, tel, "Me llamo Pedro Rojas");
  const r = await decir(app, tel, "Me llegó una demanda en mi contra por una deuda, rol C-123-2026 del Juzgado de Letras de Illapel");
  const s = db.prepare("SELECT datos FROM solicitudes").get();
  const datos = JSON.parse(s.datos);
  assert.equal(datos.rol_rit, "C-123-2026");
  assert.match(datos.tribunal, /Juzgado de Letras de Illapel/);
  const faltan = await decir(app, tel, "Vivo en Illapel");
  assert.match(faltan.texto, /resolución|notific/i);
  assert.ok(r.texto);
});

test("base de conocimiento: un dato pendiente no se informa ni se inventa", async () => {
  const { app } = crearAppPrueba();
  const { texto, r } = await decir(app, "56930000004", "¿Cuánto cobran por la primera consulta?");
  assert.match(texto, /no está confirmada/i);
  assert.doesNotMatch(texto, /\$\s?\d/);
  const kb = r.turno.acciones.find((a) => a.herramienta === "consultar_base_conocimiento").resultado;
  assert.equal(kb.mejor_coincidencia.estado, "no_aprobado");
});

test("base de conocimiento: un dato aprobado en el panel sí se informa", async () => {
  const { app, db } = crearAppPrueba();
  db.prepare("UPDATE conocimiento SET contenido = 'La consulta inicial tiene un valor de $30.000.', estado = 'aprobado' WHERE clave = 'honorarios.consulta_inicial'").run();
  const { texto, r } = await decir(app, "56930000005", "¿Cuánto cobran por la consulta inicial?");
  assert.match(texto, /\$30\.000/);
  assert.deepEqual(r.turno.problemas, []);
});
