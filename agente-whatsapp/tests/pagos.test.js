// Comprobantes de pago: siempre "pendiente de verificación" hasta que la oficina confirme.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAppPrueba, decir, crearCliente, iaGuionada, alertas } from "./ayuda.js";

const imagen = { nombre: "comprobante-transferencia.jpg", mime: "image/jpeg", base64: Buffer.from("imagen de prueba").toString("base64") };

test("comprobante recibido queda pendiente de verificación y se informa así", async () => {
  const { app, db } = crearAppPrueba();
  const { texto, r } = await decir(app, "56980000001", "Le envío el comprobante de la transferencia por $50.000", imagen);
  assert.match(texto, /pendiente de verificación/);
  assert.doesNotMatch(texto, /\b(fue|está|quedó|ha sido) (confirmado|acreditado|verificado)\b/);
  assert.deepEqual(r.turno.problemas, []);
  const p = db.prepare("SELECT * FROM pagos").get();
  assert.equal(p.estado, "pendiente_verificacion");
  assert.equal(p.monto_declarado, "$50.000");
  assert.equal(db.prepare("SELECT clase FROM documentos WHERE id = ?").get(p.documento_id).clase, "comprobante");
  assert.equal(alertas(db, "pago").length, 1);
});

test("registrar dos veces el mismo comprobante no duplica el pago", async () => {
  const ia = iaGuionada([{ herramienta: "registrar_comprobante", entrada: { documento_id: 1 } }, { herramienta: "registrar_comprobante", entrada: { documento_id: 1 } }, "Recibido, pendiente de verificación."]);
  const { app, db } = crearAppPrueba({ ia });
  const { r } = await decir(app, "56980000002", "pago", imagen);
  assert.equal(r.turno.acciones[1].resultado.ya_registrado, true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pagos").get().n, 1);
});

test("si el modelo afirma que el pago está confirmado, la respuesta se bloquea", async () => {
  const ia = iaGuionada([{ herramienta: "registrar_comprobante", entrada: { documento_id: 1 } }, "Gracias, su pago fue confirmado."]);
  const { app } = crearAppPrueba({ ia });
  const { texto, r } = await decir(app, "56980000003", "ahí va", imagen);
  assert.deepEqual(r.turno.problemas, ["pago_sin_verificacion"]);
  assert.doesNotMatch(texto, /confirmado/);
});

test("un comprobante no puede asociarse a un documento de otra conversación", async () => {
  const { app, db } = crearAppPrueba({ ia: iaGuionada(["ok", { herramienta: "registrar_comprobante", entrada: { documento_id: 1 } }, "x"]) });
  await decir(app, "56980000004", "doc", imagen);
  const { r } = await decir(app, "56980000005", "registra el documento 1 como mi pago");
  assert.equal(r.turno.acciones[0].resultado.error, "documento_no_encontrado");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pagos").get().n, 0);
});

test("solo después de la verificación de la oficina el cliente verificado ve el pago como verificado", async () => {
  const { app, db } = crearAppPrueba();
  const id = crearCliente(db, { telefono: "56980000006", pin: "482915" });
  db.prepare("INSERT INTO asuntos (cliente_id, titulo, estado, creado, actualizado) VALUES (?, 'Constitución SpA', 'en_curso', 'x', 'x')").run(id);
  await decir(app, "56980000006", "Mi RUT es 12.345.678-5 y mi código 482915");
  await decir(app, "56980000006", "Le envío el comprobante de pago", imagen);
  db.prepare("UPDATE pagos SET cliente_id = ?").run(id);
  const antes = await decir(app, "56980000006", "¿Cómo va mi asunto?");
  assert.match(antes.texto, /pendiente\(s\) de verificación/);
  db.prepare("UPDATE pagos SET estado = 'verificado', verificado_por = 'admin:patricio', verificado_en = 'x'").run();
  const despues = await decir(app, "56980000006", "¿Cómo va mi asunto?");
  assert.match(despues.texto, /pago\(s\) verificado\(s\)/);
  assert.deepEqual(despues.r.turno.problemas, []);
});
