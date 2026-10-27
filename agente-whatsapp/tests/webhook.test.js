// Webhook: verificación de suscripción, firma, deduplicación y estados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verificarSuscripcion, firmaValida, extraerEventos } from "../src/whatsapp/webhook.js";
import { crearServidor } from "../src/servidor.js";
import { crearAppPrueba, firmar, payloadTexto, SECRETO } from "./ayuda.js";

test("verificación GET: solo devuelve el desafío con el token correcto", () => {
  const q = (o) => new URLSearchParams(o);
  assert.equal(verificarSuscripcion(q({ "hub.mode": "subscribe", "hub.verify_token": "abc", "hub.challenge": "123" }), "abc"), "123");
  assert.equal(verificarSuscripcion(q({ "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "123" }), "abc"), null);
  assert.equal(verificarSuscripcion(q({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "123" }), ""), null);
});

test("firma X-Hub-Signature-256: válida, alterada, ausente o malformada", () => {
  const cuerpo = Buffer.from(JSON.stringify({ a: "é" }));
  assert.equal(firmaValida(cuerpo, firmar(cuerpo), SECRETO), true);
  assert.equal(firmaValida(Buffer.from(cuerpo.toString() + " "), firmar(cuerpo), SECRETO), false);
  assert.equal(firmaValida(cuerpo, undefined, SECRETO), false);
  assert.equal(firmaValida(cuerpo, "sha256=zz", SECRETO), false);
  assert.equal(firmaValida(cuerpo, firmar(cuerpo), ""), false, "sin App Secret configurado se rechaza todo");
});

test("extracción: descarta eventos de otro número de la empresa", () => {
  const ev = extraerEventos(payloadTexto({ phoneNumberId: "999" }), "111");
  assert.equal(ev.mensajes.length, 0);
  assert.equal(ev.descartados, 1);
});

test("HTTP: firma inválida → 401; válida → 200 y un solo mensaje aunque Meta reintente", async () => {
  const { app, db, whatsapp } = crearAppPrueba();
  const srv = crearServidor(app).listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/webhook/whatsapp`;
  try {
    const cuerpo = JSON.stringify(payloadTexto({ id: "wamid.X1", texto: "Hola, buenas tardes" }));
    const mala = await fetch(url, { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } });
    assert.equal(mala.status, 401);
    for (let i = 0; i < 3; i++) {
      const r = await fetch(url, { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": firmar(cuerpo), "content-type": "application/json" } });
      assert.equal(r.status, 200);
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM mensajes WHERE direccion = 'entrante'").get().n, 1);
    await app.procesador.revisarCola();
    await app.procesador.revisarCola();
    assert.equal(whatsapp.enviados.length, 1, "una sola respuesta");
    assert.match(whatsapp.enviados[0].texto, /asistente virtual de A & A/);
    const v = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=token-verif&hub.challenge=777`);
    assert.equal(await v.text(), "777");
    assert.equal((await fetch(`${url}?hub.mode=subscribe&hub.verify_token=x&hub.challenge=777`)).status, 403);
  } finally { srv.close(); }
});

test("mensajes seguidos se agrupan en un solo turno y una sola respuesta", async () => {
  const { app, whatsapp } = crearAppPrueba();
  app.procesador.ingresarWebhook(payloadTexto({ id: "w1", texto: "Hola" }));
  app.procesador.ingresarWebhook(payloadTexto({ id: "w2", texto: "Me llamo Rosa Díaz" }));
  await app.procesador.revisarCola();
  assert.equal(whatsapp.enviados.length, 1);
});

test("estados de entrega actualizan el mensaje y un fallo de entrega genera alerta", async () => {
  const { app, db, whatsapp } = crearAppPrueba();
  app.procesador.ingresarWebhook(payloadTexto({ id: "w1", texto: "Hola" }));
  await app.procesador.revisarCola();
  const salida = db.prepare("SELECT * FROM mensajes WHERE direccion = 'saliente'").get();
  assert.equal(salida.wa_id, "wamid.salida.1");
  app.procesador.ingresarWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, statuses: [{ id: "wamid.salida.1", status: "failed", recipient_id: "56922222222", errors: [{ code: 131047 }] }] } }] }] });
  assert.equal(db.prepare("SELECT estado FROM mensajes WHERE id = ?").get(salida.id).estado, "fallido");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM alertas WHERE tipo = 'envio_fallido'").get().n, 1);
  assert.equal(whatsapp.enviados.length, 1);
});

test("adjunto recibido por webhook se descarga y se guarda fuera del nombre del cliente", async () => {
  const { app, db } = crearAppPrueba();
  const p = payloadTexto({ id: "wimg" });
  p.entry[0].changes[0].value.messages[0] = { from: "56922222222", id: "wimg", type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "../../etc/passwd" } };
  app.procesador.ingresarWebhook(p);
  await app.procesador.revisarCola();
  const d = db.prepare("SELECT * FROM documentos").get();
  assert.ok(d.ruta && !d.ruta.includes("passwd"));
  assert.equal(d.clase, "imagen");
});
