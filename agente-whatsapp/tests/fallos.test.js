// Fallos: herramientas, proveedor de IA, WhatsApp y reinicios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAppPrueba, decir, habilitarAgenda, iaGuionada, alertas, payloadTexto } from "./ayuda.js";
import { HERRAMIENTAS } from "../src/agente/herramientas.js";
import { MENSAJE_FALLO_TECNICO } from "../src/agente/turno.js";

test("si una herramienta falla, el agente no afirma la gestión y se alerta a Patricio", async () => {
  const herramientas = { ...HERRAMIENTAS, agendar_cita: { ...HERRAMIENTAS.agendar_cita, ejecutar() { throw new Error("base de datos bloqueada"); } } };
  const { app, db } = crearAppPrueba({ herramientas });
  habilitarAgenda(db);
  await decir(app, "56960000001", "Me llamo Inés Castro");
  await decir(app, "56960000001", "quiero agendar una cita");
  const { texto, r } = await decir(app, "56960000001", "1");
  assert.match(texto, /no quedó agendada/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM citas").get().n, 0);
  assert.equal(alertas(db, "fallo_herramienta").length, 1);
  assert.equal(r.turno.acciones.find((a) => a.herramienta === "agendar_cita").resultado.error, "base de datos bloqueada");
});

test("si el proveedor de IA falla, se informa con honestidad una sola vez y se alerta", async () => {
  const ia = iaGuionada([new Error("anthropic 529 OverloadedError"), new Error("anthropic 529 OverloadedError")]);
  const { app, db } = crearAppPrueba({ ia });
  const r1 = await decir(app, "56960000002", "Hola, necesito ayuda");
  assert.equal(r1.texto, MENSAJE_FALLO_TECNICO);
  const r2 = await decir(app, "56960000002", "¿Hola?");
  assert.equal(r2.texto, null, "no repite el aviso dentro de la ventana");
  assert.ok(alertas(db, "fallo_ia").length >= 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mensajes WHERE direccion = 'entrante' AND estado = 'error'").get().n, 2);
});

test("rechazo del modelo (stop_reason refusal) se trata como falla, sin texto parcial", async () => {
  const ia = { nombre: "x", async generar() { return { content: [], stop_reason: "refusal", modelo: "x" }; } };
  const { app } = crearAppPrueba({ ia });
  const { texto } = await decir(app, "56960000003", "Hola");
  assert.equal(texto, MENSAJE_FALLO_TECNICO);
});

test("si WhatsApp falla al enviar, queda 'fallido', se alerta y no se reenvía en duplicado", async () => {
  const { app, db, whatsapp } = crearAppPrueba();
  whatsapp.fallar = true;
  app.procesador.ingresarWebhook(payloadTexto({ id: "f1", texto: "Hola" }));
  await app.procesador.revisarCola();
  await app.procesador.revisarCola();
  assert.equal(db.prepare("SELECT estado FROM mensajes WHERE direccion = 'saliente'").get().estado, "fallido");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mensajes WHERE direccion = 'saliente'").get().n, 1);
  assert.equal(alertas(db, "envio_fallido").length, 1);
});

test("reinicio durante un envío: el mensaje queda 'incierto' y no se reenvía", () => {
  const { app, db } = crearAppPrueba();
  app.procesador.ingresarWebhook(payloadTexto({ id: "f2", texto: "Hola" }));
  const conv = db.prepare("SELECT id FROM conversaciones").get().id;
  const entrante = db.prepare("SELECT id FROM mensajes").get().id;
  db.prepare("UPDATE mensajes SET estado = 'procesando'").run();
  db.prepare("INSERT INTO mensajes (conversacion_id, direccion, autor, texto, estado, en_respuesta_a, creado, actualizado) VALUES (?, 'saliente', 'agente', 'x', 'enviando', ?, 'a', 'a')").run(conv, entrante);
  app.procesador.recuperar();
  assert.equal(db.prepare("SELECT estado FROM mensajes WHERE direccion = 'saliente'").get().estado, "incierto");
  assert.equal(db.prepare("SELECT estado FROM mensajes WHERE direccion = 'entrante'").get().estado, "pendiente");
  assert.equal(alertas(db, "envio_incierto").length, 1);
});

test("entrada inválida del modelo a una herramienta se rechaza sin ejecutarla", async () => {
  const ia = iaGuionada([{ herramienta: "agendar_cita", entrada: { inicio: 5 } }, "No pude agendar."]);
  const { app, db } = crearAppPrueba({ ia });
  const { r } = await decir(app, "56960000004", "cita");
  assert.equal(r.turno.acciones[0].resultado.error, "entrada_invalida");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM citas").get().n, 0);
});

test("tope de respuestas por hora: deja de llamar a la IA y alerta (abuso o costos)", async () => {
  const { app, db } = crearAppPrueba({ env: { MAX_TURNOS_HORA: "2" } });
  await decir(app, "56960000005", "Hola");
  await decir(app, "56960000005", "Me llamo Ana");
  const r = await decir(app, "56960000005", "otro mensaje");
  assert.equal(r.texto, null);
  assert.equal(r.r.limitado, true);
  assert.equal(alertas(db, "limite_mensajes").length, 1);
});

test("una respuesta que no llegó al cliente no se usa como historial", async () => {
  const ia = iaGuionada(["Primera respuesta", "Segunda respuesta"]);
  const { app, db } = crearAppPrueba({ ia });
  await decir(app, "56960000006", "Hola");
  db.prepare("UPDATE mensajes SET estado = 'fallido' WHERE direccion = 'saliente'").run();
  await decir(app, "56960000006", "¿Hola?");
  assert.doesNotMatch(JSON.stringify(ia.llamadas[1].mensajes), /Primera respuesta/);
});
