// Citas: solo se confirman cuando la reserva queda registrada; sin duplicados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAppPrueba, decir, habilitarAgenda, iaGuionada, alertas } from "./ayuda.js";
import { reservarCita, bloquesLibres } from "../src/servicios/agenda.js";
import { obtenerConversacion } from "../src/servicios/conversaciones.js";

test("agenda no configurada: no ofrece horas ni confirma, deja la solicitud a Patricio", async () => {
  const { app, db } = crearAppPrueba();
  await decir(app, "56950000001", "Me llamo Tomás Vera");
  const { texto } = await decir(app, "56950000001", "Quiero agendar una cita");
  assert.match(texto, /no tengo horarios/i);
  assert.doesNotMatch(texto, /confirmada/i);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM citas").get().n, 0);
  assert.equal(db.prepare("SELECT tipo FROM solicitudes").get().tipo, "cita");
});

test("agenda configurada: ofrece bloques reales, reserva y confirma solo tras registrar", async () => {
  const { app, db } = crearAppPrueba();
  habilitarAgenda(db);
  await decir(app, "56950000002", "Me llamo Paula Ríos");
  const ofrece = await decir(app, "56950000002", "Necesito una hora de atención");
  assert.match(ofrece.texto, /1\)/);
  const confirma = await decir(app, "56950000002", "1");
  assert.match(confirma.texto, /quedó confirmada/);
  const cita = db.prepare("SELECT * FROM citas").get();
  assert.equal(cita.estado, "confirmada");
  assert.equal(cita.nombre, "Paula Ríos");
  assert.equal(alertas(db, "cita").length, 1);
});

test("no duplica: un contacto con cita vigente no obtiene una segunda", async () => {
  const { app, db } = crearAppPrueba();
  habilitarAgenda(db);
  await decir(app, "56950000003", "Me llamo Raúl Díaz");
  await decir(app, "56950000003", "quiero una cita");
  await decir(app, "56950000003", "1");
  await decir(app, "56950000003", "quiero agendar otra cita");
  const r = await decir(app, "56950000003", "2");
  assert.match(r.texto, /ya tiene una cita confirmada/i);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM citas WHERE estado = 'confirmada'").get().n, 1);
});

test("dos clientes no pueden tomar el mismo bloque", () => {
  const { db, cfg } = crearAppPrueba();
  habilitarAgenda(db);
  const a = obtenerConversacion(db, "56950000004");
  const b = obtenerConversacion(db, "56950000005");
  const bloque = bloquesLibres(db, cfg.zonaHoraria).bloques[0];
  const r1 = reservarCita(db, cfg.zonaHoraria, { contactoId: a.contacto.id, conversacionId: a.conversacion.id, inicio: bloque.inicio, nombre: "A", motivo: "x" });
  const r2 = reservarCita(db, cfg.zonaHoraria, { contactoId: b.contacto.id, conversacionId: b.conversacion.id, inicio: bloque.inicio, nombre: "B", motivo: "x" });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, false);
  assert.equal(r2.motivo, "bloque_no_disponible");
});

test("un horario inventado por el modelo se rechaza", () => {
  const { db, cfg } = crearAppPrueba();
  habilitarAgenda(db);
  const a = obtenerConversacion(db, "56950000006");
  const r = reservarCita(db, cfg.zonaHoraria, { contactoId: a.contacto.id, conversacionId: a.conversacion.id, inicio: "2026-12-25T03:17:00.000Z", nombre: "A", motivo: "x" });
  assert.equal(r.ok, false);
});

test("control de salida: si el modelo afirma una cita sin reserva, la respuesta se bloquea", async () => {
  const ia = iaGuionada(["Perfecto, su cita quedó confirmada para el lunes a las 10:00."]);
  const { app, db } = crearAppPrueba({ ia });
  const { texto, r } = await decir(app, "56950000007", "quiero una cita el lunes");
  assert.doesNotMatch(texto, /confirmada/);
  assert.deepEqual(r.turno.problemas, ["cita_sin_reserva"]);
  assert.equal(alertas(db, "respuesta_bloqueada").length, 1);
});
