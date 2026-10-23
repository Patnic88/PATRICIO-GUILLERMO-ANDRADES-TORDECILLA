// Asuntos urgentes: audiencias, notificaciones, vencimientos y remates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarSenales } from "../src/agente/urgencias.js";
import { crearAppPrueba, decir, iaGuionada, alertas } from "./ayuda.js";

test("detección: señales, fechas literales y nivel de urgencia", () => {
  assert.equal(detectarSenales("Hola, quería consultar por una sociedad").urgencia, "normal");
  const a = detectarSenales("Tengo audiencia mañana a las 9");
  assert.equal(a.urgencia, "urgente");
  assert.deepEqual(a.fechasLiterales, ["mañana"]);
  const r = detectarSenales("Me notificaron un remate para el 15 de noviembre");
  assert.ok(r.senales.some((s) => s.tipo === "remate"));
  assert.deepEqual(r.fechasLiterales, ["15 de noviembre"]);
  assert.equal(r.urgencia, "urgente");
  assert.equal(detectarSenales("Me despidieron ayer").urgencia, "prioritaria");
});

test("audiencia inminente: alerta alta automática, solicitud urgente y sin cálculo de plazos", async () => {
  const { app, db } = crearAppPrueba();
  await decir(app, "56990000001", "Me llamo Sergio Tapia");
  const { texto } = await decir(app, "56990000001", "Tengo audiencia mañana en el Juzgado de Letras de Los Vilos y no tengo abogado");
  assert.match(texto, /prioritario/);
  assert.match(texto, /no puedo calcular plazos/);
  const s = db.prepare("SELECT * FROM solicitudes").get();
  assert.equal(s.urgencia, "urgente");
  assert.ok(alertas(db).filter((a) => a.prioridad === "alta").length >= 2);
  assert.ok(alertas(db, "plazo").some((a) => a.fecha_informada === "mañana"));
});

test("la alerta se crea en código aunque el modelo no clasifique ni use herramientas", async () => {
  const { app, db } = crearAppPrueba({ ia: iaGuionada(["Gracias, ¿me indica su nombre?"]) });
  await decir(app, "56990000002", "Me notificaron un remate de mi casa para el 10 de diciembre");
  const a = alertas(db, "urgencia");
  assert.equal(a.length, 1);
  assert.equal(a[0].prioridad, "alta");
  assert.match(a[0].fecha_informada, /10 de diciembre/);
});

test("si el modelo calcula un plazo, la respuesta se bloquea", async () => {
  const { app } = crearAppPrueba({ ia: iaGuionada(["Tranquilo, tiene 10 días hábiles para contestar la demanda."]) });
  const { texto, r } = await decir(app, "56990000003", "me notificaron una demanda ayer, ¿cuánto plazo tengo?");
  assert.deepEqual(r.turno.problemas, ["calculo_de_plazo"]);
  assert.doesNotMatch(texto, /10 días/);
});

test("la misma señal en el mismo día no duplica alertas", async () => {
  const { app, db } = crearAppPrueba();
  await decir(app, "56990000004", "tengo audiencia mañana");
  await decir(app, "56990000004", "la audiencia es mañana temprano");
  assert.equal(alertas(db, "urgencia").filter((a) => a.descripcion.startsWith("Señales")).length, 1);
});
