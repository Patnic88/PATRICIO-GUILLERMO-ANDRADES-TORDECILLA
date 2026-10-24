// Derivación a Patricio y pausa de respuestas automáticas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAppPrueba, decir, alertas, payloadTexto } from "./ayuda.js";
import { fijarModo } from "../src/servicios/conversaciones.js";
import { guardarAjuste } from "../src/db.js";

test("el cliente pide hablar con Patricio: se deriva y el agente queda en pausa", async () => {
  const { app, db } = crearAppPrueba();
  const r = await decir(app, "56910000001", "Quiero hablar con Patricio, por favor");
  assert.match(r.texto, /Patricio/);
  const conv = db.prepare("SELECT * FROM conversaciones").get();
  assert.equal(conv.modo, "humano");
  assert.equal(alertas(db, "derivacion").length, 1);
  const siguiente = await decir(app, "56910000001", "¿Sigue ahí?");
  assert.equal(siguiente.texto, null, "con la conversación en manos de Patricio no responde el agente");
  assert.equal(db.prepare("SELECT estado FROM mensajes WHERE direccion = 'entrante' ORDER BY id DESC").get().estado, "recibido_humano");
  assert.equal(alertas(db, "mensaje_en_espera").length, 1);
  fijarModo(db, conv.id, "auto", "prueba", "admin");
  const vuelta = await decir(app, "56910000001", "Hola de nuevo");
  assert.ok(vuelta.texto);
});

test("respuesta manual de Patricio: pausa el agente y respeta la ventana de 24 horas", async () => {
  const { app, db, whatsapp } = crearAppPrueba();
  app.procesador.ingresarWebhook(payloadTexto({ id: "d1", texto: "Hola" }));
  await app.procesador.revisarCola();
  const conv = db.prepare("SELECT * FROM conversaciones").get();
  const r = await app.procesador.enviarManual(conv.id, "Hola, le escribe Patricio.", "admin:patricio");
  assert.ok(r.id);
  assert.equal(whatsapp.enviados.at(-1).texto, "Hola, le escribe Patricio.");
  assert.equal(whatsapp.enviados.at(-1).manual, true, "lo escrito por Patricio se envía aunque el servicio esté en modo prueba");
  assert.equal(db.prepare("SELECT modo FROM conversaciones").get().modo, "humano");
  db.prepare("UPDATE conversaciones SET ultimo_entrante = '2026-01-01T00:00:00.000Z'").run();
  const fuera = await app.procesador.enviarManual(conv.id, "Otro mensaje", "admin:patricio");
  assert.equal(fuera.error, "fuera_de_ventana");
});

test("eco de la app WhatsApp Business (coexistencia): pausa el agente en ese chat", () => {
  const { app, db } = crearAppPrueba();
  app.procesador.ingresarWebhook(payloadTexto({ id: "e1", texto: "Hola", de: "56910000002" }));
  app.procesador.ingresarWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "smb_message_echoes", value: { metadata: { phone_number_id: "111" }, message_echoes: [{ id: "eco1", to: "56910000002", text: { body: "Le respondo yo" } }] } }] }] });
  assert.equal(db.prepare("SELECT modo FROM conversaciones").get().modo, "humano");
  assert.equal(db.prepare("SELECT autor FROM mensajes WHERE wa_id = 'eco1'").get().autor, "patricio");
});

test("pausa global: ningún mensaje recibe respuesta automática", async () => {
  const { app, db } = crearAppPrueba();
  guardarAjuste(db, "agente_pausado", true);
  const r = await decir(app, "56910000003", "Hola");
  assert.equal(r.texto, null);
});
